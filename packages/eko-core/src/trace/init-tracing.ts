import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace, Tracer, TracerProvider, propagation, context as otelContext, Context } from "@opentelemetry/api";
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

// 实用方法：在当前活动上下文中绑定一个函数，便于跨异步边界调用时保留上下文
export function bindWithCurrentContext<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  const active = otelContext.active();
  return (...args: TArgs) => otelContext.with(active, () => fn(...args));
}

// 实用方法：在活动上下文中启动一个 Span，自动 end；适配异步函数
export async function startActiveSpan<T>(
  tracer: Tracer,
  name: string,
  run: (span: import("@opentelemetry/api").Span) => Promise<T> | T
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await run(span);
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        span.end();
      }
    });
  });
}

// 实用方法：注入与提取上下文，便于跨进程/跨请求传递
export function injectHeaders(carrier: Record<string, string>): void {
  propagation.inject(otelContext.active(), carrier);
}

export function extractContext(carrier: Record<string, string>): Context {
  return propagation.extract(otelContext.active(), carrier);
}


