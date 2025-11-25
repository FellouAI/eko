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
  agents: AgentExecution[]; // 按执行顺序排列
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
    };

export interface AgentExecution {
  agentNode: WorkflowAgent;
  contentItems: AgentContentItem[]; // 所有内容按顺序
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
  fileId?: string; // 上传后的 fileId
  url?: string; // 上传后的 URL
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  contentItems: ChatContentItem[]; // 所有内容按顺序
  files?: UploadedFile[]; // 用户消息中的文件
  loading?: boolean; // 用户消息等待回调的 loading 状态
  error?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type { ChatStreamMessage, AgentStreamMessage };
