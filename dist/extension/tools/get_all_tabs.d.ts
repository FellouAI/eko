import { BrowserTab } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export declare class GetAllTabs implements Tool<any, BrowserTab[]> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: any): Promise<BrowserTab[]>;
}
