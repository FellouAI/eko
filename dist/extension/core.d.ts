import { Tool } from '../types';
export declare function pub(chromeProxy: any, tabId: number, event: string, params: any): Promise<any>;
export declare function getLLMConfig(chromeProxy: any, name?: string): Promise<{
    llm?: string;
    apiKey?: string;
    modelName?: string;
    options?: {
        [key: string]: any;
    };
} | undefined>;
export declare function loadTools(): Map<string, Tool<any, any>>;
