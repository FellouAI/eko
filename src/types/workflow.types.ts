import { Action, ExecutionContext, Tool } from "./action.types";
import { LLMProvider } from "./llm.types";
import { ExecutionLogger } from "@/utils/execution-logger";

export interface NodeOutput {
  name: string;
  description: string;
  value?: unknown;      // filled after execution
}

export interface NodeInput {
  items: NodeOutput[];  // populated by the outputs of the dependencies before execution
}

export interface WorkflowNode {
  id: string;
  name: string;
  description?: string;
  dependencies: string[];
  action: Action;
  input: NodeInput;
  output: NodeOutput;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  variables: Map<string, any>;
  llmProvider?: LLMProvider;

  setLogger(logger: ExecutionLogger): void;
  execute(callback?: WorkflowCallback): Promise<NodeOutput[]>;
  cancel(): Promise<void>;
  addNode(node: WorkflowNode): void;
  removeNode(nodeId: string): void;
  getNode(nodeId: string): WorkflowNode;
  validateDAG(): boolean;
}

export interface WorkflowCallback {
  hooks: {
    beforeWorkflow?: (workflow: Workflow) => Promise<void>;
    beforeSubtask?: (subtask: WorkflowNode, context: ExecutionContext) => Promise<void>;
    beforeToolUse?: (tool: Tool<any, any>, context: ExecutionContext, input: any) => Promise<any>;
    afterToolUse?: (tool: Tool<any, any>, context: ExecutionContext, result: any) => Promise<any>;
    afterSubtask?: (subtask: WorkflowNode, context: ExecutionContext, result: any) => Promise<void>;
    afterWorkflow?: (workflow: Workflow, variables: Map<string, unknown>) => Promise<void>;
    onTabCreated?: (tabId: number) => Promise<void>;
    onLlmMessage?: (textContent: string) => Promise<void>;
  }
};
