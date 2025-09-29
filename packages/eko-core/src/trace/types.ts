
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