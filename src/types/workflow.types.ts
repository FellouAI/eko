import { Action, ExecutionContext, Tool } from "./action.types";
import { LLMProvider } from "./llm.types";
import { ExecutionLogger } from "@/utils/execution-logger";
import { ExportFileParam } from "./tools.types";

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

// 定义 WorkflowResult 接口
export interface WorkflowResult {
  // 总结工作流做了什么
  summary?: string;
  // 简单总结工作流，然后输出大段文本，用 "--" 隔断
  summaryWithText?: {
      summary: string;
      text: string;
  };
  // 预留 image 类型，后续可根据实际需求实现
  // image?: {
  //     url: string;
  //     // 可以添加更多关于图片的属性，如宽度、高度等
  // };
  // 预留 pdf 类型，后续可根据实际需求实现
  // pdf?: {
  //     url: string;
  //     // 可以添加更多关于 PDF 的属性，如页数等
  // };
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  variables: Map<string, any>;
  llmProvider?: LLMProvider;

  setLogger(logger: ExecutionLogger): void;
  // 修改 execute 方法的返回类型
  execute(callback?: WorkflowCallback): Promise<WorkflowResult | null>;
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
    onHumanInputText?: (question: string) => Promise<string>;
    onHumanInputSingleChoice?: (question: string, choices: string[]) => Promise<string>;
    onHumanInputMultipleChoice?: (question: string, choices: string[]) => Promise<string[]>;
    onHumanOperate?: (reason: string) => Promise<string>;
    onSummaryWorkflow?: (summary: string) => Promise<void>;
    onExportFile?: (param: ExportFileParam) => Promise<void>;
  }
};
