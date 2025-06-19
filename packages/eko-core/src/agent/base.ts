import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import {
  ForeachTaskTool,
  McpTool,
  VariableStorageTool,
  WatchTriggerTool,
} from "../tools";
import ActionBlockTool from "../tools/action_block";
import { toImage, mergeTools, uuidv4, loadImageFile } from "../common/utils";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";
import {
  WorkflowAgent,
  IMcpClient,
  LLMRequest,
  Tool,
  ToolExecuter,
  ToolResult,
  ToolSchema,
  StreamCallbackMessage,
  StreamCallback,
  HumanCallback,
} from "../types";
import {
  LanguageModelV1FilePart,
  LanguageModelV1FunctionTool,
  LanguageModelV1ImagePart,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolChoice,
  LanguageModelV1ToolResultPart,
} from "@ai-sdk/provider";

export type AgentParams = {
  name: string;
  description: string;
  tools: Tool[];
  llms?: string[];
  mcpClient?: IMcpClient;
  planDescription?: string;
};

export class Agent {
  protected name: string;
  protected description: string;
  protected tools: Tool[] = [];
  protected llms?: string[];
  protected mcpClient?: IMcpClient;
  protected planDescription?: string;
  protected callback?: StreamCallback & HumanCallback;
  protected agentContext?: AgentContext;

  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
  }

  public async run(context: Context, agentChain: AgentChain): Promise<string> {
    let mcpClient = this.mcpClient || context.config.defaultMcpClient;
    let agentContext = new AgentContext(context, this, agentChain);
    try {
      this.agentContext = agentContext;
      mcpClient && !mcpClient.isConnected() && (await mcpClient.connect());
      return this.runWithContext(agentContext, mcpClient, config.maxReactNum);
    } finally {
      mcpClient && (await mcpClient.close());
    }
  }

  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100
  ): Promise<string> {
    let loopNum = 0;
    let context = agentContext.context;
    let agentNode = agentContext.agentChain.agent;
    const tools = [...this.tools, ...this.system_auto_tools(agentNode)];
    let messages: LanguageModelV1Prompt = [
      {
        role: "system",
        content: await this.buildSystemPrompt(agentContext, tools),
      },
      {
        role: "user",
        content: await this.buildUserPrompt(agentContext, tools),
      },
    ];
    let rlm = new RetryLanguageModel(context.config.llms, this.llms);
    let agentTools = tools;
    
    // Check if we're in sequential mode
    const isSequentialMode = agentNode.sequentialMode === true;
    if (isSequentialMode) {
      Log.info(`Agent ${agentNode.name} running in sequential mode`);
    }
    
    while (loopNum < maxReactNum) {
      await context.checkAborted();
      
      // In sequential mode, try to execute action blocks directly
      if (isSequentialMode) {
        const executedAction = await this.tryExecuteNextActionBlock(agentContext, messages, agentTools);
        if (executedAction) {
          // Successfully executed an action block, continue to next iteration
          loopNum++;
          continue;
        }
        
        // Check if all nodes are completed
        const completedNodeIds = agentContext.variables.get('completedNodeIds') || new Set<number>();
        if (completedNodeIds.size >= agentNode.nodes.length) {
          Log.info(`All ${agentNode.nodes.length} nodes completed in sequential mode`);
          return "All nodes completed successfully";
        }
      }
      
      if (mcpClient) {
        let controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          let mcpTools = await this.listTools(
            context,
            mcpClient,
            agentNode,
            controlMcp.mcpParams
          );
          let usedTools = memory.extractUsedTool(messages, agentTools);
          let _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }
      await this.handleMessages(agentContext, messages, agentTools);
      let results = await callLLM(
        agentContext,
        rlm,
        messages,
        this.convertTools(agentTools),
        false,
        undefined,
        false,
        this.callback
      );
      let finalResult = await this.handleCallResult(
        agentContext,
        messages,
        agentTools,
        results
      );
      
      // In sequential mode, check if we need to auto-progress after LLM handles a non-action node
      if (isSequentialMode && !finalResult) {
        const completedNodeIds = agentContext.variables.get('completedNodeIds') || new Set<number>();
        const currentNodeId = this.getCurrentNodeId(agentContext);
        if (currentNodeId !== -1 && !completedNodeIds.has(currentNodeId)) {
          // Mark current node as completed
          completedNodeIds.add(currentNodeId);
          agentContext.variables.set('completedNodeIds', completedNodeIds);
          Log.info(`Sequential mode: marked node ${currentNodeId} as completed after LLM handling`);
        }
      }
      
      if (finalResult) {
        return finalResult;
      }
      loopNum++;
    }
    return "Unfinished";
  }

  protected async handleCallResult(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>
  ): Promise<string | null> {
    let text: string | null = null;
    let context = agentContext.context;
    let user_messages: LanguageModelV1Prompt = [];
    let toolResults: LanguageModelV1ToolResultPart[] = [];
    results = memory.removeDuplicateToolUse(results);
    if (results.length == 0) {
      return null;
    }
    for (let i = 0; i < results.length; i++) {
      let result = results[i];
      if (result.type == "text") {
        text = result.text;
        continue;
      }
      let toolResult: ToolResult;
      let toolChain = new ToolChain(
        result,
        agentContext.agentChain.agentRequest as LLMRequest
      );
      agentContext.agentChain.push(toolChain);
      try {
        let args =
          typeof result.args == "string"
            ? JSON.parse(result.args || "{}")
            : result.args || {};
        toolChain.params = args;
        let tool = this.getTool(agentTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }
        toolResult = await tool.execute(args, agentContext, result);
        toolChain.updateToolResult(toolResult);
        agentContext.consecutiveErrorNum = 0;
      } catch (e) {
        Log.error("tool call error: ", result.toolName, result.args, e);
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
            params: result.args || {},
            toolResult: toolResult,
          },
          agentContext
        );
      }
      let llmToolResult = this.convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }
    messages.push({
      role: "assistant",
      content: results,
    });
    if (toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: toolResults,
      });
      user_messages.forEach((message) => messages.push(message));
      return null;
    } else {
      return text;
    }
  }

  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    Log.info(`system_auto_tools called for agent: ${this.name}`);
    let tools: Tool[] = [];
    let agentNodeXml = agentNode.xml;
    Log.info(`agentNodeXml contains action tag: ${agentNodeXml.includes('</action>')}, length: ${agentNodeXml.length}`);
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
    // Check if any nodes have action blocks
    let hasActionBlock = false;
    if (agentNode.nodes) {
      Log.info(`Agent has ${agentNode.nodes.length} nodes`);
      hasActionBlock = agentNode.nodes.some(node => 
        node.type === 'normal' && node.action !== undefined
      );
    } else {
      Log.info(`Agent has no nodes`);
    }
    Log.info(`hasActionBlock: ${hasActionBlock}, agent name: ${this.name}, sequentialMode: ${agentNode.sequentialMode}`);
    if (hasActionBlock && this.name === "Browser") {
      // Only add for browser agents
      Log.info(`Adding ActionBlockTool for Browser agent with action blocks`);
      tools.push(new ActionBlockTool());
    }
    let toolNames = this.tools.map((tool) => tool.name);
    Log.info(`Existing tool names: ${toolNames.join(', ')}`);
    Log.info(`System auto tools before filter: ${tools.map(t => t.name).join(', ')}`);
    const filteredTools = tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
    Log.info(`System auto tools after filter: ${filteredTools.map(t => t.name).join(', ')}`);
    return filteredTools;
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
  ): Promise<
    Array<
      | LanguageModelV1TextPart
      | LanguageModelV1ImagePart
      | LanguageModelV1FilePart
    >
  > {
    const parts: Array<
      | LanguageModelV1TextPart
      | LanguageModelV1ImagePart
      | LanguageModelV1FilePart
    > = [
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

    // Add screenshots from workflow XML if available
    const workflowAgent = agentContext.agentChain.agent;
    if (workflowAgent.nodes && agentContext.context.workflowDirectory) {
      for (const node of workflowAgent.nodes) {
        if (node.type === "normal" && node.action?.screenshot) {
          const screenshotPath = node.action.screenshot;
          // Resolve path relative to workflow directory
          const fullPath = screenshotPath.startsWith('/') 
            ? screenshotPath 
            : `${agentContext.context.workflowDirectory}/${screenshotPath}`;
          
          const imageData = loadImageFile(fullPath);
          if (imageData) {
            parts.push({
              type: "image",
              image: toImage(imageData.base64),
              mimeType: imageData.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            });
            parts.push({
              type: "text",
              text: `Screenshot from workflow: ${screenshotPath}`,
            });
          }
        }
      }
    }

    return parts;
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
        await mcpClient.connect();
      }
      let list = await mcpClient.listTools({
        taskId: context.taskId,
        nodeId: agentNode?.id,
        environment: config.platform,
        agent_name: agentNode?.name || this.name,
        params: {},
        prompt: agentNode?.task || context.chain.taskPrompt,
        ...(mcpParams || {}),
      });
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
    messages: LanguageModelV1Prompt,
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
        return await mcpClient.callTool({
          name: name,
          arguments: args,
          extInfo: {
            taskId: agentContext.context.taskId,
            nodeId: agentContext.agentChain.agent.id,
            environment: config.platform,
            agent_name: agentContext.agent.Name,
          },
        });
      },
    };
  }

  private convertTools(tools: Tool[]): LanguageModelV1FunctionTool[] {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  private getTool(tools: Tool[], name: string): Tool | null {
    for (let i = 0; i < tools.length; i++) {
      if (tools[i].name == name) {
        return tools[i];
      }
    }
    return null;
  }

  protected convertToolResult(
    toolUse: LanguageModelV1ToolCallPart,
    toolResult: ToolResult,
    user_messages: LanguageModelV1Prompt
  ): LanguageModelV1ToolResultPart {
    let text = "";
    for (let i = 0; i < toolResult.content.length; i++) {
      let content = toolResult.content[i];
      if (content.type == "text") {
        text += (text.length > 0 ? "\n" : "") + content.text;
      } else {
        // Only the calude model supports returning images from tool results, while openai only supports text,
        // Compatible with other AI models that do not support tool results as images.
        user_messages.push({
          role: "user",
          content: [
            {
              type: "image",
              image: toImage(content.data),
              mimeType: content.mimeType,
            },
            { type: "text", text: `call \`${toolUse.toolName}\` tool result` },
          ],
        });
      }
    }
    let isError = toolResult.isError == true;
    if (isError && !text.startsWith("Error")) {
      text = "Error: " + text;
    } else if (!isError && text.length == 0) {
      text = "Successful";
    }
    let contentText: {
      type: "text";
      text: string;
    } | null = {
      type: "text",
      text: text,
    };
    let result: unknown = text;
    if (
      text &&
      ((text.startsWith("{") && text.endsWith("}")) ||
        (text.startsWith("[") && text.endsWith("]")))
    ) {
      try {
        result = JSON.parse(text);
        contentText = null;
      } catch (e) {}
    }
    return {
      type: "tool-result",
      toolCallId: toolUse.toolCallId,
      toolName: toolUse.toolName,
      result: result,
      content: contentText ? [contentText] : undefined,
      isError: isError,
    };
  }

  /**
   * Try to execute the next action block directly without going through LLM tool selection
   * This makes execution much faster for deterministic actions
   * Returns true if a node was executed, false otherwise
   */
  protected async tryExecuteNextActionBlock(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    tools: Tool[]
  ): Promise<boolean> {
    Log.info(`tryExecuteNextActionBlock called for agent: ${this.name}`);
    
    // Only process for Browser agents with action blocks
    if (this.name !== "Browser") {
      Log.info(`Skipping direct execution - not a Browser agent`);
      return false;
    }

    // Check if ActionBlockTool is available
    const actionBlockTool = tools.find(t => t.name === "execute_action_block");
    if (!actionBlockTool) {
      Log.info(`No ActionBlockTool found in tools`);
      return false;
    }
    
    const agentNode = agentContext.agentChain.agent;
    
    // Check if we're in sequential mode
    if (!agentNode.sequentialMode) {
      Log.info(`Agent not in sequential mode, skipping direct execution`);
      return false;
    }
    
    Log.info(`Agent in sequential mode, checking for next action block...`);

    // Get completed node IDs from context
    const completedNodeIds = agentContext.variables.get('completedNodeIds') || new Set<number>();
    
    // Get the workflow nodes directly from the agent
    const nodes = agentNode.nodes;
    
    Log.info(`Found ${nodes?.length || 0} nodes in workflow, ${completedNodeIds.size} completed`);

    // Find the next uncompleted node
    let nextNodeId = -1;
    for (let nodeId = 0; nodeId < nodes.length; nodeId++) {
      if (!completedNodeIds.has(nodeId)) {
        nextNodeId = nodeId;
        break;
      }
    }
    
    if (nextNodeId === -1) {
      Log.info(`All nodes completed`);
      return false;
    }

    const node = nodes[nextNodeId];
    
    // Only process normal nodes with action blocks
    if (node.type !== 'normal' || !node.action) {
      // This node doesn't have an action block, let LLM handle it
      Log.info(`Node ${nextNodeId} has no action block, skipping direct execution`);
      return false;
    }

    Log.info(`Executing action block directly for node ${nextNodeId}: ${node.action.type}`);

    try {
      // Execute the action block
      const mockToolCall: LanguageModelV1ToolCallPart = {
        type: 'tool-call',
        toolCallId: `direct-${nextNodeId}`,
        toolName: 'execute_action_block',
        args: { nodeId: nextNodeId }
      };
      const result = await actionBlockTool.execute(
        { nodeId: nextNodeId },
        agentContext,
        mockToolCall
      );

      // Check if it was successful
      const isError = result.isError || false;
      const content = result.content
        .map((c: any) => (c.type === "text" ? c.text : ""))
        .join("\n");

      if (!isError) {
        // Success - mark node as completed
        completedNodeIds.add(nextNodeId);
        agentContext.variables.set('completedNodeIds', completedNodeIds);

        // Update node status if task_node_status tool is available (for non-sequential mode compatibility)
        const taskStatusTool = tools.find(t => t.name === "task_node_status");
        if (taskStatusTool && !agentNode.sequentialMode) {
          // Calculate remaining todo nodes
          const todoIds = [];
          for (let i = nextNodeId + 1; i < nodes.length; i++) {
            if (!completedNodeIds.has(i)) {
              todoIds.push(i);
            }
          }

          const mockStatusCall: LanguageModelV1ToolCallPart = {
            type: 'tool-call',
            toolCallId: `status-${nextNodeId}`,
            toolName: 'task_node_status',
            args: {
              doneIds: Array.from(completedNodeIds),
              todoIds: todoIds,
              thought: `Action block executed successfully for node ${nextNodeId}`,
            }
          };
          await taskStatusTool.execute(
            {
              doneIds: Array.from(completedNodeIds),
              todoIds: todoIds,
              thought: `Action block executed successfully for node ${nextNodeId}`,
            },
            agentContext,
            mockStatusCall
          );
        }

        // Add tool result to messages
        messages.push({
          role: "assistant",
          content: [{
            type: "tool-call",
            toolCallId: mockToolCall.toolCallId,
            toolName: mockToolCall.toolName,
            args: mockToolCall.args
          }]
        });
        
        messages.push({
          role: "tool",
          content: [{
            type: "tool-result",
            toolCallId: mockToolCall.toolCallId,
            toolName: mockToolCall.toolName,
            result: content
          }]
        });

        Log.info(`Successfully executed action block for node ${nextNodeId}`);
        return true;
      } else {
        // Action failed, let the LLM take over with the error context
        Log.info(`Action block failed for node ${nextNodeId}, falling back to LLM`);
        
        // Add a note in the conversation about the failure
        agentContext.context.conversation.push(
          `Note: Attempted to execute the action block for node ${nextNodeId} but it failed with: ${content}. Please complete this step using alternative methods.`
        );
        
        return false;
      }
    } catch (error) {
      Log.error(`Error executing action block for node ${nextNodeId}:`, error);
      return false;
    }
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    tools: Tool[]
  ): Promise<void> {
    // Only keep the last image / file, large tool-text-result
    memory.handleLargeContextMessages(messages);
    
    // User dialogue
    const userPrompts = agentContext.context.conversation
      .splice(0, agentContext.context.conversation.length)
      .filter((s) => !!s);
    if (userPrompts.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role == "user") {
        for (let i = 0; i < userPrompts.length; i++) {
          lastMessage.content.push({
            type: "text",
            text: userPrompts[i],
          });
        }
      } else {
        messages.push({
          role: "user",
          content: userPrompts.map((s) => {
            return { type: "text", text: s };
          }),
        });
      }
    }
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
  
  /**
   * Get the current node ID based on completed nodes
   */
  protected getCurrentNodeId(agentContext: AgentContext): number {
    const completedNodeIds = agentContext.variables.get('completedNodeIds') || new Set<number>();
    const agentNode = agentContext.agentChain.agent;
    const nodes = agentNode.nodes;
    
    // Find the first uncompleted node
    for (let i = 0; i < nodes.length; i++) {
      if (!completedNodeIds.has(i)) {
        return i;
      }
    }
    
    return -1; // All nodes completed
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

  protected async onTaskStatus(status: "pause" | "abort" | "resume-pause") {}

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
}

export async function callLLM(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV1Prompt,
  tools: LanguageModelV1FunctionTool[],
  noCompress?: boolean,
  toolChoice?: LanguageModelV1ToolChoice,
  retry?: boolean,
  callback?: StreamCallback & HumanCallback
): Promise<Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>> {
  if (messages.length >= config.compressThreshold && !noCompress) {
    await memory.compressAgentMessages(agentContext, rlm, messages, tools);
  }
  let context = agentContext.context;
  let agentChain = agentContext.agentChain;
  let agentNode = agentChain.agent;
  let streamCallback = callback ||
    context.config.callback || {
      onMessage: async () => {},
    };
  let request: LLMRequest = {
    tools: tools,
    toolChoice,
    messages: messages,
    abortSignal: context.controller.signal,
  };
  agentChain.agentRequest = request;
  let result = await rlm.callStream(request);
  let streamText = "";
  let thinkText = "";
  let toolArgsText = "";
  let streamId = uuidv4();
  let textStreamDone = false;
  let toolParts: LanguageModelV1ToolCallPart[] = [];
  const reader = result.stream.getReader();
  try {
    let toolPart: LanguageModelV1ToolCallPart | null = null;
    while (true) {
      await context.checkAborted();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let chunk = value as LanguageModelV1StreamPart;
      switch (chunk.type) {
        case "text-delta": {
          if (toolPart && !chunk.textDelta) {
            continue;
          }
          streamText += chunk.textDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "text",
              streamId,
              streamDone: false,
              text: streamText,
            },
            agentContext
          );
          if (toolPart) {
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "tool_use",
                toolId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                params: toolPart.args || {},
              },
              agentContext
            );
            toolPart = null;
          }
          break;
        }
        case "reasoning": {
          thinkText += chunk.textDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "thinking",
              streamId,
              streamDone: false,
              text: thinkText,
            },
            agentContext
          );
          break;
        }
        case "tool-call-delta": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          toolArgsText += chunk.argsTextDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "tool_streaming",
              toolId: chunk.toolCallId,
              toolName: chunk.toolName,
              paramsText: toolArgsText,
            },
            agentContext
          );
          if (toolPart == null) {
            toolPart = {
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: {},
            };
            toolParts.push(toolPart);
          }
          break;
        }
        case "tool-call": {
          toolArgsText = "";
          let args = chunk.args ? JSON.parse(chunk.args) : {};
          let message: StreamCallbackMessage = {
            taskId: context.taskId,
            agentName: agentNode.name,
            nodeId: agentNode.id,
            type: "tool_use",
            toolId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
          };
          await streamCallback.onMessage(message, agentContext);
          if (toolPart == null) {
            toolParts.push({
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: message.params || args,
            });
          } else {
            toolPart.args = message.params || args;
            toolPart = null;
          }
          break;
        }
        case "file": {
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "file",
              mimeType: chunk.mimeType,
              data: chunk.data as string,
            },
            agentContext
          );
          break;
        }
        case "error": {
          Log.error(`${agentNode.name} agent error: `, chunk);
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "error",
              error: chunk.error,
            },
            agentContext
          );
          throw new Error("LLM Error: " + chunk.error);
        }
        case "finish": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          if (toolPart) {
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "tool_use",
                toolId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                params: toolPart.args || {},
              },
              agentContext
            );
            toolPart = null;
          }
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "finish",
              finishReason: chunk.finishReason,
              usage: chunk.usage,
            },
            agentContext
          );
          if (
            chunk.finishReason === "length" &&
            messages.length >= 10 &&
            !noCompress &&
            !retry
          ) {
            await memory.compressAgentMessages(
              agentContext,
              rlm,
              messages,
              tools
            );
            return callLLM(
              agentContext,
              rlm,
              messages,
              tools,
              noCompress,
              toolChoice,
              true,
              streamCallback
            );
          }
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  agentChain.agentResult = streamText;
  return streamText
    ? [
        { type: "text", text: streamText } as LanguageModelV1TextPart,
        ...toolParts,
      ]
    : toolParts;
}
