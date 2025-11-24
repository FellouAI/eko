import {
  EkoMessage,
  ToolResult,
  DialogueTool,
  DialogueParams,
  ChatStreamCallback,
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
} from "./llm";
import Log from "../common/log";
import global from "../config/global";
import { uuidv4 } from "../common/utils";
import DeepActionTool from "./deep-action";
import { RetryLanguageModel } from "../llm";
import { EkoMemory } from "../memory/memory";
import { ChatContext } from "./chat-context";
import WebpageQaTool from "./webpage-qa";
import WebSearchTool from "./web-search";
import { getChatSystemPrompt } from "../prompt/chat";
import TaskVariableStorageTool from "./variable-storage";
import { convertTools, getTool, convertToolResult } from "../agent/llm";

export class ChatAgent {
  protected chatContext: ChatContext;
  protected memory: EkoMemory;
  protected tools: DialogueTool[];

  constructor(
    config: EkoDialogueConfig,
    chatId: string = uuidv4(),
    memory?: EkoMemory,
    tools?: DialogueTool[]
  ) {
    this.tools = tools ?? [];
    const systemPrompt = getChatSystemPrompt();
    this.memory = memory ?? new EkoMemory(systemPrompt);
    this.chatContext = new ChatContext(chatId, config);
    global.chatMap.set(chatId, this.chatContext);
  }

  public async chat(params: DialogueParams): Promise<string> {
    return this.doChat(params, false);
  }

  private async doChat(
    params: DialogueParams,
    segmentedExecution: boolean
  ): Promise<string> {
    await this.addUserMessage(params.messageId, params.user);
    const config = this.chatContext.getConfig();
    const rlm = new RetryLanguageModel(config.llms, config.chatLlms);
    for (let i = 0; i < 15; i++) {
      const messages = this.memory.buildMessages();
      const chatTools = [...this.buildInnerTools(params), ...this.tools];
      const results = await callChatLLM(
        params.messageId,
        this.chatContext,
        rlm,
        messages,
        convertTools(chatTools),
        undefined,
        0,
        params.callback,
        params.signal
      );
      const finalResult = await this.handleCallResult(
        params.messageId,
        chatTools,
        results,
        params.callback
      );
      if (finalResult) {
        return finalResult;
      }
    }
    return "Unfinished";
  }

  protected async addUserMessage(
    messageId: string,
    user: string | EkoMessageUserPart[],
  ): Promise<EkoMessage> {
    const message: EkoMessage = {
      id: messageId,
      role: "user",
      timestamp: Date.now(),
      content: user,
    };
    await this.memory.addMessages([message]);
    return message;
  }

  protected buildInnerTools(params: DialogueParams): DialogueTool[] {
    return [
      new DeepActionTool(this.chatContext, params),
      new WebpageQaTool(this.chatContext, params),
      new WebSearchTool(this.chatContext, params),
      new TaskVariableStorageTool(this.chatContext, params),
    ];
  }

  public getChatContext(): ChatContext {
    return this.chatContext;
  }

  protected async handleCallResult(
    messageId: string,
    chatTools: DialogueTool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>,
    chatStreamCallback?: ChatStreamCallback
  ): Promise<string | null> {
    let text: string | null = null;
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];
    if (results.length == 0) {
      return null;
    }
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.type == "text") {
        text = result.text;
        continue;
      }
      let toolResult: ToolResult;
      try {
        const args =
          typeof result.input == "string"
            ? JSON.parse(result.input || "{}")
            : result.input || {};
        const tool = getTool(chatTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }
        toolResult = await tool.execute(args, result, messageId);
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
      }
      const callback = chatStreamCallback?.chatCallback;
      if (callback) {
        await callback.onMessage({
          streamType: "chat",
          chatId: this.chatContext.getChatId(),
          messageId: messageId,
          type: "tool_result",
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        });
      }
      const llmToolResult = convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }
    await this.memory.addMessages([
      {
        id: this.memory.genMessageId(),
        role: "assistant",
        timestamp: Date.now(),
        content: convertAssistantToolResults(results),
      },
    ]);
    if (toolResults.length > 0) {
      await this.memory.addMessages([
        {
          id: this.memory.genMessageId(),
          role: "tool",
          timestamp: Date.now(),
          content: convertToolResults(toolResults),
        },
      ]);
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
      return text;
    }
  }
}
