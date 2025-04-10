import { ToolDefinition } from '../../types/llm.types';
import { ToolRegistry } from '../../core/tool-registry';
export declare function createWorkflowPrompts(tools: ToolDefinition[]): {
    formatSystemPrompt: () => string;
    formatUserPrompt: (requirement: string) => string;
    modifyUserPrompt: (prompt: string) => string;
};
export declare function createWorkflowGenerationTool(registry: ToolRegistry): ToolDefinition;
