import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { SpanContext } from "@opentelemetry/api";
import axios from "axios";

interface TransparentBrowserExporterOptions {
  endpoint: string; // 你的后端 /otel-ingest
  batchBytesLimit?: number; // 可选：最大 payload
  useSendBeacon?: boolean; // 默认 true
}

export class TransparentBrowserExporter implements SpanExporter {
  private endpoint: string;
  private batchBytesLimit: number;
  private useSendBeacon: boolean;

  constructor(opts: TransparentBrowserExporterOptions) {
    this.endpoint = opts.endpoint;
    this.batchBytesLimit = opts.batchBytesLimit ?? 800_000;
    this.useSendBeacon = opts.useSendBeacon ?? true;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    try {
      const payload = spans.map((s) => this.toTransportSpan(s));
      const json = JSON.stringify(payload);
      if (this.getByteLength(json) > this.batchBytesLimit) {
        console.warn("[TransparentExporter] Payload too large, dropping batch");
        resultCallback({ code: ExportResultCode.FAILED });
        return;
      }

      // 优先 sendBeacon（浏览器环境）
      if (
        this.useSendBeacon &&
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const ok = navigator.sendBeacon(
          this.endpoint,
          new Blob([json], { type: "application/json" })
        );
        if (ok) {
          resultCallback({ code: ExportResultCode.SUCCESS });
          return;
        }
      }

      // fallback axios（兼容 Node 与浏览器）
      axios
        .post(this.endpoint, json, {
          headers: { "Content-Type": "application/json" },
          // axios 在浏览器下会使用 XHR/fetch 适配器，Node 使用 http 适配器
          // sendBeacon 已覆盖页面卸载时的可靠上报场景
        })
        .then(() => {
          resultCallback({ code: ExportResultCode.SUCCESS });
        })
        .catch((e) => {
          console.error("[TransparentExporter] export failed", e);
          resultCallback({ code: ExportResultCode.FAILED });
        });
    } catch (e) {
      console.error("[TransparentExporter] unexpected error", e);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private toTransportSpan(span: ReadableSpan) {
    const spanContext = span.spanContext();
    const parentSpanContext = span.parentSpanContext;

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
      traceState: spanContext.traceState?.serialize(),
      spanContext: this.serializeSpanContext(spanContext),
      parentSpanId: parentSpanContext?.spanId,
      parentSpanContext: parentSpanContext
        ? this.serializeSpanContext(parentSpanContext)
        : undefined,
      name: span.name,
      kind: span.kind,
      startTime: span.startTime,
      endTime: span.endTime,
      duration: span.duration,
      status: span.status,
      attributes: span.attributes,
      links: span.links.map((link) => ({
        context: this.serializeSpanContext(link.context),
        attributes: link.attributes,
        droppedAttributesCount: link.droppedAttributesCount,
      })),
      events: span.events.map((event) => ({
        name: event.name,
        time: event.time,
        attributes: event.attributes,
        droppedAttributesCount: event.droppedAttributesCount,
      })),
      droppedAttributesCount: span.droppedAttributesCount,
      droppedEventsCount: span.droppedEventsCount,
      droppedLinksCount: span.droppedLinksCount,
      ended: span.ended,
      resource: {
        attributes: span.resource?.attributes ?? {},
        schemaUrl: span.resource?.schemaUrl,
      },
      instrumentationScope: {
        name: span.instrumentationScope.name,
        version: span.instrumentationScope.version,
        schemaUrl: span.instrumentationScope.schemaUrl,
      },
    };
  }

  private serializeSpanContext(context: SpanContext) {
    return {
      traceId: context.traceId,
      spanId: context.spanId,
      traceFlags: context.traceFlags,
      traceState: context.traceState?.serialize(),
    };
  }

  private getByteLength(payload: string): number {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(payload).length;
    }

    const maybeBuffer = (globalThis as any)?.Buffer;
    if (maybeBuffer?.byteLength) {
      return maybeBuffer.byteLength(payload);
    }

    return payload.length;
  }
}
