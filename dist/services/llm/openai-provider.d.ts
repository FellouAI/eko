import OpenAI, { ClientOptions } from 'openai';
import { LLMProvider, LLMParameters, LLMResponse, Message, LLMStreamHandler } from '../../types/llm.types';
export declare class OpenaiProvider implements LLMProvider {
    private client;
    private defaultModel;
    constructor(client: OpenAI, defaultModel?: string);
    constructor(options: ClientOptions, defaultModel?: string);
    constructor(apiKey: string, defaultModel?: string | null, options?: ClientOptions);
    private buildParams;
    generateText(messages: Message[], params: LLMParameters): Promise<LLMResponse>;
    generateStream(messages: Message[], params: LLMParameters, handler: LLMStreamHandler): Promise<void>;
}
