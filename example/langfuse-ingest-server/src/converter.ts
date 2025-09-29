import type { Attributes } from "@opentelemetry/api";
import { TraceFlags } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { LangfuseOtelSpanAttributes } from "@langfuse/core";

import type {
  ResolvedSpanContext,
  TransportSpan,
  TransportSpanContext,
  TransportLink,
  TransportEvent,
} from "./types.js";

export interface ConversionOptions {
  defaultEnvironment?: string;
  defaultRelease?: string;
}

export function toReadableSpan(
  transport: TransportSpan,
  options: ConversionOptions
): ReadableSpan {
  const spanContext = resolveSpanContext(
    transport.spanContext ?? {
      traceId: transport.traceId,
      spanId: transport.spanId,
      traceFlags: transport.traceFlags,
      traceState: transport.traceState,
    }
  );

  const parentSpanContext = transport.parentSpanContext
    ? resolveSpanContext(transport.parentSpanContext)
    : undefined;

  const attributes: Attributes = {
    ...transport.attributes,
  };

  if (options.defaultEnvironment) {
    attributes[LangfuseOtelSpanAttributes.ENVIRONMENT] ??=
      options.defaultEnvironment;
  }

  if (options.defaultRelease) {
    attributes[LangfuseOtelSpanAttributes.RELEASE] ??=
      options.defaultRelease;
  }

  const readableSpan: ReadableSpan = {
    name: transport.name,
    kind: transport.kind,
    spanContext: () => spanContext,
    parentSpanContext,
    startTime: transport.startTime,
    endTime: transport.endTime,
    duration: transport.duration,
    status: transport.status,
    attributes,
    links: (transport.links ?? []).map((link: TransportLink) => ({
      context: resolveSpanContext(link.context),
      attributes: link.attributes,
      droppedAttributesCount: link.droppedAttributesCount ?? 0,
    })),
    events: (transport.events ?? []).map((event: TransportEvent) => ({
      name: event.name,
      time: event.time,
      attributes: event.attributes,
      droppedAttributesCount: event.droppedAttributesCount ?? 0,
    })),
    resource: resourceFromAttributes(transport.resource?.attributes ?? {}, {
      schemaUrl: transport.resource?.schemaUrl,
    }),
    instrumentationScope: {
      name: transport.instrumentationScope.name,
      version: transport.instrumentationScope.version,
      schemaUrl: transport.instrumentationScope.schemaUrl,
    },
    droppedAttributesCount: transport.droppedAttributesCount ?? 0,
    droppedEventsCount: transport.droppedEventsCount ?? 0,
    droppedLinksCount: transport.droppedLinksCount ?? 0,
    ended: transport.ended ?? true,
  };

  return readableSpan;
}

export function resolveSpanContext(
  context: TransportSpanContext
): ResolvedSpanContext {
  const traceFlags = normalizeTraceFlags(context.traceFlags);
  const traceState = context.traceState
    ? new TraceState(context.traceState)
    : undefined;

  const resolved: ResolvedSpanContext = {
    traceId: context.traceId,
    spanId: context.spanId,
    traceFlags,
    isRemote: context.isRemote ?? false,
    traceState,
  };

  return resolved;
}

function normalizeTraceFlags(value: TransportSpanContext["traceFlags"]): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const parsedHex = Number.parseInt(value, 16);
    if (!Number.isNaN(parsedHex)) {
      return parsedHex;
    }
  }

  return TraceFlags.NONE;
}
