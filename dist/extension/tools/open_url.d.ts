import { OpenUrlParam, OpenUrlResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Open Url
 */
export declare class OpenUrl implements Tool<OpenUrlParam, OpenUrlResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * Open Url
     *
     * @param {*} params { url: 'https://www.google.com', newWindow: true }
     * @returns > { tabId, windowId, title, success: true }
     */
    execute(context: ExecutionContext, params: OpenUrlParam): Promise<OpenUrlResult>;
}
