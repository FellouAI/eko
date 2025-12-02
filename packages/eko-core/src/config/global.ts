import { Global } from "../types";
import TaskContext from "../agent/agent-context";
import { ChatContext } from "../chat/chat-context";

const global: Global = {
  chatMap: new Map<string, ChatContext>(),
  taskMap: new Map<string, TaskContext>(),
  prompts: new Map<string, string>(),
};

export default global;
