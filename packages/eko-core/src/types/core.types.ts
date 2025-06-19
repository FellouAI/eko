import { LanguageModelV1FinishReason } from "@ai-sdk/provider";
import { Agent } from "../agent";
import { LLMs } from "./llm.types";
import { IA2aClient } from "../agent/a2a";
import { IMcpClient } from "./mcp.types";
import { ToolResult } from "./tools.types";
import { AgentContext } from "../core/context";

export type EkoConfig = {
  llms: LLMs;
  agents?: Agent[];
  planLlms?: string[];
  callback?: StreamCallback & HumanCallback;
  defaultMcpClient?: IMcpClient;
  a2aClient?: IA2aClient;
};

export type StreamCallbackMessage = {
  taskId: string;
  agentName: string;
  nodeId?: string | null; // agent nodeId
} & (
  | {
      type: "workflow";
      streamDone: boolean;
      workflow: Workflow;
    }
  | {
      type: "text" | "thinking";
      streamId: string;
      streamDone: boolean;
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string;
    }
  | {
      type: "tool_streaming";
      toolName: string;
      toolId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolId: string;
      text: string;
      streamId: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV1FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
      };
    }
);

export interface StreamCallback {
  onMessage: (message: StreamCallbackMessage, agentContext?: AgentContext) => Promise<void>;
}

export type ActionSelector = {
  css?: string;
  xpath?: string;
};

export type BrowserAction = {
  type: string; // e.g., "browser.click", "browser.input", etc.
  selector?: ActionSelector;
  value?: string;
  screenshot?: string;
  url?: string;
  command?: string;
  key?: string;
  duration?: number;
  fields?: Array<{
    name: string;
    selector: string;
  }>;
};

export type WorkflowTextNode = {
  type: "normal",
  text: string;
  input?: string | null;
  output?: string | null;
  executionMode?: "deterministic" | "agent";
  action?: BrowserAction;
};

export type WorkflowForEachNode = {
  type: "forEach",
  items: string; // list or variable name
  nodes: WorkflowNode[];
};

export type WorkflowWatchNode = {
  type: "watch",
  event: "dom" | "gui" | "file";
  loop: boolean;
  description: string;
  triggerNodes: (WorkflowTextNode | WorkflowForEachNode)[];
};

export type WorkflowNode =
  | WorkflowTextNode
  | WorkflowForEachNode
  | WorkflowWatchNode;

export type WorkflowAgent = {
  id: string;
  name: string;
  task: string;
  nodes: WorkflowNode[];
  xml: string; // <agent name="xxx">...</agent>
  sequentialMode?: boolean; // Execute nodes sequentially without LLM orchestration
};

export type TemplateVariable = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
};

export type WorkflowTemplate = {
  version: string;
  variables: TemplateVariable[];
};

export type Workflow = {
  taskId: string;
  name: string;
  thought: string;
  agents: WorkflowAgent[];
  xml: string;
  taskPrompt?: string;
  template?: WorkflowTemplate;
};

export interface HumanCallback {
  onHumanConfirm?: (
    agentContext: AgentContext,
    prompt: string,
    extInfo?: any
  ) => Promise<boolean>;
  onHumanInput?: (
    agentContext: AgentContext,
    prompt: string,
    extInfo?: any
  ) => Promise<string>;
  onHumanSelect?: (
    agentContext: AgentContext,
    prompt: string,
    options: string[],
    multiple?: boolean,
    extInfo?: any
  ) => Promise<string[]>;
  onHumanHelp?: (
    agentContext: AgentContext,
    helpType: "request_login" | "request_assistance",
    prompt: string,
    extInfo?: any
  ) => Promise<boolean>;
}

export type EkoResult = {
  taskId: string;
  success: boolean;
  stopReason: "abort" | "error" | "done";
  result?: any;
};
