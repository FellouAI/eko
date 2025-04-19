import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export declare class RequestLogin implements Tool<any, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: any): Promise<any>;
    awaitLogin(chromeProxy: any, tabId: number, task_id: string): Promise<boolean>;
    isLoginIn(context: ExecutionContext): Promise<boolean>;
}
