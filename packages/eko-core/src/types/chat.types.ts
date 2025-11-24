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

export type ChatMessage = { id: string } & (
  | {
      role: "user";
      content: Array<MessageTextPart | MessageFilePart>;
    }
  | {
      role: "assistant";
      thinkingContent?: string;
      content: Array<MessageTextPart | ToolCallPart>;
    }
  | {
      role: "tool";
      content: Array<ToolResultPart>;
    }
) & {
    createdAt: number;
    extra?: Record<string, any>;
  };

export type ChatMessages = Array<ChatMessage>;

export type WebSearchResult = {
  name: string;
  url: string;
  logo?: string;
  snippet: string;
  content?: string;
  imageList?: string[];
};

export type ChatStreamMessage = {
  streamType: "chat";
  chatId: string;
  messageId: string;
} & (
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
);

export interface ChatStreamCallback {
  chatCallback: {
    onMessage: (message: ChatStreamMessage) => Promise<void>;
  };
  taskCallback?: AgentStreamCallback & HumanCallback;
}

export type EkoMessage =
  | {
      id: string;
      role: "user";
      timestamp: number;
      content: string | EkoMessageUserPart[];
    }
  | {
      id: string;
      role: "assistant";
      timestamp: number;
      content: EkoMessageAssistantPart[];
    }
  | {
      id: string;
      role: "tool";
      timestamp: number;
      content: EkoMessageToolPart[];
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
    messageId: string,
  ) => Promise<ToolResult>;
}

export type EkoDialogueConfig = Omit<EkoConfig, "callback"> & {
  chatLlms?: string[];
};

export type DialogueParams = {
  messageId: string;
  user: Array<MessageTextPart | MessageFilePart>;
  callback: ChatStreamCallback;
  signal?: AbortSignal;
  extra?: Record<string, any>;
};
