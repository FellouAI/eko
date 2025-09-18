import { MonitorEvent, MonitorSessionMeta, MonitorStorage } from '../types/index.js';

export class InMemoryStorage implements MonitorStorage {
  private sessions: Map<string, MonitorSessionMeta> = new Map();
  private events: Map<string, MonitorEvent[]> = new Map();

  async ensureSession(sessionId: string, init: () => MonitorSessionMeta): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, init());
    }
  }

  async appendEvent(event: MonitorEvent): Promise<void> {
    const list = this.events.get(event.sessionId) ?? [];
    list.push(event);
    this.events.set(event.sessionId, list);
  }

  async getSession(sessionId: string): Promise<MonitorSessionMeta | undefined> {
    return this.sessions.get(sessionId);
  }
}

// 导出增强存储
export * from './enhanced-storage.js';

