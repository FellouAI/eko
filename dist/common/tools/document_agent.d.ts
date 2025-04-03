import { Tool, InputSchema, ExecutionContext, DocumentAgentToolInput, DocumentAgentToolOutput } from '@/types';
export declare class DocumentAgentTool implements Tool<DocumentAgentToolInput, DocumentAgentToolOutput> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: DocumentAgentToolInput): Promise<DocumentAgentToolOutput>;
}
