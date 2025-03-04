import { BrowserTab } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';

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
    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id;
    const tabs = await chrome.tabs.query({ windowId });
    const tabsInfo: BrowserTab[] = [];
  
    for (const tab of tabs) {
      if (tab.id === undefined) {
        console.warn(`Tab ID is undefined for tab with URL: ${tab.url}`);
        continue;
      }
  
      await injectScript(tab.id);
      await sleep(500);
      let content = await executeScript(tab.id, () => {
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
  
      console.log("url: " + tab.url);
      console.log("title: " + tab.title);
      console.log("description: " + description);
      tabsInfo.push(tabInfo);
    }
  
    return tabsInfo;
  }
}
