import { Config } from "../types";

const config: Config = {
  name: "Eko",
  mode: "normal",
  platform: "mac",
  maxReactNum: 500,
  maxOutputTokens: 16000,
  maxRetryNum: 3,
  agentParallel: false,
  compressThreshold: 80,
  compressTokensThreshold: 80000,
  largeTextLength: 8000,
  fileTextMaxLength: 20000,
  maxDialogueImgFileNum: 1,
  toolResultMultimodal: true,
  parallelToolCalls: true,
  markImageMode: "draw",
  expertModeTodoLoopNum: 10,
  memoryConfig: {
    maxMessageNum: 15,
    maxInputTokens: 64000,
    enableCompression: true,
    compressionThreshold: 10,
    compressionMaxLength: 6000,
  },
  fallbackConfig: {
    loopThreshold: 3, // Same action repeated 3 times = loop detected
    stuckThreshold: 5, // 5 consecutive failures triggers fallback mode
    historySize: 20, // Track last 20 actions for loop detection
    recoveryActions: 3, // 3 successful actions exits fallback mode
    enableAutoFallback: true, // Enable automatic fallback to coordinate-based clicks
  },
};

export default config;