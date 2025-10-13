// Core callback types for structured logging
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

// System options
export type TraceSystemOptions = {
  // Whether to pretty print to console (default: true)
  prettyPrint?: boolean;
};

