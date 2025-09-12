import WebSocket, { WebSocketServer } from 'ws';
import { WsEvent, EventBroadcaster, WsOptions } from '../types/index.js';

export class WsBroadcaster implements EventBroadcaster {
  private wss?: WebSocketServer;
  private readonly subscribers: Map<string, Set<WebSocket>> = new Map();

  constructor(private readonly options: WsOptions) {}

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.options.port });
    this.wss.on('connection', (socket: WebSocket) => {
      socket.on('message', (buf: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(buf.toString());
          if (msg?.type === 'subscribe' && typeof msg.sessionId === 'string') {
            const set = this.subscribers.get(msg.sessionId) ?? new Set<WebSocket>();
            set.add(socket);
            this.subscribers.set(msg.sessionId, set);
          }
        } catch {}
      });
      socket.on('close', () => {
        for (const set of this.subscribers.values()) {
          set.delete(socket);
        }
      });
    });
  }

  async stop(): Promise<void> {
    const wss = this.wss;
    if (!wss) return;
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    this.wss = undefined;
    this.subscribers.clear();
  }

  broadcast(sessionId: string, event: WsEvent): void {
    const set = this.subscribers.get(sessionId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

export class NoopBroadcaster implements EventBroadcaster {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  broadcast(sessionId: string, event: WsEvent): void {}
}

