import { NoopBroadcaster, WsBroadcaster } from '../realtime/broadcaster.js';
import { InMemoryStorage } from '../storage/index.js';
import { StreamCallback, TraceSystemOptions, EventBroadcaster, MonitorStorage } from '../types/index.js';
import { TraceCollector } from './collector.js';

export class TraceSystem {
  private readonly storage: MonitorStorage;
  private readonly broadcaster: EventBroadcaster;
  private readonly collector: TraceCollector;
  private started = false;

  constructor(private readonly options: TraceSystemOptions = {}) {
    this.storage = new InMemoryStorage();
    this.broadcaster = typeof options.realtime === 'object'
      ? new WsBroadcaster({ port: options.realtime.port })
      : new NoopBroadcaster();
    this.collector = new TraceCollector(this.storage, this.broadcaster);
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

  enable<T extends { config?: { callback?: StreamCallback } }>(ekoInstance: T): T {
    if (this.options.enabled === false) return ekoInstance;
    const original = ekoInstance.config?.callback;
    const wrapped: StreamCallback = this.collector.interceptCallback(original);
    if (!ekoInstance.config) (ekoInstance as any).config = {};
    (ekoInstance.config as any).callback = wrapped as StreamCallback;
    return ekoInstance;
  }
}

