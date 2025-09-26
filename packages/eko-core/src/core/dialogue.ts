/**
 * Dialogue module
 *
 * Implements the dialogue management core and unified interaction entry point.
 * Tool-driven architecture integrates specialized tools to handle complex
 * requests.
 *
 * Architecture:
 * - EkoDialogue: orchestrates dialogue flow
 * - TaskPlannerTool: generates/modifies task plans
 * - ExecuteTaskTool: executes planned tasks
 * - TaskVariableStorageTool: manages dialogue context data
 * - EkoMemory: stores and compresses dialogue history
 *
 * Flow: user input -> dialogue manager -> tools -> planning -> execution -> result
 *
 * Traits:
 * - Tool-driven extensibility
 * - Segmented execution for complex multi-step tasks
 * - Context management and event-driven updates
 * - Robust error handling and retries
 */

import Log from "../common/log";
import {
  EkoMessage,
  ToolResult,
  DialogueTool,
  DialogueParams,
  DialogueCallback,
  EkoDialogueConfig,
  EkoMessageUserPart,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from "../types";
import {
  callChatLLM,
  convertToolResults,
  convertUserContent,
  convertAssistantToolResults,
} from "./dialogue/llm";
import { Eko } from "./eko";
import TaskPlannerTool, {
  TOOL_NAME as task_planner,
} from "./dialogue/task_planner";
import { RetryLanguageModel } from "../llm";
import { EkoMemory } from "../memory/memory";
import ExecuteTaskTool from "./dialogue/execute_task";
import { getDialogueSystemPrompt } from "../prompt/dialogue";
import TaskVariableStorageTool from "./dialogue/variable_storage";
import { convertTools, getTool, convertToolResult } from "../agent/llm";

/**
 * EkoDialogue: dialogue manager
 *
 * Coordinates complex interactions and integrates tools for planning,
 * execution, and context/state management.
 */
export class EkoDialogue {
  /** Dialogue history manager */
  protected memory: EkoMemory;

  /** External dialogue tools */
  protected tools: DialogueTool[];

  /** Dialogue system configuration */
  protected config: EkoDialogueConfig;

  /** Eko instance map: taskId -> Eko */
  protected ekoMap: Map<string, Eko>;

  /** Global context store for shared variables */
  protected globalContext: Map<string, any>;

  /**
   * Constructor
   */
  constructor(
    config: EkoDialogueConfig,
    memory?: EkoMemory,
    tools?: DialogueTool[]
  ) {
    this.config = config;
    this.tools = tools ?? [];
    this.ekoMap = new Map<string, Eko>();
    this.globalContext = new Map<string, any>();

    // Initialize memory with dialogue system prompt
    this.memory = memory ?? new EkoMemory(getDialogueSystemPrompt());
  }

  /**
   * Standard chat entry
   */
  public async chat(params: DialogueParams): Promise<string> {
    return this.doChat(params, false);
  }

  /**
   * Segmented execution entry
   */
  public async segmentedExecution(
    params: Omit<DialogueParams, "user">
  ): Promise<string> {
    // Retrieve full history
    const messages = this.memory.getMessages();
    const lastMessage = messages[messages.length - 1];

    // Ensure last message contains planner tool-call
    if (
      lastMessage.role !== "tool" ||
      !lastMessage.content.some((part) => part.toolName === task_planner)
    ) {
      throw new Error("No task planner tool call found");
    }

    // Extract last user message as context
    const userMessages = messages.filter((message) => message.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    // Delegate to segmented execution handler
    return this.doChat(
      {
        ...params,
        user: lastUserMessage.content as string | EkoMessageUserPart[],
        callback: params.callback,
        messageId: params.messageId || lastUserMessage.id,
        signal: params.signal,
      },
      true
    );
  }

  /**
   * Internal dialogue engine
   * @private
   */
  private async doChat(
    params: DialogueParams,
    segmentedExecution: boolean
  ): Promise<string> {
    // Handle user message (non-segmented only)
    if (!segmentedExecution) {
      // Generate or use provided messageId
      params.messageId = params.messageId ?? this.memory.genMessageId();
      // Append user message to history
      await this.addUserMessage(params.user, params.messageId);
    }

    // Initialize RetryLanguageModel
    const rlm = new RetryLanguageModel(this.config.llms, this.config.chatLlms);

    // Main loop, up to 15 iterations
    for (let i = 0; i < 15; i++) {
      // Build current message history
      const messages = this.memory.buildMessages();

      // Build tools (inner + external)
      const chatTools = [...this.buildInnerTools(params), ...this.tools];

      // Call LLM
      const results = await callChatLLM(
        params.messageId as string,
        rlm,
        messages,
        convertTools(chatTools),
        undefined,
        0,
        params.callback,
        params.signal
      );

      // Handle tool results
      const finalResult = await this.handleCallResult(
        chatTools,
        results,
        params.callback
      );

      // Return if final result is ready
      if (finalResult) {
        return finalResult;
      }

      // Check segmentedExecution trigger
      if (
        this.config.segmentedExecution &&
        results.some((r) => r.type == "tool-call" && r.toolName == task_planner)
      ) {
        return "segmentedExecution";
      }
    }

    // Max iterations reached
    return "Unfinished";
  }

  /**
   * Add user message to history
   * @protected
   */
  protected async addUserMessage(
    user: string | EkoMessageUserPart[],
    messageId: string
  ): Promise<EkoMessage> {
    // Create message object
    const message: EkoMessage = {
      id: messageId,
      role: "user",
      timestamp: Date.now(),
      content: user,
    };

    // Append to history
    await this.memory.addMessages([message]);
    return message;
  }

  /**
   * Build inner dialogue tools
   * @protected
   */
  protected buildInnerTools(params: DialogueParams): DialogueTool[] {
    return [
      // Task planner
      new TaskPlannerTool(this, params),

      // Task executor
      new ExecuteTaskTool(this),

      // Variable storage
      new TaskVariableStorageTool(this),
    ];
  }

  /**
   * Register an Eko instance
   */
  public addEko(taskId: string, eko: Eko): void {
    this.ekoMap.set(taskId, eko);
  }

  /**
   * Get Eko instance by taskId
   */
  public getEko(taskId: string): Eko | undefined {
    return this.ekoMap.get(taskId);
  }

  /**
   * Get global context store
   */
  public getGlobalContext(): Map<string, any> {
    return this.globalContext;
  }

  /**
   * Get dialogue configuration
   */
  public getConfig(): EkoDialogueConfig {
    return this.config;
  }

  /**
   * Handle tool-call results
   * @protected
   */
  protected async handleCallResult(
    chatTools: DialogueTool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>,
    dialogueCallback?: DialogueCallback
  ): Promise<string | null> {
    let text: string | null = null;
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];

    // If no results, return null
    if (results.length == 0) {
      return null;
    }

    // Handle each result part
    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      // Handle text part
      if (result.type == "text") {
        text = result.text;
        continue;
      }

      // Handle tool-call part
      let toolResult: ToolResult;
      try {
        // Parse tool arguments
        const args =
          typeof result.input == "string"
            ? JSON.parse(result.input || "{}")
            : result.input || {};

        // Find corresponding tool
        const tool = getTool(chatTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }

        // Execute tool
        toolResult = await tool.execute(args, result);
      } catch (e) {
        // Log tool-call error
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
      }

      // Fire tool result callback
      const callback = dialogueCallback?.chatCallback;
      if (callback) {
        await callback.onMessage({
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        });
      }

      // Convert tool result to LLM format
      const llmToolResult = convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }

    // Append assistant message to history
    await this.memory.addMessages([
      {
        id: this.memory.genMessageId(),
        role: "assistant",
        timestamp: Date.now(),
        content: convertAssistantToolResults(results),
      },
    ]);

    // If tool results exist, append them to history
    if (toolResults.length > 0) {
      await this.memory.addMessages([
        {
          id: this.memory.genMessageId(),
          role: "tool",
          timestamp: Date.now(),
          content: convertToolResults(toolResults),
        },
      ]);

      // Handle user messages generated by tools
      for (let i = 0; i < user_messages.length; i++) {
        const message = user_messages[i];
        if (message.role == "user") {
          await this.memory.addMessages([
            {
              id: this.memory.genMessageId(),
              role: "user",
              timestamp: Date.now(),
              content: convertUserContent(message.content),
            },
          ]);
        }
      }
      return null;
    } else {
      // Return pure text result
      return text;
    }
  }
}
