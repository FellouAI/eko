import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';
export declare class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: SummaryWorkflowInput): Promise<any>;
}
