import { LLMConfig, EkoConfig, EkoInvokeParam, Tool, Workflow, WorkflowCallback, NodeOutput } from '../types';
/**
 * Eko core
 */
export declare class Eko {
    static tools: Map<string, Tool<any, any>>;
    private llmProvider;
    private ekoConfig;
    private toolRegistry;
    private workflowGeneratorMap;
    constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig);
    private registerTools;
    generate(prompt: string, param?: EkoInvokeParam): Promise<Workflow>;
    execute(workflow: Workflow): Promise<NodeOutput[]>;
    cancel(workflow: Workflow): Promise<void>;
    modify(workflow: Workflow, prompt: string): Promise<Workflow>;
    private getTool;
    callTool(toolName: string, input: object, callback?: WorkflowCallback): Promise<any>;
    callTool(tool: Tool<any, any>, input: object, callback?: WorkflowCallback): Promise<any>;
    registerTool(tool: Tool<any, any>): void;
    unregisterTool(toolName: string): void;
}
export default Eko;
