import { NoopBroadcaster, WsBroadcaster } from '../realtime/broadcaster.js';
import { InMemoryStorage } from '../storage/index.js';
import { EnhancedInMemoryStorage, EnhancedMonitorStorage } from '../storage/enhanced-storage.js';
import { StreamCallback, TraceSystemOptions, EventBroadcaster, MonitorStorage } from '../types/index.js';
import { TraceCollector } from './collector.js';

export class TraceSystem {
  private readonly storage: EnhancedMonitorStorage;
  private readonly broadcaster: EventBroadcaster;
  private readonly collector: TraceCollector;
  private started = false;

  constructor(private readonly options: TraceSystemOptions = {}) {
    this.storage = new EnhancedInMemoryStorage();
    this.broadcaster = typeof options.realtime === 'object'
      ? new WsBroadcaster({ port: options.realtime.port })
      : new NoopBroadcaster();
    this.collector = new TraceCollector(this.storage, this.broadcaster, {
      prettyPrint: this.options.prettyPrint !== false,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.options.enabled === false) return;
    await this.broadcaster.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.broadcaster.stop();
    this.started = false;
  }

  enable<T extends object>(ekoInstance: T): T;
  enable<T extends { config?: { callback?: StreamCallback } }>(ekoInstance: T): T;
  enable<T extends object>(ekoInstance: T): T {
    if (this.options.enabled === false) return ekoInstance;
    const original = (ekoInstance as any).config?.callback;
    const wrapped: StreamCallback = this.collector.interceptCallback(original);
    if (!(ekoInstance as any).config) (ekoInstance as any).config = {};
    // merge existing callback methods (including possible HumanCallback methods)
    (ekoInstance as any).config.callback = {
      ...(original as any),
      ...wrapped
    } as StreamCallback;
    return ekoInstance;
  }

  async getSession(sessionId: string) {
    return await this.storage.getSession(sessionId);
  }

  async getEvents(sessionId: string, options?: any) {
    return await this.storage.getEvents(sessionId, options);
  }

  async searchSessions(query: any) {
    return await this.storage.searchSessions(query);
  }

  async getAggregateStats(sessionIds: string[]) {
    return await this.storage.getAggregateStats(sessionIds);
  }
}

