import { EventBroadcaster } from '../realtime/broadcaster.js';
import { MonitorEvent, MonitorEventType, StreamCallback } from '../types/index.js';
import { MonitorStorage } from '../storage/index.js';

export class TraceCollector {
  constructor(
    private readonly storage: MonitorStorage,
    private readonly broadcaster: EventBroadcaster
  ) {}

  interceptCallback(original?: StreamCallback): StreamCallback {
    return {
      onMessage: async (msg: any, agentCtx?: unknown) => {
        await this.collect(msg, agentCtx);
        await original?.onMessage?.(msg, agentCtx);
        this.broadcaster.broadcast(msg.taskId, {
          type: 'monitor_event',
          sessionId: msg.taskId,
          event: this.toEvent(msg, agentCtx)
        });
      }
    };
  }

  private async collect(msg: any, agentCtx?: unknown): Promise<void> {
    await this.storage.ensureSession(msg.taskId, () => ({
      id: msg.taskId,
      startTime: new Date(),
      metadata: { currentPhase: 'execute' }
    }));
    await this.storage.appendEvent(this.toEvent(msg, agentCtx));
  }

  private toEvent(msg: any, agentCtx?: unknown): MonitorEvent {
    return {
      id: `${msg.taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: msg.taskId,
      timestamp: new Date(),
      type: this.mapType(msg.type),
      category: this.mapCategory(msg.type),
      level: 'info',
      data: { ...msg, agentId: (agentCtx as any)?.agent?.Id }
    };
  }

  private mapType(t: string): MonitorEventType {
    switch (t) {
      case 'workflow': return 'workflow_plan_complete';
      case 'agent_start': return 'agent_start';
      case 'tool_use': return 'tool_call_start';
      case 'tool_result': return 'tool_call_complete';
      case 'text':
      case 'thinking': return 'llm_request_complete';
      case 'finish': return 'workflow_execute_complete';
      default: return 'agent_complete';
    }
  }

  private mapCategory(t: string): MonitorEvent['category'] {
    if (t.startsWith?.('tool')) return 'tool';
    if (t === 'text' || t === 'thinking') return 'prompt';
    if (t === 'workflow') return 'execution';
    return 'execution';
  }
}

