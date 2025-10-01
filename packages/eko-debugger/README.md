<h1 align="center">
  <a href="https://github.com/FellouAI/eko" target="_blank">
    <img src="https://github.com/user-attachments/assets/55dbdd6c-2b08-4e5f-a841-8fea7c2a0b92" alt="eko-logo" width="200" height="200">
  </a>
  <br>
  <small>Eko Debugger — Observability, Replay, and Extensibility for Agent Workflows</small>
</h1>

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://example.com/build-status) [![Version](https://img.shields.io/github/package-json/v/FellouAI/eko?color=yellow)](https://eko.fellou.ai/docs/release/versions/)

`@eko-ai/eko-debugger` adds zero-instrumentation observability to the Eko agent framework:

- Intercepts `StreamCallback` events to capture tasks, planning steps, agent nodes, tool calls, and LLM usage in real time.
- Persists both raw events and derived views for timelines, agent trees, execution metrics, and context snapshots.
- Enables with a single `TraceSystem` call, wiring into existing callback chains without modifying business logic.

> ⚠️ Requires Eko v3.0 or later. Upgrade the core packages to emit the full set of debugging events.

## Highlights

- **Drop-in tracing**: `TraceSystem.enable(eko)` merges seamlessly with existing callbacks, including Human-in-the-loop and Langfuse integrations.
- **Rich derived views**: Built-in planning records, agent trees, timelines, node execution metrics, and token accounting make it easy to power dashboards or reports.
- **Context snapshots**: Capture `Context`/`AgentContext` state on configurable policies to support TimeMachine and offline replay.
- **Pluggable storage**: Ships with `InMemoryMessageStore`; implement `MessageStore` to stream data into SQL/NoSQL stores, S3, Kafka, or your own pipeline.
- **Structured console output**: Pretty-prints key events (toggleable) so you can spot bottlenecks and errors at a glance.

## Quickstart

### 1. Install

```bash
pnpm add @eko-ai/eko @eko-ai/eko-debugger
```

### 2. Enable the TraceSystem

```typescript
import { Eko } from "@eko-ai/eko";
import { TraceSystem } from "@eko-ai/eko-debugger";

const eko = new Eko({ llms, agents });

const tracer = new TraceSystem({
  prettyPrint: true,
  // store: new DynamoDBMessageStore(), // optional replacement for the default storage
});

tracer.enable(eko);

const result = await eko.run("Summarize the morning stand-up notes.");
console.log(result.result);

const timeline = await tracer.getEvents(result.taskId);
console.log("Timeline length", timeline.length);
```

>`TraceSystem.enable` returns the same `eko` instance with the debugger callback merged into `eko.config.callback`.

## Data Outputs

The debugger keeps **raw events** alongside **derived views** to support diverse visualizations:

| View | Description | Typical usage |
| --- | --- | --- |
| Raw Messages | Full `StreamCallbackMessage` stream | Data lakes, downstream event reconstruction |
| Planning Record | Planner prompts, steps, and final workflow | Inspect planner reasoning, render planning UIs |
| Agent Tree | Workflow topology | Build execution graphs, inspect dependencies |
| Node Execution Record | Inputs/outputs, timing, LLM usage per node | SLA tracking, failure triage, cost analysis |
| Timeline | Condensed event feed | Render chronological views or terminal output |
| Context Snapshot | Serialized `Context`/`AgentContext` | TimeMachine, node-level replay |

All data flows through the `MessageStore` interface; the default implementation is `InMemoryMessageStore`.

## Custom Storage

Implement the `MessageStore` interface to stream tracing data anywhere:

```typescript
import { MessageStore, TimelineItem } from "@eko-ai/eko-debugger";

class MyStore implements MessageStore {
  async appendRawMessage(runId, message) {
    await writeToKafka(runId, message);
  }

...existing code...

  async appendTimelineItem(runId, item: TimelineItem) {
    await db.collection("timeline").insertOne({ runId, ...item });
  }

  // Implement the remaining methods
}

const tracer = new TraceSystem({
  store: new MyStore(),
  prettyPrint: false,
});
```

> Every `MessageStore` method returns a `Promise<void>`. Apply backpressure, retries, and error handling so observability never blocks production workloads.

## Replay & TimeMachine

- Snapshots are captured on `agent_node_start` by default; configure via `snapshotPolicy: "always" | "off"`.
- Snapshots retain JSON-safe context data (variable maps, conversation history, etc.) so scripts like `replay.ts` can rehydrate node executions.
- `globalThis.__eko_llms`, `__eko_agents`, and `__eko_callback` are populated during `enable()` for browser-based or CLI replay tooling.

## CLI Example: `example/nodejs_debug`

The repository ships with a demo that enables both Langfuse and the Eko Debugger:

```bash
pnpm install
pnpm --filter @eko-ai/eko-nodejs-debug-example run build
pnpm --filter @eko-ai/eko-nodejs-debug-example run start
```

Watch the structured logs in your terminal and query the full event timeline with `TraceSystem.getEvents(sessionId)`.

## API Overview

- `new TraceSystem(options)`
  - `store`: `MessageStore` instance, defaults to `InMemoryMessageStore`
  - `prettyPrint`: toggles console pretty-printing (`true` by default)
  - `snapshotPolicy`: `"on_agent_start" | "always" | "off"`
- `TraceSystem.enable(eko)`: activates the debugger and returns the same `eko` instance.
- `TraceSystem.getEvents(sessionId)`: reads the timeline for a given session/task ID.
- `TraceRecorder`: internal helper that intercepts callbacks; exported for advanced customization.
- `serializeContextForSnapshot()`: trims context objects into replay-safe payloads.

Refer to `src/types/index.ts` for the full type surface.

## FAQ

1. **How do I disable console output?** Pass `{ prettyPrint: false }` when constructing `TraceSystem`.
2. **Will this break existing callbacks?** The debugger merges with the current `config.callback`; if you overwrite it manually, compose with the returned callback to keep tracing active.
3. **Can I filter events?** Implement selective persistence in your `MessageStore`, or filter downstream when consuming the data.

## License

This package is released under the MIT License. See the repository root [LICENSE](../../LICENSE) for details.
