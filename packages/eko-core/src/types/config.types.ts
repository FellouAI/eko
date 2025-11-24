import TaskContext from "../agent/agent-context";
import { ChatContext } from "../chat/chat-context";
import { ChatService } from "../service/chat-service";

export type Config = {
  name: string; // product name
  mode: "fast" | "normal" | "expert";
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
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
}

export const GlobalPromptKey = {
  planner_system: "planner_system",
  planner_user: "planner_user",
  planner_user_website: "planner_user_website",
  agent_system: "agent_system",
  chat_system: "chat_system",
  deep_action_description: "deep_action_description",
  deep_action_param_task_description: "deep_action_param_task_description",
};

export type Global = {
  chatMap: Map<string, ChatContext>;
  taskMap: Map<string, TaskContext>; // messageId -> TaskContext
  prompts: Map<string, string>;
  chatService: ChatService,
};
