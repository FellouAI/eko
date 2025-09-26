import { StreamCallback, StreamCallbackMessage } from '../types/index.js';
import { MessageStore, serializeContextForSnapshot } from '../storage/message-store.js';

/**
 * TraceRecorder
 *
 * Responsibilities:
 * - Intercept eko-core StreamCallbackMessage
 * - Persist raw messages (JSONL or memory)
 * - Incrementally update derived views (planning/tree/timeline/nodes)
 * - Capture snapshots from global Context (for TimeMachine)
 * - Optional structured console pretty-printing
 */
export class TraceRecorder {
  constructor(
    private readonly store: MessageStore,
    private readonly options: {
      prettyPrint?: boolean;
      snapshotPolicy?: 'on_agent_start' | 'always' | 'off';
    } = { prettyPrint: true, snapshotPolicy: 'on_agent_start' }
  ) {}

  private llmReqCache = new Map<string, any>();

  private normalizeType(t: string): { base: string; isDebug: boolean } {
    if (!t) return { base: t, isDebug: false };
    return t.startsWith('debug_') ? { base: t.slice(6), isDebug: true } : { base: t, isDebug: false };
  }

  private llmKey(msg: StreamCallbackMessage): string {
    return `${msg.taskId}:${msg.agentName}:${msg.nodeId || ''}`;
  }

  interceptCallback(original?: StreamCallback): StreamCallback {
    const merged: any = { ...(original as any) };
    merged.onMessage = async (msg: StreamCallbackMessage, agentCtx?: unknown) => {
      await this.handle(msg, agentCtx);
      if (this.options.prettyPrint !== false) {
        this.prettyPrint(msg);
      }
      await original?.onMessage?.(msg, agentCtx);
    };
    return merged as StreamCallback;
  }

  private async handle(msg: StreamCallbackMessage, agentCtx?: unknown): Promise<void> {
    const ts = msg.timestamp || Date.now();
    const { base } = this.normalizeType(msg.type);

    // 1) Raw message
    await this.store.appendRawMessage(msg.taskId, { ...msg, timestamp: ts });

    // 2) Derived views
    await this.updateDerivedViews(msg.taskId, base, ts, msg);

    // 3) Snapshot
    await this.maybeSnapshot(msg.taskId, base, ts, msg, agentCtx);
  }

  private async updateDerivedViews(runId: string, baseType: string, ts: number, msg: StreamCallbackMessage): Promise<void> {
    // Planning
    if (baseType === 'plan_start') {
      await this.store.upsertPlanning(runId, (prev) => ({
        runId,
        steps: [
          ...(prev?.steps ?? []),
          { timestamp: ts, data: { taskPrompt: (msg as any).taskPrompt, plannerPrompt: (msg as any).plannerPrompt } },
        ],
        finalPlan: prev?.finalPlan,
        planRequest: prev?.planRequest,
      }));
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'plan_start', data: { ...msg } });
    } else if (baseType === 'plan_process') {
      await this.store.upsertPlanning(runId, (prev) => ({
        runId,
        steps: [ ...(prev?.steps ?? []), { timestamp: ts, data: { partialWorkflow: (msg as any).partialWorkflow, thinkingText: (msg as any).thinkingText } } ],
        finalPlan: prev?.finalPlan,
        planRequest: prev?.planRequest,
      }));
    } else if (baseType === 'plan_finished') {
      await this.store.upsertPlanning(runId, (prev) => ({
        runId,
        steps: prev?.steps ?? [],
        finalPlan: (msg as any).workflow,
        planRequest: { request: (msg as any).planRequest, result: (msg as any).planResult },
      }));
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'plan_finished', data: { ...msg } });
    }

    // Agent Tree
    if (baseType === 'workflow_start') {
      await this.store.saveAgentTree(runId, {
        runId,
        createdAt: ts,
        root: (msg as any).agentTree,
      });
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'workflow_start', data: { ...msg } });
    }
    if (baseType === 'workflow_finished') {
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'workflow_finished', data: { ...msg } });
    }

    // Node execution (prefer agent_node_*, compatible with agent_*)
    if (baseType === 'agent_node_start' || baseType === 'agent_start') {
      const nodeId = (msg as any).agentNode?.id || msg.nodeId || '';
      if (nodeId) {
        await this.store.upsertNodeRecord(runId, nodeId, (prev) => ({
          runId,
          nodeId,
          attempts: (prev?.attempts ?? 0) + 1,
          startedAt: ts,
          spans: prev?.spans ?? [],
          input: (msg as any).task || prev?.input,
        }));
        await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'agent_node_start', data: { ...msg } });
      }
    }
    if (baseType === 'agent_node_finished' || baseType === 'agent_finished') {
      const nodeId = (msg as any).agentNode?.id || msg.nodeId || '';
      const stats = (msg as any).executionStats;
      if (nodeId) {
        await this.store.upsertNodeRecord(runId, nodeId, (prev) => ({
          runId,
          nodeId,
          attempts: prev?.attempts ?? 1,
          startedAt: prev?.startedAt ?? ts,
          finishedAt: ts,
          durationMs: stats?.duration ?? (prev?.startedAt ? ts - prev.startedAt : undefined),
          output: (msg as any).result ?? prev?.output,
          error: (msg as any).error ?? prev?.error,
          spans: prev?.spans ?? [],
          llmUsage: prev?.llmUsage,
        }));
      }
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'agent_node_finished', data: { ...msg } });
    }

    // LLM spans & usage
    if (baseType === 'llm_request_start') {
      this.llmReqCache.set(this.llmKey(msg), (msg as any).request);
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'llm_request_start', data: { ...msg } });
    }
    if (baseType === 'llm_response_finished') {
      const nodeId = msg.nodeId || '';
      const usage = (msg as any).usage;
      if (nodeId) {
        await this.store.upsertNodeRecord(runId, nodeId, (prev) => ({
          runId,
          nodeId,
          attempts: prev?.attempts ?? 1,
          startedAt: prev?.startedAt ?? ts,
          finishedAt: prev?.finishedAt,
          durationMs: prev?.durationMs,
          input: prev?.input,
          output: prev?.output,
          error: prev?.error,
          spans: prev?.spans ?? [],
          llmUsage: {
            modelName: (msg as any).modelName,
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            totalTokens: usage?.totalTokens,
          },
        }));
      }
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: 'llm_response_finished', data: { ...msg } });
      this.llmReqCache.delete(this.llmKey(msg));
    }

    // Tools timeline
    if (baseType === 'tool_call_start' || baseType === 'tool_call_process' || baseType === 'tool_call_finished') {
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: baseType, data: { ...msg } });
    }

    // legacy
    if (msg.type === 'workflow' || msg.type === 'text' || msg.type === 'thinking' || msg.type === 'finish') {
      await this.store.appendTimelineItem(runId, { timestamp: ts, type: msg.type, data: { ...msg } });
    }
  }

  private async maybeSnapshot(runId: string, baseType: string, ts: number, msg: StreamCallbackMessage, agentCtx?: unknown): Promise<void> {
    const policy = this.options.snapshotPolicy ?? 'on_agent_start';
    if (policy === 'off') return;
    const should = policy === 'always' || baseType === 'agent_node_start' || baseType === 'agent_start';
    if (!should) return;

    const nodeId = (msg as any).agentNode?.id || msg.nodeId;
    if (!nodeId) return;

    const source = (msg as any).context ?? agentCtx;
    if (!source) return;

    const snapshot = {
      snapshotVersion: 1 as const,
      runId,
      nodeId,
      createdAt: ts,
      context: serializeContextForSnapshot(source),
      agentScope: (() => {
        const ac = (source as any)?.variables ? source : (source as any)?.agent ? source : undefined;
        if (ac && (ac as any).variables instanceof Map) {
          const obj: Record<string, unknown> = {};
          for (const [k, v] of (ac as any).variables.entries()) {
            if (typeof v === 'function') continue;
            obj[k] = v;
          }
          return { variables: obj };
        }
        return undefined;
      })(),
      redaction: { applied: false, rules: [] },
    };
    await this.store.saveSnapshot(runId, nodeId, snapshot);
  }

    // ============== Structured console pretty-printing (legacy style) ==============
  private prettyPrint(msg: StreamCallbackMessage) {
    const ts = new Date(msg.timestamp || Date.now()).toISOString();
    const { base: type, isDebug } = this.normalizeType(msg.type);
    if (!isDebug && msg.type !== 'error') return;
    const safeStr = (v: any, len: number = 160) => {
      try {
        const text = typeof v === 'string' ? v : JSON.stringify(v);
        return text.length > len ? text.slice(0, len) + '...' : text;
      } catch {
        return String(v);
      }
    };
    const sep = '='.repeat(60);
    const pipe = (...parts: Array<string | number | boolean | undefined | null>) =>
      parts.filter((p) => p !== undefined && p !== null && p !== '').map((p) => String(p)).join(' | ');
    const logBlock = (...lines: Array<string | undefined>) => {
      console.log('\n' + sep);
      lines.forEach((l) => { if (l) console.log(l); });
      console.log(sep);
    };

    switch (type) {
      case 'agent_node_start': {
        const agentNode = (msg as any).agentNode;
        const task = (msg as any).task;
        logBlock(
          pipe('🧩 agent_node_start', ts, msg.agentName, `nodeId=${msg.nodeId || ''}`),
          agentNode?.id ? pipe('node', agentNode.id) : undefined,
          task ? pipe('task', safeStr(task, 180)) : undefined,
        );
        break;
      }
      case 'agent_node_finished': {
        const { agentNode, result, error, executionStats } = msg as any;
        const ok = !error;
        logBlock(
          pipe(ok ? '✅ agent_node_finished' : '❌ agent_node_finished', ts, msg.agentName, `nodeId=${agentNode?.id || msg.nodeId || ''}`, `duration=${executionStats?.duration || 0}ms`, `tools=${executionStats?.toolCallCount || 0}`),
          ok && typeof result === 'string' ? pipe('result', safeStr(result, 200)) : undefined,
          !ok ? pipe('error', safeStr(error, 200)) : undefined,
        );
        break;
      }
      case 'task_start': {
        const taskPrompt = (msg as any).taskPrompt;
        logBlock(
          pipe('🎯 task_start', ts, `taskId=${msg.taskId}`),
          taskPrompt ? pipe('prompt', safeStr(taskPrompt, 200)) : undefined,
        );
        break;
      }
      case 'task_finished': {
        const { success, result, error, stopReason } = msg as any;
        logBlock(
          pipe('🏁 task_finished', ts, `taskId=${msg.taskId}`, `success=${!!success}`, `reason=${stopReason || 'done'}`),
          success && typeof result === 'string' ? pipe('result', safeStr(result, 200)) : undefined,
          !success && error ? pipe('error', safeStr(error, 200)) : undefined,
        );
        break;
      }
      case 'plan_start': {
        const plannerPrompt = (msg as any).plannerPrompt;
        const availableAgents = (msg as any).availableAgents || [];
        logBlock(
          pipe('📝 plan_start', ts, `agents=${availableAgents.length}`),
          plannerPrompt?.userPrompt ? pipe('user', safeStr(plannerPrompt.userPrompt, 180)) : undefined,
        );
        break;
      }
      case 'plan_process': {
        const done = (msg as any).streamDone;
        if (done) {
          const wf = (msg as any).partialWorkflow;
          logBlock(pipe('✅ plan_process complete', ts, `agents=${wf?.agents?.length || 0}`));
        }
        break;
      }
      case 'plan_finished': {
        const wf = (msg as any).workflow;
        const lines: Array<string | undefined> = [];
        lines.push(pipe('✅ plan_finished', ts, `name=${wf?.name || ''}`, `agents=${wf?.agents?.length || 0}`));
        const agents = Array.isArray(wf?.agents) ? wf.agents : [];
        for (let i = 0; i < agents.length; i++) {
          const a = agents[i] || {};
          const depends = Array.isArray(a.dependsOn) ? a.dependsOn.join(',') : '';
          const nodes = Array.isArray(a.nodes) ? a.nodes : [];
          lines.push(
            pipe('agent', `#${i + 1}`, `id=${a.id || ''}`, `name=${a.name || ''}`, `nodes=${nodes.length}`, depends ? `dependsOn=[${depends}]` : undefined, a.status ? `status=${a.status}` : undefined, a.parallel ? `parallel=${!!a.parallel}` : undefined)
          );
        }
        logBlock(...lines);
        break;
      }
      case 'workflow_start': {
        logBlock(pipe('🚀 workflow_start', ts));
        break;
      }
      case 'workflow_finished': {
        const final = (msg as any).finalResult;
        logBlock(pipe('🏁 workflow_finished', ts), pipe('result', safeStr(final, 200)));
        break;
      }
      case 'agent_start': {
        const agentNode = (msg as any).agentNode;
        const requirements = (msg as any).requirements;
        logBlock(
          pipe('🤖 agent_start', ts, msg.agentName, `nodeId=${msg.nodeId || ''}`),
          agentNode?.task ? pipe('task', safeStr(agentNode.task, 180)) : undefined,
          requirements ? pipe('req', safeStr(requirements, 180)) : undefined,
        );
        break;
      }
      case 'agent_process': {
        const { loopNum, maxReactNum } = msg as any;
        logBlock(pipe('📍 agent_process', ts, msg.agentName, `loop=${loopNum}/${maxReactNum}`));
        break;
      }
      case 'agent_finished': {
        const { result, error, executionStats } = msg as any;
        const ok = !error;
        logBlock(
          pipe(ok ? '✅ agent_finished' : '❌ agent_finished', ts, msg.agentName, `duration=${executionStats?.duration || 0}ms`, `tools=${executionStats?.toolCallCount || 0}`),
          ok && typeof result === 'string' ? pipe('result', safeStr(result, 200)) : undefined,
          !ok ? pipe('error', safeStr(error, 200)) : undefined,
        );
        break;
      }
      case 'llm_request_start': {
        const ctx = (msg as any).context || {};
        const request = (msg as any).request || {};
        this.llmReqCache.set(this.llmKey(msg), request);
        const pick = (o: any, keys: string[]) => keys.reduce((a, k) => (o && o[k] !== undefined ? (a[k] = o[k], a) : a), {} as any);
        const reqPreview = pick(request, ['maxTokens','temperature','toolChoice']);
        const toolsCount = Array.isArray(request.tools) ? request.tools.length : 0;
        logBlock(
          pipe('🧠 llm_request_start', ts, msg.agentName, `messages=${ctx.messageCount}`, `tools=${ctx.toolCount}`, `hasSystem=${!!ctx.hasSystemPrompt}`),
          pipe('request', JSON.stringify({ ...reqPreview, toolsCount })),
        );
        break;
      }
      case 'llm_response_start': {
        const req = this.llmReqCache.get(this.llmKey(msg));
        logBlock(
          pipe('🧠 llm_response_start', ts, msg.agentName),
          req && Array.isArray(req.messages) ? pipe('messages', JSON.stringify(req.messages)) : undefined,
        );
        break;
      }
      case 'llm_response_process': {
        break;
      }
      case 'llm_response_finished': {
        const usage = (msg as any).usage;
        const response = (msg as any).response;
        let text = '';
        if (Array.isArray(response)) {
          text = response.filter((p: any) => p && p.type === 'text').map((p: any) => p.text).join('');
        }
        const req = this.llmReqCache.get(this.llmKey(msg));
        logBlock(
          pipe('🏁 llm_response_finished', ts, msg.agentName, `tokens=${usage?.totalTokens || 0}`),
          req && Array.isArray(req.messages) ? pipe('messages', JSON.stringify(req.messages)) : undefined,
          text ? pipe('response', text) : undefined,
        );
        this.llmReqCache.delete(this.llmKey(msg));
        break;
      }
      case 'tool_call_start': {
        const { toolName, params } = msg as any;
        logBlock(
          pipe('🔧 tool_call_start', ts, `${msg.agentName}.${toolName}`),
          params ? pipe('params', safeStr(params, 180)) : undefined,
        );
        break;
      }
      case 'tool_call_process': {
        const text = (msg as any).text;
        if (text) logBlock(pipe('🔧 tool_call_process', ts, 'streaming'), pipe('text', safeStr(text, 160)));
        break;
      }
      case 'tool_call_finished': {
        const { toolName, toolResult, duration } = msg as any;
        logBlock(
          pipe('🔧 tool_call_finished', ts, `${msg.agentName}.${toolName}`, `duration=${duration}ms`),
          toolResult ? pipe('result', safeStr(toolResult, 180)) : undefined,
        );
        break;
      }
      case 'error': {
        const err = (msg as any).error;
        logBlock(pipe('❌ error', ts), pipe('detail', safeStr(err, 200)));
        break;
      }
      default: {
        logBlock(pipe('📎 event', ts, type, msg.agentName || ''));
        break;
      }
    }
  }
}


