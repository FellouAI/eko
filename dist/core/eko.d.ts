import { LLMConfig, EkoConfig, EkoInvokeParam, Tool, Workflow, WorkflowCallback, WorkflowResult } from '../types';
/**
 * Eko core
 */
export declare class Eko {
    static tools: Map<string, Tool<any, any>>;
    private llmProvider;
    private ekoConfig;
    private toolRegistry;
    private workflowGeneratorMap;
    prompt: string;
    tabs: chrome.tabs.Tab[];
    workflow?: Workflow;
    constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig);
    private buildEkoConfig;
    private registerTools;
    generate(prompt: string, tabs?: chrome.tabs.Tab[], param?: EkoInvokeParam): Promise<Workflow>;
    execute(workflow: Workflow): Promise<WorkflowResult>;
    cancel(): Promise<void>;
    modify(workflow: Workflow, prompt: string): Promise<Workflow>;
    private getTool;
    callTool(toolName: string, input: object, callback?: WorkflowCallback): Promise<any>;
    callTool(tool: Tool<any, any>, input: object, callback?: WorkflowCallback): Promise<any>;
    registerTool(tool: Tool<any, any>): void;
    unregisterTool(toolName: string): void;
}
export default Eko;
