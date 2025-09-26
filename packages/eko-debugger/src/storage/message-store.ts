import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamCallbackMessage } from '../types/index.js';

/**
 * 消息存储与派生视图定义（零侵入方案的基础设施）
 *
 * 设计目标：
 * - 原始消息按 JSONL 追加写入，作为唯一事实源。
 * - 结构化派生视图（planning/tree/timeline/nodes/snapshots）增量更新，供 UI 与重放直接消费。
 * - 提供内存与文件双实现，便于测试与实际落盘使用。
 */

// ========== 衍生视图类型定义（最小必要集合） ==========

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
  root: unknown; // 直接保存来自 core 的 agentTree（保持原样）
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
  // 仅保留可序列化且对重放必要的数据
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

// ========== 存储接口 ==========

export interface MessageStore {
  appendRawMessage(runId: RunId, message: StreamCallbackMessage): Promise<void>;
  upsertPlanning(runId: RunId, updater: (prev?: PlanningRecord) => PlanningRecord): Promise<void>;
  saveAgentTree(runId: RunId, doc: AgentTreeDocument): Promise<void>;
  upsertNodeRecord(runId: RunId, nodeId: NodeId, updater: (prev?: NodeExecutionRecord) => NodeExecutionRecord): Promise<void>;
  appendTimelineItem(runId: RunId, item: TimelineItem): Promise<void>;
  saveSnapshot(runId: RunId, nodeId: NodeId, snapshot: ContextSnapshot): Promise<void>;

  // 读取接口（供 UI/重放使用）
  readPlanning(runId: RunId): Promise<PlanningRecord | undefined>;
  readAgentTree(runId: RunId): Promise<AgentTreeDocument | undefined>;
  readNode(runId: RunId, nodeId: NodeId): Promise<NodeExecutionRecord | undefined>;
  listNodes(runId: RunId): Promise<NodeId[]>;
  readTimeline(runId: RunId): Promise<TimelineItem[]>;
  readLatestSnapshot(runId: RunId, nodeId: NodeId): Promise<ContextSnapshot | undefined>;
}

// ========== 内存实现 ==========

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

// ========== 文件实现 ==========

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
    //   // 移除可能引入循环的大对象或无关的数据态
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

  // 专用于快照：快照数据已通过 serializeContextForSnapshot 规整，无需 replacer，必须保留 context 字段
  private async writeJsonSnapshot(file: string, data: unknown): Promise<void> {
    await this.ensureDir(dirname(file));
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  }

  private async readJson<T>(file: string): Promise<T | undefined> {
    try { const buf = await fs.readFile(file, 'utf8'); return JSON.parse(buf) as T; } catch { return undefined; }
  }

  async appendRawMessage(runId: RunId, message: StreamCallbackMessage): Promise<void> {
    // 文件实现不再落盘 messages；改为 no-op（仍满足接口）
    return;
  }

  async upsertPlanning(runId: RunId, updater: (prev?: PlanningRecord) => PlanningRecord): Promise<void> {
    // 文件实现不再落盘 planning；改为 no-op（仍满足接口）
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
    // 文件实现不再落盘 timeline；改为 no-op（仍满足接口）
    return;
  }

  async saveSnapshot(runId: RunId, nodeId: NodeId, snapshot: ContextSnapshot): Promise<void> {
    const file = join(this.snapshotsDir(runId), `${nodeId}-${snapshot.createdAt}.json`);
    // 注意：不能使用 writeJson（含 replacer 会移除 context 字段）
    await this.writeJsonSnapshot(file, snapshot);
  }

  async readPlanning(runId: RunId): Promise<PlanningRecord | undefined> {
    // 文件实现不再落盘 planning；返回 undefined
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
    // 文件实现不再落盘 timeline；返回空数组
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

// ========== 工具：Context 快照序列化 ==========

export function serializeContextForSnapshot(agentOrTaskContext: any): ContextSnapshot['context'] {
  // 入参可能是 AgentContext 或 Context；优先取其 context 字段
  const ctx = agentOrTaskContext?.context ?? agentOrTaskContext;
  const variablesObj: Record<string, unknown> = {};
  if (ctx?.variables instanceof Map) {
    for (const [k, v] of ctx.variables.entries()) {
      // 仅保留可 JSON 序列化的数据；函数/流等直接跳过
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
      // 预留可能影响执行的开关（按需扩展）
      agentParallel: ctx?.variables?.get ? ctx.variables.get('agentParallel') : undefined,
    },
  };
}


