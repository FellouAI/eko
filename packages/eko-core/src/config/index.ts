import { Config } from "../types";

const config: Config = {
  name: "Browseless",
  mode: "normal",
  platform: "mac",
  maxReactNum: 50, // Max steps per task (nanobrowser: 50 steps)
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
  markImageMode: "draw", // Use draw mode but without visible overlays
  expertModeTodoLoopNum: 10,
  displayHighlights: false, // Disable colorful overlay boxes on webpages
  naturalInteractions: true, // Enable natural cursor movements and typing
  memoryConfig: {
    maxMessageNum: 15,
    maxInputTokens: 64000,
    enableCompression: true,
    compressionThreshold: 10,
    compressionMaxLength: 6000,
  },
  fallbackConfig: {
    loopThreshold: 3, // Same action repeated 3 times = loop detected
    stuckThreshold: 20, // Max failures before giving up (nanobrowser: 20)
    historySize: 50, // Track last 50 actions for history (nanobrowser: replay history)
    recoveryActions: 3, // 3 successful actions exits fallback mode
    enableAutoFallback: true, // Enable automatic fallback to coordinate-based clicks
  },
};

export default config;