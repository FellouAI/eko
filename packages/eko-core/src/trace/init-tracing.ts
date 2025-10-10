import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace, Tracer, TracerProvider, propagation } from "@opentelemetry/api";
import { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } from "@opentelemetry/core";
import { TransparentBrowserExporter } from "./transparet-exporter";

export interface InitTracingOptions {
  endpoint: string;
  serviceName?: string;
  serviceVersion?: string;
  useSendBeacon?: boolean;
  batchBytesLimit?: number;
  /** Batch processor config（可选，保持简单默认值） */
  maxQueueSize?: number;
  scheduledDelayMillis?: number;
  exportTimeoutMillis?: number;
  maxExportBatchSize?: number;
}

export interface InitTracingResult {
  provider: TracerProvider;
  shutdown: () => Promise<void>;
}

export function initTracing(options: InitTracingOptions): InitTracingResult {

  const exporter = new TransparentBrowserExporter({
    endpoint: options.endpoint,
    useSendBeacon: options.useSendBeacon,
    batchBytesLimit: options.batchBytesLimit,
  });

  const processor = new BatchSpanProcessor(exporter, {
    maxQueueSize: options.maxQueueSize ?? 2048,
    scheduledDelayMillis: options.scheduledDelayMillis ?? 5000,
    exportTimeoutMillis: options.exportTimeoutMillis ?? 30000,
    maxExportBatchSize: options.maxExportBatchSize ?? 512,
  });

  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
  

  // 全局注册 Provider 与 Propagator（仅使用 BasicTracerProvider 与核心传播器）
  trace.setGlobalTracerProvider(provider as unknown as TracerProvider);
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    })
  );

  return {
    provider,
    shutdown: () => (provider as unknown as { shutdown?: () => Promise<void> }).shutdown?.() ?? Promise.resolve(),
  };
}


