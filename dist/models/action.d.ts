import { Action, Tool, ExecutionContext } from '../types/action.types';
import { NodeInput, NodeOutput } from '../types/workflow.types';
import { LLMProvider, LLMParameters } from '../types/llm.types';
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
    constructor(type: 'prompt', // Only support prompt type
    name: string, description: string, tools: Tool<any, any>[], llmProvider: LLMProvider | undefined, llmConfig?: LLMParameters | undefined, config?: {
        maxRounds?: number;
    });
    private executeSingleRound;
    private handleHistoryImageMessages;
    private countImages;
    execute(input: NodeInput, output: NodeOutput, context: ExecutionContext, outputSchema?: unknown): Promise<unknown>;
    private formatSystemPrompt;
    private formatUserPrompt;
    static createPromptAction(name: string, description: string, tools: Tool<any, any>[], llmProvider: LLMProvider | undefined, llmConfig?: LLMParameters): Action;
}
