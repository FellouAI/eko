/**
 * 全局配置类型定义
 *
 * 定义了 Eko 系统运行时的所有全局配置参数，这些配置影响整个系统的行为和性能。
 * 配置分为多个类别：基础信息、性能限制、功能开关、专家模式等。
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
 * Eko 系统全局配置实例
 *
 * 这是 Eko 系统的默认配置，定义了系统的运行参数和行为特征。
 * 这些配置值经过优化，在性能和功能之间取得了良好的平衡。
 *
 * 性能配置：
 * - maxReactNum: 500 - 允许代理进行深入推理
 * - maxTokens: 16000 - 支持较长的上下文和响应
 * - maxRetryNum: 3 - 平衡可靠性和响应速度
 *
 * 功能配置：
 * - agentParallel: false - 默认串行执行，更稳定可控
 * - compressThreshold: 80 - 合理的消息压缩阈值
 * - toolResultMultimodal: true - 支持丰富的工具输出格式
 *
 * 专家配置：
 * - expertMode: false - 默认关闭，需要时手动启用
 * - expertModeTodoLoopNum: 10 - 专家模式的迭代深度
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
  expertMode: false,           // 是否启用专家模式
  expertModeTodoLoopNum: 10,   // 专家模式待办循环次数
};

export default config;