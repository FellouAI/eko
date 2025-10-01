import { StreamCallback, TraceSystemOptions } from '../types/index.js';
import { TraceRecorder } from './recorder.js';
import { InMemoryMessageStore, MessageStore } from '../storage/message-store.js';

export class TraceSystem {
  private readonly store: MessageStore;
  private readonly recorder: TraceRecorder;

  constructor(private readonly options: TraceSystemOptions = {}) {
    const providedStore = options.store;
    this.store = providedStore ?? new InMemoryMessageStore();
    this.recorder = new TraceRecorder(this.store, {
      prettyPrint: this.options.prettyPrint !== false,
      snapshotPolicy: 'on_agent_start',
    });
  }


  enable<T extends object>(ekoInstance: T): T;
  enable<T extends { config?: { callback?: StreamCallback } }>(ekoInstance: T): T;
  enable<T extends object>(ekoInstance: T): T {
    const original = (ekoInstance as any).config?.callback;
    const wrapped: StreamCallback = this.recorder.interceptCallback(original);
    if (!(ekoInstance as any).config) (ekoInstance as any).config = {};
    // merge existing callback methods (including possible HumanCallback methods)
    (ekoInstance as any).config.callback = {
      ...(original as any),
      ...wrapped
    } as StreamCallback;
    // Expose to replay (minimal impl: inject runtime deps into global)
    const runtimeGlobal: any = typeof globalThis !== 'undefined'
      ? globalThis
      : (typeof global !== 'undefined' ? global : undefined);
    if (runtimeGlobal) {
      runtimeGlobal.__eko_llms = (ekoInstance as any).config?.llms;
      runtimeGlobal.__eko_agents = (ekoInstance as any).config?.agents;
      runtimeGlobal.__eko_callback = (ekoInstance as any).config?.callback;
    }
    return ekoInstance;
  }

  // Compatibility: provide simple query for example scripts
  async getEvents(sessionId: string) {
    return await this.store.readTimeline(sessionId);
  }
}

