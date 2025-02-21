import Anthropic, { ClientOptions } from '@anthropic-ai/sdk';
import { LLMProvider, LLMParameters, LLMResponse, Message, LLMStreamHandler } from '../../types/llm.types';
export declare class ClaudeProvider implements LLMProvider {
    private client;
    private defaultModel;
    constructor(options: Anthropic, defaultModel?: string);
    constructor(options: ClientOptions, defaultModel?: string);
    constructor(apiKey: string, defaultModel?: string | null, options?: ClientOptions);
    private processResponse;
    generateText(messages: Message[], params: LLMParameters): Promise<LLMResponse>;
    generateStream(messages: Message[], params: LLMParameters, handler: LLMStreamHandler): Promise<void>;
}
