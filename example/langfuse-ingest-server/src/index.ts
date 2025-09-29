import "dotenv/config";

/// <reference types="node" />

import express from "express";
import type { Request, Response } from "express";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseAPIClient, LANGFUSE_SDK_VERSION } from "@langfuse/core";

import { toReadableSpan } from "./converter.js";
import type { TransportSpan, IngestResult } from "./types.js";
import { MediaService } from "./media-service.js";

const PORT = Number.parseInt(process.env.PORT ?? "3418", 10);
const BODY_LIMIT = process.env.BODY_LIMIT ?? "1mb";
const FORCE_FLUSH_QUERY_KEY = "flush";

const defaultEnvironment =
  process.env.LANGFUSE_TRACING_ENVIRONMENT ??
  process.env.LANGFUSE_DEFAULT_ENVIRONMENT;
const defaultRelease = process.env.LANGFUSE_RELEASE;

const masked = (value?: string): string => {
  if (!value) return "<unset>";
  if (value.length <= 4) return "<hidden>";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
};

const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS ?? "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

console.log(
  `[langfuse-ingest-server] Langfuse target baseUrl=${
    process.env.LANGFUSE_BASE_URL ?? "<unset>"
  } environment=${defaultEnvironment ?? "<unset>"} release=${
    defaultRelease ?? "<unset>"
  } publicKey=${masked(process.env.LANGFUSE_PUBLIC_KEY)} secretKey=${masked(
    process.env.LANGFUSE_SECRET_KEY
  )} corsOrigins=${allowedOrigins.join(",")}`
);

const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;
const baseUrl = process.env.LANGFUSE_BASE_URL;

const processor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
  environment: defaultEnvironment,
  release: defaultRelease,
});

const apiClient = new LangfuseAPIClient({
  baseUrl,
  username: publicKey,
  password: secretKey,
  xLangfusePublicKey: publicKey,
  xLangfuseSdkVersion: LANGFUSE_SDK_VERSION,
  xLangfuseSdkName: "langfuse-ingest-server",
  environment: defaultEnvironment ?? "",
});

const mediaService = new MediaService({ apiClient });

const app = express();
app.use(express.json({ limit: BODY_LIMIT }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowAll = allowedOrigins.length === 0 || allowedOrigins.includes("*");
  const isExplicitlyAllowed = origin ? allowedOrigins.includes(origin) : false;
  const shouldAllow = allowAll || isExplicitlyAllowed;

  if (shouldAllow) {
    const responseOrigin = origin && shouldAllow ? origin : "*";
    res.setHeader("Access-Control-Allow-Origin", responseOrigin);

    if (responseOrigin !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }

    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "*"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      req.headers["access-control-request-method"] ?? "GET,POST,OPTIONS"
    );
    res.setHeader("Access-Control-Expose-Headers", "*");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/otel-ingest", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const spans = extractSpans(req.body);

  if (!spans) {
    console.warn(
      "[langfuse-ingest-server] Rejected payload: missing spans array",
      {
        contentType: req.get("content-type"),
        bodyType: typeof req.body,
      }
    );
    res.status(400).json({
      error: "Invalid payload: expected an array of spans or { spans: [] }",
    });
    return;
  }

  console.log(
    `[langfuse-ingest-server] Received ${spans.length} span(s) from ${
      req.ip
    }`
  );

  const result = await processSpans(spans);

  const shouldForceFlush =
    (req.query[FORCE_FLUSH_QUERY_KEY] ?? "false") === "true" ||
    process.env.LANGFUSE_FORCE_FLUSH === "true";

  if (shouldForceFlush) {
    console.log("[langfuse-ingest-server] Force flushing Langfuse processor");
    await mediaService.flush();
    await processor.forceFlush();
  }

  console.log(
    `[langfuse-ingest-server] Processed spans (accepted=${result.accepted}, rejected=${result.rejected}, forceFlush=${shouldForceFlush}) in ${
      Date.now() - startedAt
    }ms`
  );

  res.status(result.rejected > 0 ? 207 : 202).json(result);
});

app.post("/flush", async (_req: Request, res: Response) => {
  console.log("[langfuse-ingest-server] Manual flush requested");
  await mediaService.flush();
  await processor.forceFlush();
  res.status(202).json({ status: "flushed" });
});

const server = app.listen(PORT, () => {
  console.log(
    `[langfuse-ingest-server] Listening on port ${PORT}. Body limit: ${BODY_LIMIT}`
  );
});

async function processSpans(spans: TransportSpan[]): Promise<IngestResult> {
  const errors: IngestResult["errors"] = [];
  let accepted = 0;

  for (const [index, span] of spans.entries()) {
    try {
      const readableSpan = toReadableSpan(span, {
        defaultEnvironment,
        defaultRelease,
      });

      await mediaService.process(readableSpan);
      processor.onEnd(readableSpan);
      accepted += 1;
    } catch (error) {
      console.error(
        "[langfuse-ingest-server] Failed to process span",
        {
          index,
          traceId: span.traceId,
          spanId: span.spanId,
        },
        error
      );
      errors.push({
        index,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    accepted,
    rejected: errors.length,
    errors,
  };
}

function extractSpans(payload: unknown): TransportSpan[] | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return payload as TransportSpan[];
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "spans" in payload &&
    Array.isArray((payload as { spans: unknown }).spans)
  ) {
    return (payload as { spans: TransportSpan[] }).spans;
  }

  return null;
}

type NodeSignal = "SIGINT" | "SIGTERM";

async function gracefulShutdown(signal: NodeSignal) {
  console.log(`[langfuse-ingest-server] Received ${signal}, shutting down...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  try {
    await mediaService.flush();
    await processor.forceFlush();
    await processor.shutdown();
    console.log("[langfuse-ingest-server] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[langfuse-ingest-server] Error during shutdown", error);
    process.exit(1);
  }
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

process.on("uncaughtException", (error: unknown) => {
  console.error("[langfuse-ingest-server] Uncaught exception", error);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[langfuse-ingest-server] Unhandled rejection", reason);
});
