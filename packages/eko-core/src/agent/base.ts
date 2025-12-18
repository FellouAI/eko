import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "./chain";
import {
  McpTool,
  ForeachTaskTool,
  WatchTriggerTool,
  HumanInteractTool,
  VariableStorageTool,
} from "../tools";
import {
  Tool,
  ToolSchema,
  IMcpClient,
  LLMRequest,
  ToolResult,
  ToolExecuter,
  WorkflowAgent,
  HumanCallback,
  AgentStreamCallback,
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
} from "./agent-llm";
import { convertAssistantContent } from "../llm/react";
import TaskContext, { AgentContext } from "./agent-context";
import { doTaskResultCheck } from "../tools/task-result-check";
import { doTodoListManager } from "../tools/todo-list-manager";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";

export type AgentParams = {
  name: string;
  description: string;
  tools: Tool[];
  llms?: string[];
  mcpClient?: IMcpClient;
  planDescription?: string;
  requestHandler?: (request: LLMRequest) => void;
};

export class Agent {
  protected name: string;
  protected description: string;
  protected tools: Tool[] = [];
  protected llms?: string[];
  protected mcpClient?: IMcpClient;
  protected planDescription?: string;
  protected requestHandler?: (request: LLMRequest) => void;
  protected callback?: AgentStreamCallback & HumanCallback;
  protected agentContext?: AgentContext;

  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
    this.requestHandler = params.requestHandler;
  }

  public async run(
    context: TaskContext,
    agentChain: AgentChain
  ): Promise<string> {
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
    const tools = [
      ...this.tools,
      ...this.system_auto_tools(agentNode, agentContext),
    ];
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
      },
    ];
    agentContext.messages = messages;
    const rlm = new RetryLanguageModel(context.config.llms, this.llms);
    rlm.setContext(agentContext);
    let agentTools = tools;
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
        if (
          config.mode == "expert" &&
          loopNum % config.expertModeTodoLoopNum == 0
        ) {
          await doTodoListManager(agentContext, rlm, messages, llm_tools);
        }
        continue;
      }
      if (config.mode == "expert" && checkNum == 0) {
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
      content: convertAssistantContent(results),
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
        (s) =>
          agentTools.find((t) => t.name == s.toolName)?.supportParallelCalls
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
          streamType: "agent",
          chatId: context.chatId,
          taskId: context.taskId,
          agentName: agentContext.agent.Name,
          nodeId: agentContext.agentChain.agent.id,
          type: "tool_result",
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        },
        agentContext
      );
    }
    return convertToolResult(result, toolResult, user_messages);
  }

  protected system_auto_tools(
    agentNode: WorkflowAgent,
    agentContext: AgentContext
  ): Tool[] {
    const tools: Tool[] = [];
    const agentNodeXml = agentNode.xml;
    const hasVariable =
      agentNodeXml.indexOf("input=") > -1 ||
      agentNodeXml.indexOf("output=") > -1;
    if (hasVariable) {
      tools.push(new VariableStorageTool());
    } else {
      const dependentVariables =
        agentContext.context.variables.get("dependentVariables");
      if (dependentVariables && dependentVariables.length > 0) {
        tools.push(new VariableStorageTool());
      }
    }
    const hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
    if (hasForeach) {
      tools.push(new ForeachTaskTool());
    }
    const hasWatch = agentNodeXml.indexOf("</watch>") > -1;
    if (hasWatch) {
      tools.push(new WatchTriggerTool());
    }
    const callback = this.callback || agentContext.context.config.callback;
    if (
      callback?.onHumanConfirm ||
      callback?.onHumanInput ||
      callback?.onHumanSelect ||
      callback?.onHumanHelp
    ) {
      tools.push(new HumanInteractTool());
    }
    const toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

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
    context: TaskContext,
    mcpClient: IMcpClient,
    agentNode?: WorkflowAgent,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      if (!mcpClient.isConnected()) {
        await mcpClient.connect(context.controller.signal);
      }
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
    return {
      mcpTools: loopNum == 0,
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

  public async loadTools(context: TaskContext): Promise<Tool[]> {
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

  get Tools(): Tool[] {
    return this.tools;
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
