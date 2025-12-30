import { Config } from "../types";

const config: Config = {
  name: "Eko",
  mode: "normal",
  platform: "mac",
  maxReactNum: 500,
  maxOutputTokens: 16000,
  maxRetryNum: 3,
  agentParallel: false,
  workflowConfirm: false,
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
};

export default config;