# Langfuse Transparent Span Ingest Server

A lightweight Node.js API that accepts the transparent span payload emitted by the Eko `TransparentBrowserExporter`, restores each entry into an OpenTelemetry `ReadableSpan`, and forwards everything to Langfuse via the official `LangfuseSpanProcessor`.

## Features

- Minimal Express API (`POST /otel-ingest`) that accepts either an array of spans or `{ spans: [...] }`.
- Converts each transport object back into a `ReadableSpan`, preserving links, events, attributes, trace state, and resource metadata.
- Streams spans into `LangfuseSpanProcessor`, so the same masking/media upload logic applies as inside Langfuse SDKs.
- Optional `?flush=true` query flag or dedicated `POST /flush` endpoint to force delivery (useful in tests).
- Graceful shutdown hooks that flush outstanding batches on `SIGINT`/`SIGTERM`.

## Getting started

```bash
cd example/langfuse-ingest-server
pnpm install
cp .env.example .env
# Fill in LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (or provide your own exporter URL)
pnpm run dev
```

The server listens on `http://localhost:3418` by default.

### Environment variables

| Key | Description |
| --- | --- |
| `PORT` | HTTP port (default `3418`). |
| `BODY_LIMIT` | Maximum request body accepted by Express; align with exporter limit (default `1mb`). |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse credentials used by `LangfuseSpanProcessor`. |
| `LANGFUSE_BASE_URL` | Custom Langfuse base URL (defaults to cloud). |
| `LANGFUSE_TRACING_ENVIRONMENT` | Fallback environment tag if spans don’t already include one. |
| `LANGFUSE_RELEASE` | Fallback release tag. |
| `LANGFUSE_FORCE_FLUSH` | When set to `true`, flushes the span processor after every ingest call (handy for tests). |

## API surface

### `POST /otel-ingest`

- **Body**: either `[{...span...}]` or `{ "spans": [{...}] }` where each span matches the structure sent by `TransparentBrowserExporter`.
- **Query**: `?flush=true` triggers an immediate flush after processing.
- **Response**: `202 Accepted` (or `207 Multi-Status` if some spans failed) with `{ accepted, rejected, errors }`.

### `POST /flush`

Forces a flush of pending batches.

### `GET /healthz`

Simple health check returning `{ "status": "ok" }`.

## Testing with curl

```bash
curl -X POST http://localhost:3418/otel-ingest \
  -H "Content-Type: application/json" \
  --data @sample-payload.json
```

## Implementation notes

- The converter uses `resourceFromAttributes` so any custom resource metadata travels downstream.
- `TraceState` strings are rehydrated into real `TraceState` objects, ensuring child spans (links, parent context) remain intact.
- When `LANGFUSE_TRACING_ENVIRONMENT` or `LANGFUSE_RELEASE` is set, the value is only applied if the incoming span has not already defined those attributes.
- `LangfuseSpanProcessor` runs in batch mode by default; use the force-flush hooks during tests or when running short-lived processes.

## Next steps / ideas

- Add authentication (e.g., shared secret) to the ingest endpoint before deploying publicly.
- Wrap the server with HTTPS/TLS if exposed to the internet.
- Persist failed spans to disk or queue for later replay.
- Add structured logging (pino/winston) and metrics.
