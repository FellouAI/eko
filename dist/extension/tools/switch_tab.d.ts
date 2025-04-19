import { ExecutionContext, InputSchema, SwitchTabParam, TabManagementResult, Tool } from '@/types';
export declare class SwitchTab implements Tool<SwitchTabParam, TabManagementResult> {
    description: string;
    input_schema: InputSchema;
    name: string;
    constructor();
    execute(context: ExecutionContext, params: SwitchTabParam): Promise<TabManagementResult>;
}
