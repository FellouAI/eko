/**
 * Global configuration type definitions
 *
 * Defines all runtime-wide configuration parameters for the Eko system. These
 * parameters influence overall system behavior and performance.
 * Categories include: basic info, performance limits, feature flags, and expert mode.
 */
type GlobalConfig = {
  name: string; // product name
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
  expertMode: boolean;
  expertModeTodoLoopNum: number;
}


/**
 * Global configuration instance for the Eko system
 *
 * This is the default configuration defining runtime parameters and behavioral
 * characteristics. Values are tuned to balance performance and functionality.
 *
 * Performance:
 * - maxReactNum: 500 - allow deep agent reasoning
 * - maxTokens: 16000 - support long context and responses
 * - maxRetryNum: 3 - balance reliability and latency
 *
 * Features:
 * - agentParallel: false - serial by default for stability and control
 * - compressThreshold: 80 - reasonable message compression threshold
 * - toolResultMultimodal: true - support rich tool output formats
 *
 * Expert mode:
 * - expertMode: false - disabled by default, enable when needed
 * - expertModeTodoLoopNum: 10 - iteration depth in expert mode
 */
const config: GlobalConfig = {
  name: "Eko",
  platform: "mac",
  maxReactNum: 500,
  maxTokens: 16000,
  maxRetryNum: 3,
  agentParallel: false,
  compressThreshold: 80,
  compressTokensThreshold: 100000,
  largeTextLength: 5000,
  fileTextMaxLength: 20000,
  maxDialogueImgFileNum: 1,
  toolResultMultimodal: true,
  parallelToolCalls: true,
  expertMode: false,           // Whether to enable expert mode
  expertModeTodoLoopNum: 10,   // Todo loop interval in expert mode
};

export default config;