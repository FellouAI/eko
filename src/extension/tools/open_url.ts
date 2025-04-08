import { BrowserUseParam, OpenUrlParam, OpenUrlResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getWindowId, open_new_tab } from '../utils';
import { ToolReturnsScreenshot } from './tool_returns_screenshot';

/**
 * Open Url
 */
export class OpenUrl extends ToolReturnsScreenshot<OpenUrlParam> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    super();
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
  async realExecute(context: ExecutionContext, params: OpenUrlParam): Promise<OpenUrlResult> {
    console.log('Starting execute function with context:', context, 'and params:', params);

    // 参数验证
    if (typeof params !== 'object' || params === null || !params.url) {
      console.error('Invalid parameters. Expected an object with a "url" property.');
      throw new Error('Invalid parameters. Expected an object with a "url" property.');
    }

    // 提取参数
    let url = params.url.trim();
    let newWindow = params.newWindow;
    console.log('URL to open:', url);
    console.log('Initial newWindow value:', newWindow);

    // 根据上下文调整 newWindow 的值
    if (context.ekoConfig.workingWindowId) {
      console.log('Working window ID exists in context, setting newWindow to false.');
      newWindow = false;
    } else if (!newWindow && !context.variables.get('windowId') && !context.variables.get('tabId')) {
      // First mandatory opening of a new window
      console.log('No existing window or tab ID found, forcing newWindow to true.');
      newWindow = true;
    }

    console.log('Final newWindow value:', newWindow);

    // 打开新标签页
    let tab: chrome.tabs.Tab;
    if (newWindow) {
      console.log('Opening new tab in a new window.');
      tab = await open_new_tab(context.ekoConfig.chromeProxy, url);
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      console.log('New tab created in a new window:', tab);
    } else {
      let windowId = context.ekoConfig.workingWindowId ? context.ekoConfig.workingWindowId : await getWindowId(context);
      console.log('Using existing window with ID:', windowId);
      try {
        tab = await open_new_tab(context.ekoConfig.chromeProxy, url, windowId);
        console.log("Calling hook...")
        context.callback?.hooks?.onTabCreated?.(tab.id as number);
        console.log('New tab created in existing window:', tab);
      } catch (e) {
        console.error("An error occurs when `open_url`");
        console.error(e);
        throw e;
      }
    }

    // 获取窗口和标签 ID
    let windowId = tab.windowId as number;
    let tabId = tab.id as number;
    console.log('Tab ID:', tabId, 'Window ID:', windowId);

    // 更新上下文变量
    context.variables.set('windowId', windowId);
    context.variables.set('tabId', tabId);
    console.log('Updated context variables:', context.variables);

    // 处理新窗口的 windowIds
    if (newWindow) {
      let windowIds = context.variables.get('windowIds') as Array<number>;
      if (windowIds) {
        console.log('Existing window IDs:', windowIds);
        windowIds.push(windowId);
        console.log('Updated window IDs:', windowIds);
      } else {
        console.log('No existing window IDs found, creating new array.');
        context.variables.set('windowIds', [windowId] as Array<number>);
      }
    }

    // 返回结果
    let result = {
      tabId,
      windowId,
      title: tab.title,
    };
    console.log('Returning result:', result);
    return result;
  }
}
