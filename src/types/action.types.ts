import { Workflow } from "./workflow.types";
import { LLMProvider, Message } from "./llm.types";
import { NodeOutput, WorkflowCallback } from "./workflow.types";
import { NodeInput } from "./workflow.types";
import { EkoConfig } from "./eko.types";

export interface Tool<T, R> {
  name: string;
  description: string;
  input_schema: InputSchema;
  execute: (context: ExecutionContext, params: T) => Promise<R>;
  destroy?: (context: ExecutionContext) => void;
}

export interface InputSchema {
  type: 'object';
  properties?: Properties;
  required?: Array<string>;
}

export interface Properties {
  [key: string]: Property;
}

export interface Property {
  type: 'string' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  items?: InputSchema;
  enum?: Array<string | number>;
  properties?: Properties;
}

export interface ExecutionContext {
  llmProvider: LLMProvider;
  ekoConfig: EkoConfig;
  variables: Map<string, unknown>;
  workflow?: Workflow;
  tools?: Map<string, Tool<any, any>>;
  callback?: WorkflowCallback;
  signal?: AbortSignal;
  [key: string]: any;
}

export interface Action {
  type: 'prompt' | 'script' | 'hybrid';
  name: string;
  description: string;
  execute: (input: NodeInput, output: NodeOutput, context: ExecutionContext) => Promise<{nodeOutput: unknown, reacts: Message[]}>;
  tools: Array<Tool<any, any>>; // Allow both Tool objects and tool names
  llmProvider?: LLMProvider;
  tabs: chrome.tabs.Tab[];
}
