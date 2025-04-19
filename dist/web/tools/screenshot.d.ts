import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { ScreenshotResult } from '../../types/tools.types';
/**
 * Current Page Screenshot
 */
export declare class Screenshot implements Tool<any, ScreenshotResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * Current Page Screenshot
     *
     * @param {*} params {}
     * @returns > { image: { type: 'base64', media_type: 'image/png', data } }
     */
    execute(context: ExecutionContext, params: unknown): Promise<ScreenshotResult>;
}
