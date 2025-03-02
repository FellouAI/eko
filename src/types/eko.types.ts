import { ClientOptions as OpenAiClientOptions } from 'openai';
import { ClientOptions as ClaudeClientOption } from '@anthropic-ai/sdk';
import { LLMProvider } from './llm.types';
import { Tool } from './action.types';
import { WorkflowCallback } from './workflow.types';

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

export type ClaudeApiKey = string;

export type LLMConfig = ClaudeApiKey | ClaudeConfig | OpenaiConfig | LLMProvider;

export interface EkoConfig {
  workingWindowId?: number,
  chromeProxy?: any, // should be original `chrome` or a proxy created by `createChromeApiProxy()`
  callback?: WorkflowCallback,
}

export const DefaultEkoConfig: EkoConfig = {
  workingWindowId: undefined,
  chromeProxy: chrome,
  callback: undefined,
};

export interface EkoInvokeParam {
  tools?: Array<string> | Array<Tool<any, any>>;
}

export interface WorkflowResult {
  isSuccessful: boolean,
  summary: string,
  payload: WorkflowTranscript | WorkflowArtifact,
}

export type WorkflowTranscript = string

export interface WorkflowArtifact {} // TODO
