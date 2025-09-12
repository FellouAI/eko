export type MonitorEventType =
  | 'workflow_plan_start' | 'workflow_plan_complete'
  | 'workflow_execute_start' | 'workflow_execute_complete'
  | 'agent_start' | 'agent_complete' | 'agent_error'
  | 'prompt_build' | 'llm_request_start' | 'llm_request_complete'
  | 'tool_call_start' | 'tool_call_complete' | 'tool_call_error';

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

export interface CallbackMessageBase {
  taskId: string;
  type: string;
  ts: number;
  payload: Record<string, unknown>;
}

export type StreamCallback = {
  onMessage: (msg: CallbackMessageBase, agentCtx?: unknown) => void | Promise<void>;
};

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
};

