// 已移除 MonitorEvent/EventBroadcaster 模式，仅保留核心回调类型
// 使用相对路径导入eko-core的类型，避免循环依赖
export interface StreamCallback {
  onMessage: (msg: any, agentCtx?: unknown) => void | Promise<void>;
}

export interface StreamCallbackMessage {
  taskId: string;
  agentName: string;
  nodeId?: string | null;
  timestamp?: number;
  type: string;
  [key: string]: any;
}

export interface WsOptions {
  port: number;
}

// System
export type TraceSystemOptions = {
  enabled?: boolean;
  // 是否在控制台进行结构化打印（默认：true）
  prettyPrint?: boolean;
};

