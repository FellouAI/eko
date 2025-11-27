import {
  PageTab,
  EkoMessage,
  ToolResult,
  DialogueTool,
  DialogueParams,
  EkoDialogueConfig,
  EkoMessageUserPart,
  ChatStreamCallback,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from "../types";
import {
  callChatLLM,
  convertToolResults,
  convertAssistantToolResults,
} from "./chat-llm";
import Log from "../common/log";
import global from "../config/global";
import { RetryLanguageModel } from "../llm";
import { EkoMemory } from "../memory/memory";
import { ChatContext } from "./chat-context";
import WebpageQaTool from "./tools/webpage-qa";
import WebSearchTool from "./tools/web-search";
import DeepActionTool from "./tools/deep-action";
import { getChatSystemPrompt } from "../prompt/chat";
import { mergeTools, uuidv4 } from "../common/utils";
import TaskVariableStorageTool from "./tools/variable-storage";
import { convertTools, getTool, convertToolResult } from "../agent/agent-llm";

export class ChatAgent {
  protected memory: EkoMemory;
  protected tools: DialogueTool[];
  protected chatContext: ChatContext;

  constructor(
    config: EkoDialogueConfig,
    chatId: string = uuidv4(),
    memory?: EkoMemory,
    tools?: DialogueTool[]
  ) {
    this.tools = tools ?? [];
    this.memory = memory ?? new EkoMemory();
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
    const runStartTime = Date.now();
    let reactLoopNum = 0;
    let errorInfo: string | null = null;
    try {
      if (params.callback?.chatCallback) {
        await params.callback.chatCallback.onMessage({
          streamType: "chat",
          chatId: this.chatContext.getChatId(),
          messageId: params.messageId,
          type: "chat_start",
        });
      }
      const chatTools = mergeTools(this.buildInnerTools(params), this.tools);
      await this.buildSystemPrompt(params, chatTools);
      await this.addUserMessage(params.messageId, params.user);
      const config = this.chatContext.getConfig();
      const rlm = new RetryLanguageModel(config.llms, config.chatLlms);
      for (; reactLoopNum < 15; reactLoopNum++) {
        const messages = this.memory.buildMessages();
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
        if (params.signal?.aborted) {
          const error = new Error("Operation was interrupted");
          error.name = "AbortError";
          throw error;
        }
      }
      reactLoopNum--;
      return "Unfinished";
    } catch (e: any) {
      Log.error("chat error: ", e);
      if (e instanceof Error) {
        errorInfo = e.name + ": " + e.message;
      } else {
        errorInfo = String(e);
      }
      return errorInfo;
    } finally {
      if (params.callback?.chatCallback) {
        await params.callback.chatCallback.onMessage({
          streamType: "chat",
          chatId: this.chatContext.getChatId(),
          messageId: params.messageId,
          type: "chat_end",
          error: errorInfo,
          duration: Date.now() - runStartTime,
          reactLoopNum: reactLoopNum + 1,
        });
      }
    }
  }

  public async initMessages(): Promise<void> {
    if (!global.chatService) {
      return;
    }
    const messages = this.memory.getMessages();
    if (messages.length == 0) {
      const messages = await global.chatService.loadMessages(
        this.chatContext.getChatId()
      );
      if (messages && messages.length > 0) {
        await this.memory.addMessages(messages);
      }
    }
  }

  protected async buildSystemPrompt(
    params: DialogueParams,
    chatTools: DialogueTool[]
  ): Promise<void> {
    let _memory = undefined;
    if (global.chatService) {
      try {
        const userPrompt = params.user
          .map((part) => (part.type == "text" ? part.text : ""))
          .join("\n")
          .trim();
        if (userPrompt) {
          _memory = await global.chatService.memoryRecall(
            this.chatContext.getChatId(),
            userPrompt
          );
        }
      } catch (e) {
        Log.error("chat service memory recall error: ", e);
      }
    }
    let _tabs: PageTab[] | undefined = undefined;
    if (global.browserService) {
      try {
        _tabs = await global.browserService.loadTabs(
          this.chatContext.getChatId()
        );
      } catch (e) {
        Log.error("browser service load tabs error: ", e);
      }
    }
    const datetime = params.datetime || new Date().toLocaleString();
    const systemPrompt = getChatSystemPrompt(
      chatTools,
      datetime,
      _memory,
      _tabs
    );
    this.memory.setSystemPrompt(systemPrompt);
  }

  protected async addUserMessage(
    messageId: string,
    user: string | EkoMessageUserPart[]
  ): Promise<EkoMessage> {
    const message: EkoMessage = {
      id: messageId,
      role: "user",
      timestamp: Date.now(),
      content: user,
    };
    await this.addMessages([message]);
    return message;
  }

  protected async addMessages(
    messages: EkoMessage[],
    storage: boolean = true
  ): Promise<void> {
    await this.memory.addMessages(messages);
    if (storage && global.chatService) {
      await global.chatService.addMessage(
        this.chatContext.getChatId(),
        messages
      );
    }
  }

  protected buildInnerTools(params: DialogueParams): DialogueTool[] {
    const tools: DialogueTool[] = [];
    tools.push(new DeepActionTool(this.chatContext, params));
    if (global.browserService) {
      tools.push(new WebpageQaTool(this.chatContext, params));
    }
    tools.push(new WebSearchTool(this.chatContext, params));
    tools.push(new TaskVariableStorageTool(this.chatContext, params));
    return tools;
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
      const llmToolResult = convertToolResult(result, toolResult);
      toolResults.push(llmToolResult);
    }
    await this.addMessages([
      {
        id: this.memory.genMessageId(),
        role: "assistant",
        timestamp: Date.now(),
        content: convertAssistantToolResults(results),
      },
    ]);
    if (toolResults.length > 0) {
      await this.addMessages([
        {
          id: this.memory.genMessageId(),
          role: "tool",
          timestamp: Date.now(),
          content: convertToolResults(toolResults),
        },
      ]);
      return null;
    } else {
      return text;
    }
  }
}
