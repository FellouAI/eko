import { CancelWorkflowInput } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export declare class CancelWorkflow implements Tool<CancelWorkflowInput, void> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: CancelWorkflowInput): Promise<void>;
}
