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
import { initAgentServices } from "./agent";
import { BrowserAgent } from "@eko-ai/eko-extension";

var chatAgent: ChatAgent | null = null;
const humanCallbackIdMap = new Map<string, Function>();
const abortControllers = new Map<string, AbortController>();

// Optimal presets for each module (parameters only - model is auto-selected by OpenRouter)
const MODULE_PRESETS = {
  planning: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 8192,
  },
  navigation: {
    temperature: 0.2,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 16000,
  },
  compression: {
    temperature: 0.5,
    topP: 0.85,
    topK: 30,
    maxOutputTokens: 4096,
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
      humanCallbackIdMap.set(callbackId, (value: boolean) => {
        humanCallbackIdMap.delete(callbackId);
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
      humanCallbackIdMap.set(callbackId, (value: string) => {
        humanCallbackIdMap.delete(callbackId);
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
      humanCallbackIdMap.set(callbackId, (value: string[]) => {
        humanCallbackIdMap.delete(callbackId);
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
      humanCallbackIdMap.set(callbackId, (value: boolean) => {
        humanCallbackIdMap.delete(callbackId);
        resolve(value);
      });
    });
  },
};

export async function init(): Promise<ChatAgent | void> {
  // Load OpenRouter API key
  const storage = await chrome.storage.sync.get(["openRouterApiKey"]);
  const apiKey = storage.openRouterApiKey;

  if (!apiKey) {
    printLog(
      "Please configure your OpenRouter API key in the Browseless.ai extension settings.",
      "error"
    );
    setTimeout(() => {
      chrome.runtime.openOptionsPage();
    }, 1000);
    return;
  }

  initAgentServices();

  // Build LLMs config using OpenRouter auto-routing for all modules
  // OpenRouter's "openrouter/auto" automatically selects the best model for each prompt
  const llms: LLMs = {
    default: {
      provider: "openrouter",
      model: "openrouter/auto",
      apiKey: apiKey,
      config: {
        baseURL: "https://openrouter.ai/api/v1",
        temperature: MODULE_PRESETS.navigation.temperature,
        topP: MODULE_PRESETS.navigation.topP,
        topK: MODULE_PRESETS.navigation.topK,
        maxOutputTokens: MODULE_PRESETS.navigation.maxOutputTokens,
      },
    },
    planning: {
      provider: "openrouter",
      model: "openrouter/auto",
      apiKey: apiKey,
      config: {
        baseURL: "https://openrouter.ai/api/v1",
        temperature: MODULE_PRESETS.planning.temperature,
        topP: MODULE_PRESETS.planning.topP,
        topK: MODULE_PRESETS.planning.topK,
        maxOutputTokens: MODULE_PRESETS.planning.maxOutputTokens,
      },
    },
    navigation: {
      provider: "openrouter",
      model: "openrouter/auto",
      apiKey: apiKey,
      config: {
        baseURL: "https://openrouter.ai/api/v1",
        temperature: MODULE_PRESETS.navigation.temperature,
        topP: MODULE_PRESETS.navigation.topP,
        topK: MODULE_PRESETS.navigation.topK,
        maxOutputTokens: MODULE_PRESETS.navigation.maxOutputTokens,
      },
    },
    compression: {
      provider: "openrouter",
      model: "openrouter/auto",
      apiKey: apiKey,
      config: {
        baseURL: "https://openrouter.ai/api/v1",
        temperature: MODULE_PRESETS.compression.temperature,
        topP: MODULE_PRESETS.compression.topP,
        topK: MODULE_PRESETS.compression.topK,
        maxOutputTokens: MODULE_PRESETS.compression.maxOutputTokens,
      },
    },
  };

  // Create browser agent with navigation-specific LLM
  const agents = [new BrowserAgent(["navigation"])];

  // Create ChatAgent with module-specific LLM configurations
  chatAgent = new ChatAgent({
    llms,
    agents,
    planLlms: ["planning"],
    compressLlms: ["compression"],
  });

  chatAgent.initMessages().catch((e) => {
    printLog("init messages error: " + e, "error");
  });

  console.log("Browseless.ai initialized with OpenRouter auto-routing:", {
    model: "openrouter/auto",
    modules: ["planning", "navigation", "compression"],
  });

  return chatAgent;
}

// Handle chat request
async function handleChat(requestId: string, data: any): Promise<void> {
  const messageId = data.messageId;

  if (!chatAgent) {
    chrome.runtime.sendMessage({
      requestId,
      type: "chat_result",
      data: { messageId, error: "ChatAgent not initialized" },
    });
    return;
  }

  const user = data.user as (MessageTextPart | MessageFilePart)[];
  const abortController = new AbortController();
  abortControllers.set(messageId, abortController);

  try {
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
  } catch (error) {
    chrome.runtime.sendMessage({
      requestId,
      type: "chat_result",
      data: { messageId, error: String(error) },
    });
  }
}

// Handle human callback request
async function handleHumanCallback(
  requestId: string,
  data: any
): Promise<void> {
  const callbackId = data.callbackId as string;
  const value = data.value as any;
  const callback = humanCallbackIdMap.get(callbackId);
  if (callback) {
    callback(value);
  }
  chrome.runtime.sendMessage({
    requestId,
    type: "human_callback_result",
    data: { callbackId, success: callback != null },
  });
}

// Handle upload file request
async function handleUploadFile(requestId: string, data: any): Promise<void> {
  if (!chatAgent) {
    chrome.runtime.sendMessage({
      requestId,
      type: "uploadFile_result",
      data: { error: "ChatAgent not initialized" },
    });
    return;
  }

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
}

// Handle stop request
async function handleStop(requestId: string, data: any): Promise<void> {
  const abortController = abortControllers.get(data.messageId);
  if (abortController) {
    abortController.abort("User aborted");
    abortControllers.delete(data.messageId);
  }
}

// Handle get tabs request
async function handleGetTabs(requestId: string, data: any): Promise<void> {
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
          favicon: tab.favIconUrl,
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

// Event routing mapping
const eventHandlers: Record<
  string,
  (requestId: string, data: any) => Promise<void>
> = {
  chat: handleChat,
  human_callback: handleHumanCallback,
  uploadFile: handleUploadFile,
  stop: handleStop,
  getTabs: handleGetTabs,
};

// Message listener
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  const requestId = request.requestId;
  const type = request.type;
  const data = request.data;

  if (!chatAgent) {
    await init();
  }

  const handler = eventHandlers[type];
  if (handler) {
    handler(requestId, data).catch((error) => {
      printLog(`Error handling ${type}: ${error}`, "error");
    });
  }
});

function printLog(message: string, level?: "info" | "success" | "error") {
  chrome.runtime.sendMessage({
    type: "log",
    data: {
      level: level || "info",
      message: message + "",
    },
  });
}

if ((chrome as any).sidePanel) {
  // open panel on action click
  (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
