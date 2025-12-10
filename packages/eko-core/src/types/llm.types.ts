import {
  ProviderV2,
  SharedV2Headers,
  LanguageModelV2Usage,
  LanguageModelV2Prompt,
  LanguageModelV2Content,
  LanguageModelV2TextPart,
  SharedV2ProviderMetadata,
  LanguageModelV2ToolChoice,
  LanguageModelV2StreamPart,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2CallOptions,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultOutput,
  LanguageModelV2ResponseMetadata,
} from "@ai-sdk/provider";
import { ToolResult } from "./tools.types";
import TaskContext, { AgentContext } from "../agent/agent-context";

export type LLMprovider =
  | "openai"
  | "anthropic"
  | "google"
  | "aws"
  | "openrouter"
  | "openai-compatible"
  | "modelscope"
  | ProviderV2;

export type LLMConfig = {
  provider: LLMprovider;
  model: string;
  apiKey: string | (() => Promise<string>);
  config?: {
    baseURL?: string | (() => Promise<string>);
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    [key: string]: any;
  };
  options?: Record<string, any>;
  fetch?: typeof globalThis.fetch;
  handler?: (
    options: LanguageModelV2CallOptions,
    context?: TaskContext,
    agentContext?: AgentContext
  ) => Promise<LanguageModelV2CallOptions>;
};

export type LLMs = {
  default: LLMConfig;
  [key: string]: LLMConfig;
};

export type GenerateResult = {
  llm: string;
  llmConfig: LLMConfig;
  text?: string;
  content: Array<LanguageModelV2Content>;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  providerMetadata?: SharedV2ProviderMetadata;
  request?: {
    body?: unknown;
  };
  response?: LanguageModelV2ResponseMetadata & {
    headers?: SharedV2Headers;
    body?: unknown;
  };
  warnings: Array<LanguageModelV2CallWarning>;
};

export type StreamResult = {
  llm: string;
  llmConfig: LLMConfig;
  stream: ReadableStream<LanguageModelV2StreamPart>;
  request?: {
    body?: unknown;
  };
  response?: {
    headers?: SharedV2Headers;
  };
};

export type LLMRequest = {
  maxOutputTokens?: number;
  messages: LanguageModelV2Prompt;
  toolChoice?: LanguageModelV2ToolChoice;
  tools?: Array<LanguageModelV2FunctionTool>;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  abortSignal?: AbortSignal;
};

export type ReActStreamMessage =
  | {
      type: "text" | "thinking";
      streamId: string;
      streamDone: boolean;
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string;
    }
  | {
      type: "tool_streaming";
      toolName: string;
      toolCallId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolCallId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolCallId: string;
      text: string;
      streamId: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolCallId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV2FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };

export type ReActStreamCallback = (
  message: ReActStreamMessage
) => Promise<void>;

export type ReActErrorHandler = (
  request: LLMRequest,
  error: any,
  retryNum: number
) => Promise<void>;

export type ReActFinishHandler = (
  request: LLMRequest,
  finishReason: LanguageModelV2FinishReason,
  value: LanguageModelV2StreamPart,
  retryNum: number
) => Promise<"retry" | void>;

export type ReActToolCallCallback = (
  request: LLMRequest,
  toolUses: LanguageModelV2ToolCallPart[]
) => Promise<LanguageModelV2ToolResultOutput[]>;

export type ReActLoopControl = (
  request: LLMRequest,
  assistantParts: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>,
  loopNum: number
) => Promise<boolean>;
