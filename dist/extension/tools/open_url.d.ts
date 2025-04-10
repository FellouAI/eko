import { OpenUrlParam, OpenUrlResult } from '../../types/tools.types';
import { InputSchema, ExecutionContext } from '../../types/action.types';
import { ToolReturnsScreenshot } from './tool_returns_screenshot';
/**
 * Open Url
 */
export declare class OpenUrl extends ToolReturnsScreenshot<OpenUrlParam> {
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
    realExecute(context: ExecutionContext, params: OpenUrlParam): Promise<OpenUrlResult>;
}
