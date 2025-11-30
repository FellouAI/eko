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

// Module config interface (matches options page)
interface ModuleConfig {
  enabled: boolean;
  useDefaultModel: boolean;
  llm: string;
  modelName: string;
  apiKey: string;
  options: {
    baseURL: string;
  };
  parameters: {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
  };
}

interface FullLLMConfig {
  default: {
    llm: string;
    modelName: string;
    apiKey: string;
    options: {
      baseURL: string;
    };
  };
  modules: {
    planning: ModuleConfig;
    navigation: ModuleConfig;
    compression: ModuleConfig;
  };
}

// Default module presets (fallback if not configured)
const DEFAULT_MODULE_PRESETS = {
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
  // Try to load v2 config first, fall back to v1
  const storage = await chrome.storage.sync.get(["llmConfig", "llmConfigV2"]);
  const v2Config = storage.llmConfigV2 as FullLLMConfig | undefined;
  const v1Config = storage.llmConfig;

  // Determine the default config
  const defaultConfig = v2Config?.default || v1Config;

  if (!defaultConfig || !defaultConfig.apiKey) {
    printLog(
      "Please configure apiKey, configure in the eko extension options of the browser extensions.",
      "error"
    );
    setTimeout(() => {
      chrome.runtime.openOptionsPage();
    }, 1000);
    return;
  }

  initAgentServices();

  // Build LLMs config with module-specific settings
  const llms: LLMs = {
    default: {
      provider: defaultConfig.llm as any,
      model: defaultConfig.modelName,
      apiKey: defaultConfig.apiKey,
      config: {
        baseURL: defaultConfig.options?.baseURL,
      },
    },
  };

  // Track which LLM names to use for each module
  const planLlms: string[] = [];
  const compressLlms: string[] = [];

  // Add module-specific LLM configurations if v2 config exists
  if (v2Config?.modules) {
    // Planning module
    const planningConfig = v2Config.modules.planning;
    if (planningConfig && !planningConfig.useDefaultModel) {
      llms["planning"] = {
        provider: planningConfig.llm as any,
        model: planningConfig.modelName,
        apiKey: planningConfig.apiKey || defaultConfig.apiKey,
        config: {
          baseURL: planningConfig.options?.baseURL,
          temperature: planningConfig.parameters?.temperature ?? DEFAULT_MODULE_PRESETS.planning.temperature,
          topP: planningConfig.parameters?.topP ?? DEFAULT_MODULE_PRESETS.planning.topP,
          topK: planningConfig.parameters?.topK ?? DEFAULT_MODULE_PRESETS.planning.topK,
          maxOutputTokens: planningConfig.parameters?.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.planning.maxOutputTokens,
        },
      };
      planLlms.push("planning");
    } else if (planningConfig?.parameters) {
      // Use default model but with custom parameters for planning
      llms["planning"] = {
        ...llms.default,
        config: {
          ...llms.default.config,
          temperature: planningConfig.parameters.temperature ?? DEFAULT_MODULE_PRESETS.planning.temperature,
          topP: planningConfig.parameters.topP ?? DEFAULT_MODULE_PRESETS.planning.topP,
          topK: planningConfig.parameters.topK ?? DEFAULT_MODULE_PRESETS.planning.topK,
          maxOutputTokens: planningConfig.parameters.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.planning.maxOutputTokens,
        },
      };
      planLlms.push("planning");
    }

    // Navigation module (browser agent)
    const navigationConfig = v2Config.modules.navigation;
    if (navigationConfig && !navigationConfig.useDefaultModel) {
      llms["navigation"] = {
        provider: navigationConfig.llm as any,
        model: navigationConfig.modelName,
        apiKey: navigationConfig.apiKey || defaultConfig.apiKey,
        config: {
          baseURL: navigationConfig.options?.baseURL,
          temperature: navigationConfig.parameters?.temperature ?? DEFAULT_MODULE_PRESETS.navigation.temperature,
          topP: navigationConfig.parameters?.topP ?? DEFAULT_MODULE_PRESETS.navigation.topP,
          topK: navigationConfig.parameters?.topK ?? DEFAULT_MODULE_PRESETS.navigation.topK,
          maxOutputTokens: navigationConfig.parameters?.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.navigation.maxOutputTokens,
        },
      };
    } else if (navigationConfig?.parameters) {
      // Use default model but with custom parameters for navigation
      llms["navigation"] = {
        ...llms.default,
        config: {
          ...llms.default.config,
          temperature: navigationConfig.parameters.temperature ?? DEFAULT_MODULE_PRESETS.navigation.temperature,
          topP: navigationConfig.parameters.topP ?? DEFAULT_MODULE_PRESETS.navigation.topP,
          topK: navigationConfig.parameters.topK ?? DEFAULT_MODULE_PRESETS.navigation.topK,
          maxOutputTokens: navigationConfig.parameters.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.navigation.maxOutputTokens,
        },
      };
    }

    // Compression module
    const compressionConfig = v2Config.modules.compression;
    if (compressionConfig && !compressionConfig.useDefaultModel) {
      llms["compression"] = {
        provider: compressionConfig.llm as any,
        model: compressionConfig.modelName,
        apiKey: compressionConfig.apiKey || defaultConfig.apiKey,
        config: {
          baseURL: compressionConfig.options?.baseURL,
          temperature: compressionConfig.parameters?.temperature ?? DEFAULT_MODULE_PRESETS.compression.temperature,
          topP: compressionConfig.parameters?.topP ?? DEFAULT_MODULE_PRESETS.compression.topP,
          topK: compressionConfig.parameters?.topK ?? DEFAULT_MODULE_PRESETS.compression.topK,
          maxOutputTokens: compressionConfig.parameters?.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.compression.maxOutputTokens,
        },
      };
      compressLlms.push("compression");
    } else if (compressionConfig?.parameters) {
      // Use default model but with custom parameters for compression
      llms["compression"] = {
        ...llms.default,
        config: {
          ...llms.default.config,
          temperature: compressionConfig.parameters.temperature ?? DEFAULT_MODULE_PRESETS.compression.temperature,
          topP: compressionConfig.parameters.topP ?? DEFAULT_MODULE_PRESETS.compression.topP,
          topK: compressionConfig.parameters.topK ?? DEFAULT_MODULE_PRESETS.compression.topK,
          maxOutputTokens: compressionConfig.parameters.maxOutputTokens ?? DEFAULT_MODULE_PRESETS.compression.maxOutputTokens,
        },
      };
      compressLlms.push("compression");
    }
  }

  // Create browser agent with navigation-specific LLM if configured
  const browserAgentLlms = llms["navigation"] ? ["navigation"] : undefined;
  const agents = [new BrowserAgent(browserAgentLlms)];

  // Create ChatAgent with module-specific LLM configurations
  chatAgent = new ChatAgent({
    llms,
    agents,
    planLlms: planLlms.length > 0 ? planLlms : undefined,
    compressLlms: compressLlms.length > 0 ? compressLlms : undefined,
  });

  chatAgent.initMessages().catch((e) => {
    printLog("init messages error: " + e, "error");
  });

  console.log("Eko initialized with LLM configs:", {
    default: llms.default.model,
    planning: llms["planning"]?.model || "using default",
    navigation: llms["navigation"]?.model || "using default",
    compression: llms["compression"]?.model || "using default",
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
