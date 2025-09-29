import { StreamCallbackMessage } from '../types/index.js';

/**
 * Message store and derived views (infrastructure for zero-intrusion design)
 *
 * Goals:
 * - Append raw messages (JSONL) as the single source of truth
 * - Incrementally update structured derived views (planning/tree/timeline/nodes/snapshots)
 *   for direct UI and replay consumption
 * - Default to in-memory implementation; callers can extend MessageStore for persistence
 */

// ========== Derived view types (minimal set) ==========

export type RunId = string;
export type NodeId = string;

export interface PlanningRecord {
  runId: RunId;
  steps: Array<{ timestamp: number; message?: string; data?: unknown }>;
  finalPlan?: unknown;
  planRequest?: unknown;
}

export interface AgentTreeDocument {
  runId: RunId;
  createdAt: number;
  root: unknown; // Preserve agentTree from core as-is
}

export interface TimelineItem {
  timestamp: number;
  type: string;
  summary?: string;
  data?: unknown;
}

export interface SpanRecord {
  spanId?: string;
  type: string; // e.g. 'llm' | 'tool' | 'system'
  name?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  data?: unknown;
}

export interface NodeExecutionRecord {
  runId: RunId;
  nodeId: NodeId;
  attempts: number;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  llmUsage?: {
    modelName?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  spans: SpanRecord[];
}

export interface ContextSnapshot {
  snapshotVersion: 1;
  runId: RunId;
  nodeId: NodeId;
  createdAt: number;
  // Keep only serializable data required for replay
  context: {
    taskId: string;
    workflow?: unknown;
    variables: Record<string, unknown>;
    conversation: string[];
    flags?: Record<string, unknown>;
  };
  agentScope?: {
    variables: Record<string, unknown>;
  };
  redaction?: {
    applied: boolean;
    rules: string[];
  };
}

// ========== Store interface ==========

export interface MessageStore {
  appendRawMessage(runId: RunId, message: StreamCallbackMessage): Promise<void>;
  upsertPlanning(runId: RunId, updater: (prev?: PlanningRecord) => PlanningRecord): Promise<void>;
  saveAgentTree(runId: RunId, doc: AgentTreeDocument): Promise<void>;
  upsertNodeRecord(runId: RunId, nodeId: NodeId, updater: (prev?: NodeExecutionRecord) => NodeExecutionRecord): Promise<void>;
  appendTimelineItem(runId: RunId, item: TimelineItem): Promise<void>;
  saveSnapshot(runId: RunId, nodeId: NodeId, snapshot: ContextSnapshot): Promise<void>;

  // Read interfaces (for UI/replay)
  readPlanning(runId: RunId): Promise<PlanningRecord | undefined>;
  readAgentTree(runId: RunId): Promise<AgentTreeDocument | undefined>;
  readNode(runId: RunId, nodeId: NodeId): Promise<NodeExecutionRecord | undefined>;
  listNodes(runId: RunId): Promise<NodeId[]>;
  readTimeline(runId: RunId): Promise<TimelineItem[]>;
  readLatestSnapshot(runId: RunId, nodeId: NodeId): Promise<ContextSnapshot | undefined>;
}

// ========== In-memory implementation ==========

export class InMemoryMessageStore implements MessageStore {
  private raw: Map<RunId, StreamCallbackMessage[]> = new Map();
  private planning: Map<RunId, PlanningRecord> = new Map();
  private tree: Map<RunId, AgentTreeDocument> = new Map();
  private nodes: Map<RunId, Map<NodeId, NodeExecutionRecord>> = new Map();
  private timeline: Map<RunId, TimelineItem[]> = new Map();
  private snapshots: Map<RunId, Map<NodeId, ContextSnapshot[]>> = new Map();

  async appendRawMessage(runId: RunId, message: StreamCallbackMessage): Promise<void> {
    const list = this.raw.get(runId) ?? [];
    list.push(message);
    this.raw.set(runId, list);
  }

  async upsertPlanning(runId: RunId, updater: (prev?: PlanningRecord) => PlanningRecord): Promise<void> {
    const next = updater(this.planning.get(runId));
    this.planning.set(runId, next);
  }

  async saveAgentTree(runId: RunId, doc: AgentTreeDocument): Promise<void> {
    this.tree.set(runId, doc);
  }

  async upsertNodeRecord(runId: RunId, nodeId: NodeId, updater: (prev?: NodeExecutionRecord) => NodeExecutionRecord): Promise<void> {
    const runMap = this.nodes.get(runId) ?? new Map<NodeId, NodeExecutionRecord>();
    const next = updater(runMap.get(nodeId));
    runMap.set(nodeId, next);
    this.nodes.set(runId, runMap);
  }

  async appendTimelineItem(runId: RunId, item: TimelineItem): Promise<void> {
    const list = this.timeline.get(runId) ?? [];
    list.push(item);
    this.timeline.set(runId, list);
  }

  async saveSnapshot(runId: RunId, nodeId: NodeId, snapshot: ContextSnapshot): Promise<void> {
    const byNode = this.snapshots.get(runId) ?? new Map<NodeId, ContextSnapshot[]>();
    const list = byNode.get(nodeId) ?? [];
    list.push(snapshot);
    byNode.set(nodeId, list);
    this.snapshots.set(runId, byNode);
  }

  async readPlanning(runId: RunId): Promise<PlanningRecord | undefined> {
    return this.planning.get(runId);
  }
  async readAgentTree(runId: RunId): Promise<AgentTreeDocument | undefined> {
    return this.tree.get(runId);
  }
  async readNode(runId: RunId, nodeId: NodeId): Promise<NodeExecutionRecord | undefined> {
    return this.nodes.get(runId)?.get(nodeId);
  }
  async listNodes(runId: RunId): Promise<NodeId[]> {
    return Array.from(this.nodes.get(runId)?.keys() ?? []);
  }
  async readTimeline(runId: RunId): Promise<TimelineItem[]> {
    return (this.timeline.get(runId) ?? []).slice();
  }
  async readLatestSnapshot(runId: RunId, nodeId: NodeId): Promise<ContextSnapshot | undefined> {
    const list = this.snapshots.get(runId)?.get(nodeId) ?? [];
    return list[list.length - 1];
  }
}

// ========== Utils: Context snapshot serialization ==========

export function serializeContextForSnapshot(agentOrTaskContext: any): ContextSnapshot['context'] {
  // Input might be AgentContext or Context; prefer its `context` field
  const ctx = agentOrTaskContext?.context ?? agentOrTaskContext;
  const variablesObj: Record<string, unknown> = {};
  if (ctx?.variables instanceof Map) {
    for (const [k, v] of ctx.variables.entries()) {
      // Keep only JSON-serializable data; skip functions/streams
      if (typeof v === 'function') continue;
      variablesObj[k] = v;
    }
  }
  const conversation = Array.isArray(ctx?.conversation) ? ctx.conversation.slice() : [];
  return {
    taskId: String(ctx?.taskId ?? ''),
    workflow: ctx?.workflow ?? undefined,
    variables: variablesObj,
    conversation,
    flags: {
      // Reserved flags that may affect execution (extensible)
      agentParallel: ctx?.variables?.get ? ctx.variables.get('agentParallel') : undefined,
    },
  };
}


