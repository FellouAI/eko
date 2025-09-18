export type MonitorEventType =
  // 任务级别事件
  | 'task_start' | 'task_finished'
  // 规划阶段事件
  | 'plan_start' | 'plan_process' | 'plan_finished'
  // 工作流执行事件
  | 'workflow_start' | 'workflow_finished'
  // 代理级别事件
  | 'agent_start' | 'agent_process' | 'agent_finished'
  // 代理节点级别事件
  | 'agent_node_start' | 'agent_node_finished'
  // LLM交互事件
  | 'llm_request_start' | 'llm_response_start' | 'llm_response_process' | 'llm_response_finished'
  // 工具调用事件
  | 'tool_call_start' | 'tool_call_process' | 'tool_call_finished'
  // 兼容旧事件类型
  | 'workflow_plan_start' | 'workflow_plan_complete'
  | 'workflow_execute_start' | 'workflow_execute_complete'
  | 'agent_complete' | 'agent_error'
  | 'prompt_build' | 'llm_request_complete'
  | 'tool_call_complete' | 'tool_call_error';

export interface MonitorEvent<T = unknown> {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: MonitorEventType;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  category?: 'execution' | 'prompt' | 'tool' | 'performance' | 'system';
  data: T;
}

export interface MonitorSessionSnapshotIndex {
  id: string;
  ts: Date;
  nodeIds: string[];
  contextRef: string;
}

export interface MonitorSessionMeta {
  id: string;
  workflow?: unknown;
  resources?: Record<string, unknown>;
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
  snapshots?: MonitorSessionSnapshotIndex[];
}

export type WsEvent =
  | { type: 'session_update'; sessionId: string; data: { status?: string; resources?: unknown; currentPhase?: string } }
  | { type: 'monitor_event'; sessionId: string; event: MonitorEvent };

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

export interface CallbackMessageBase {
  taskId: string;
  type: string;
  ts: number;
  payload: Record<string, unknown>;
}

// Realtime
export interface EventBroadcaster {
  broadcast(sessionId: string, event: WsEvent): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface WsOptions {
  port: number;
}

// Storage
export interface MonitorStorage {
  ensureSession(sessionId: string, init: () => MonitorSessionMeta): Promise<void>;
  appendEvent(event: MonitorEvent): Promise<void>;
  getSession(sessionId: string): Promise<MonitorSessionMeta | undefined>;
}

// System
export type TraceSystemOptions = {
  enabled?: boolean;
  realtime?: { port: number } | false;
  storage?: { type: 'memory' } | false;
  // 是否在控制台进行结构化打印（默认：true）
  prettyPrint?: boolean;
};

