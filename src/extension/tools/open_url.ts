import { OpenUrlParam, OpenUrlResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getWindowId, open_new_tab } from '../utils';

/**
 * Open Url
 */
export class OpenUrl implements Tool<OpenUrlParam, OpenUrlResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'open_url';
    this.description = 'Open the specified URL link in browser window';
    this.input_schema = {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL link address',
        },
        newWindow: {
          type: 'boolean',
          description: 'true: Open in a new window; false: Open in the current window.',
        },
      },
      required: ['url'],
    };
  }

  /**
   * Open Url
   *
   * @param {*} params { url: 'https://www.google.com', newWindow: true }
   * @returns > { tabId, windowId, title, success: true }
   */
  async execute(context: ExecutionContext, params: OpenUrlParam): Promise<OpenUrlResult> {    
    if (typeof params !== 'object' || params === null || !params.url) {
      throw new Error('Invalid parameters. Expected an object with a "url" property.');
    }
    let url = params.url;
    let newWindow = params.newWindow;
    if (context.ekoConfig.workingWindowId) {
      newWindow = false;
    } else if (!newWindow && !context.variables.get('windowId') && !context.variables.get('tabId')) {
      // First mandatory opening of a new window
      newWindow = true;
    }
    let tab: chrome.tabs.Tab;
    if (newWindow) {
      tab = await open_new_tab(context.ekoConfig.chromeProxy, url, true);
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
    } else {
      let windowId = context.ekoConfig.workingWindowId ? context.ekoConfig.workingWindowId : await getWindowId(context);
      tab = await open_new_tab(context.ekoConfig.chromeProxy, url, false, windowId);
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
    }
    let windowId = tab.windowId as number;
    let tabId = tab.id as number;
    context.variables.set('windowId', windowId);
    context.variables.set('tabId', tabId);
    if (newWindow) {
      let windowIds = context.variables.get('windowIds') as Array<number>;
      if (windowIds) {
        windowIds.push(windowId);
      } else {
        context.variables.set('windowIds', [windowId] as Array<number>);
      }
    }
    return {
      tabId,
      windowId,
      title: tab.title,
    };
  }
}
