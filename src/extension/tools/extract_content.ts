import { ExtractContentResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';

/**
 * Extract Page Content
 */
export class ExtractContent implements Tool<any, ExtractContentResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

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
   * @returns > { tabId, result: { title, url, content }, success: true }
   */
  async execute(context: ExecutionContext, params: any): Promise<ExtractContentResult> {
    let tabId = await getTabId(context);
    let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
    await injectScript(context.ekoConfig.chromeProxy, tabId);
    await sleep(500);
    let content = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
      return eko.extractHtmlContent();
    }, []);
    return {
      tabId,
      result: {
        title: tab.title,
        url: tab.url,
        content: content,
      }
    } as ExtractContentResult;
  }
}
