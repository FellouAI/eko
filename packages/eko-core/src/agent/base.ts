import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import {
  McpTool,
  ForeachTaskTool,
  WatchTriggerTool,
  VariableStorageTool,
} from "../tools";
import {
  Tool,
  IMcpClient,
  LLMRequest,
  ToolResult,
  ToolSchema,
  ToolExecuter,
  WorkflowAgent,
  HumanCallback,
  StreamCallback,
} from "../types";
import { ICapability } from "../capabilities/base";
import { createCapability } from "../capabilities/registry";
import {
  LanguageModelV2Prompt,
  LanguageModelV2FilePart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from "@ai-sdk/provider";
import {
  getTool,
  convertTools,
  callAgentLLM,
  convertToolResult,
  defaultMessageProviderOptions,
} from "./llm";
import { doTaskResultCheck } from "../tools/task_result_check";
import { doTodoListManager } from "../tools/todo_list_manager";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";

export type AgentParams = {
  name: string;
  description: string;
  tools: Tool[];
  llms?: string[];
  mcpClient?: IMcpClient;
  planDescription?: string;
  requestHandler?: (request: LLMRequest) => void;

  /** Optional callback handler for status and user interaction */
  callback?: StreamCallback & HumanCallback;
};

export type AgentSerializedData = {
  agent_name: string;
  description: string;
  system_prompt: string;
  tool_ids?: string[];
  capabilities?: string[];
};

export class Agent {
  protected name: string;
  protected description: string;
  protected tools: Tool[] = [];
  protected llms?: string[];
  protected mcpClient?: IMcpClient;
  protected planDescription?: string;
  protected requestHandler?: (request: LLMRequest) => void;
  protected callback?: StreamCallback & HumanCallback;
  protected agentContext?: AgentContext;
  protected serializedSystemPrompt?: string;

  /** Optional tool IDs for MCP tools to load */
  protected toolIds?: string[];

  /** Capabilities attached to this agent */
  protected capabilities: ICapability[] = [];

  /**
   * Constructor
   *
   * Initializes a new intelligent agent with configuration and capabilities.
   *
   * Initialization:
   * 1. Base config: identifiers and descriptions
   * 2. Capability config: tool collection and models
   * 3. Extensions: MCP client and callback handler
   * 4. State: prepare execution context
   *
   * Validation hints:
   * - name: unique identifier
   * - description: capability description for planning
   * - tools: core capability set
   * - llms/mcpClient: optional integrations
   *
   * @param params Agent configuration
   */
  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
    this.requestHandler = params.requestHandler;
    this.callback = params.callback;
  }

  /**
   * Build Agent instance from JSON data
   * 
   * Deserializes an Agent from JSON containing agent_name, description, and system_prompt.
   * The serialized system prompt will be used as a base, with dynamic content appended at runtime.
   * 
   * @param jsonData Serialized Agent data (object or JSON string)
   * @returns Agent instance
   * @static
   */
  public static build_from_json(
    jsonData: AgentSerializedData | string
  ): Agent {
    // Parse JSON if string
    const data: AgentSerializedData = typeof jsonData === 'string'
      ? JSON.parse(jsonData)
      : jsonData;
    // Validate required fields
    if (!data.agent_name || !data.description) {
      throw new Error('Agent serialized data must contain agent_name and description');
    }

    // Create Agent instance
    const agent = new Agent({
      name: data.agent_name,
      description: data.description,
      tools: [], // Empty tools array for now
    });

    // Store serialized system prompt if provided
    if (data.system_prompt) {
      agent.serializedSystemPrompt = data.system_prompt;
    }

    // Store tool IDs if provided
    if (data.tool_ids) {
      agent.toolIds = data.tool_ids;
    }

    // Load capabilities if provided
    if (data.capabilities && Array.isArray(data.capabilities)) {
      for (const capName of data.capabilities) {
        const capability = createCapability(capName);
        if (capability) {
          agent.addCapability(capability);
        } else {
          console.warn(`Failed to load capability: ${capName}`);
        }
      }
    }

    return agent;
  }

  public async run(context: Context, agentChain: AgentChain): Promise<string> {
    const mcpClient = this.mcpClient || context.config.defaultMcpClient;
    const agentContext = new AgentContext(context, this, agentChain);
    try {
      this.agentContext = agentContext;
      mcpClient &&
        !mcpClient.isConnected() &&
        (await mcpClient.connect(context.controller.signal));
      return await this.runWithContext(
        agentContext,
        mcpClient,
        config.maxReactNum
      );
    } finally {
      mcpClient && (await mcpClient.close());
    }
  }

  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100,
    historyMessages: LanguageModelV2Prompt = []
  ): Promise<string> {
    let loopNum = 0;
    let checkNum = 0;
    this.agentContext = agentContext;
    const context = agentContext.context;
    const agentNode = agentContext.agentChain.agent;

    // Build complete tool set (agent tools + capability tools + system auto tools)
    const capabilityTools = this.capabilities.flatMap((cap) => cap.tools);
    const tools = mergeTools(
      mergeTools(this.tools, capabilityTools),
      this.system_auto_tools(agentNode)
    );

    // Build system and user prompts
    const systemPrompt = await this.buildSystemPrompt(agentContext, tools);
    const userPrompt = await this.buildUserPrompt(agentContext, tools);
    const messages: LanguageModelV2Prompt = [
      {
        role: "system",
        content: systemPrompt,
        providerOptions: defaultMessageProviderOptions(),
      },
      ...historyMessages,
      {
        role: "user",
        content: userPrompt,
        providerOptions: defaultMessageProviderOptions(),
      },
    ];
    agentContext.messages = messages;
    const rlm = new RetryLanguageModel(context.config.llms, this.llms);
    rlm.setContext(agentContext);
    let agentTools = tools;

    // Main reasoning loop
    while (loopNum < maxReactNum) {
      await context.checkAborted();
      if (mcpClient) {
        const controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          const mcpTools = await this.listTools(
            context,
            mcpClient,
            agentNode,
            controlMcp.mcpParams
          );
          const usedTools = memory.extractUsedTool(messages, agentTools);
          const _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }
      await this.handleMessages(agentContext, messages, tools);
      const llm_tools = convertTools(agentTools);
      const results = await callAgentLLM(
        agentContext,
        rlm,
        messages,
        llm_tools,
        false,
        undefined,
        0,
        this.callback,
        this.requestHandler
      );
      const forceStop = agentContext.variables.get("forceStop");
      if (forceStop) {
        return forceStop;
      }
      const finalResult = await this.handleCallResult(
        agentContext,
        messages,
        agentTools,
        results
      );
      loopNum++;
      if (!finalResult) {
        if ((config.mode == "expert" || config.expertMode) && loopNum % config.expertModeTodoLoopNum == 0) {
          await doTodoListManager(agentContext, rlm, messages, llm_tools);
        }
        continue;
      }
      if ((config.mode == "expert" || config.expertMode) && checkNum == 0) {
        checkNum++;
        const { completionStatus } = await doTaskResultCheck(
          agentContext,
          rlm,
          messages,
          llm_tools
        );
        if (completionStatus == "incomplete") {
          continue;
        }
      }
      return finalResult;
    }
    return "Unfinished";
  }

  protected async handleCallResult(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
  ): Promise<string | null> {
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];
    // results = memory.removeDuplicateToolUse(results);
    messages.push({
      role: "assistant",
      content: results,
    });
    if (results.length == 0) {
      return null;
    }
    if (results.every((s) => s.type == "text")) {
      return results.map((s) => s.text).join("\n\n");
    }
    const toolCalls = results.filter((s) => s.type == "tool-call");
    if (
      toolCalls.length > 1 &&
      this.canParallelToolCalls(toolCalls) &&
      toolCalls.every(
        (s) => agentTools.find((t) => t.name == s.toolName)?.supportParallelCalls
      )
    ) {
      const results = await Promise.all(
        toolCalls.map((toolCall) =>
          this.callToolCall(agentContext, agentTools, toolCall, user_messages)
        )
      );
      for (let i = 0; i < results.length; i++) {
        toolResults.push(results[i]);
      }
    } else {
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        const toolResult = await this.callToolCall(
          agentContext,
          agentTools,
          toolCall,
          user_messages
        );
        toolResults.push(toolResult);
      }
    }
    if (toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: toolResults,
      });
      user_messages.forEach((message) => messages.push(message));
      return null;
    } else {
      return results
        .filter((s) => s.type == "text")
        .map((s) => s.text)
        .join("\n\n");
    }
  }

  protected async callToolCall(
    agentContext: AgentContext,
    agentTools: Tool[],
    result: LanguageModelV2ToolCallPart,
    user_messages: LanguageModelV2Prompt = []
  ): Promise<LanguageModelV2ToolResultPart> {
    const context = agentContext.context;
    const toolChain = new ToolChain(
      result,
      agentContext.agentChain.agentRequest as LLMRequest
    );
    agentContext.agentChain.push(toolChain);
    let toolResult: ToolResult;
    try {
      const args =
        typeof result.input == "string"
          ? JSON.parse(result.input || "{}")
          : result.input || {};
      toolChain.params = args;
      let tool = getTool(agentTools, result.toolName);
      if (!tool) {
        throw new Error(result.toolName + " tool does not exist");
      }
      toolResult = await tool.execute(args, agentContext, result);
      toolChain.updateToolResult(toolResult);
      agentContext.consecutiveErrorNum = 0;
    } catch (e) {
      Log.error("tool call error: ", result.toolName, result.input, e);
      toolResult = {
        content: [
          {
            type: "text",
            text: e + "",
          },
        ],
        isError: true,
      };
      toolChain.updateToolResult(toolResult);
      if (++agentContext.consecutiveErrorNum >= 10) {
        throw e;
      }
    }
    const callback = this.callback || context.config.callback;
    if (callback) {
      await callback.onMessage(
        {
          taskId: context.taskId,
          agentName: agentContext.agent.Name,
          nodeId: agentContext.agentChain.agent.id,
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        },
        agentContext
      );
    }
    return convertToolResult(result, toolResult, user_messages);
  }

  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    let tools: Tool[] = [];
    let agentNodeXml = agentNode.xml;
    let hasVariable =
      agentNodeXml.indexOf("input=") > -1 ||
      agentNodeXml.indexOf("output=") > -1;
    if (hasVariable) {
      tools.push(new VariableStorageTool());
    }
    let hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
    if (hasForeach) {
      tools.push(new ForeachTaskTool());
    }
    let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
    if (hasWatch) {
      tools.push(new WatchTriggerTool());
    }
    let toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

  protected async buildSystemPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    // Collect capability guides and format with prefix
    // Note: Capabilities are already added to the agent, we just collect their guides here
    const capabilityGuides = this.capabilities
      .map((cap) => cap.getGuide())
      .filter((guide) => guide.length > 0)
      .join("\n\n");

    const capabilityGuideSection = capabilityGuides
      ? `Capability Guide：\n${capabilityGuides}`
      : "";

    // Build prompt first (with capability tools already included in tools parameter)
    let prompt: string;

    // If serialized system prompt exists, first append Capability Guide, then do dynamic injection
    if (this.serializedSystemPrompt) {
      // Step 1: Append Capability Guide to serializedSystemPrompt first
      let extPrompt = this.serializedSystemPrompt;

      if (capabilityGuideSection) {
        extPrompt = extPrompt + "\n\n" + capabilityGuideSection;
      }
      prompt = getAgentSystemPrompt(
        this,
        agentContext.agentChain.agent,
        agentContext.context,
        tools,
        extPrompt
      )
    } else {
      // Otherwise use existing dynamic building logic
      let extPrompt = await this.extSysPrompt(agentContext, tools);
      prompt = getAgentSystemPrompt(
        this,
        agentContext.agentChain.agent,
        agentContext.context,
        tools,
        extPrompt
      );
      // Append capability guides at the end for non-serialized prompts
      if (capabilityGuideSection) {
        prompt = prompt + "\n\n" + capabilityGuideSection;
      }
    }

    return prompt;
  }

  protected async buildUserPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<Array<LanguageModelV2TextPart | LanguageModelV2FilePart>> {
    return [
      {
        type: "text",
        text: getAgentUserPrompt(
          this,
          agentContext.agentChain.agent,
          agentContext.context,
          tools
        ),
      },
    ];
  }

  protected async extSysPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return "";
  }

  private async listTools(
    context: Context,
    mcpClient: IMcpClient,
    agentNode?: WorkflowAgent,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      if (!mcpClient.isConnected()) {
        await mcpClient.connect(context.controller.signal);
      }

      // Get tool list
      // Merge mcpParams into params if tool_ids is present, otherwise spread at root level
      const baseParams: any = {
        taskId: context.taskId,
        nodeId: agentNode?.id,
        environment: config.platform,
        agent_name: agentNode?.name || this.name,
        params: {},
        prompt: agentNode?.task || context.chain.taskPrompt,
      };

      // If tool_ids is in mcpParams, put it in params.params (nested) for MCP endpoint compatibility
      if (mcpParams?.tool_ids) {
        baseParams.params.tool_ids = mcpParams.tool_ids;
        // Also spread other mcpParams at root level
        const { tool_ids, ...otherParams } = mcpParams;
        Object.assign(baseParams, otherParams);
      } else {
        // Otherwise spread all mcpParams at root level
        Object.assign(baseParams, mcpParams || {});
      }

      let list = await mcpClient.listTools(
        baseParams,
        context.controller.signal
      );
      let mcpTools: Tool[] = [];
      for (let i = 0; i < list.length; i++) {
        let toolSchema: ToolSchema = list[i];
        let execute = this.toolExecuter(mcpClient, toolSchema.name);
        let toolWrapper = new ToolWrapper(toolSchema, execute);
        mcpTools.push(new McpTool(toolWrapper));
      }
      return mcpTools;
    } catch (e) {
      Log.error("Mcp listTools error", e);
      return [];
    }
  }

  protected async controlMcpTools(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    loopNum: number
  ): Promise<{
    mcpTools: boolean;
    mcpParams?: Record<string, unknown>;
  }> {
    // Default: only load MCP tools in the first loop
    // For custom-tools MCP endpoint, only load if tool_ids are provided
    // (since the endpoint requires tool_ids parameter)
    if (this.toolIds && this.toolIds.length > 0) {
      return {
        mcpTools: loopNum == 0,
        mcpParams: { tool_ids: this.toolIds },
      };
    }

    // If no tool_ids, don't load MCP tools for custom-tools endpoint
    // (other MCP endpoints may work without tool_ids)
    return {
      mcpTools: false,
    };
  }

  protected toolExecuter(mcpClient: IMcpClient, name: string): ToolExecuter {
    return {
      execute: async function (args, agentContext): Promise<ToolResult> {
        return await mcpClient.callTool(
          {
            name: name,
            arguments: args,
            extInfo: {
              taskId: agentContext.context.taskId,
              nodeId: agentContext.agentChain.agent.id,
              environment: config.platform,
              agent_name: agentContext.agent.Name,
            },
          },
          agentContext.context.controller.signal
        );
      },
    };
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<void> {
    // Only keep the last image / file, large tool-text-result
    memory.handleLargeContextMessages(messages);
  }

  protected async callInnerTool(fun: () => Promise<any>): Promise<ToolResult> {
    let result = await fun();
    return {
      content: [
        {
          type: "text",
          text: result
            ? typeof result == "string"
              ? result
              : JSON.stringify(result)
            : "Successful",
        },
      ],
    };
  }

  public async loadTools(context: Context): Promise<Tool[]> {
    if (this.mcpClient) {
      let mcpTools = await this.listTools(context, this.mcpClient);
      if (mcpTools && mcpTools.length > 0) {
        return mergeTools(this.tools, mcpTools);
      }
    }
    return this.tools;
  }

  public addTool(tool: Tool) {
    this.tools.push(tool);
  }

  protected async onTaskStatus(
    status: "pause" | "abort" | "resume-pause",
    reason?: string
  ) {
    if (status == "abort" && this.agentContext) {
      this.agentContext?.variables.clear();
    }
  }

  public canParallelToolCalls(
    toolCalls?: LanguageModelV2ToolCallPart[]
  ): boolean {
    return config.parallelToolCalls;
  }

  get Llms(): string[] | undefined {
    return this.llms;
  }

  get Name(): string {
    return this.name;
  }

  get Description(): string {
    return this.description;
  }

  /**
   * Get agent tools
   * @returns Built-in tool list (including capability tools)
   */
  get Tools(): Tool[] {
    const capabilityTools = this.capabilities.flatMap((cap) => cap.tools);
    return mergeTools(this.tools, capabilityTools);
  }

  /**
   * Add a capability to this agent
   * @param capability Capability instance to add
   */
  public addCapability(capability: ICapability): void {
    this.capabilities.push(capability);
  }

  /**
   * Get all capabilities attached to this agent
   * @returns Array of capabilities
   */
  public getCapabilities(): ICapability[] {
    return [...this.capabilities];
  }

  get PlanDescription() {
    return this.planDescription;
  }

  get McpClient() {
    return this.mcpClient;
  }

  get AgentContext(): AgentContext | undefined {
    return this.agentContext;
  }
}
