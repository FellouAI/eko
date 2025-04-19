import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Extract Page Content
 */
export declare class ExtractContent implements Tool<any, string> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * Extract Page Content
     *
     * @param {*} params {}
     * @returns > string
     */
    execute(context: ExecutionContext, params: any): Promise<string>;
}
