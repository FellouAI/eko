/**
 * 全局配置类型定义
 *
 * 定义了 Eko 系统运行时的所有全局配置参数，这些配置影响整个系统的行为和性能。
 * 配置分为多个类别：基础信息、性能限制、功能开关、专家模式等。
 */
type GlobalConfig = {
  /** 产品名称 */
  name: string;

  /** 运行平台 */
  platform: "windows" | "mac" | "linux";

  /** 最大反应次数 - 限制代理的推理步骤 */
  maxReactNum: number;

  /** 最大token数 - LLM响应的最大长度限制 */
  maxTokens: number;

  /** 最大重试次数 - 网络请求失败时的重试次数 */
  maxRetryNum: number;

  /** 是否启用代理并行执行 - 影响任务执行的并发性 */
  agentParallel: boolean;

  /** 对话上下文压缩阈值 - 消息数量超过此值时触发压缩 */
  compressThreshold: number;

  /** 大文本长度阈值 - 用于判断是否需要特殊处理 */
  largeTextLength: number;

  /** 文件文本最大长度 - 文件内容读取的限制 */
  fileTextMaxLength: number;

  /** 对话中图片文件最大数量 - 限制多媒体内容的数量 */
  maxDialogueImgFileNum: number;

  /** 是否支持工具结果的多模态输出 - 影响工具返回格式 */
  toolResultMultimodal: boolean;

  /** 是否启用专家模式 - 解锁高级功能 */
  expertMode: boolean;

  /** 专家模式待办事项循环次数 - 高级推理的迭代次数 */
  expertModeTodoLoopNum: number;
};

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

  // 核心性能限制
  maxReactNum: 500,           // 代理最大推理步骤
  maxTokens: 16000,           // LLM响应最大token数
  maxRetryNum: 3,             // 网络请求最大重试次数

  // 并发和压缩配置
  agentParallel: false,        // 是否启用代理并行执行
  compressThreshold: 80,       // 对话上下文压缩阈值

  // 文件和多媒体处理
  largeTextLength: 5000,       // 大文本处理阈值
  fileTextMaxLength: 20000,    // 文件内容最大长度
  maxDialogueImgFileNum: 1,    // 对话中最大图片数量

  // 功能开关
  toolResultMultimodal: true,  // 支持多模态工具结果

  // 专家模式配置
  expertMode: false,           // 是否启用专家模式
  expertModeTodoLoopNum: 10,   // 专家模式待办循环次数
};

export default config;