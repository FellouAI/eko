import { ExecutionLogger, LogOptions } from "@/utils/execution-logger";
import { Workflow, WorkflowNode, LLMProvider, WorkflowCallback } from "../types";
import { EkoConfig, WorkflowResult } from "../types/eko.types";
export declare class WorkflowImpl implements Workflow {
    id: string;
    name: string;
    private ekoConfig;
    private rawWorkflow;
    description?: string | undefined;
    nodes: WorkflowNode[];
    variables: Map<string, unknown>;
    llmProvider?: LLMProvider | undefined;
    abort?: boolean;
    private logger?;
    abortControllers: Map<string, AbortController>;
    constructor(id: string, name: string, ekoConfig: EkoConfig, rawWorkflow: string, description?: string | undefined, nodes?: WorkflowNode[], variables?: Map<string, unknown>, llmProvider?: LLMProvider | undefined, loggerOptions?: LogOptions);
    setLogger(logger: ExecutionLogger): void;
    cancel(): Promise<void>;
    execute(callback?: WorkflowCallback): Promise<WorkflowResult>;
    addNode(node: WorkflowNode): void;
    removeNode(nodeId: string): void;
    getNode(nodeId: string): WorkflowNode;
    validateDAG(): boolean;
    getRawWorkflowJson(): string;
}
