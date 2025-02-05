import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { extractHtmlContent } from './browser';

/**
 * Extract Page Content
 */
export class ExtractContent implements Tool<any, string> {
  name: string;
  description: string;
  input_schema: InputSchema;
  need_vision: boolean = false;

  constructor() {
    this.name = 'extract_content';
    this.description = 'Extract the text content of the current webpage';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  /**
   * Extract Page Content
   *
   * @param {*} params {}
   * @returns > string
   */
  async execute(context: ExecutionContext, params: any): Promise<string> {
    return extractHtmlContent();
  }
}
