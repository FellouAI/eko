import { Tool, InputSchema, ExecutionContext } from "@/types";
export declare class WriteContextTool implements Tool<any, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    execute(context: ExecutionContext, params: unknown): Promise<unknown>;
}
