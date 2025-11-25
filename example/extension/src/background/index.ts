import {
  LLMs,
  global,
  uuidv4,
  ChatAgent,
  AgentContext,
  AgentStreamMessage,
} from "@eko-ai/eko";
import {
  HumanCallback,
  MessageTextPart,
  MessageFilePart,
  ChatStreamMessage,
  AgentStreamCallback,
} from "@eko-ai/eko/types";
import { BrowserAgent } from "@eko-ai/eko-extension";

const abortControllers = new Map<string, AbortController>();
const callbackIdMap = new Map<string, Function>();

export async function getLLMConfig(name: string = "llmConfig"): Promise<any> {
  const result = await chrome.storage.sync.get([name]);
  return result[name];
}

export async function init(): Promise<ChatAgent> {
  const config = await getLLMConfig();
  if (!config || !config.apiKey) {
    printLog(
      "Please configure apiKey, configure in the eko extension options of the browser extensions.",
      "error"
    );
    chrome.runtime.openOptionsPage();
    chrome.storage.local.set({ running: false });
    chrome.runtime.sendMessage({ type: "stop" });
    return;
  }

  const llms: LLMs = {
    default: {
      provider: config.llm as any,
      model: config.modelName,
      apiKey: config.apiKey,
      config: {
        baseURL: config.options.baseURL,
      },
    },
  };

  // Chat callback
  const chatCallback = {
    onMessage: async (message: ChatStreamMessage) => {
      chrome.runtime.sendMessage({
        type: "chat_callback",
        data: message,
      });
      console.log("chat message: ", JSON.stringify(message, null, 2));
    },
  };

  // Task agent callback
  const taskCallback: AgentStreamCallback & HumanCallback = {
    onMessage: async (message: AgentStreamMessage) => {
      chrome.runtime.sendMessage({
        type: "task_callback",
        data: { ...message, messageId: message.taskId },
      });
      console.log("task message: ", JSON.stringify(message, null, 2));
    },
    onHumanConfirm: async (context: AgentContext, prompt: string) => {
      const callbackId = uuidv4();
      chrome.runtime.sendMessage({
        type: "task_callback",
        data: {
          streamType: "agent",
          chatId: context.context.chatId,
          taskId: context.context.taskId,
          agentName: context.agent.Name,
          nodeId: context.agentChain.agent.id,
          messageId: context.context.taskId,
          type: "human_confirm",
          callbackId: callbackId,
          prompt: prompt,
        },
      });
      console.log("human_confirm: ", prompt);
      return new Promise((resolve) => {
        callbackIdMap.set(callbackId, (value: boolean) => {
          callbackIdMap.delete(callbackId);
          resolve(value);
        });
      });
    },
    onHumanInput: async (context: AgentContext, prompt: string) => {
      const callbackId = uuidv4();
      chrome.runtime.sendMessage({
        type: "task_callback",
        data: {
          streamType: "agent",
          chatId: context.context.chatId,
          taskId: context.context.taskId,
          agentName: context.agent.Name,
          nodeId: context.agentChain.agent.id,
          messageId: context.context.taskId,
          type: "human_input",
          callbackId: callbackId,
          prompt: prompt,
        },
      });
      console.log("human_input: ", prompt);
      return new Promise((resolve) => {
        callbackIdMap.set(callbackId, (value: string) => {
          callbackIdMap.delete(callbackId);
          resolve(value);
        });
      });
    },
    onHumanSelect: async (
      context: AgentContext,
      prompt: string,
      options: string[],
      multiple: boolean
    ) => {
      const callbackId = uuidv4();
      chrome.runtime.sendMessage({
        type: "task_callback",
        data: {
          streamType: "agent",
          chatId: context.context.chatId,
          taskId: context.context.taskId,
          agentName: context.agent.Name,
          nodeId: context.agentChain.agent.id,
          messageId: context.context.taskId,
          type: "human_select",
          callbackId: callbackId,
          prompt: prompt,
          options: options,
          multiple: multiple,
        },
      });
      console.log("human_select: ", prompt);
      return new Promise((resolve) => {
        callbackIdMap.set(callbackId, (value: string[]) => {
          callbackIdMap.delete(callbackId);
          resolve(value);
        });
      });
    },
    onHumanHelp: async (
      context: AgentContext,
      helpType: "request_login" | "request_assistance",
      prompt: string
    ) => {
      const callbackId = uuidv4();
      chrome.runtime.sendMessage({
        type: "task_callback",
        data: {
          streamType: "agent",
          chatId: context.context.chatId,
          taskId: context.context.taskId,
          agentName: context.agent.Name,
          nodeId: context.agentChain.agent.id,
          messageId: context.context.taskId,
          type: "human_help",
          callbackId: callbackId,
          helpType: helpType,
          prompt: prompt,
        },
      });
      console.log("human_help: ", prompt);
      return new Promise((resolve) => {
        callbackIdMap.set(callbackId, (value: boolean) => {
          callbackIdMap.delete(callbackId);
          resolve(value);
        });
      });
    },
  };

  const agents = [new BrowserAgent()];
  const chatAgent = new ChatAgent({ llms, agents });

  chrome.runtime.onMessage.addListener(async function (
    request,
    sender,
    sendResponse
  ) {
    const requestId = request.requestId;
    const type = request.type;
    const data = request.data;
    if (type == "chat") {
      const messageId = data.messageId;
      const user = data.user as (MessageTextPart | MessageFilePart)[];
      const abortController = new AbortController();
      abortControllers.set(messageId, abortController);
      const result = await chatAgent.chat({
        user: user,
        messageId,
        callback: {
          chatCallback,
          taskCallback,
        },
        signal: abortController.signal,
      });
      chrome.runtime.sendMessage({
        requestId,
        type: "chat_result",
        data: { messageId, result },
      });
    } else if (type == "human_callback") {
      const callbackId = data.callbackId as string;
      const value = data.value as any;
      const callback = callbackIdMap.get(callbackId);
      if (callback) {
        callback(value);
      }
      chrome.runtime.sendMessage({
        requestId,
        type: "human_callback_result",
        data: { callbackId, success: callback != null },
      });
    } else if (type == "uploadFile") {
      const base64Data = data.base64Data as string;
      const mimeType = data.mimeType as string;
      const filename = data.filename as string;
      try {
        const { fileId, url } = await global.chatService.uploadFile(
          { base64Data, mimeType, filename },
          chatAgent.getChatContext().getChatId()
        );
        chrome.runtime.sendMessage({
          requestId,
          type: "uploadFile_result",
          data: { fileId, url },
        });
      } catch (error) {
        chrome.runtime.sendMessage({
          requestId,
          type: "uploadFile_result",
          data: { error: error + "" },
        });
      }
    } else if (type == "stop") {
      const abortController = abortControllers.get(data.messageId);
      if (abortController) {
        abortController.abort("user aborted");
        abortControllers.delete(data.messageId);
      }
    } else if (type == "getTabs") {
      try {
        const tabs = await chrome.tabs.query({});
        const sortedTabs = tabs
          .sort((a, b) => {
            const aTime = (a as any).lastAccessed || 0;
            const bTime = (b as any).lastAccessed || 0;
            return bTime - aTime;
          })
          .filter((tab) => !tab.url.startsWith("chrome://"))
          .map((tab) => {
            const lastAccessed = (tab as any).lastAccessed;
            return {
              tabId: String(tab.id),
              title: tab.title || "",
              url: tab.url || "",
              active: tab.active,
              status: tab.status,
              iconUrl: tab.favIconUrl,
              lastAccessed: lastAccessed
                ? new Date(lastAccessed).toLocaleString()
                : "",
            };
          })
          .slice(0, 15);

        chrome.runtime.sendMessage({
          requestId,
          type: "getTabs_result",
          data: { tabs: sortedTabs },
        });
      } catch (error) {
        chrome.runtime.sendMessage({
          requestId,
          type: "getTabs_result",
          data: { error: String(error) },
        });
      }
    }
  });

  return chatAgent;
}

function printLog(message: string, level?: "info" | "success" | "error") {
  chrome.runtime.sendMessage({
    type: "log",
    data: {
      level: level || "info",
      message: message + "",
    },
  });
}

init().catch((error) => {
  printLog(error, "error");
});

if ((chrome as any).sidePanel) {
  (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
