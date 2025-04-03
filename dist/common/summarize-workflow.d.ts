import { LLMProvider, WorkflowSummary, Workflow, NodeOutput } from "@/types";
export declare function summarizeWorkflow(llmProvider: LLMProvider, workflow: Workflow, contextVariables: Map<string, unknown>, nodeOutputs: NodeOutput[]): Promise<WorkflowSummary>;
