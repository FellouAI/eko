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
 * 转换工具为LLM格式
 *
 * 将自定义工具对象转换为LLM提供商的标准函数工具格式。
 * 这个函数是工具系统与LLM集成的关键桥梁。
 *
 * 转换过程：
 * 1. 提取工具的基本信息（名称、描述、参数模式）
 * 2. 转换为标准化的LanguageModelV2FunctionTool格式
 * 3. 确保与LLM提供商的兼容性
 *
 * 支持的工具类型：
 * - Tool：标准工具接口
 * - DialogueTool：对话专用工具接口
 *
 * @param tools 要转换的工具数组
 * @returns LLM标准格式的工具数组
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
 * 根据名称查找工具
 *
 * 在工具数组中查找指定名称的工具实例。
 * 这个函数是工具调用的核心查找逻辑。
 *
 * 查找策略：
 * 1. 遍历工具数组
 * 2. 精确匹配工具名称
 * 3. 返回第一个匹配的工具实例
 * 4. 未找到时返回null
 *
 * 性能特点：
 * - 线性查找，时间复杂度O(n)
 * - 适用于小规模工具集合
 * - 保证返回结果的类型安全
 *
 * @param tools 工具数组
 * @param name 要查找的工具名称
 * @returns 找到的工具实例，如果不存在则返回null
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
 * 调用代理LLM
 *
 * 这是代理系统与LLM集成的核心函数，负责：
 * 1. 代理与LLM的完整交互流程
 * 2. 流式响应的处理和解析
 * 3. 工具调用的触发和参数传递
 * 4. 错误处理和重试机制
 * 5. 实时回调和状态通知
 *
 * 核心流程：
 * 1. 上下文压缩：检查并压缩过长的对话历史
 * 2. 用户对话追加：添加代理执行中的用户干预
 * 3. LLM调用：发送请求并处理流式响应
 * 4. 结果解析：解析文本、工具调用、推理等不同类型的响应
 * 5. 状态回调：实时通知外部监听器
 * 6. 错误重试：处理网络错误和长度限制等异常情况
 *
 * 流式处理特性：
 * - 实时文本输出
 * - 推理过程展示
 * - 工具调用参数流式传递
 * - 文件和多媒体内容支持
 * - 完成状态和使用统计
 *
 * ReAct 循环说明（本函数所在的一次 Assistant Step）：
 * - 本函数实现的是一次“助理回复阶段”的流式生成与解析。它会产出纯文本与若干工具调用（ToolCall），
 *   但并不在本函数内执行工具。工具的实际执行、结果回填、以及再次调用本函数，发生在本函数的上层调度逻辑中，
 *   由此构成完整的 ReAct 外层循环（思考 -> 行动 -> 观察 -> 再思考）。
 *
 * - 映射到流事件的 ReAct 阶段：
 *   1) Observe（观察）：
 *      - 在调用前，通过 `appendUserConversation` 将用户干预并入 `messages`；
 *      - 上一轮工具执行结果（若有）也在上层被并入 `messages`，因此本函数开局收到的 `messages` 已包含“观察”。
 *   2) Reason/Think（思考）：
 *      - 由模型以推理通道输出，体现在事件 `reasoning-start` / `reasoning-delta` / `reasoning-end`；
 *      - 本函数将其汇聚到 `thinkText`，并通过回调对外暴露。
 *   3) Act（行动，调用工具）：
 *      - 由事件 `tool-input-start` / `tool-input-delta` 增量传输工具参数文本；
 *      - 由事件 `tool-call` 给出完整的调用（含工具名与最终 JSON 参数），本函数收敛为 `toolParts` 返回给上层；
 *   4) Finalize（收尾）：
 *      - 由 `text-*` 事件传出自然语言回复；
 *      - `finish` 事件收束本次 Assistant Step，携带用量与终止原因；
 *      - 若终止原因为长度限制且满足条件，则触发压缩与重试，仍属于一次 Step 的自恢复策略。
 *
 * - 小结：本函数“只生成，不执行”。上层据 `toolParts` 执行工具，得到结果（可能是文本/图片/JSON），再把结果
 *   作为新的消息加入 `messages`，随后再次调用本函数，形成多轮 ReAct 迭代，直到没有新的工具调用且文本输出完成。
 *
 * @param agentContext 代理执行上下文
 * @param rlm 重试语言模型管理器
 * @param messages 对话消息历史
 * @param tools 可用的工具列表
 * @param noCompress 是否禁用上下文压缩
 * @param toolChoice 工具选择策略
 * @param retryNum 当前重试次数
 * @param callback 流式回调函数
 * @param requestHandler 请求预处理函数
 * @returns LLM响应结果数组
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
    await memory.compressAgentMessages(agentContext, rlm, messages, tools);
  }
  if (!toolChoice) {
    // Append user dialogue
    appendUserConversation(agentContext, messages);
  }
  const context = agentContext.context;

  // 创建回调助手
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
  // 兼容性：部分运行时/TS lib 未提供 AbortSignal.any，这里做降级处理
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
        // 若任一已提前中止，立即同步中止
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

  // CALLBACK: 发送LLM请求开始事件
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
  // toolParts：本次 Assistant Step 内收集到的“行动（工具调用）”结果（仅为调用意图，不含执行结果）
  const toolParts: LanguageModelV2ToolCallPart[] = [];
  let reader: ReadableStreamDefaultReader<LanguageModelV2StreamPart> | null = null;
  try {
    agentChain.agentRequest = request;
    context.currentStepControllers.add(stepController);
    const result: StreamResult = await rlm.callStream(request);
    // 新版：LLM 响应开始
    await agentllmCbHelper.llmResponseStart(llmResponseStreamId);
    reader = result.stream.getReader();
    let toolPart: LanguageModelV2ToolCallPart | null = null;
    // 读取与解析流式事件：将提供商的细粒度事件映射为 ReAct 的“思考/行动/输出”要素
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
          // 新版：LLM 响应流过程 - 文本
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
          // 新版：LLM 响应流过程 - 思维
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
          // 新版：LLM 响应流过程 - 工具参数
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
          // 新版：LLM 响应完成
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
              rlm,
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
        await memory.compressAgentMessages(agentContext, rlm, messages, tools);
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
