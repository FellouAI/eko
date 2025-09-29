import { LanguageModelV2FinishReason } from "@ai-sdk/provider";
import { Agent } from "../agent";
import { LLMs, LLMRequest } from "./llm.types";
import { IA2aClient } from "../agent/a2a";
import { IMcpClient } from "./mcp.types";
import { ToolResult } from "./tools.types";
import { AgentContext } from "../core/context";
import { LangfuseCallbackOptions } from "../trace/langfuse-integration";

export type EkoConfig = {
  llms: LLMs;
  agents?: Agent[];
  planLlms?: string[];
  callback?: StreamCallback & HumanCallback;
  defaultMcpClient?: IMcpClient;
  a2aClient?: IA2aClient;
  /**
   * Enable Langfuse observation callback composition
   * When true, eko-core composes built-in Langfuse callbacks with user-provided
   * callback at runtime to achieve session-level tracing with multiple observations.
   */
  enable_langfuse?: boolean;
  langfuse_options?: LangfuseCallbackOptions;
};

export type StreamCallbackMessage = {
  taskId: string;
  agentName: string;
  nodeId?: string | null; // agent nodeId
  timestamp?: number; // event timestamp
} & (
  // ========== Task-level events ==========
  | {
      type: "debug_task_start";
      taskPrompt: string;
      contextParams?: Record<string, any>;
    }
  | {
      type: "debug_task_finished";
      success: boolean;
      result?: string;
      error?: any;
      stopReason?: string;
    }
  // ========== Planning events ==========
  | {
      type: "debug_plan_start";
      taskPrompt: string;
      plannerPrompt: {
        systemPrompt: string;
        userPrompt: string;
      };
      availableAgents: Array<{
        name: string;
        description: string;
        planDescription?: string;
      }>;
    }
  | {
      type: "debug_plan_process";
      streamDone: boolean;
      partialWorkflow?: Workflow;
      thinkingText?: string;
    }
  | {
      type: "debug_plan_finished";
      workflow: Workflow;
      planRequest: LLMRequest;
      planResult: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
  // ========== Workflow execution events ==========
  | {
      type: "debug_workflow_start";
      workflow: Workflow;
      agentTree: any; // built agent execution tree
    }
  | {
      type: "debug_workflow_finished";
      results: string[];
      finalResult: string;
    }
  // ========== Agent-level events ==========
  | {
      type: "debug_agent_start";
      agentNode: WorkflowAgent;
      agentInfo: {
        name: string;
        description: string;
        tools: string[];
        llms?: string[];
      };
      requirements: string; // requirement passed to the agent
    }
  | {
      type: "debug_agent_process";
      loopNum: number;
      maxReactNum: number;
      currentMessages: any; // current message history stats
    }
  | {
      type: "debug_agent_finished";
      agentNode: WorkflowAgent;
      result: string;
      error?: any;
      executionStats: {
        loopCount: number;
        toolCallCount: number;
        duration: number;
      };
    }
  // ========== LLM interaction events ==========
  | {
      type: "debug_llm_request_start";
      request: LLMRequest;
      modelName?: string;
      context: {
        messageCount: number;
        toolCount: number;
        hasSystemPrompt: boolean;
      };
    }
  | {
      type: "debug_llm_response_start";
      streamId: string;
    }
  | {
      type: "debug_llm_response_process";
      streamId: string;
      deltaType: "text" | "thinking" | "tool_call";
      delta: string;
    }
  | {
      type: "debug_llm_response_finished";
      streamId: string;
      response: Array<any>;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
  // ========== Tool-call events ==========
  | {
      type: "debug_tool_call_start";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
    }
  | {
      type: "debug_tool_call_process";
      toolName: string;
      toolId: string;
      streamId: string;
      text: string;
      streamDone: boolean;
    }
  | {
      type: "debug_tool_call_finished";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
      duration: number;
    }
  // ========== Backward-compatible legacy event types ==========
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
      type: "agent_result";
      agentNode: WorkflowAgent;
      error?: any;
      result?: string;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV2FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
);

export interface StreamCallback {
  onMessage: (
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ) => Promise<void>;
}

export type WorkflowTextNode = {
  type: "normal";
  text: string;
  input?: string | null;
  output?: string | null;
};

export type WorkflowForEachNode = {
  type: "forEach";
  items: string; // list or variable name
  nodes: WorkflowNode[];
};

export type WorkflowWatchNode = {
  type: "watch";
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
  dependsOn: string[];
  nodes: WorkflowNode[];
  parallel?: boolean;
  status: "init" | "running" | "done" | "error";
  xml: string; // <agent name="xxx">...</agent>
};

export type Workflow = {
  taskId: string;
  name: string;
  thought: string;
  agents: WorkflowAgent[];
  xml: string;
  modified?: boolean;
  taskPrompt?: string;
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
  result: string;
  error?: unknown;
};

export type NormalAgentNode = {
  type: "normal";
  agent: WorkflowAgent;
  nextAgent?: AgentNode;
  result?: string;
};

export type ParallelAgentNode = {
  type: "parallel";
  agents: NormalAgentNode[];
  nextAgent?: AgentNode;
  result?: string;
};

export type AgentNode = NormalAgentNode | ParallelAgentNode;
