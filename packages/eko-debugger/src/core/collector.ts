import { MonitorEvent, MonitorEventType, StreamCallback, StreamCallbackMessage, EventBroadcaster, MonitorStorage } from '../types/index.js';

export class TraceCollector {
  constructor(
    private readonly storage: MonitorStorage,
    private readonly broadcaster: EventBroadcaster,
    private readonly options: { prettyPrint?: boolean } = { prettyPrint: true }
  ) {}

  private llmReqCache = new Map<string, any>();

  // 统一处理新老事件类型：将 debug_ 前缀去除得到基类类型
  private normalizeType(t: string): { base: string; isDebug: boolean } {
    if (!t) return { base: t, isDebug: false };
    return t.startsWith('debug_')
      ? { base: t.slice(6), isDebug: true }
      : { base: t, isDebug: false };
  }

  private llmKey(msg: StreamCallbackMessage): string {
    return `${msg.taskId}:${msg.agentName}:${msg.nodeId || ''}`;
  }

  interceptCallback(original?: StreamCallback): StreamCallback {
    const merged: any = { ...(original as any) };
    merged.onMessage = async (msg: StreamCallbackMessage, agentCtx?: unknown) => {
      await this.collect(msg, agentCtx);
      if (this.options.prettyPrint !== false) {
        this.prettyPrint(msg, agentCtx);
      }
      await original?.onMessage?.(msg, agentCtx);
      this.broadcaster.broadcast(msg.taskId, {
        type: 'monitor_event',
        sessionId: msg.taskId,
        event: this.toEvent(msg, agentCtx)
      });
    };
    return merged as StreamCallback;
  }

  private async collect(msg: StreamCallbackMessage, agentCtx?: unknown): Promise<void> {
    // 确定当前阶段（优先处理 debug_ 前缀的新类型）
    const { base } = this.normalizeType(msg.type);
    let currentPhase = 'unknown';
    if (base.startsWith('plan_')) currentPhase = 'planning';
    else if (base.startsWith('workflow_')) currentPhase = 'workflow';
    else if (base.startsWith('agent_')) currentPhase = 'agent';
    else if (base.startsWith('llm_')) currentPhase = 'llm';
    else if (base.startsWith('tool_')) currentPhase = 'tool';
    else if (base === 'task_start') currentPhase = 'init';
    else if (base === 'task_finished') currentPhase = 'complete';
    // 兼容旧类型
    else if (msg.type === 'workflow' && !(msg as any)?.streamDone) currentPhase = 'planning';
    else if (msg.type === 'workflow' && (msg as any)?.streamDone) currentPhase = 'execute';

    await this.storage.ensureSession(msg.taskId, () => ({
      id: msg.taskId,
      startTime: new Date(),
      metadata: { 
        currentPhase,
        taskPrompt: this.extractTaskPrompt(msg),
      },
      workflow: this.extractWorkflow(msg)
    }));
    await this.storage.appendEvent(this.toEvent(msg, agentCtx));
  }

  private toEvent(msg: StreamCallbackMessage, agentCtx?: unknown): MonitorEvent {
    const { base } = this.normalizeType(msg.type);
    return {
      id: `${msg.taskId}_${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: msg.taskId,
      timestamp: new Date(msg.timestamp || Date.now()),
      type: this.mapType(base, msg),
      category: this.mapCategory(base),
      level: this.mapLevel(base, msg),
      data: { 
        ...msg, 
        agentId: (agentCtx as any)?.agent?.Id,
        nodeId: msg.nodeId,
        agentName: msg.agentName,
      }
    };
  }

  private mapType(t: string, msg?: any): MonitorEventType {
    // 直接映射新的事件类型
    if (this.isValidMonitorEventType(t)) {
      return t as MonitorEventType;
    }
    
    // 兼容旧事件类型的映射
    switch (t) {
      case 'workflow':
        return msg?.streamDone ? 'workflow_plan_complete' : 'workflow_plan_start';
      case 'agent_result':
        return (msg as any)?.error ? 'agent_error' : 'agent_complete';
      case 'tool_use':
        return 'tool_call_start';
      case 'tool_result':
        return 'tool_call_complete';
      case 'text':
      case 'thinking':
        return 'llm_request_complete';
      case 'finish':
        return 'workflow_execute_complete';
      case 'error':
        return 'agent_error';
      default:
        return 'agent_complete';
    }
  }

  private mapCategory(t: string): MonitorEvent['category'] {
    if (t.startsWith('tool_')) return 'tool';
    if (t.startsWith('llm_') || t === 'text' || t === 'thinking') return 'prompt';
    if (t.startsWith('plan_') || t.startsWith('workflow_') || t.startsWith('agent_')) return 'execution';
    if (t.startsWith('task_')) return 'system';
    // 兼容旧类型
    if (t.startsWith('tool')) return 'tool';
    if (t === 'workflow') return 'execution';
    return 'execution';
  }

  private mapLevel(t: string, msg?: any): MonitorEvent['level'] {
    if (t === 'error' || (msg as any)?.error) return 'error';
    if (t.endsWith('_start') || t.endsWith('_process')) return 'debug';
    if (t.endsWith('_finished') || t.endsWith('_complete')) return 'info';
    if (t === 'task_start' || t === 'task_finished') return 'info';
    return 'debug';
  }

  private isValidMonitorEventType(type: string): boolean {
    const validTypes = [
      'task_start', 'task_finished',
      'plan_start', 'plan_process', 'plan_finished',
      'workflow_start', 'workflow_finished',
      'agent_start', 'agent_process', 'agent_finished',
      'agent_node_start', 'agent_node_finished',
      'llm_request_start', 'llm_response_start', 'llm_response_process', 'llm_response_finished',
      'tool_call_start', 'tool_call_process', 'tool_call_finished',
      'workflow_plan_start', 'workflow_plan_complete',
      'workflow_execute_start', 'workflow_execute_complete',
      'agent_complete', 'agent_error',
      'prompt_build', 'llm_request_complete',
      'tool_call_complete', 'tool_call_error'
    ];
    return validTypes.includes(type);
  }

  private extractTaskPrompt(msg: StreamCallbackMessage): string | undefined {
    if ((msg as any).taskPrompt) return (msg as any).taskPrompt;
    const { base } = this.normalizeType(msg.type);
    if (base === 'plan_start') return (msg as any).taskPrompt;
    if (base === 'task_start') return (msg as any).taskPrompt;
    return undefined;
  }

  private extractWorkflow(msg: StreamCallbackMessage): any {
    if ((msg as any).workflow) return (msg as any).workflow;
    const { base } = this.normalizeType(msg.type);
    if (base === 'plan_finished') return (msg as any).workflow;
    if (base === 'workflow_start') return (msg as any).workflow;
    return undefined;
  }

  // ============== Console Pretty Print ==============
  private prettyPrint(msg: StreamCallbackMessage, agentCtx?: unknown) {
    const ts = new Date(msg.timestamp || Date.now()).toISOString();
    const { base: type, isDebug } = this.normalizeType(msg.type);
    // 仅打印 debug_* 事件；为了可观测性，保留对旧版 error 的打印
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
      parts
        .filter((p) => p !== undefined && p !== null && p !== '')
        .map((p) => String(p))
        .join(' | ');
    const logBlock = (...lines: Array<string | undefined>) => {
      console.log('\n' + sep);
      lines.forEach((l) => {
        if (l) console.log(l);
      });
      console.log(sep);
    };

    switch (type) {
      // 代理节点
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
      // 任务
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

      // 规划
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
          logBlock(
            pipe('✅ plan_process complete', ts, `agents=${wf?.agents?.length || 0}`)
          );
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
            pipe(
              'agent',
              `#${i + 1}`,
              `id=${a.id || ''}`,
              `name=${a.name || ''}`,
              `nodes=${nodes.length}`,
              depends ? `dependsOn=[${depends}]` : undefined,
              a.status ? `status=${a.status}` : undefined,
              a.parallel ? `parallel=${!!a.parallel}` : undefined,
            )
          );
          for (let j = 0; j < nodes.length; j++) {
            const n = nodes[j] || {};
            const t = n.type || 'normal';
            if (t === 'normal') {
              const text = (n.text && typeof n.text === 'string') ? n.text : '';
              lines.push(
                pipe(
                  '  node',
                  `#${j + 1}`,
                  `type=normal`,
                  text ? `text=${safeStr(text, 120)}` : undefined,
                  n.input ? `input=${safeStr(n.input, 80)}` : undefined,
                  n.output ? `output=${safeStr(n.output, 80)}` : undefined,
                )
              );
            } else if (t === 'forEach') {
              const sub = Array.isArray(n.nodes) ? n.nodes.length : 0;
              lines.push(
                pipe(
                  '  node',
                  `#${j + 1}`,
                  `type=forEach`,
                  n.items ? `items=${safeStr(n.items, 80)}` : undefined,
                  `subNodes=${sub}`,
                )
              );
            } else if (t === 'watch') {
              const trg = Array.isArray(n.triggerNodes) ? n.triggerNodes.length : 0;
              lines.push(
                pipe(
                  '  node',
                  `#${j + 1}`,
                  `type=watch`,
                  n.event ? `event=${n.event}` : undefined,
                  `loop=${!!n.loop}`,
                  n.description ? `desc=${safeStr(n.description, 80)}` : undefined,
                  `triggers=${trg}`,
                )
              );
            } else {
              lines.push(pipe('  node', `#${j + 1}`, `type=${t}`));
            }
          }
        }
        logBlock(...lines);
        break;
      }

      // 工作流
      case 'workflow_start': {
        logBlock(pipe('🚀 workflow_start', ts));
        break;
      }
      case 'workflow_finished': {
        const final = (msg as any).finalResult;
        logBlock(
          pipe('🏁 workflow_finished', ts),
          pipe('result', safeStr(final, 200))
        );
        break;
      }

      // 代理
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

      // LLM
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
        // 忽略增量内容，不打印
        break;
      }
      case 'llm_response_finished': {
        const usage = (msg as any).usage;
        const response = (msg as any).response;
        let text = '';
        if (Array.isArray(response)) {
          text = response
            .filter((p: any) => p && p.type === 'text')
            .map((p: any) => p.text)
            .join('');
        }
        const req = this.llmReqCache.get(this.llmKey(msg));
        logBlock(
          pipe('🏁 llm_response_finished', ts, msg.agentName, `tokens=${usage?.totalTokens || 0}`),
          req && Array.isArray(req.messages) ? pipe('messages', JSON.stringify(req.messages)) : undefined,
          text ? pipe('response', text) : undefined,
        );
        // 清理缓存
        this.llmReqCache.delete(this.llmKey(msg));
        break;
      }

      // 工具
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

      // 兼容旧事件
      // case 'workflow': {
      //   const done = (msg as any).streamDone;
      //   if (!done) process.stdout.write('📝 planning...');
      //   else console.log(`\n✅ [${ts}] planning complete`);
      //   break;
      // }
      // case 'text': {
      //   const text = (msg as any).text;
      //   process.stdout.write(`\n📤 ${msg.agentName}: ${safeStr(text, 160)}`);
      //   break;
      // }
      // case 'thinking': {
      //   const text = (msg as any).text;
      //   process.stdout.write(`\n🧩 ${msg.agentName} thinking: ${safeStr(text, 160)}`);
      //   break;
      // }
      // case 'finish': {
      //   const usage = (msg as any).usage;
      //   console.log(`\n🏁 [${ts}] step_finished tokens=${usage?.totalTokens || 0}`);
      //   break;
      // }
      case 'error': {
        const err = (msg as any).error;
        logBlock(pipe('❌ error', ts), pipe('detail', safeStr(err, 200)));
        break;
      }
      default: {
        // 降级打印
        logBlock(pipe('📎 event', ts, type, msg.agentName || ''));
        break;
      }
    }
  }
}

