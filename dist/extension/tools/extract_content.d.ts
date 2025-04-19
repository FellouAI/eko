import { ExtractContentResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Extract Page Content
 */
export declare class ExtractContent implements Tool<any, ExtractContentResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * Extract Page Content
     *
     * @param {*} params {}
     * @returns > { tabId, result: { title, url, content }, success: true }
     */
    execute(context: ExecutionContext, params: any): Promise<ExtractContentResult>;
}
