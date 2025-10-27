type GlobalConfig = {
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
  /** @deprecated please use mode set to expert */
  expertMode: boolean;
  expertModeTodoLoopNum: number;
}

const config: GlobalConfig = {
  name: "Eko",
  mode: "normal",
  platform: "mac",
  maxReactNum: 500,
  maxTokens: 16000,
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
  expertMode: false,
  expertModeTodoLoopNum: 10,
};

export default config;