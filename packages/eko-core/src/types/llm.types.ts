import {
  ProviderV2,
  SharedV2Headers,
  LanguageModelV2Usage,
  LanguageModelV2Prompt,
  LanguageModelV2Content,
  SharedV2ProviderMetadata,
  LanguageModelV2ToolChoice,
  LanguageModelV2StreamPart,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2CallOptions,
  LanguageModelV2ResponseMetadata,
} from "@ai-sdk/provider";
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
    maxTokens?: number;
    [key: string]: any;
  };
  options?: Record<string, any>;
  fetch?: typeof globalThis.fetch;
  handler?: (options: LanguageModelV2CallOptions, context?: TaskContext, agentContext?: AgentContext) => Promise<LanguageModelV2CallOptions>;
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
  maxTokens?: number;
  messages: LanguageModelV2Prompt;
  toolChoice?: LanguageModelV2ToolChoice;
  tools?: Array<LanguageModelV2FunctionTool>;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  abortSignal?: AbortSignal;
};
