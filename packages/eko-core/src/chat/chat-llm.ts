import {
  LanguageModelV2FilePart,
  LanguageModelV2ToolResultPart,
} from "@ai-sdk/provider";
import {
  LLMRequest,
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
import { RetryLanguageModel, callLLM } from "../llm";

export async function callChatLLM(
  chatId: string,
  messageId: string,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[],
  toolChoice?: LanguageModelV2ToolChoice,
  callback?: ChatStreamCallback,
  signal?: AbortSignal
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
  const streamCallback = callback?.chatCallback || {
    onMessage: async () => {},
  };
  const request: LLMRequest = {
    tools,
    messages,
    toolChoice,
    abortSignal: signal,
  };
  return await callLLM(rlm, request, async (message) => {
    await streamCallback.onMessage({
      streamType: "chat",
      chatId,
      messageId,
      ...message,
    });
  });
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
