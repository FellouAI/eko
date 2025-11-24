import {
  LLMs,
  global,
  ChatAgent,
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
    onHumanConfirm: async (context, prompt) => {
      return doConfirm(prompt);
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
    } else if (type == "uploadFile") {
      const base64Data = data.base64Data as string;
      const mimeType = data.mimeType as string;
      const filename = data.filename as string;
      const { fileId, url } = await global.chatService.uploadFile(
        { base64Data, mimeType, filename },
        chatAgent.getChatContext().getChatId()
      );
      chrome.runtime.sendMessage({
        requestId,
        type: "uploadFile_result",
        data: { fileId, url },
      });
    } else if (type == "stop") {
      const abortController = abortControllers.get(data.messageId);
      if (abortController) {
        abortController.abort();
        abortControllers.delete(data.messageId);
      }
    }
  });

  return chatAgent;
}

async function doConfirm(prompt: string) {
  const tabs = (await chrome.tabs.query({
    active: true,
    windowType: "normal",
  })) as any[];
  const frameResults = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: (prompt) => {
      return window.confirm(prompt);
    },
    args: [prompt],
  });
  return frameResults[0].result;
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
