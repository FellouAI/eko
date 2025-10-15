# Eko Copilot Guide

## Repository & Build
- pnpm workspace at root; run `pnpm install` once, then `pnpm -r --sequential build` or `pnpm --filter <pkg> build` per package, while `pnpm clean` removes all `node_modules/dist` artifacts.
- Core packages live in `packages/`: `eko-core` (engine), `eko-nodejs` (Playwright/FS agents), `eko-web` and `eko-extension` (browser bundles), `eko-debugger` (telemetry UI). The `example/` apps consume these local packages.
- Each package owns its Rollup + TypeScript config; do not mix targets across `tsconfig.*.json` files.
- `pnpm --filter @eko-ai/eko test` runs the lone Jest suite (`packages/eko-core/test/core/eko.test.ts`); it performs live LLM calls and currently ships with `test.only`, so set valid API keys before execution.

## Core Engine Patterns (`packages/eko-core`)
- `core/eko.ts` coordinates generate → execute: it builds a `Workflow` via `Planner`, persists per-task `Context`, then resolves dependency graphs with `buildAgentTree` during execution.
- `Context.variables` and `AgentContext.variables` are real `Map`s; mutate via `.set/.get` (e.g. `context.variables.set("agentParallel", true)`) rather than object spread, and they propagate into retry logic and callbacks.
- Agents subclass `agent/base.ts`, rely on `RetryLanguageModel` for provider failover, and emit lifecycle events through `createCallbackHelper`; use `callInnerTool` inside custom tool lambdas to inherit retry/error handling.
- Tool executors must return a `ToolResult` `content` array (text/image) and mark `supportParallelCalls` when safe; `ToolWrapper` and `McpTool` bridge MCP servers so remote tools blend into the same execution path.
- Combine debugger or user callbacks with `composeCallbacks`, and prefer `Log.setLevel(LogLevel.DEBUG)` from `common/log.ts` over raw `console.log`.

## LLM Configuration
- Always declare `llms.default`; extra entries inherit the retry order passed into `RetryLanguageModel` and use provider factories in `llm/index.ts` with per-model `config` for headers/base URLs.
- Supply `llms[name].handler` when you need to mutate `LanguageModelV2CallOptions` (token limits, metadata) at call time; handlers receive either the task or agent context set via `RetryLanguageModel.setContext`.
- `config/index.ts` enables `parallelToolCalls` globally, but per-tool concurrency only activates when the schema sets `supportParallelCalls`.
- Wire `config.a2aClient` to merge external agents; ensure custom agents expose meaningful `description` and `planDescription` so planners can rank them correctly.

## Observability & Replay
- Tracing initializes lazily in `Eko.ensureTracingInitialized`; toggling `enable_langfuse` composes `createLangfuseCallback` and routes exporter traffic using `langfuse_options` (endpoint, service metadata, sendBeacon flag).
- Transparent spans flow through `trace/transparet-exporter.ts` to the ingest service (`example/langfuse-ingest-server`); browsers prefer `navigator.sendBeacon`, while Node falls back to axios with the same payloads.
- `@eko-ai/eko-debugger`’s `TraceSystem.enable(eko)` wraps the existing callback chain and renders `debug_*` events; `example/nodejs_debug/src/index.ts` shows correlating spans by setting `context.variables.set("traceSpanId", parentSpan.id)` inside custom handlers.
- Preserve event names emitted by `createCallbackHelper` (`debug_llm_request_start`, `taskStart`, etc.) so downstream tooling (Langfuse, debugger timeline) remains compatible.

## Platform Packages & Examples
- `@eko-ai/eko-nodejs` exports `BrowserAgent`, `FileAgent`, and `SimpleStdioMcpClient`; `BrowserAgent` extends `BaseBrowserLabelsAgent` and drives Playwright—configure headless mode, CDP endpoints, and persistent profiles via setters before `eko.run`.
- `example/nodejs_debug` combines a custom `Agent` (`example/nodejs_debug/src/chat.ts`), `TraceSystem`, and Langfuse; it expects `OPENROUTER_API_KEY` (or other LLM credentials) plus optional `LANGFUSE_*` entries in `.env`.
- `example/web` runs a Vite dev server with tracing enabled, while `example/extension` builds a Chrome extension; use each package’s `package.json` scripts through `pnpm --filter ... run <script>`.
- When exporting new tools or agents, mirror the patterns re-exported from `packages/eko-core/src/index.ts` so consumers in `example/` and downstream packages pick them up automatically.
