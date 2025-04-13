import { BrowserTab } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';
import { logger } from '@/common/log';

export class GetAllTabs implements Tool<any, BrowserTab[]> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'get_all_tabs';
    this.description = 'Get the tabId, title, url and content from current all tabs without opening new tab.';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  async execute(context: ExecutionContext, params: any): Promise<BrowserTab[]> {
    const currentWindow = await context.ekoConfig.chromeProxy.windows.getCurrent();
    const windowId = currentWindow.id;
    const tabs = await context.ekoConfig.chromeProxy.tabs.query({ windowId });
    const tabsInfo: BrowserTab[] = [];
  
    for (const tab of tabs) {
      if (tab.id === undefined) {
        logger.warn(`Tab ID is undefined for tab with URL: ${tab.url}`);
        continue;
      }
  
      await injectScript(context.ekoConfig.chromeProxy, tab.id);
      await sleep(500);
      let content = await executeScript(context.ekoConfig.chromeProxy, tab.id, () => {
        return eko.extractHtmlContent();
      }, []);
  
      // Use title as description, but requirement may evolve
      let description = tab.title? tab.title : "No description available.";
      
      const tabInfo: BrowserTab = {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        content: content,
        description: description,
      };
  
      logger.debug(tabInfo);
      tabsInfo.push(tabInfo);
    }
  
    return tabsInfo;
  }
}
