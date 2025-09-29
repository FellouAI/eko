# Eko Copilot Guide

## Monorepo layout & tooling
- pnpm workspace; run `pnpm install` once at root, then `pnpm -r --sequential build` or `pnpm --filter <pkg> build` for scoped bundles.
- Packages: `eko-core` (engine), `eko-nodejs`, `eko-web`, `eko-extension`, `eko-debugger`. Examples live under `example/` and consume the local packages.
- Build system is Rollup per package. TypeScript config is per package; avoid mixing `tsconfig.*.json` targets.

## Core engine architecture (`packages/eko-core`)
- `core/eko.ts` orchestrates generate → execute via `Context`, `Planner`, `Agent` tree. Workflows are `Workflow` objects with dependency-aware agent graphs.
- Agents extend `agent/base.ts`, rely on `RetryLanguageModel` for multi-provider failover, and emit structured events through `createCallbackHelper`.
- Runtime config (`config/index.ts`) provides defaults such as `agentParallel`; override per task with `context.variables.set("agentParallel", true)` instead of editing constants.
- `context` and `AgentContext` back execution state; variables are real `Map` instances, so use `set/get` rather than object mutation.

## LLM & tool conventions
- Always populate `llms.default`; additional models (e.g. plan-only) inherit retry order in `RetryLanguageModel`. Provider-specific headers/base URLs come from the `config` object in each entry.
- Tool invocations go through `ToolWrapper` + `ToolChain`; error bursts trip `agentContext.consecutiveErrorNum >= 10`. New tools should return `ToolResult` with `content` arrays, mirroring the built-ins.
- Parallel tool calls require both `config.parallelToolCalls` and tool schemas with `supportParallelCalls === true`.

## Observability & debugging
- Instrumentation uses `debug_*` event types produced by `CallbackHelper`; preserve these names so `@eko-ai/eko-debugger` can derive timelines.
- `packages/eko-debugger` wraps an existing `StreamCallback`, stores telemetry through a pluggable `MessageStore` (defaulting to in-memory), and exposes events through `TraceSystem.enable(ekoInstance)`.
- Langfuse support (`enable_langfuse`) composes another callback; it is a no-op unless `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` are resolvable from the environment.
- Browser tracing: `trace/init-tracing.ts` registers an OpenTelemetry `BasicTracerProvider` with the custom `TransparentBrowserExporter` which prefers `navigator.sendBeacon` and falls back to axios.

## Platform-specific packages
- `eko-nodejs` supplies `BrowserAgent`, `FileAgent`, and CDP helpers tuned for Node runtimes; `example/nodejs_debug` demonstrates enabling Langfuse + TraceSystem inside a Playwright-style task.
- `eko-extension` and `eko-web` expect bundling through their Rollup configs; examples under `example/extension` and `example/web` use `pnpm --filter` targets to build/start and assume a proxy for API keys.

## Developer workflows & caveats
- `pnpm -r test` delegates to each package; only `eko-core` ships a Jest suite and it currently contains `test.only` plus live LLM calls, so gate it behind real API keys before running.
- Logging is centralized via `common/log.ts`; call `Log.setLevel(LogLevel.DEBUG)` in scripts instead of sprinkling `console.log`.
- When adding new callbacks or wrappers, compose them with `composeCallbacks` to keep user-supplied and internal hooks isolated.
- Replay/TimeMachine features depend on storing sanitized context snapshots; avoid adding non-serializable data to `Context.variables`.

## External integrations
- MCP clients (`agent/a2a.ts`, MCP tools) expect cooperative cancellation via `context.controller.signal`; propagate `AbortSignal` when wiring new integrations.
- A2A agent discovery merges external agents via `mergeAgents`; provide `planDescription` and `description` so planners can rank them.
- Telemetry exporters and debugger stores assume JSON-safe payloads—if you attach custom data, strip circular references or functions first.
