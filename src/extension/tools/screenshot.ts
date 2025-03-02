import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { screenshot } from './browser';
import { getWindowId } from '../utils';
import { ScreenshotResult } from '../../types/tools.types';

/**
 * Current Page Screenshot
 */
export class Screenshot implements Tool<any, ScreenshotResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'screenshot';
    this.description = 'Screenshot the current webpage window';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  /**
   * Current Page Screenshot
   *
   * @param {*} params {}
   * @returns > { image: { type: 'base64', media_type: 'image/png', data } }
   */
  async execute(context: ExecutionContext, params: unknown): Promise<ScreenshotResult> {
    let windowId = await getWindowId(context);
    return await screenshot(context.ekoConfig.chromeProxy, windowId);
  }
}
