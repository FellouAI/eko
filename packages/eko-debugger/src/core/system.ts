import { StreamCallback, TraceSystemOptions } from '../types/index.js';
import { TraceRecorder } from './recorder.js';
import { FileMessageStore, InMemoryMessageStore, MessageStore } from '../storage/message-store.js';

export class TraceSystem {
  private readonly store: MessageStore;
  private readonly recorder: TraceRecorder;
  private started = false;

  constructor(private readonly options: TraceSystemOptions = {}) {

    // 简化：默认文件落盘，若显式关闭则用内存
    this.store = new FileMessageStore();
    this.recorder = new TraceRecorder(this.store, {
      prettyPrint: this.options.prettyPrint !== false,
      snapshotPolicy: 'on_agent_start',
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.options.enabled === false) return;
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
  }

  enable<T extends object>(ekoInstance: T): T;
  enable<T extends { config?: { callback?: StreamCallback } }>(ekoInstance: T): T;
  enable<T extends object>(ekoInstance: T): T {
    if (this.options.enabled === false) return ekoInstance;
    const original = (ekoInstance as any).config?.callback;
    const wrapped: StreamCallback = this.recorder.interceptCallback(original);
    if (!(ekoInstance as any).config) (ekoInstance as any).config = {};
    // merge existing callback methods (including possible HumanCallback methods)
    (ekoInstance as any).config.callback = {
      ...(original as any),
      ...wrapped
    } as StreamCallback;
    // 暴露给重放（最小实现：通过 global 注入运行时依赖）
    (global as any).__eko_llms = (ekoInstance as any).config?.llms;
    (global as any).__eko_agents = (ekoInstance as any).config?.agents;
    (global as any).__eko_callback = (ekoInstance as any).config?.callback;
    return ekoInstance;
  }

  // 兼容导出：提供简单查询以支持示例脚本输出
  async getEvents(sessionId: string) {
    return await this.store.readTimeline(sessionId);
  }
}

