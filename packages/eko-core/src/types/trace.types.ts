import { AgentContext } from "../core/context";
import { StreamCallbackMessage } from "./core.types";
// Define a serializable type to make sure 
// Every LangfuseSpan could be serialized into JSON 
// and can be transparently transferred to our Tracing backend.

export type SerializableLangfuseSpan = {
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    attributes: Record<string, any>;
    events: Record<string, any>[];
    links: Record<string, any>[];
    status: string;
    traceId: string;
    spanId: string;
    parentSpanId: string;
    kind: string;
    references: Record<string, any>[];
}

export type DebugEventType =
    // Task-level events
    | 'debug_task_start'
    | 'debug_task_finished'
    // Planning events
    | 'debug_plan_start'
    | 'debug_plan_process'
    | 'debug_plan_finished'
    // Workflow execution events
    | 'debug_workflow_start'
    | 'debug_workflow_finished'
    // Agent-level events
    | 'debug_agent_start'
    | 'debug_agent_process'
    | 'debug_agent_finished'
    // LLM interaction events
    | 'debug_llm_request_start'
    | 'debug_llm_response_start'
    | 'debug_llm_response_process'
    | 'debug_llm_response_finished'
    // Tool-call events
    | 'debug_tool_call_start'
    | 'debug_tool_call_process'
    | 'debug_tool_call_finished'

export type DebugEventHandler = {
    /** whether to bypass default handling logic */
    bypassDefault?: boolean;
    /** handle logic for debug_event */
    handle: (
        message: StreamCallbackMessage,
        agentContext?: AgentContext,
        spanContext?: LangfuseSpanContext
    ) => Promise<void>;
}

export type LangfuseSpanContext = {
    /** Resolve parent span id using current execution context */
    getParentSpanId: (nodeIdOverride?: string) => string | undefined;
    /** Resolve parent span instance */
    getParentSpan: (nodeIdOverride?: string) => any | undefined;
    /** Fetch span instance by id */
    getSpan: (spanId: string) => any | undefined;
    /** List currently tracked span ids */
    listSpanIds: () => string[];
};

export type LangfuseCallbackOptions = {
    enabled?: boolean;
    endpoint?: string; // Langfuse OTEL Ingest URL
    serviceName?: string; // 服务名，默认 eko-service
    serviceVersion?: string; // 服务版本，默认 1.0.0
    /** Whether to use navigator.sendBeacon if available (browser only) */
    useSendBeacon?: boolean;
    /** Max payload size in bytes, default 800_000 (800KB) */
    batchBytesLimit?: number;
    /** Whether to record streaming events like plan_process, default false */
    recordStreaming?: boolean;
    /** Whether to auto flush after each export, default true */
    autoFlush?: boolean;

    /** Customerized event handler */
    eventHandler?: Partial<Record<DebugEventType, DebugEventHandler>>;
};

