import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import type { AgentContext } from "../core/context";
import { uuidv4, sleep, toFile, getMimeType } from "../common/utils";
import { createCallbackHelper } from "../common/callback-helper";
import {
  Tool,
  LLMRequest,
  ToolResult,
  DialogueTool,
  StreamResult,
  HumanCallback,
  StreamCallback,
  StreamCallbackMessage,
} from "../types";
import {
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  SharedV2ProviderOptions,
  LanguageModelV2ToolChoice,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2FunctionTool,
  LanguageModelV2ToolResultPart,
  LanguageModelV2ToolResultOutput,
} from "@ai-sdk/provider";

export function defaultLLMProviderOptions(): SharedV2ProviderOptions {
  return {
    openai: {
      stream_options: {
        include_usage: true,
      },
    },
    openrouter: {
      reasoning: {
        max_tokens: 10,
      },
    },
  };
}

export function defaultMessageProviderOptions(): SharedV2ProviderOptions {
  return {
    anthropic: {
      cacheControl: { type: "ephemeral" },
    },
    bedrock: {
      cachePoint: { type: "default" },
    },
    openrouter: {
      cacheControl: { type: "ephemeral" },
    },
  };
}

/**
 * Convert tools to LLM format
 *
 * Converts custom tool objects into the provider-agnostic function-tool format
 * required by LLM providers. This is the key bridge between the tool system
 * and LLM integration.
 *
 * Conversion steps:
 * 1. Extract basic tool info (name, description, parameter schema)
 * 2. Convert to standardized LanguageModelV2FunctionTool
 * 3. Ensure compatibility with provider expectations
 *
 * Supported tool types:
 * - Tool: standard tool interface
 * - DialogueTool: dialogue-specific tool interface
 *
 * @param tools Tools to convert
 * @returns Tools in LLM-standard format
 */
export function convertTools(
  tools: Tool[] | DialogueTool[]
): LanguageModelV2FunctionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
    // providerOptions: defaultMessageProviderOptions()
  }));
}

/**
 * Find tool by name
 *
 * Searches the tool array for a tool instance with the specified name.
 * This is the core lookup logic for tool invocation.
 *
 * Strategy:
 * 1. Iterate over the tool array
 * 2. Strictly match tool name
 * 3. Return the first matched tool instance
 * 4. Return null if not found
 *
 * Performance:
 * - Linear scan, O(n)
 * - Suitable for small tool sets
 * - Type-safe return value
 *
 * @param tools Tool array
 * @param name Tool name to look up
 * @returns The found tool instance, or null if not found
 */
export function getTool<T extends Tool | DialogueTool>(
  tools: T[],
  name: string
): T | null {
  for (let i = 0; i < tools.length; i++) {
    if (tools[i].name == name) {
      return tools[i];
    }
  }
  return null;
}

export function convertToolResult(
  toolUse: LanguageModelV2ToolCallPart,
  toolResult: ToolResult,
  user_messages: LanguageModelV2Prompt
): LanguageModelV2ToolResultPart {
  let result: LanguageModelV2ToolResultOutput;
  if (!toolResult || !toolResult.content) {
    result = {
      type: "error-text",
      value: "Error",
    };
  } else if (
    toolResult.content.length == 1 &&
    toolResult.content[0].type == "text"
  ) {
    let text = toolResult.content[0].text;
    result = {
      type: "text",
      value: text,
    };
    let isError = toolResult.isError == true;
    if (isError && !text.startsWith("Error")) {
      text = "Error: " + text;
      result = {
        type: "error-text",
        value: text,
      };
    } else if (!isError && text.length == 0) {
      text = "Successful";
      result = {
        type: "text",
        value: text,
      };
    }
    if (
      text &&
      ((text.startsWith("{") && text.endsWith("}")) ||
        (text.startsWith("[") && text.endsWith("]")))
    ) {
      try {
        result = JSON.parse(text);
        result = {
          type: "json",
          value: result,
        };
      } catch (e) {}
    }
  } else {
    result = {
      type: "content",
      value: [],
    };
    for (let i = 0; i < toolResult.content.length; i++) {
      let content = toolResult.content[i];
      if (content.type == "text") {
        result.value.push({
          type: "text",
          text: content.text,
        });
      } else {
        if (config.toolResultMultimodal) {
          // Support returning images from tool results
          let mediaData = content.data;
          if (mediaData.startsWith("data:")) {
            mediaData = mediaData.substring(mediaData.indexOf(",") + 1);
          }
          result.value.push({
            type: "media",
            data: mediaData,
            mediaType: content.mimeType || "image/png",
          });
        } else {
          // Only the claude model supports returning images from tool results, while openai only supports text,
          // Compatible with other AI models that do not support tool results as images.
          user_messages.push({
            role: "user",
            content: [
              {
                type: "file",
                data: toFile(content.data),
                mediaType: content.mimeType || getMimeType(content.data),
              },
              {
                type: "text",
                text: `call \`${toolUse.toolName}\` tool result`,
              },
            ],
          });
        }
      }
    }
  }
  return {
    type: "tool-result",
    toolCallId: toolUse.toolCallId,
    toolName: toolUse.toolName,
    output: result,
  };
}

/**
 * Call the agent LLM
 *
 * Core integration point between the agent system and the LLM. Handles:
 * 1) Full interaction lifecycle with the LLM
 * 2) Streaming response parsing
 * 3) Tool-call triggering and argument passing
 * 4) Error handling and retry
 * 5) Real-time callbacks and status notifications
 *
 * Core flow:
 * 1) Context compression: check and compress long conversation history
 * 2) Append user intervention: merge user inputs during execution
 * 3) LLM call: send request and process the streaming response
 * 4) Result parsing: handle text, tool calls, reasoning, etc.
 * 5) Status callbacks: notify listeners in real time
 * 6) Retry on errors such as network issues or length limits
 *
 * Streaming characteristics:
 * - Real-time text output
 * - Reasoning stream exposure
 * - Streaming tool-args
 * - File and multimedia support
 * - Completion status and usage stats
 *
 * ReAct loop note (one Assistant Step of the outer loop in this function):
 * - This function generates a streaming assistant reply and tool calls, but does
 *   not execute tools. Execution, result injection, and subsequent re-calls are
 *   done by upper-level orchestration to complete the ReAct loop
 *   (Think -> Act -> Observe -> Think).
 *
 * - Mapping to stream events:
 *   1) Observe:
 *      - `appendUserConversation` merges user interventions before the call
 *      - Previous tool results are also merged at upper level, so `messages`
 *        already include the observation
 *   2) Reason/Think:
 *      - Emitted via reasoning channel: `reasoning-start/delta/end`
 *      - Aggregated into `thinkText` and exposed via callbacks
 *   3) Act (tool call):
 *      - Parameters streamed via `tool-input-start/delta`
 *      - Complete call emitted via `tool-call`; consolidated as `toolParts`
 *   4) Finalize:
 *      - Natural language reply via `text-*`
 *      - `finish` closes the step with usage and stop reason
 *      - If stopped due to length, compression and retry may be triggered
 *
 * - Summary: this function “generates but does not execute”. Upper layer
 *   executes tools based on `toolParts`, injects results as new messages, then
 *   calls this function again, forming multi-turn ReAct iterations until no
 *   more tool calls and text is finalized.
 *
 * @param agentContext Agent execution context
 * @param rlm Retry LLM manager
 * @param messages Conversation history
 * @param tools Available tools
 * @param noCompress Disable context compression
 * @param toolChoice Tool choice policy
 * @param retryNum Current retry count
 * @param callback Streaming callback
 * @param requestHandler Request pre-processor
 * @returns Array of LLM response parts
 */
export async function callAgentLLM(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[],
  noCompress?: boolean,
  toolChoice?: LanguageModelV2ToolChoice,
  retryNum: number = 0,
  callback?: StreamCallback & HumanCallback,
  requestHandler?: (request: LLMRequest) => void
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
  await agentContext.context.checkAborted();
  if (
    !noCompress &&
    (messages.length >= config.compressThreshold || (messages.length >= 10 && estimatePromptTokens(messages, tools) >= config.compressTokensThreshold))
  ) {
    // Compress messages
    await memory.compressAgentMessages(agentContext, messages, tools);
  }
  if (!toolChoice) {
    // Append user dialogue
    appendUserConversation(agentContext, messages);
  }
  const context = agentContext.context;

  // Create callback helper
  const agentllmCbHelper = createCallbackHelper(
    callback,
    context.taskId,
    agentContext.agent.Name,
    agentContext.agentChain.agent.id
  );
  const agentChain = agentContext.agentChain;
  const agentNode = agentChain.agent;
  const streamCallback = callback ||
    context.config.callback || {
      onMessage: async () => {},
    };
  const stepController = new AbortController();
  // Compatibility: some runtimes/TS libs do not provide AbortSignal.any; fallback
  let cleanupAbortListeners: (() => void) | null = null;
  const signal: AbortSignal = (AbortSignal as any).any
    ? (AbortSignal as any).any([
        context.controller.signal,
        stepController.signal,
      ])
    : (() => {
        const combined = new AbortController();
        const abortFromContext = () => {
          try {
            combined.abort((context.controller.signal as any).reason);
          } catch (_) {
            combined.abort();
          }
        };
        const abortFromStep = () => {
          try {
            combined.abort((stepController.signal as any).reason);
          } catch (_) {
            combined.abort();
          }
        };
        context.controller.signal.addEventListener("abort", abortFromContext);
        stepController.signal.addEventListener("abort", abortFromStep);
        // If either already aborted, abort immediately
        if (context.controller.signal.aborted) abortFromContext();
        if (stepController.signal.aborted) abortFromStep();
        cleanupAbortListeners = () => {
          context.controller.signal.removeEventListener(
            "abort",
            abortFromContext
          );
          stepController.signal.removeEventListener("abort", abortFromStep);
        };
        return combined.signal;
      })();
  const request: LLMRequest = {
    tools: tools,
    toolChoice,
    messages: messages,
    abortSignal: signal,
  };
  requestHandler && requestHandler(request);

  // CALLBACK: send LLM request start event
  await agentllmCbHelper.llmRequestStart(
    request,
    undefined, // model name not available
    {
      messageCount: messages.length,
      toolCount: tools.length,
      hasSystemPrompt: messages.some(m => m.role === 'system'),
    }
  );

  let streamText = "";
  let thinkText = "";
  let toolArgsText = "";
  let textStreamId = uuidv4();
  let thinkStreamId = uuidv4();
  let llmResponseStreamId = uuidv4();
  let textStreamDone = false;
  // toolParts: collected tool-call intents within this Assistant Step (no results)
  const toolParts: LanguageModelV2ToolCallPart[] = [];
  let reader: ReadableStreamDefaultReader<LanguageModelV2StreamPart> | null = null;
  try {
    agentChain.agentRequest = request;
    context.currentStepControllers.add(stepController);
    const result: StreamResult = await rlm.callStream(request);
    // New: LLM response start
    await agentllmCbHelper.llmResponseStart(llmResponseStreamId);
    reader = result.stream.getReader();
    let toolPart: LanguageModelV2ToolCallPart | null = null;
    // Read and parse streaming events: map provider-specific events to ReAct phases
    while (true) {
      await context.checkAborted();
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
          // New: LLM response streaming - text
          await agentllmCbHelper.llmResponseProcess(
            llmResponseStreamId,
            "text_start",
            chunk.delta || "",
            false
          );
          // OLD VERSION CALLBACK
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "text",
              streamId: textStreamId,
              streamDone: false,
              text: streamText,
            },
            agentContext
          );
          if (toolPart) {
            await agentllmCbHelper.llmResponseProcess(
              llmResponseStreamId,
              "tool_call_start",
              chunk.delta || "",
              false
            );
            // OLD VERSION CALLBACK
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "tool_use",
                toolId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                params: toolPart.input || {},
              },
              agentContext
            );
            toolPart = null;
          }
          break;
        }
        case "text-end": {
          textStreamDone = true;
          if (streamText) {
            await agentllmCbHelper.llmResponseProcess(
              llmResponseStreamId,
              "text_end",
              streamText,
              true
            );
            // OLD VERSION CALLBACK
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId: textStreamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          break;
        }
        case "reasoning-start": {
          thinkStreamId = uuidv4();
          await agentllmCbHelper.llmResponseProcess(
            llmResponseStreamId,
            "thinking_start",
            "",
            false
          );
          break;
        }
        case "reasoning-delta": {
          thinkText += chunk.delta || "";
          // New: LLM response streaming - reasoning
          await agentllmCbHelper.llmResponseProcess(
            llmResponseStreamId,
            "thinking_delta",
            chunk.delta || "",
            false
          );
          // OLD VERSION CALLBACK
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "thinking",
              streamId: thinkStreamId,
              streamDone: false,
              text: thinkText,
            },
            agentContext
          );
          break;
        }
        case "reasoning-end": {
          if (thinkText) {
            await agentllmCbHelper.llmResponseProcess(
              llmResponseStreamId,
              "thinking_end",
              thinkText,
              true
            );
            // OLD VERSION CALLBACK
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "thinking",
                streamId: thinkStreamId,
                streamDone: true,
                text: thinkText,
              },
              agentContext
            );
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
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId: textStreamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          toolArgsText += chunk.delta || "";
          // New: LLM response streaming - tool args
          await agentllmCbHelper.llmResponseProcess(
            llmResponseStreamId,
            "tool_call_delta",
            chunk.delta || "",
            false
          );
          // OLD VERSION CALLBACK
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "tool_streaming",
              toolId: chunk.id,
              toolName: toolPart?.toolName || "",
              paramsText: toolArgsText,
            },
            agentContext
          );
          break;
        }
        case "tool-call": {
          toolArgsText = "";
          const args = chunk.input ? JSON.parse(chunk.input) : {};


          await agentllmCbHelper.llmResponseProcess(
            llmResponseStreamId,
            "tool_call_start",
            chunk.input || "{}",
            false
          );

          const message: StreamCallbackMessage = {
            taskId: context.taskId,
            agentName: agentNode.name,
            nodeId: agentNode.id,
            type: "tool_use",
            toolId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
          };
          // OLD VERSION CALLBACK
          await streamCallback.onMessage(message, agentContext);
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
        case "file": {
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "file",
              mimeType: chunk.mediaType,
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
                streamId: textStreamId,
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
                params: toolPart.input || {},
              },
              agentContext
            );
            toolPart = null;
          }
          // New: LLM response finished
          await agentllmCbHelper.llmResponseFinished(
            llmResponseStreamId,
            [
              ...(streamText ? [{ type: "text", text: streamText } as any] : []),
              ...toolParts,
            ],
            {
              promptTokens: chunk.usage.inputTokens || 0,
              completionTokens: chunk.usage.outputTokens || 0,
              totalTokens:
                chunk.usage.totalTokens ||
                (chunk.usage.inputTokens || 0) + (chunk.usage.outputTokens || 0),
            }
          );
          // OLD VERSION CALLBACK
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
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
            },
            agentContext
          );
          if (
            chunk.finishReason === "length" &&
            messages.length >= 5 &&
            !noCompress &&
            retryNum < config.maxRetryNum
          ) {
            await memory.compressAgentMessages(
              agentContext,
              messages,
              tools
            );
            return callAgentLLM(
              agentContext,
              rlm,
              messages,
              tools,
              noCompress,
              toolChoice,
              ++retryNum,
              streamCallback
            );
          }
          break;
        }
      }
    }
  } catch (e: any) {
    await context.checkAborted();
    if (retryNum < config.maxRetryNum) {
      await sleep(300 * (retryNum + 1) * (retryNum + 1));
      if ((e + "").indexOf("is too long") > -1) {
        await memory.compressAgentMessages(agentContext, messages, tools);
      }
      return callAgentLLM(
        agentContext,
        rlm,
        messages,
        tools,
        noCompress,
        toolChoice,
        ++retryNum,
        streamCallback
      );
    }
    throw e;
  } finally {
    reader && reader.releaseLock();
    context.currentStepControllers.delete(stepController);
  }
  agentChain.agentResult = streamText;
  return streamText
    ? [
        { type: "text", text: streamText } as LanguageModelV2TextPart,
        ...toolParts,
      ]
    : toolParts;
}

export function estimatePromptTokens(
  messages: LanguageModelV2Prompt,
  tools?: LanguageModelV2FunctionTool[]
) {
  let tokens = messages.reduce((total, message) => {
    if (message.role == "system") {
      return total + estimateTokens(message.content);
    } else if (message.role == "user") {
      return (
        total +
        estimateTokens(
          message.content
            .filter((part): part is LanguageModelV2TextPart => part.type === "text")
            .map((part) => part.text)
            .join("\n")
        )
      );
    } else if (message.role == "assistant") {
      return (
        total +
        estimateTokens(
          message.content
            .map((part) => {
              if (part.type == "text") {
                return part.text;
              } else if (part.type == "reasoning") {
                return part.text;
              } else if (part.type == "tool-call") {
                return part.toolName + JSON.stringify(part.input || {});
              } else if (part.type == "tool-result") {
                return part.toolName + JSON.stringify(part.output || {});
              }
              return "";
            })
            .join("")
        )
      );
    } else if (message.role == "tool") {
      return (
        total +
        estimateTokens(
          message.content
            .map((part) => part.toolName + JSON.stringify(part.output || {}))
            .join("")
        )
      );
    }
    return total;
  }, 0);
  if (tools) {
    tokens += tools.reduce((total, tool) => {
      return total + estimateTokens(JSON.stringify(tool));
    }, 0);
  }
  return tokens;
}

export function estimateTokens(text: string) {
  if (!text) {
    return 0;
  }
  let tokenCount = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      tokenCount += 2;
    } else if (/\s/.test(char)) {
      continue;
    } else if (/[a-zA-Z]/.test(char)) {
      let word = "";
      while (i < text.length && /[a-zA-Z]/.test(text[i])) {
        word += text[i];
        i++;
      }
      i--;
      if (word.length <= 4) {
        tokenCount += 1;
      } else {
        tokenCount += Math.ceil(word.length / 4);
      }
    } else if (/\d/.test(char)) {
      let number = "";
      while (i < text.length && /\d/.test(text[i])) {
        number += text[i];
        i++;
      }
      i--;
      tokenCount += Math.max(1, Math.ceil(number.length / 3));
    } else {
      tokenCount += 1;
    }
  }
  return Math.max(1, tokenCount);
}

function appendUserConversation(
  agentContext: AgentContext,
  messages: LanguageModelV2Prompt
) {
  const userPrompts = agentContext.context.conversation
    .splice(0, agentContext.context.conversation.length)
    .filter((s) => !!s);
  if (userPrompts.length > 0) {
    const prompt =
      "The user is intervening in the current task, please replan and execute according to the following instructions:\n" +
      userPrompts.map((s) => `- ${s.trim()}`).join("\n");
    messages.push({
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }
}
