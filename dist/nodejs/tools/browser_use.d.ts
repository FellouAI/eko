import { BrowserUseParam, BrowserUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Browser Use => `npx playwright install`
 */
export declare class BrowserUse implements Tool<BrowserUseParam, BrowserUseResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    private browser;
    private browser_context;
    private current_page;
    constructor();
    /**
     * browser
     *
     * @param {*} params { action: 'input_text', index: 1, text: 'string' }
     * @returns > { success: true, image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' }, text?: string }
     */
    execute(context: ExecutionContext, params: BrowserUseParam): Promise<BrowserUseResult>;
    private open_url;
    private injectScript;
    private get_highlight_element;
    private extractHtmlContent;
    private get_dropdown_options;
    private select_dropdown_option;
    destroy(context: ExecutionContext): void;
}
