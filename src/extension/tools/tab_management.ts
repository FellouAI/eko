import {
  CloseTabInfo,
  TabInfo,
  TabManagementParam,
  TabManagementResult,
} from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import {
  executeScript,
  getTabId,
  getWindowId,
  open_new_tab,
  sleep,
  waitForTabComplete,
} from '../utils';

/**
 * Browser tab management
 */
export class TabManagement implements Tool<TabManagementParam, TabManagementResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'tab_management';
    this.description = 'Browser tab management, view and operate tabs.You can use this tool to' +
      'View all tabs with the tabId and title.Get current tab information (tabId, url, title).' +
      'Go back to the previous page in the current tab. And Close the current tab.';
    this.input_schema = {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: `The command to perform. The available commands are:
* \`tab_all\`: View all tabs and return the tabId and title.
* \`go_back\`: Go back to the previous page in the current tab.
* \`switch_tab\`: Switch to the specified tab by tabId.`,
          enum: ['tab_all', 'go_back', 'switch_tab'],
        },
        tabId: {
          type: 'integer',
          description: "Tab id. Only needed when using 'switch_tab'",
        },
      },
      required: ['command'],
    };
  }

  async execute(
    context: ExecutionContext,
    params: TabManagementParam,
  ): Promise<TabManagementResult> {
    if (params === null || !params.command) {
      throw new Error('Invalid parameters. Expected an object with a "command" property.');
    }
    if (params.command == 'tab_all') {
      ; // empty body because this is default behavior
    } else if (params.command == 'go_back') {
      let tabId = await getTabId(context);
      await context.ekoConfig.chromeProxy.tabs.goBack(tabId);
    } else if (params.command == "switch_tab") {
      await context.ekoConfig.chromeProxy.tabs.select(params.tabId);
    } else if (params.command == 'close_tab') {
      let closedTabId = await getTabId(context);
      await context.ekoConfig.chromeProxy.tabs.remove(closedTabId);
      await sleep(100);
      let tabs = await context.ekoConfig.chromeProxy.tabs.query({ active: true, currentWindow: true });
      if (tabs.length == 0) {
        tabs = await context.ekoConfig.chromeProxy.tabs.query({ status: 'complete', currentWindow: true });
      }
      let tab = tabs[tabs.length - 1];
      if (!tab.active) {
        await context.ekoConfig.chromeProxy.tabs.update(tab.id as number, { active: true });
      }
      context.variables.set('tabId', tab.id);
      context.variables.set('windowId', tab.windowId);
    } else {
      throw Error('Unknown command: ' + params.command);
    }

    // build return value
    let tabs: chrome.tabs.Tab[] = await context.ekoConfig.chromeProxy.tabs.query({});
    tabs = tabs.filter((tab) => tab.title && tab.url);
    if (tabs.length > 0) {
      let result: string = "After operation, the existing tabs are as follows:\n";
      for(const tab of tabs) {
        result += `<tab><id>${tab.id}</id><title>${tab.title}</title><url>${tab.url}</url></tab>\n`;
      }
      let currentTabId = await getTabId(context);
      let currentTab: chrome.tabs.Tab = await context.ekoConfig.chromeProxy.tabs.get(currentTabId);
      result += `The current active tab: <tab><id>${currentTab.id}</id><title>${currentTab.title}</title><url>${currentTab.url}</url></tab>`
      return result;
    } else {
      return "No existing tab. Use 'open_url' to open a new tab";
    }
  }

  destroy(context: ExecutionContext): void {
    let windowIds = context.variables.get('windowIds') as Array<number>;
    if (windowIds) {
      for (let i = 0; i < windowIds.length; i++) {
        context.ekoConfig.chromeProxy.windows.remove(windowIds[i]);
      }
    }
  }
}
