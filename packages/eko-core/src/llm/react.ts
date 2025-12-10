import {
  LLMRequest,
  ReActLoopControl,
  ReActErrorHandler,
  ReActFinishHandler,
  ReActStreamMessage,
  ReActStreamCallback,
  ReActToolCallCallback,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
} from "../types";
import config from "../config";
import Log from "../common/log";
import { RetryLanguageModel } from ".";
import { sleep, uuidv4 } from "../common/utils";
import { LanguageModelV2StreamPart } from "@ai-sdk/provider";

export async function callWithReAct(
  rlm: RetryLanguageModel,
  request: LLMRequest,
  toolCallCallback: ReActToolCallCallback,
  streamCallback?: ReActStreamCallback,
  errorHandler?: ReActErrorHandler,
  finishHandler?: ReActFinishHandler,
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
  let loopNum = 0;
  let assistantParts: Array<
    LanguageModelV2TextPart | LanguageModelV2ToolCallPart
  > | null = null;
  while (true) {
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
        content: assistantParts
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
                  input: JSON.parse((part.input || "{}") as string),
                }
          ),
      });
    }
    const continueLoop = await loopControl(request, assistantParts, loopNum);
    if (!continueLoop) {
      break;
    }
    const toolUses = assistantParts.filter((s) => s.type == "tool-call");
    const toolResults = await toolCallCallback(request, toolUses);
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
    loopNum++;
  }
  return assistantParts;
}

export async function callLLM(
  rlm: RetryLanguageModel,
  request: LLMRequest,
  streamCallback?: ReActStreamCallback,
  errorHandler?: ReActErrorHandler,
  finishHandler?: ReActFinishHandler,
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
          });
          if (toolPart) {
            await streamCallback?.({
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
            await streamCallback?.({
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
          await streamCallback?.({
            type: "thinking",
            streamId: thinkStreamId,
            streamDone: false,
            text: thinkText,
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
            } else {
              toolPart = {
                type: "tool-call",
                toolCallId: chunk.id,
                toolName: chunk.toolName,
                input: {},
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
            });
          }
          toolArgsText += chunk.delta || "";
          await streamCallback?.({
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
          const message: ReActStreamMessage = {
            type: "tool_use",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
          };
          await streamCallback?.(message);
          if (toolPart == null) {
            const _toolPart = toolParts.filter(
              (s) => s.toolCallId == chunk.toolCallId
            )[0];
            if (_toolPart) {
              _toolPart.input = message.params || args;
            } else {
              toolParts.push({
                type: "tool-call",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: message.params || args,
              });
            }
          } else {
            toolPart.input = message.params || args;
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
            });
          }
          if (toolPart) {
            await streamCallback?.({
              type: "tool_use",
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              params: toolPart.input || {},
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
