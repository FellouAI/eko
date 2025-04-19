import { Action, Tool, ExecutionContext } from '../types/action.types';
import { NodeInput, NodeOutput } from '../types/workflow.types';
import { LLMProvider, Message, LLMParameters } from '../types/llm.types';
export declare class ActionImpl implements Action {
    type: 'prompt';
    name: string;
    description: string;
    tools: Tool<any, any>[];
    llmProvider: LLMProvider | undefined;
    private llmConfig?;
    private readonly maxRounds;
    private writeContextTool;
    private toolResults;
    private logger;
    tabs: chrome.tabs.Tab[];
    constructor(type: 'prompt', // Only support prompt type
    name: string, description: string, tools: Tool<any, any>[], llmProvider: LLMProvider | undefined, llmConfig?: LLMParameters | undefined, config?: {
        maxRounds?: number;
    });
    private executeSingleRound;
    private handleHistoryImageMessages;
    private countImages;
    execute(input: NodeInput, output: NodeOutput, context: ExecutionContext, outputSchema?: unknown): Promise<{
        nodeOutput: unknown;
        reacts: Message[];
    }>;
    private formatSystemPrompt;
    private formatUserPrompt;
    private getPatchs;
    static createPromptAction(name: string, description: string, tools: Tool<any, any>[], llmProvider: LLMProvider | undefined, llmConfig?: LLMParameters): Action;
    private wrapToolInputSchema;
    private unwrapToolCall;
}
