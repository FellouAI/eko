import type {
  Workflow,
  ToolResult,
  WorkflowAgent,
  ChatStreamMessage,
  AgentStreamMessage,
} from "@eko-ai/eko/types";

export type MessageRole = "user" | "assistant";

export type ChatContentItem =
  | { type: "thinking"; streamId: string; text: string; streamDone: boolean }
  | { type: "text"; streamId: string; text: string; streamDone: boolean }
  | { type: "file"; mimeType: string; data: string }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      params?: Record<string, any>;
      paramsText?: string;
      result?: ToolResult;
      running?: boolean;
      runningText?: string;
    }
  | { type: "task"; taskId: string; task: TaskData };

export interface TaskData {
  taskId: string;
  workflow?: Workflow;
  workflowStreamDone?: boolean;
  agents: AgentExecution[]; // Ordered by execution sequence
}

export type AgentContentItem =
  | { type: "thinking"; streamId: string; text: string; streamDone: boolean }
  | { type: "text"; streamId: string; text: string; streamDone: boolean }
  | { type: "file"; mimeType: string; data: string }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      params?: Record<string, any>;
      paramsText?: string;
      result?: ToolResult;
      running?: boolean;
      runningText?: string;
    }
  | {
      type: "human_confirm";
      callbackId: string;
      prompt: string;
      responded?: boolean;
      value?: any;
    }
  | {
      type: "human_input";
      callbackId: string;
      prompt: string;
      responded?: boolean;
      value?: any;
    }
  | {
      type: "human_select";
      callbackId: string;
      prompt: string;
      options: string[];
      multiple: boolean;
      responded?: boolean;
      value?: any;
    }
  | {
      type: "human_help";
      callbackId: string;
      prompt: string;
      helpType: "request_login" | "request_assistance";
      responded?: boolean;
      value?: any;
    };

export interface AgentExecution {
  agentNode: WorkflowAgent;
  contentItems: AgentContentItem[]; // All content in order
  status: "init" | "running" | "done" | "error";
  result?: string;
  error?: any;
}

export interface UploadedFile {
  id: string;
  file: File;
  base64Data: string;
  mimeType: string;
  filename: string;
  fileId?: string; // File ID after upload
  url?: string; // URL after upload
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  uploadedFiles?: UploadedFile[]; // Files in user message
  contentItems: ChatContentItem[]; // All content in order
  status?: "waiting" | "running" | "done" | "error" | "terminated";
  error?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type { ChatStreamMessage, AgentStreamMessage };
