import TaskContext from "../agent/agent-context";
import { ChatContext } from "../chat/chat-context";
import { ChatService } from "../service/chat-service";
import { BrowserService } from "../service/browser-service";

export interface MemoryConfig {
  maxMessageNum: number; // Maximum number of messages to keep in memory
  maxInputTokens: number; // Maximum number of input tokens to keep in memory
  enableCompression: boolean; // Whether to enable compression of text content
  compressionThreshold: number; // Threshold for compression of message count
  compressionMaxLength: number; // Maximum length for compression of text content
}

export type Config = {
  name: string; // product name
  mode: "fast" | "normal" | "expert";
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxOutputTokens: number;
  maxRetryNum: number;
  agentParallel: boolean;
  compressThreshold: number; // Dialogue context compression threshold (message count)
  compressTokensThreshold: number; // Dialogue context compression threshold (token count)
  largeTextLength: number;
  fileTextMaxLength: number;
  maxDialogueImgFileNum: number;
  toolResultMultimodal: boolean;
  parallelToolCalls: boolean;
  markImageMode: "dom" | "draw";
  expertModeTodoLoopNum: number;
  memoryConfig: MemoryConfig;
}

export enum GlobalPromptKey {
  planner_system = "planner_system",
  planner_example = "planner_example",
  planner_user = "planner_user",
  agent_system = "agent_system",
  chat_system = "chat_system",
  webpage_qa_prompt = "webpage_qa_prompt",
  deep_action_description = "deep_action_description",
  deep_action_param_task_description = "deep_action_param_task_description",
}

export type Global = {
  chatMap: Map<string, ChatContext>;
  taskMap: Map<string, TaskContext>; // messageId -> TaskContext
  prompts: Map<string, string>;
  chatService?: ChatService,
  browserService?: BrowserService,
};
