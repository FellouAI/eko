import { ExtractContentResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';
import { getChromeProxy } from '@/common/chrome/proxy';

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
    let tab = await getChromeProxy().tabs.get(tabId);
    await injectScript(tabId);
    await sleep(500);
    let content = await executeScript(tabId, () => {
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
