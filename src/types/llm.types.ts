export interface Message {
  role: 'user' | 'assistant' | 'system'; // openai role: system == developer
  content: string | unknown[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string | Array<{ type: string; text: string }>;
}

export interface LLMParameters {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: { type: 'auto' | 'tool' | 'any'; name?: string };
}

export interface LLMResponse {
  textContent: string | null;
  content: string | unknown[];
  toolCalls: ToolCall[];
  stop_reason: string | null;
}

export interface LLMStreamHandler {
  onStart?: () => void;
  onContent?: (content: string) => void;
  onToolUse?: (toolCall: ToolCall) => void;
  onComplete?: (response: LLMResponse) => void;
  onError?: (error: Error) => void;
}

export interface LLMProvider {
  client: any;
  defaultModel: string;
  generateText(messages: Message[], params: LLMParameters): Promise<LLMResponse>;
  generateStream(messages: Message[], params: LLMParameters, handler: LLMStreamHandler): Promise<void>;
}
