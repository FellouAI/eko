import {
  LLMRequest,
  LLMErrorHandler,
  LLMStreamMessage,
  LLMFinishHandler,
  ReActLoopControl,
  LLMStreamCallback,
  ReActToolCallCallback,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultOutput,
} from "../types";
import {
  ReActTool,
  ReActRequest,
  ToolCallsOrCallback,
  ReActStreamCallback,
  ReActToolsAndCallback,
} from "../types/llm.types";
import config from "../config";
import Log from "../common/log";
import { RetryLanguageModel } from "./rlm";
import { sleep, uuidv4 } from "../common/utils";
import { LanguageModelV2StreamPart } from "@ai-sdk/provider";

export async function callWithReAct(
  rlm: RetryLanguageModel,
  request: LLMRequest,
  toolCallCallback: ReActToolCallCallback,
  streamCallback?: ReActStreamCallback,
  errorHandler?: LLMErrorHandler,
  finishHandler?: LLMFinishHandler,
  loopControl?: ReActLoopControl
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>>;

export async function callWithReAct(
  rlm: RetryLanguageModel,
  request: Omit<LLMRequest, "tools">,
  tools: ReActTool[],
  streamCallback?: ReActStreamCallback,
  errorHandler?: LLMErrorHandler,
  finishHandler?: LLMFinishHandler,
  loopControl?: ReActLoopControl
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>>;

export async function callWithReAct(
  rlm: RetryLanguageModel,
  request: Omit<LLMRequest, "tools">,
  toolsAndCallback: ReActToolsAndCallback,
  streamCallback?: ReActStreamCallback,
  errorHandler?: LLMErrorHandler,
  finishHandler?: LLMFinishHandler,
  loopControl?: ReActLoopControl
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>>;

export async function callWithReAct(
  rlm: RetryLanguageModel,
  request: ReActRequest,
  toolCallsOrCallback: ToolCallsOrCallback,
  streamCallback?: ReActStreamCallback,
  errorHandler?: LLMErrorHandler,
  finishHandler?: LLMFinishHandler,
  loopControl?: ReActLoopControl
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
  if (!loopControl) {
    loopControl = async (request, assistantParts, loopNum) => {
      if (loopNum >= 15) {
        return false;
      }
      return assistantParts.filter((s) => s.type == "tool-call").length > 0;
    };
  }
  if (typeof toolCallsOrCallback !== "function") {
    (request as LLMRequest).tools = (
      Array.isArray(toolCallsOrCallback)
        ? toolCallsOrCallback
        : toolCallsOrCallback.tools
    ).map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }
  let loopNum = 0;
  let assistantParts: Array<
    LanguageModelV2TextPart | LanguageModelV2ToolCallPart
  > | null = null;
  while (true) {
    await streamCallback?.({
      type: "loop_start",
      request,
      loopNum,
    });
    assistantParts = await callLLM(
      rlm,
      request,
      streamCallback,
      errorHandler,
      finishHandler
    );
    if (assistantParts.length > 0) {
      request.messages.push({
        role: "assistant",
        content: convertAssistantContent(assistantParts),
      });
    }
    const continueLoop = await loopControl(request, assistantParts, loopNum);
    if (!continueLoop) {
      await streamCallback?.({
        type: "loop_end",
        request,
        loopNum,
        continueLoop,
      });
      break;
    }
    const toolUses = assistantParts.filter((s) => s.type == "tool-call");

    let toolResults: LanguageModelV2ToolResultOutput[];
    if (typeof toolCallsOrCallback === "function") {
      toolResults = await toolCallsOrCallback(request, toolUses);
    } else {
      const tools = Array.isArray(toolCallsOrCallback)
        ? toolCallsOrCallback
        : toolCallsOrCallback.tools;
      if (!Array.isArray(toolCallsOrCallback) && toolCallsOrCallback.callback) {
        toolResults = await toolCallsOrCallback.callback(
          request,
          toolUses,
          tools
        );
      } else {
        toolResults = await Promise.all(
          toolUses.map(async (toolUse) => {
            const tool = tools.find((t) => t.name === toolUse.toolName);
            if (!tool) {
              throw new Error(`Tool ${toolUse.toolName} not found`);
            }
            const args =
              typeof toolUse.input === "string"
                ? JSON.parse(toolUse.input || "{}")
                : toolUse.input || {};
            try {
              return tool.execute(args, toolUse);
            } catch (e) {
              Log.error(
                "tool call error: ",
                toolUse.toolName,
                toolUse.input,
                e
              );
              return {
                type: "error-text",
                value: "Error: " + (e + "") || "Unknown error",
              };
            }
          })
        );
      }
    }

    if (toolResults.length > 0) {
      request.messages.push({
        role: "tool",
        content: toolResults.map((result, index) => ({
          type: "tool-result",
          toolCallId: toolUses[index].toolCallId,
          toolName: toolUses[index].toolName,
          output: result,
        })),
      });
    }

    await streamCallback?.({
      type: "loop_end",
      request,
      loopNum,
      continueLoop,
    });

    loopNum++;
  }
  return assistantParts;
}

export async function callLLM(
  rlm: RetryLanguageModel,
  request: LLMRequest,
  streamCallback?: LLMStreamCallback,
  errorHandler?: LLMErrorHandler,
  finishHandler?: LLMFinishHandler,
  retryNum: number = 0
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
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
          await streamCallback?.({
            type: "text",
            streamId: textStreamId,
            streamDone: false,
            text: streamText,
            newTextLength: chunk.delta?.length || 0,
          });
          if (toolPart) {
            await streamCallback?.({
              type: "tool_use",
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              params: toolPart.input || {},
              providerMetadata: toolPart.providerOptions,
            });
            toolPart = null;
          }
          break;
        }
        case "text-end": {
          textStreamDone = true;
          if (streamText) {
            await streamCallback?.({
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
              newTextLength: 0,
              providerMetadata: chunk.providerMetadata,
            });
          }
          break;
        }
        case "reasoning-start": {
          thinkStreamId = chunk.id || uuidv4();
          break;
        }
        case "reasoning-delta": {
          thinkText += chunk.delta || "";
          await streamCallback?.({
            type: "thinking",
            streamId: thinkStreamId,
            streamDone: false,
            text: thinkText,
            newTextLength: chunk.delta?.length || 0,
          });
          break;
        }
        case "reasoning-end": {
          if (thinkText) {
            await streamCallback?.({
              type: "thinking",
              streamId: thinkStreamId,
              streamDone: true,
              text: thinkText,
              newTextLength: 0,
            });
          }
          break;
        }
        case "tool-input-start": {
          if (toolPart && toolPart.toolCallId == chunk.id) {
            toolPart.toolName = chunk.toolName;
          } else {
            const _toolPart = toolParts.filter(
              (s) => s.toolCallId == chunk.id
            )[0];
            if (_toolPart) {
              toolPart = _toolPart;
              toolPart.toolName = _toolPart.toolName || chunk.toolName;
              toolPart.input = _toolPart.input || {};
              toolPart.providerOptions = _toolPart.providerOptions;
            } else {
              toolPart = {
                type: "tool-call",
                toolCallId: chunk.id,
                toolName: chunk.toolName,
                input: {},
                providerOptions: chunk.providerMetadata,
              };
              toolParts.push(toolPart);
            }
          }
          break;
        }
        case "tool-input-delta": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback?.({
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
              newTextLength: 0,
            });
          }
          toolArgsText += chunk.delta || "";
          await streamCallback?.({
            type: "tool_streaming",
            toolCallId: chunk.id,
            toolName: toolPart?.toolName || "",
            paramsText: toolArgsText,
            newTextLength: chunk.delta?.length || 0,
          });
          break;
        }
        case "tool-call": {
          toolArgsText = "";
          const args = chunk.input ? JSON.parse(chunk.input) : {};
          const message: LLMStreamMessage = {
            type: "tool_use",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
            providerMetadata: chunk.providerMetadata,
          };
          await streamCallback?.(message);
          if (toolPart == null) {
            const _toolPart = toolParts.filter(
              (s) => s.toolCallId == chunk.toolCallId
            )[0];
            if (_toolPart) {
              _toolPart.input = message.params || args;
              _toolPart.providerOptions = chunk.providerMetadata;
            } else {
              toolParts.push({
                type: "tool-call",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: message.params || args,
                providerOptions: chunk.providerMetadata,
              });
            }
          } else {
            toolPart.input = message.params || args;
            toolPart.providerOptions = chunk.providerMetadata;
            toolPart = null;
          }
          break;
        }
        case "file": {
          await streamCallback?.({
            type: "file",
            mimeType: chunk.mediaType,
            data: chunk.data as string,
          });
          break;
        }
        case "raw": {
          await streamCallback?.({
            type: "raw",
            rawValue: chunk.rawValue,
          });
          break;
        }
        case "error": {
          Log.error(`chatLLM error: `, chunk);
          await streamCallback?.({
            type: "error",
            error: chunk.error,
          });
          throw new Error("LLM Error: " + chunk.error);
        }
        case "finish": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback?.({
              type: "text",
              streamId: textStreamId,
              streamDone: true,
              text: streamText,
              newTextLength: 0,
            });
          }
          if (toolPart) {
            await streamCallback?.({
              type: "tool_use",
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              params: toolPart.input || {},
              providerMetadata: toolPart.providerOptions,
            });
            toolPart = null;
          }
          if (finishHandler) {
            const type = await finishHandler(
              request,
              chunk.finishReason,
              chunk,
              retryNum
            );
            if (type == "retry") {
              await sleep(200 * (retryNum + 1) * (retryNum + 1));
              return callLLM(
                rlm,
                request,
                streamCallback,
                errorHandler,
                finishHandler,
                ++retryNum
              );
            }
          }
          await streamCallback?.({
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
            providerMetadata: chunk.providerMetadata,
          });
          break;
        }
      }
    }
  } catch (e: any) {
    if (retryNum < config.maxRetryNum) {
      await sleep(200 * (retryNum + 1) * (retryNum + 1));
      if (errorHandler) {
        await errorHandler(request, e, retryNum);
      }
      return callLLM(
        rlm,
        request,
        streamCallback,
        errorHandler,
        finishHandler,
        ++retryNum
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

export function convertAssistantContent(
  assistantParts: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
): Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart> {
  return assistantParts
    .filter((part) => part.type == "text" || part.type == "tool-call")
    .map((part) =>
      part.type === "text"
        ? {
            type: "text",
            text: part.text,
          }
        : {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input:
              typeof part.input == "string"
                ? JSON.parse(part.input || "{}")
                : part.input || {},
            providerOptions: part.providerOptions,
          }
    );
}
