import {
  JSONSchema7,
  LanguageModelV2FinishReason,
  LanguageModelV2ToolCallPart,
} from "@ai-sdk/provider";
import { ToolResult } from "./tools.types";
import { EkoConfig, HumanCallback, AgentStreamCallback } from "./agent.types";

export type MessageTextPart = {
  type: "text";
  text: string;
};

export type MessageFilePart = {
  type: "file";
  fileId: string;
  filename?: string;
  mimeType: string;
  data: string; // base64 / URL
  filePath?: string;
};

export type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  isError: boolean;
  output: string | Record<string, any>;
};

export type ChatStreamMessage = {
  streamType: "chat";
  chatId: string;
  messageId: string;
} & (
  | {
      type: "chat_start";
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
      toolCallId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolCallId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolCallId: string;
      text: string;
      streamId: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolCallId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
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
  | {
      type: "chat_end";
      error: string | null;
      duration: number;
      reactLoopNum: number;
    }
);

export interface ChatStreamCallback {
  chatCallback: {
    onMessage: (message: ChatStreamMessage) => Promise<void>;
  };
  taskCallback?: AgentStreamCallback & HumanCallback;
}

export type EkoMessage = { id: string } & (
  | {
      role: "user";
      content: string | EkoMessageUserPart[];
    }
  | {
      role: "assistant";
      content: EkoMessageAssistantPart[];
    }
  | {
      role: "tool";
      content: EkoMessageToolPart[];
    }
) & {
    timestamp: number;
    extra?: Record<string, any>;
  };

export type EkoMessageUserPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string; // base64 / URL
    };

export type EkoMessageAssistantPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    };

export type EkoMessageToolPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: string | Record<string, unknown>;
};

export interface DialogueTool {
  readonly name: string;
  readonly description?: string;
  readonly parameters: JSONSchema7;
  execute: (
    args: Record<string, unknown>,
    toolCall: LanguageModelV2ToolCallPart,
    messageId: string
  ) => Promise<ToolResult>;
}

export type EkoDialogueConfig = Omit<EkoConfig, "callback"> & {
  chatLlms?: string[];
};

export type DialogueParams = {
  messageId: string;
  user: Array<MessageTextPart | MessageFilePart>;
  callback: ChatStreamCallback;
  datetime?: string;
  signal?: AbortSignal;
  extra?: Record<string, any>;
};
