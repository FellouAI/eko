import { ClientOptions as OpenAiClientOptions } from 'openai';
import { ClientOptions as ClaudeClientOption } from '@anthropic-ai/sdk';
import { LLMProvider } from './llm.types';
import { Tool } from './action.types';

export interface ClaudeConfig {
  llm: 'claude';
  apiKey: string;
  modelName?: string;
  options?: ClaudeClientOption;
}

export interface OpenaiConfig {
  llm: 'openai';
  apiKey: string;
  modelName?: string;
  options?: OpenAiClientOptions;
}

export interface DeepseekConfig {
  llm: 'deepseek';
  apiKey: string;
  modelName?: string;
  options?: OpenAiClientOptions;
}

export type ClaudeApiKey = string;

export type EkoConfig = ClaudeApiKey | ClaudeConfig | OpenaiConfig | DeepseekConfig | LLMProvider;

export interface EkoInvokeParam {
  tools?: Array<string> | Array<Tool<any, any>>;
}
