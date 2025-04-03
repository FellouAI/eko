import { BrowserUseParam, BrowserUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Browser Use for general
 */
export declare class BrowserUse implements Tool<BrowserUseParam, BrowserUseResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * browser
     *
     * @param {*} params { action: 'input_text', index: 1, text: 'string' }
     * @returns > { success: true, image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' }, text?: string }
     */
    execute(context: ExecutionContext, params: BrowserUseParam): Promise<BrowserUseResult>;
    destroy(context: ExecutionContext): void;
}
