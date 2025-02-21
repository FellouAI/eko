import { Tool } from '../types/action.types';
import { ToolDefinition } from '../types/llm.types';
export declare class ToolRegistry {
    private tools;
    registerTool(tool: Tool<any, any>): void;
    unregisterTool(toolName: string): boolean;
    getTool(toolName: string): Tool<any, any>;
    hasTools(toolNames: string[]): boolean;
    getAllTools(): Tool<any, any>[];
    getToolDefinitions(): ToolDefinition[];
    getToolEnum(): string[];
    getWorkflowSchema(): object;
}
