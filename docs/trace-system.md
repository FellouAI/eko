# Eko Trace System Overview

Eko shares the same engine across browser, Node.js, and hybrid runtimes. To keep the **Universal JS** dependency boundary intact, we avoid pulling any Langfuse SDK directly into the core package. Instead, we transparently transport OpenTelemetry spans to a dedicated Node.js ingest server, which then forwards them to Langfuse. This document explains the architecture, key components, and example integration for that pipeline.

## Architecture Flow

```text
┌────────────┐     ┌───────────────────────────────────────────┐
│  eko-core  │     │ TransparentBrowserExporter (browser-safe) │
│  Trace API │ ──▶ │ 1. Flatten ReadableSpan into JSON payload │
└────────────┘     │ 2. sendBeacon/axios to ingest server      │
                    └───────────────────────────────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │ langfuse-ingest-server (Node) │
                               │ 1. Restore JSON → ReadableSpan │
                               │ 2. LangfuseSpanProcessor.onEnd │
                               └────────────────────────────────┘
                                              │
                                              ▼
                                    Langfuse SaaS / self-hosted
```

- **TransparentBrowserExporter** (`packages/eko-core/src/trace/transparet-exporter.ts`)
  - Serializes span context, attributes, links, events, and resource metadata into plain JSON.
  - Prefers `navigator.sendBeacon` to ensure delivery when a page unloads; falls back to `axios.post` (XHR/fetch adapter in browsers, http adapter in Node).
  - Enforces a `batchBytesLimit` so oversized payloads are dropped early.

- **Ingest server** (`example/langfuse-ingest-server`)
  - Express `POST /otel-ingest` endpoint accepts an array of transparent spans.
  - `toReadableSpan` converts each transport object back into `@opentelemetry/sdk-trace-base` `ReadableSpan`s.
  - Each restored span is passed to `LangfuseSpanProcessor`, keeping Langfuse’s batching and masking logic intact.
  - Adds a base64 URI prefix to `langfuse.observation.input` assets so the Langfuse UI renders multimodal content correctly.

- **Langfuse integration** (`packages/eko-core/src/trace/langfuse-integration.ts`)
  - `createLangfuseCallback` listens to debugging events (`debug_*`) and builds the Langfuse observation tree.
  - Dynamically imports `@langfuse/tracing` only when `enable_langfuse=true` and the host project has the dependency installed, keeping it optional.

### Example integration in `example/web`

`example/web/src/main.ts` shows the full browser setup:

- `Eko` + `BrowserAgent` drive the login automation test.
- `langfuse_options` points the transparent exporter to `http://localhost:3418/otel-ingest`.
- `TraceSystem` (`@eko-ai/eko-debugger`) renders the agent timeline in a web UI.

```ts
let eko = new Eko({
  llms,
  agents: [new BrowserAgent()],
  enable_langfuse: true,
  langfuse_options: {
    endpoint: "http://localhost:3418/otel-ingest",
    serviceName: "eko-service",
    useSendBeacon: true,
    batchBytesLimit: 800_000,
  },
});
```

## Node side: Langfuse ingest server

`example/langfuse-ingest-server` is a ready-to-run Node.js service:

1. `TransparentBrowserExporter` bundles spans as JSON and POSTs them to `/otel-ingest`.
2. The server calls `toReadableSpan` to reconstruct each span.
3. `LangfuseSpanProcessor` batches and forwards them to Langfuse (preserving environment, release, and masking behavior).

### Quick start

```bash
cd example/langfuse-ingest-server
pnpm install
cp .env.example .env    # Fill in Langfuse credentials and optional CORS allowlist
pnpm run dev            # Defaults to http://localhost:3418
```

- `POST /otel-ingest`: accepts the transparent span array; append `?flush=true` to force immediate delivery.
- `POST /flush`: clears buffered spans for short-lived processes or tests.
- `GET /healthz`: health check endpoint.

### Run the browser demo

```bash
pnpm --filter example/web install   # Install demo dependencies
pnpm --filter example/web dev      # Launch the Vite/React app (default port 3000)
```

Open `http://localhost:3000` and the demo will execute the login test automatically. Check the browser console or Network tab for `/otel-ingest` requests, and confirm the full trace/observation tree inside the Langfuse dashboard.

## Design rationale: keep Universal JS dependencies

- Browsers cannot directly depend on Node/SSR-oriented packages like `@langfuse/otel` or `@langfuse/tracing`. Transparent transport relies only on OpenTelemetry APIs and an optional HTTP client, avoiding Node-only modules.
- `langfuse_options.enabled`, `endpoint`, and friends are optional; when disabled, neither the exporter nor the ingest server are involved.
- The same `TransparentBrowserExporter` can run in Node (axios fallback), so CLIs, tests, and browsers all share one pipeline.

## Key types and extension points

| Location | Description |
| --- | --- |
| `packages/eko-core/src/trace/types.ts` | Declares `SerializableLangfuseSpan` to guarantee JSON-safe fields. |
| `packages/eko-core/src/trace/transparet-exporter.ts` | Core exporter with sendBeacon/axios transport. |
| `example/langfuse-ingest-server/src/converter.ts` | Reconstructs `TransportSpan` → `ReadableSpan`, including TraceState. |
| `example/langfuse-ingest-server/src/index.ts` | Express entry point handling CORS, health checks, errors, and force flush. |

Extension ideas:

- Add authentication (API key or signature) to `/otel-ingest` before deploying publicly.
- Tune `BatchSpanProcessor`’s `scheduledDelayMillis`, or call `shutdown()` on page unload / test teardown to reduce flush latency.
- Enrich spans server-side before handing them off to Langfuse if extra metadata is needed.

## Troubleshooting

1. **No data in Langfuse**: Ensure the browser’s `/otel-ingest` call returns `202/207`, and check the Node logs for the `Processed spans` message.
2. **CORS errors**: Set `CORS_ALLOW_ORIGINS=http://localhost:3000` (or `*`) in `.env`.
3. **Images missing**: The ingest server automatically prefixes `type=file` content with `data:${mediaType};base64,` so screenshots render properly; if your payload isn’t base64 yet, encode it before exporting.
4. **Payload too large**: Increase the exporter’s `batchBytesLimit` and align the server’s `BODY_LIMIT`.

---

This pipeline delivers a browser-friendly tracing story: the core engine stays free of backend-specific dependencies while seamlessly integrating with Langfuse whenever needed, keeping things lightweight yet fully observable.