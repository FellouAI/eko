import { BrowserUseResult, ExecutionContext, InputSchema, Tool } from "@/types";
export declare abstract class ToolReturnsScreenshot<T> implements Tool<T, BrowserUseResult> {
    abstract name: string;
    abstract description: string;
    abstract input_schema: InputSchema;
    abstract realExecute(context: ExecutionContext, params: T): Promise<any>;
    execute(context: ExecutionContext, params: T): Promise<BrowserUseResult>;
}
