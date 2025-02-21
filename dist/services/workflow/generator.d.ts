import { LLMProvider, Message } from '../../types/llm.types';
import { Workflow } from '../../types/workflow.types';
import { ToolRegistry } from '../../core/tool-registry';
import { EkoConfig } from '@/types';
export declare class WorkflowGenerator {
    private llmProvider;
    private toolRegistry;
    message_history: Message[];
    constructor(llmProvider: LLMProvider, toolRegistry: ToolRegistry);
    generateWorkflow(prompt: string, ekoConfig: EkoConfig): Promise<Workflow>;
    generateWorkflowFromJson(json: any, ekoConfig: EkoConfig): Promise<Workflow>;
    modifyWorkflow(prompt: string, ekoConfig: EkoConfig): Promise<Workflow>;
    private doGenerateWorkflow;
    private createWorkflowFromData;
}
