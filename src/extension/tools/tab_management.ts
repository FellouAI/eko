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
    this.description = 'Browser tab management, view and operate tabs';
    this.input_schema = {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: `The command to perform. The available commands are:
* \`tab_all\`: View all tabs and return the tabId and title.
* \`current_tab\`: Get current tab information (tabId, url, title).
* \`go_back\`: Go back to the previous page in the current tab.
* \`change_url [url]\`: open URL in the current tab, eg: \`change_url https://www.google.com\`.
* \`close_tab\`: Close the current tab.
* \`switch_tab [tabId]\`: Switch to the specified tab using tabId, eg: \`switch_tab 1000\`.
* \`new_tab [url]\`: Open a new tab window and open the URL, eg: \`new_tab https://www.google.com\``,
        },
      },
      required: ['command'],
    };
  }

  /**
   * Tab management
   *
   * @param {*} params { command: `new_tab [url]` | 'tab_all' | 'current_tab' | 'go_back' | 'close_tab' | 'switch_tab [tabId]' | `change_url [url]` }
   * @returns > { result, success: true }
   */
  async execute(
    context: ExecutionContext,
    params: TabManagementParam
  ): Promise<TabManagementResult> {
    if (params === null || !params.command) {
      throw new Error('Invalid parameters. Expected an object with a "command" property.');
    }
    let windowId = await getWindowId(context);
    let command = params.command.trim();
    if (command.startsWith('`')) {
      command = command.substring(1);
    }
    if (command.endsWith('`')) {
      command = command.substring(0, command.length - 1);
    }
    let result: TabManagementResult;
    if (command == 'tab_all') {
      result = [];
      let tabs = await chrome.tabs.query({ windowId: windowId });
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        let tabInfo: TabInfo = {
          tabId: tab.id,
          windowId: tab.windowId,
          title: tab.title,
          url: tab.url,
        };
        if (tab.active) {
          tabInfo.active = true;
        }
        result.push(tabInfo);
      }
    } else if (command == 'current_tab') {
      let tabId = await getTabId(context);
      let tab = await chrome.tabs.get(tabId);
      let tabInfo: TabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
      result = tabInfo;
    } else if (command == 'go_back') {
      let tabId = await getTabId(context);
      await chrome.tabs.goBack(tabId);
      let tab = await chrome.tabs.get(tabId);
      let tabInfo: TabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
      result = tabInfo;
    } else if (command == 'close_tab') {
      let closedTabId = await getTabId(context);
      await chrome.tabs.remove(closedTabId);
      await sleep(100);
      let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length == 0) {
        tabs = await chrome.tabs.query({ status: 'complete', currentWindow: true });
      }
      let tab = tabs[tabs.length - 1];
      if (!tab.active) {
        await chrome.tabs.update(tab.id as number, { active: true });
      }
      let newTabId = tab.id;
      context.variables.set('tabId', tab.id);
      context.variables.set('windowId', tab.windowId);
      let closeTabInfo: CloseTabInfo = { closedTabId, newTabId, newTabTitle: tab.title };
      result = closeTabInfo;
    } else if (command.startsWith('switch_tab')) {
      let tabId = parseInt(command.replace('switch_tab', '').replace('[', '').replace(']', ''));
      let tab = await chrome.tabs.update(tabId, { active: true });
      context.variables.set('tabId', tab.id);
      context.variables.set('windowId', tab.windowId);
      let tabInfo: TabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
      result = tabInfo;
    } else if (command.startsWith('change_url')) {
      let url = command.substring('change_url'.length).replace('[', '').replace(']', '').trim();
      let tabId = await getTabId(context);
      // await chrome.tabs.update(tabId, { url: url });
      await executeScript(tabId, () => {
        location.href = url;
      }, []);
      let tab = await waitForTabComplete(tabId);
      let tabInfo: TabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
      result = tabInfo;
    } else if (command.startsWith('new_tab')) {
      let url = command.replace('new_tab', '').replace('[', '').replace(']', '').replace(/"/g, '');
      // First mandatory opening of a new window
      let newWindow = !context.variables.get('windowId') && !context.variables.get('tabId');
      let tab: chrome.tabs.Tab;
      if (newWindow) {
        tab = await open_new_tab(url, true);
      } else {
        let windowId = await getWindowId(context);
        tab = await open_new_tab(url, false, windowId);
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
      let tabInfo: TabInfo = {
        tabId: tab.id,
        windowId: tab.windowId,
        title: tab.title,
        url: tab.url,
      };
      result = tabInfo;
    } else {
      throw Error('Unknown command: ' + command);
    }
    return result;
  }

  destroy(context: ExecutionContext): void {
    let windowIds = context.variables.get('windowIds') as Array<number>;
    if (windowIds) {
      for (let i = 0; i < windowIds.length; i++) {
        chrome.windows.remove(windowIds[i]);
      }
    }
  }
}
