import type { Attributes, SpanContext, HrTime } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

export interface TransportSpanContext {
  traceId: string;
  spanId: string;
  traceFlags?: number | string;
  traceState?: string | null;
  isRemote?: boolean;
}

export interface TransportEvent {
  name: string;
  time: HrTime;
  attributes?: Attributes;
  droppedAttributesCount?: number;
}

export interface TransportLink {
  context: TransportSpanContext;
  attributes?: Attributes;
  droppedAttributesCount?: number;
}

export interface TransportResource {
  attributes?: Attributes;
  schemaUrl?: string;
}

export interface TransportInstrumentationScope {
  name: string;
  version?: string;
  schemaUrl?: string;
}

export interface TransportSpan {
  traceId: string;
  spanId: string;
  traceFlags?: number | string;
  traceState?: string | null;
  spanContext?: TransportSpanContext;
  parentSpanId?: string;
  parentSpanContext?: TransportSpanContext;
  name: string;
  kind: number;
  startTime: HrTime;
  endTime: HrTime;
  duration: HrTime;
  status: ReadableSpan["status"];
  attributes: Attributes;
  links?: TransportLink[];
  events?: TransportEvent[];
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
  ended?: boolean;
  resource?: TransportResource;
  instrumentationScope: TransportInstrumentationScope;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; message: string }>;
}

export type TransportPayload = TransportSpan[] | { spans: TransportSpan[] };

export interface ResolvedSpanContext extends SpanContext {
  traceState?: SpanContext["traceState"];
}
