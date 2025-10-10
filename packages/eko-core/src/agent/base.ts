/**
 * Agent base module
 *
 * Implements the intelligent agent base class of the Eko system, the core of
 * the agent framework. The Agent class defines the standard interfaces and
 * lifecycle management used by concrete agents.
 *
 * Architecture:
 * - Agent base: defines standard interfaces and behaviors
 * - Tool integration: supports registration and invocation of multiple tools
 * - LLM integration: multi-model support via RetryLanguageModel
 * - Context management: full execution context and state tracking
 * - Lifecycle: from construction to execution to cleanup
 *
 * Design principles:
 * 1. Composition over inheritance: compose tools, LLMs, and contexts
 * 2. Standardized interfaces: unified Agent interface for integration
 * 3. Fault tolerance: robust error handling and retry mechanisms
 * 4. State isolation: each agent instance has an isolated environment
 * 5. Extensibility: plugin-style tool system
 *
 * Agent lifecycle:
 * 1. Construct: initialize configuration and tools
 * 2. Run: accept tasks and start execution
 * 3. Reason: analyze and plan via LLM
 * 4. Tool calls: invoke tools as needed
 * 5. Produce result: synthesize final output
 * 6. Cleanup: release resources and state
 */

import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import { createCallbackHelper } from "../common/callback-helper";
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

/**
 * Agent parameter configuration type
 *
 * Parameters required to create an intelligent agent. These determine agent
 * capabilities, behavior, and integration options.
 */
export type AgentParams = {
  /** Unique agent name for identification and reference */
  name: string;

  /** Description of agent capabilities and task types */
  description: string;

  /** Built-in tool collection defining available capabilities */
  tools: Tool[];

  /** Optional LLM model list specifying usable language models */
  llms?: string[];

  /** Optional MCP client for external tools/services integration */
  mcpClient?: IMcpClient;

  /** Optional planning description for workflow planner selection */
  planDescription?: string;

  /** Optional request handler to pre-process LLM requests */
  requestHandler?: (request: LLMRequest) => void;
};

/**
 * Intelligent Agent base class
 *
 * Base class for all intelligent agents in Eko. Each instance has isolated
 * capabilities, tool sets, and execution environments.
 *
 * Core responsibilities:
 * 1. Execute tasks
 * 2. Manage tool collection
 * 3. Integrate with LLMs for reasoning
 * 4. Manage context and conversation history
 * 5. Produce final results
 *
 * Execution modes:
 * 1. Tool-centric mode: extend capability via tools
 * 2. Reasoning mode: complex problem analysis via LLM
 * 3. Collaboration mode: cooperate with other agents/components
 * 4. Learning mode: optimize behavior from history
 *
 * State management:
 * - Execution context via AgentContext
 * - Tool status tracking
 * - Conversation history
 * - Error metrics
 *
 * Extension mechanisms:
 * - Tool plugins via addTool
 * - LLM customization via llms
 * - Callback integration for status/user interaction
 * - MCP integration via mcpClient
 */
export class Agent {
  /** Unique agent identifier */
  public name: string;

  /** Description of agent capability scope */
  public description: string;

  /** Built-in tool collection defining core capabilities */
  public tools: Tool[] = [];

  /** Optional LLM model list specifying usable models */
  protected llms?: string[];

  /** Optional MCP client for external tools/services */
  protected mcpClient?: IMcpClient;

  /** Optional planning description for workflow stage */
  protected planDescription?: string;

  /** Optional request handler to customize LLM requests */
  protected requestHandler?: (request: LLMRequest) => void;

  /** Optional callback handler for status and user interaction */
  protected callback?: StreamCallback & HumanCallback;

  /** Current agent execution context */
  protected agentContext?: AgentContext;

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
  }

  /**
   * Execute agent task
   *
   * Core execution entry of an agent. Prepares context, manages MCP connection,
   * runs task logic, and ensures cleanup.
   *
   * Flow:
   * 1. Prepare environment
   * 2. Connect MCP if configured
   * 3. Execute core logic
   * 4. Cleanup resources
   *
   * Concurrency:
   * - Execution is isolated per agent instance
   * - MCP connection is closed after execution
   *
   * @param context Execution context
   * @param agentChain Agent execution chain
   * @returns Result string
   */
  public async run(context: Context, agentChain: AgentChain): Promise<string> {
    const mcpClient = this.mcpClient || context.config.defaultMcpClient;
    const agentContext = new AgentContext(context, this, agentChain);
    try {
      // Save current agent context
      this.agentContext = agentContext;

      // Connect MCP client if configured and not connected
      mcpClient &&
        !mcpClient.isConnected() &&
        (await mcpClient.connect(context.controller.signal));
      return await this.runWithContext(
        agentContext,
        mcpClient,
        config.maxReactNum
      );
    } finally {
      // Ensure MCP connection is closed to prevent leaks
      mcpClient && (await mcpClient.close());
    }
  }

  /**
   * Execute agent task with context
   *
   * Implements the reasoning loop and tool invocation mechanism.
   *
   * Strategy:
   * - Iterative reasoning via multiple LLM calls
   * - Dynamic tool usage during reasoning
   * - Context maintenance and error recovery
   *
   * @param agentContext Agent execution context
   * @param mcpClient Optional MCP client
   * @param maxReactNum Max reasoning iterations
   * @param historyMessages Previous messages for continuation
   * @returns Final result
   */
  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100,
    historyMessages: LanguageModelV2Prompt = []
  ): Promise<string> {
    // Initialize loop variables
    let loopNum = 0;  // current reasoning loop index
    let checkNum = 0; // task check count

    // Save agent context
    this.agentContext = agentContext;

    // Get task context and agent node
    const context = agentContext.context;
    const agentNode = agentContext.agentChain.agent;

    // Create callback helper
    const agentRunCbHelper = createCallbackHelper(
      this.callback || context.config.callback,
      context.taskId,
      this.name,
      agentNode.id
    );

    // Build complete tool set (agent tools + system auto tools)
    const tools = [...this.tools, ...this.system_auto_tools(agentNode)];

    // Build system and user prompts
    const systemPrompt = await this.buildSystemPrompt(agentContext, tools);
    const userPrompt = await this.buildUserPrompt(agentContext, tools);

    // Construct message list
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

    // Save messages into agent context
    agentContext.messages = messages;

    // Initialize RetryLanguageModel
    const rlm = new RetryLanguageModel(context.config.llms, this.llms);

    // Initialize agent tool set
    let agentTools = tools;

    await agentRunCbHelper.agentStart(
      this, 
      agentContext
    )

    // Main reasoning loop
    while (loopNum < maxReactNum) {
      // Check for abort
      await context.checkAborted();

      // Send agent processing event
      await agentRunCbHelper.agentProcess(
        loopNum,
        maxReactNum,
        agentContext,
        agentContext.context as any
      );

      // Dynamically load MCP tools
      if (mcpClient) {
        const controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          // Get MCP tools
          const mcpTools = await this.listTools(
            context,
            mcpClient,
            agentNode,
            controlMcp.mcpParams
          );
          // Extract used tools
          const usedTools = memory.extractUsedTool(messages, agentTools);
          // Merge all tools
          const _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }

      // Handle messages (compression/cleanup)
      await this.handleMessages(agentContext, messages, tools);

      // Convert tools to LLM format
      const llm_tools = convertTools(agentTools);

      // Call LLM for reasoning
      const results = await callAgentLLM(
        agentContext,
        rlm,
        messages,
        llm_tools,
        false,
        undefined,
        0,
        this.callback || context.config.callback,
        this.requestHandler
      );

      // Check force stop
      const forceStop = agentContext.variables.get("forceStop");
      if (forceStop) {
        return forceStop;
      }

      // Handle tool-call results
      const finalResult = await this.handleCallResult(
        agentContext,
        messages,
        agentTools,
        results
      );

      // Increase loop counter
      loopNum++;

      // Continue if no final result
      if (!finalResult) {
        // Expert mode: periodic todo management
        if (config.expertMode && loopNum % config.expertModeTodoLoopNum == 0) {
          await doTodoListManager(agentContext, rlm, messages, llm_tools);
        }
        continue;
      }

      // Expert mode: task result validation
      if (config.expertMode && checkNum == 0) {
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

      await agentRunCbHelper.agentFinished(
        this,
        agentContext,
        finalResult,
        undefined,
        agentContext.context as any
      );

      // Return final result
      return finalResult;
    }

    await agentRunCbHelper.agentFinished(
      this,
      agentContext,
      "Unfinished",
      undefined,
      agentContext.context as any
    );

    return "Unfinished";
  }

  /**
   * Handle tool-call results
   *
   * Core of the reasoning loop that executes tool calls based on LLM responses
   * and updates conversation history.
   *
   * @param agentContext Agent execution context
   * @param messages Conversation history
   * @param agentTools Available tools
   * @param results LLM results
   * @returns Final result string or null
   * @protected
   */
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

    const args =
      typeof result.input == "string"
        ? JSON.parse(result.input || "{}")
        : result.input || {};
    toolChain.params = args;

    const toolcallCbHelper = createCallbackHelper(
      this.callback || context.config.callback,
      context.taskId,
      this.name,
      agentContext.agentChain.agent.id
    );

    let toolResult: ToolResult;
    const startTime = Date.now();
    try {
      await toolcallCbHelper.toolCallStart(
        result.toolName,
        result.toolCallId,
        args
      );
      const tool = getTool(agentTools, result.toolName);
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
      const durationErr = Date.now() - startTime;
      await toolcallCbHelper.toolCallFinished(
        result.toolName,
        result.toolCallId,
        args,
        toolResult,
        durationErr
      );
      if (++agentContext.consecutiveErrorNum >= 10) {
        throw e;
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

    const duration = Date.now() - startTime;
    await toolcallCbHelper.toolCallFinished(
      result.toolName,
      result.toolCallId,
      args,
      toolResult,
      duration
    );

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

  /**
   * Generate system auto tools
   *
   * Based on workflow XML config, dynamically add tools that are not defined
   * by the agent itself.
   *
   * Mapping:
   * - VariableStorageTool: when inputs/outputs appear
   * - ForeachTaskTool: when loop structure exists
   * - WatchTriggerTool: when watch triggers exist
   *
   * Dedup: avoid tools already provided by the agent
   *
   * @param agentNode Workflow agent node
   * @returns Auto-generated system tools
   * @protected
   */
  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    let tools: Tool[] = [];
    let agentNodeXml = agentNode.xml;

    // Check variable operations
    let hasVariable =
      agentNodeXml.indexOf("input=") > -1 ||
      agentNodeXml.indexOf("output=") > -1;
    if (hasVariable) {
      tools.push(new VariableStorageTool());
    }

    // Check foreach structure
    let hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
    if (hasForeach) {
      tools.push(new ForeachTaskTool());
    }

    // Check watch trigger
    let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
    if (hasWatch) {
      tools.push(new WatchTriggerTool());
    }

    // Filter out duplicates with existing tools
    let toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

  /**
   * Build system prompt for the agent
   *
   * @param agentContext Agent execution context
   * @param tools Available tools
   * @returns System prompt string
   * @protected
   */
  protected async buildSystemPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return getAgentSystemPrompt(
      this,
      agentContext.agentChain.agent,
      agentContext.context,
      tools,
      await this.extSysPrompt(agentContext, tools)
    );
  }

  /**
   * Build user prompt for the agent
   *
   * @param agentContext Agent execution context
   * @param tools Available tools
   * @returns User prompt parts
   * @protected
   */
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

  /**
   * Extend system prompt
   *
   * Allow subclasses to extend the base system prompt with agent-specific
   * guidance.
   *
   * @param agentContext Agent execution context
   * @param tools Available tools
   * @returns Extended system prompt
   * @protected
   */
  protected async extSysPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return "";
  }

  /**
   * List MCP tools
   *
   * Fetch available external tools from MCP client and convert to standard
   * tool instances.
   *
   * @param context Execution context
   * @param mcpClient MCP client instance
   * @param agentNode Optional workflow agent node
   * @param mcpParams Optional MCP params
   * @returns MCP tool list
   * @private
   */
  private async listTools(
    context: Context,
    mcpClient: IMcpClient,
    agentNode?: WorkflowAgent,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      // Ensure MCP client connected
      if (!mcpClient.isConnected()) {
        await mcpClient.connect(context.controller.signal);
      }

      // Get tool list
      let list = await mcpClient.listTools(
        {
          taskId: context.taskId,
          nodeId: agentNode?.id,
          environment: config.platform,
          agent_name: agentNode?.name || this.name,
          params: {},
          prompt: agentNode?.task || context.chain.taskPrompt,
          ...(mcpParams || {}),
        },
        context.controller.signal
      );

      // Convert schemas and create wrappers
      let mcpTools: Tool[] = [];
      for (let i = 0; i < list.length; i++) {
        let toolSchema: ToolSchema = list[i];
        let execute = this.toolExecuter(mcpClient, toolSchema.name);
        let toolWrapper = new ToolWrapper(toolSchema, execute);
        mcpTools.push(new McpTool(toolWrapper));
      }
      return mcpTools;
    } catch (e) {
      // Log MCP tool retrieval error
      Log.error("Mcp listTools error", e);
      return [];
    }
  }

  /**
   * Control MCP tool loading strategy
   *
   * Default: load only in the first loop to avoid duplicates later.
   *
   * @param agentContext Agent execution context
   * @param messages Current messages
   * @param loopNum Current loop number
   * @returns Control flags
   * @protected
   */
  protected async controlMcpTools(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    loopNum: number
  ): Promise<{
    mcpTools: boolean;
    mcpParams?: Record<string, unknown>;
  }> {
    // Default: only load MCP tools in the first loop
    return {
      mcpTools: loopNum == 0,
    };
  }

  /**
   * Create MCP tool executer wrapper
   *
   * @param mcpClient MCP client instance
   * @param name Tool name
   * @returns Tool executer
   * @protected
   */
  protected toolExecuter(mcpClient: IMcpClient, name: string): ToolExecuter {
    return {
      execute: async function (args, agentContext): Promise<ToolResult> {
        // Call MCP tool
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

  /**
   * Handle messages
   *
   * Pre-process and optimize conversation messages for context efficiency.
   *
   * @param agentContext Agent execution context
   * @param messages Messages to process
   * @param tools Available tools
   * @protected
   */
  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<void> {
    // Process large context messages, keep latest media and tool results
    memory.handleLargeContextMessages(messages);
  }

  /**
   * Call inner utility as tool result
   *
   * @param fun Async function to execute
   * @returns Formatted tool result
   * @protected
   */
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

  /**
   * Load tools (built-in + MCP if configured)
   *
   * @param context Execution context
   * @returns Complete tool list
   */
  public async loadTools(context: Context): Promise<Tool[]> {
    // Load external MCP tools if configured
    if (this.mcpClient) {
      let mcpTools = await this.listTools(context, this.mcpClient);
      if (mcpTools && mcpTools.length > 0) {
        // Merge MCP and built-in tools
        return mergeTools(this.tools, mcpTools);
      }
    }
    // Fallback to built-in tools
    return this.tools;
  }

  /**
   * Add a tool dynamically at runtime
   *
   * @param tool Tool instance
   */
  public addTool(tool: Tool) {
    this.tools.push(tool);
  }

  /**
   * Handle task status changes
   *
   * @param status New status (pause | abort | resume-pause)
   * @param reason Optional reason
   * @protected
   */
  protected async onTaskStatus(
    status: "pause" | "abort" | "resume-pause",
    reason?: string
  ) {
    // Clear variables when aborted
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

  /**
   * Get agent name
   * @returns Unique agent name
   */
  get Name(): string {
    return this.name;
  }

  /**
   * Get agent description
   * @returns Capability description
   */
  get Description(): string {
    return this.description;
  }

  /**
   * Get agent tools
   * @returns Built-in tool list
   */
  get Tools(): Tool[] {
    return this.tools;
  }

  /**
   * Get planning description
   */
  get PlanDescription() {
    return this.planDescription;
  }

  /**
   * Get MCP client
   * @returns MCP client or undefined
   */
  get McpClient() {
    return this.mcpClient;
  }

  /**
   * Get AgentContext
   * @returns AgentContext or undefined
   */
  get AgentContext(): AgentContext | undefined {
    return this.agentContext;
  }
}
