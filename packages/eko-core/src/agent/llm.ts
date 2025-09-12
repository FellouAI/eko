import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { AgentContext } from "../core/context";
import { uuidv4, sleep, toFile, getMimeType } from "../common/utils";
import {
  LLMRequest,
  StreamCallbackMessage,
  StreamCallback,
  HumanCallback,
  StreamResult,
  Tool,
  ToolResult,
  DialogueTool,
} from "../types";
import {
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolChoice,
  LanguageModelV2ToolResultOutput,
  LanguageModelV2ToolResultPart,
  SharedV2ProviderOptions,
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
    type: "function",
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
  } else if (toolResult.content.length == 1 && toolResult.content[0].type == "text") {
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
  if (messages.length >= config.compressThreshold && !noCompress) {
    await memory.compressAgentMessages(agentContext, rlm, messages, tools);
  }
  if (!toolChoice) {
    // Append user dialogue
    appendUserConversation(agentContext, messages);
  }
  const context = agentContext.context;
  const agentChain = agentContext.agentChain;
  const agentNode = agentChain.agent;
  const streamCallback = callback ||
    context.config.callback || {
      onMessage: async () => {},
    };
  const stepController = new AbortController();
  const signal = AbortSignal.any([
    context.controller.signal,
    stepController.signal,
  ]);
  const request: LLMRequest = {
    tools: tools,
    toolChoice,
    messages: messages,
    abortSignal: signal,
  };
  requestHandler && requestHandler(request);
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
    agentChain.agentRequest = request;
    context.currentStepControllers.add(stepController);
    const result: StreamResult = await rlm.callStream(request);
    reader = result.stream.getReader();
    let toolPart: LanguageModelV2ToolCallPart | null = null;
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
          break;
        }
        case "reasoning-delta": {
          thinkText += chunk.delta || "";
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
          const message: StreamCallbackMessage = {
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
