import config from "../config";
import * as memory from "../memory";
import { AgentContext } from "./agent-context";
import { callLLM, RetryLanguageModel } from "../llm";
import { toFile, getMimeType } from "../common/utils";
import {
  Tool,
  ToolResult,
  LLMRequest,
  DialogueTool,
  HumanCallback,
  AgentStreamCallback,
} from "../types";
import {
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  SharedV2ProviderOptions,
  LanguageModelV2ToolChoice,
  LanguageModelV2ToolCallPart,
  LanguageModelV2FunctionTool,
  LanguageModelV2ToolResultPart,
  LanguageModelV2ToolResultOutput,
} from "@ai-sdk/provider";
import { AnthropicProviderOptions } from "@ai-sdk/anthropic";

export function defaultLLMProviderOptions(): SharedV2ProviderOptions {
  return {
    // openai: {
    //   reasoning: {
    //     effort: "low",
    //   },
    // },
    // anthropic: {
    //   effort: "low",
    // },
    // openrouter: {
    //   reasoning: {
    //     effort: "low",
    //   },
    // },
  };
}

export function defaultMessageProviderOptions(): SharedV2ProviderOptions {
  return {
    anthropic: {
      cacheControl: { type: "ephemeral", ttl: "1h" },
    } as AnthropicProviderOptions,
    bedrock: {
      cachePoint: { type: "default" },
    },
    openrouter: {
      cacheControl: { type: "ephemeral" },
    },
  };
}

export function convertTools(
  tools: Tool[] | DialogueTool[]
): LanguageModelV2FunctionTool[] {
  return tools.map((tool, index) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
    providerOptions: index < 3 ? defaultMessageProviderOptions() : undefined,
  }));
}

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
  user_messages?: LanguageModelV2Prompt
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
          if (user_messages) {
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
          } else {
            result.value.push({
              type: "text",
              text: "[image]",
            });
          }
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

export async function callAgentLLM(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[],
  noCompress?: boolean,
  toolChoice?: LanguageModelV2ToolChoice,
  callback?: AgentStreamCallback & HumanCallback,
  requestHandler?: (request: LLMRequest) => void
): Promise<Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>> {
  await agentContext.context.checkAborted();
  if (
    !noCompress &&
    (messages.length >= config.compressThreshold ||
      (messages.length >= 10 &&
        estimatePromptTokens(messages, tools) >=
          config.compressTokensThreshold))
  ) {
    // Compress messages
    await memory.compressAgentMessages(agentContext, messages, tools);
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
  try {
    agentChain.agentRequest = request;
    context.currentStepControllers.add(stepController);
    const result = await callLLM(
      rlm,
      request,
      async (message) => {
        await context.checkAborted();
        await streamCallback.onMessage({
          streamType: "agent",
          chatId: context.chatId,
          taskId: context.taskId,
          agentName: agentNode.name,
          nodeId: agentNode.id,
          ...message,
        });
      },
      async (request, error) => {
        if ((error + "").indexOf("is too long") > -1) {
          await memory.compressAgentMessages(agentContext, messages, tools);
        }
      },
      async (request, finishReason, value, retryNum) => {
        if (finishReason === "content-filter") {
          throw new Error("LLM error: trigger content filtering violation");
        } else if (finishReason === "other") {
          throw new Error("LLM error: terminated due to other reasons");
        } else if (
          finishReason === "length" &&
          messages.length >= 3 &&
          !noCompress &&
          retryNum < config.maxRetryNum
        ) {
          await memory.compressAgentMessages(agentContext, messages, tools);
          return "retry";
        }
      }
    );
    agentChain.agentResult = result
      .filter((s) => s.type == "text")
      .map((s) => s.text)
      .join("\n\n");
    return result;
  } finally {
    context.currentStepControllers.delete(stepController);
  }
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
            .filter((part) => part.type == "text")
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
