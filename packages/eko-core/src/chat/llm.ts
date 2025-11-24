import {
  LanguageModelV2FilePart,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolResultPart,
} from "@ai-sdk/provider";
import {
  LLMRequest,
  ChatStreamMessage,
  ChatStreamCallback,
  EkoMessageToolPart,
  EkoMessageUserPart,
  LanguageModelV2Prompt,
  EkoMessageAssistantPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolChoice,
  LanguageModelV2ToolCallPart,
  LanguageModelV2FunctionTool,
} from "../types";
import config from "../config";
import Log from "../common/log";
import { RetryLanguageModel } from "../llm";
import { ChatContext } from "./chat-context";
import { sleep, uuidv4 } from "../common/utils";

export async function callChatLLM(
  messageId: string,
  chatContext: ChatContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[],
  toolChoice?: LanguageModelV2ToolChoice,
  retryNum: number = 0,
  callback?: ChatStreamCallback,
  signal?: AbortSignal
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
  const streamCallback = callback?.chatCallback || {
    onMessage: async () => {},
  };
  const request: LLMRequest = {
    tools: tools,
    toolChoice,
    messages: messages,
    abortSignal: signal,
  };
  let streamText = "";
  let thinkText = "";
  let toolArgsText = "";
  let textStreamId = uuidv4();
  let thinkStreamId = uuidv4();
  let textStreamDone = false;
  const toolParts: LanguageModelV2ToolCallPart[] = [];
  let reader: ReadableStreamDefaultReader<LanguageModelV2StreamPart> | null =
    null;
  try {
    const result = await rlm.callStream(request);
    reader = result.stream.getReader();
    let toolPart: LanguageModelV2ToolCallPart | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = value as LanguageModelV2StreamPart;
      switch (chunk.type) {
        case "text-start": {
          textStreamId = uuidv4();
          break;
        }
        case "text-delta": {
          if (toolPart && !chunk.delta) {
            continue;
          }
          streamText += chunk.delta || "";
          await streamCallback.onMessage({
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "text",
            streamId: textStreamId,
            streamDone: false,
            text: streamText,
          });
          if (toolPart) {
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "tool_use",
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              params: toolPart.input || {},
            });
            toolPart = null;
          }
          break;
        }
        case "text-end": {
          textStreamDone = true;
          if (streamText) {
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
            });
          }
          break;
        }
        case "reasoning-start": {
          thinkStreamId = uuidv4();
          break;
        }
        case "reasoning-delta": {
          thinkText += chunk.delta || "";
          await streamCallback.onMessage({
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "thinking",
            streamId: thinkStreamId,
            streamDone: false,
            text: thinkText,
          });
          break;
        }
        case "reasoning-end": {
          if (thinkText) {
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "thinking",
              streamId: thinkStreamId,
              streamDone: true,
              text: thinkText,
            });
          }
          break;
        }
        case "tool-input-start": {
          if (toolPart && toolPart.toolCallId == chunk.id) {
            toolPart.toolName = chunk.toolName;
          } else {
            toolPart = {
              type: "tool-call",
              toolCallId: chunk.id,
              toolName: chunk.toolName,
              input: {},
            };
            toolParts.push(toolPart);
          }
          break;
        }
        case "tool-input-delta": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
            });
          }
          toolArgsText += chunk.delta || "";
          await streamCallback.onMessage({
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "tool_streaming",
            toolCallId: chunk.id,
            toolName: toolPart?.toolName || "",
            paramsText: toolArgsText,
          });
          break;
        }
        case "tool-call": {
          toolArgsText = "";
          const args = chunk.input ? JSON.parse(chunk.input) : {};
          const message: ChatStreamMessage = {
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "tool_use",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
          };
          await streamCallback.onMessage(message);
          if (toolPart == null) {
            toolParts.push({
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: message.params || args,
            });
          } else {
            toolPart.input = message.params || args;
            toolPart = null;
          }
          break;
        }
        case "error": {
          Log.error(`chatLLM error: `, chunk);
          await streamCallback.onMessage({
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "error",
            error: chunk.error,
          });
          throw new Error("LLM Error: " + chunk.error);
        }
        case "finish": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
            });
          }
          if (toolPart) {
            await streamCallback.onMessage({
              streamType: "chat",
              chatId: chatContext.getChatId(),
              messageId,
              type: "tool_use",
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              params: toolPart.input || {},
            });
            toolPart = null;
          }
          await streamCallback.onMessage({
            streamType: "chat",
            chatId: chatContext.getChatId(),
            messageId,
            type: "finish",
            finishReason: chunk.finishReason,
            usage: {
              promptTokens: chunk.usage.inputTokens || 0,
              completionTokens: chunk.usage.outputTokens || 0,
              totalTokens:
                chunk.usage.totalTokens ||
                (chunk.usage.inputTokens || 0) +
                  (chunk.usage.outputTokens || 0),
            },
          });
          break;
        }
      }
    }
  } catch (e: any) {
    if (retryNum < config.maxRetryNum) {
      await sleep(200 * (retryNum + 1) * (retryNum + 1));
      return callChatLLM(
        messageId,
        chatContext,
        rlm,
        messages,
        tools,
        toolChoice,
        ++retryNum,
        callback,
        signal
      );
    }
    throw e;
  } finally {
    reader && reader.releaseLock();
  }
  return streamText
    ? [
        { type: "text", text: streamText } as LanguageModelV2TextPart,
        ...toolParts,
      ]
    : toolParts;
}

export function convertAssistantToolResults(
  results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
): EkoMessageAssistantPart[] {
  return results.map((part) => {
    if (part.type == "text") {
      return {
        type: "text",
        text: part.text,
      };
    } else if (part.type == "tool-call") {
      return {
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: (part.input || {}) as any,
      };
    }
    return part;
  });
}

export function convertToolResults(
  toolResults: LanguageModelV2ToolResultPart[]
): EkoMessageToolPart[] {
  return toolResults.map((part) => {
    const output = part.output;
    return {
      type: "tool-result",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      result:
        output.type == "text" || output.type == "error-text"
          ? output.value
          : output.type == "json" || output.type == "error-json"
          ? (output.value as any)
          : output.value
              .map((s) => {
                if (s.type == "text") {
                  return s.text;
                } else if (s.type == "media") {
                  return JSON.stringify({
                    data: s.data,
                    mimeType: s.mediaType,
                  });
                }
              })
              .join("\n"),
    };
  });
}

export function convertUserContent(
  content: Array<LanguageModelV2TextPart | LanguageModelV2FilePart>
): EkoMessageUserPart[] {
  return content.map((part) => {
    if (part.type == "text") {
      return {
        type: "text",
        text: part.text,
      };
    } else if (part.type == "file") {
      return {
        type: "file",
        mimeType: part.mediaType,
        data: part.data + "",
      };
    }
    return part;
  });
}
