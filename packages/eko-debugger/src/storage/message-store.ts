import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamCallbackMessage } from '../types/index.js';

/**
 * Message store and derived views (infrastructure for zero-intrusion design)
 *
 * Goals:
 * - Append raw messages (JSONL) as the single source of truth
 * - Incrementally update structured derived views (planning/tree/timeline/nodes/snapshots)
 *   for direct UI and replay consumption
 * - Provide both in-memory and file-backed implementations for tests and persistence
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

// ========== File-backed implementation ==========

export class FileMessageStore implements MessageStore {
  constructor(private readonly rootDir: string = join(process.cwd(), 'runs')) {}

  private runDir(runId: RunId): string {
    return join(this.rootDir, runId);
  }
  private nodeDir(runId: RunId): string {
    return join(this.runDir(runId), 'nodes');
  }
  private snapshotsDir(runId: RunId): string {
    return join(this.runDir(runId), 'snapshots');
  }

  private async ensureDir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  private safeStringify(data: unknown): string {
    // const seen = new WeakSet<object>();
    // const replacer = (key: string, value: any) => {
    //   // Remove large/cyclic or irrelevant fields if needed
    //   if (key === 'context' || key === 'agent' || key === 'agentContext') {
    //     return undefined;
    //   }
    //   if (typeof value === 'function') return undefined;
    //   if (typeof value === 'object' && value !== null) {
    //     if (seen.has(value)) return '[Circular]';
    //     seen.add(value);
    //   }
    //   return value;
    // };

    // return JSON.stringify(data, replacer, 2);
    return JSON.stringify(data);
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    await this.ensureDir(dirname(file));
    await fs.writeFile(file, this.safeStringify(data), 'utf8');
  }

  // Snapshots only: data already normalized by serializeContextForSnapshot; must keep the context field
  private async writeJsonSnapshot(file: string, data: unknown): Promise<void> {
    await this.ensureDir(dirname(file));
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  }

  private async readJson<T>(file: string): Promise<T | undefined> {
    try { const buf = await fs.readFile(file, 'utf8'); return JSON.parse(buf) as T; } catch { return undefined; }
  }

  async appendRawMessage(runId: RunId, message: StreamCallbackMessage): Promise<void> {
    // File implementation no longer persists messages; keep as no-op
    return;
  }

  async upsertPlanning(runId: RunId, updater: (prev?: PlanningRecord) => PlanningRecord): Promise<void> {
    // File implementation no longer persists planning; keep as no-op
    return;
  }

  async saveAgentTree(runId: RunId, doc: AgentTreeDocument): Promise<void> {
    const file = join(this.runDir(runId), 'tree.json');
    await this.writeJson(file, doc);
  }

  async upsertNodeRecord(runId: RunId, nodeId: NodeId, updater: (prev?: NodeExecutionRecord) => NodeExecutionRecord): Promise<void> {
    const file = join(this.nodeDir(runId), `${nodeId}.json`);
    const prev = await this.readJson<NodeExecutionRecord>(file);
    const next = updater(prev);
    await this.writeJson(file, next);
  }

  async appendTimelineItem(runId: RunId, item: TimelineItem): Promise<void> {
    // File implementation no longer persists timeline; keep as no-op
    return;
  }

  async saveSnapshot(runId: RunId, nodeId: NodeId, snapshot: ContextSnapshot): Promise<void> {
    const file = join(this.snapshotsDir(runId), `${nodeId}-${snapshot.createdAt}.json`);
    // NOTE: cannot use writeJson (custom replacer would drop context field)
    await this.writeJsonSnapshot(file, snapshot);
  }

  async readPlanning(runId: RunId): Promise<PlanningRecord | undefined> {
    // File implementation does not persist planning; return undefined
    return undefined;
  }
  async readAgentTree(runId: RunId): Promise<AgentTreeDocument | undefined> {
    return this.readJson<AgentTreeDocument>(join(this.runDir(runId), 'tree.json'));
  }
  async readNode(runId: RunId, nodeId: NodeId): Promise<NodeExecutionRecord | undefined> {
    return this.readJson<NodeExecutionRecord>(join(this.nodeDir(runId), `${nodeId}.json`));
  }
  async listNodes(runId: RunId): Promise<NodeId[]> {
    try {
      const files = await fs.readdir(this.nodeDir(runId));
      return files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    } catch { return []; }
  }
  async readTimeline(runId: RunId): Promise<TimelineItem[]> {
    // File implementation does not persist timeline; return empty
    return [];
  }
  async readLatestSnapshot(runId: RunId, nodeId: NodeId): Promise<ContextSnapshot | undefined> {
    try {
      const dir = this.snapshotsDir(runId);
      const files = await fs.readdir(dir);
      const matched = files.filter(f => f.startsWith(`${nodeId}-`) && f.endsWith('.json'));
      matched.sort();
      const last = matched[matched.length - 1];
      if (!last) return undefined;
      return this.readJson<ContextSnapshot>(join(dir, last));
    } catch { return undefined; }
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


