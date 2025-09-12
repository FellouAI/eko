# @eko-ai/eko-debugger

最小可用的 Eko 可观测/调试子系统：装饰回调收集事件、可选 WebSocket 实时推送、内存存储。

## 使用

```ts
import { Eko } from '@eko-ai/eko';
import { TraceSystem } from '@eko-ai/eko-debugger';

const trace = new TraceSystem({ enabled: true, realtime: { port: 8080 } });
await trace.start();

const eko = new Eko(config);
trace.enable(eko);

const result = await eko.run('分析这个文档');
```

## 事件
- 统一封装为 MonitorEvent，经由 WS 推送 `{ type: 'monitor_event', sessionId, event }`

## 存储
- 默认内存存储，可扩展 Postgres 等实现
