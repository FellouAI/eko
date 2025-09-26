// Removed MonitorEvent/EventBroadcaster; keep only core callback types
// Import types from eko-core via relative path to avoid circular deps
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
  // Whether to pretty print to console (default: true)
  prettyPrint?: boolean;
};

