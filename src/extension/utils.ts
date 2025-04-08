import { ExecutionContext } from '../types/action.types';

export async function getWindowId(context: ExecutionContext): Promise<number> {
  let windowId = context.variables.get('windowId') as any;
  if (windowId) {
    try {
      await context.ekoConfig.chromeProxy.windows.get(windowId);
    } catch (e) {
      windowId = null;
      context.variables.delete('windowId');
      let tabId = context.variables.get('tabId') as any;
      if (tabId) {
        try {
          let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
          windowId = tab.windowId;
        } catch (e) {
          context.variables.delete('tabId');
        }
      }
    }
  }

  if (!windowId) {
    const window = await context.ekoConfig.chromeProxy.windows.getCurrent();
    windowId = window.id;
  }

  // `window.FELLOU_WINDOW_ID` is a feature of Downstream Caller
  if (!windowId) {
    windowId = (window as any).FELLOU_WINDOW_ID;
  }

  if (!windowId) {
    console.warn("`getWindowId()` returns " + windowId);
  }

  return windowId as number;
}

export async function getTabId(context: ExecutionContext): Promise<number> {
  let tabId = context.variables.get('tabId') as any;
  if (tabId) {
    try {
      await context.ekoConfig.chromeProxy.tabs.get(tabId);
    } catch (e) {
      tabId = null;
      context.variables.delete('tabId');
    }
  }

  if (!tabId) {
    console.log("tabId is empty");
    let windowId = await getWindowId(context);
    console.log(`windowId=${windowId}`);
    if (windowId) {
      try {
        tabId = await getCurrentTabId(context.ekoConfig.chromeProxy, windowId);
        console.log("getCurrentTabId(context.ekoConfig.chromeProxy, windowId) returns " + tabId);
      } catch (e) {
        tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
        console.log("getCurrentTabId(context.ekoConfig.chromeProxy, windowId) throws an error");
        console.log("getCurrentTabId(context.ekoConfig.chromeProxy) returns " + tabId);
        context.variables.delete('windowId');
      }
    } else {
      tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
      console.log("getCurrentTabId(context.ekoConfig.chromeProxy) #2 returns " + tabId);
    }

    if (!tabId) {
      throw new Error('Could not find a valid tab');
    }
    context.variables.set('tabId', tabId);
  }

  return tabId;
}

export function getCurrentTabId(chromeProxy: any, windowId?: number | undefined): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    console.debug("[getCurrentTabId] get the active tabId on: ", { windowId });
    let queryInfo: chrome.tabs.QueryInfo;
    if (windowId !== undefined) {
      console.debug(`[getCurrentTabId] get the active tab in window (windowId=${windowId})...`);
      queryInfo = { windowId, active: true };
    } else {
      console.debug(`[getCurrentTabId] get the active tabId on current window`);
      queryInfo = { active: true, currentWindow: true };
    }
    chrome.tabs.query(queryInfo, (tabs: chrome.tabs.Tab[]) => {
      if (chromeProxy.runtime.lastError) {
        console.error(`[getCurrentTabId] failed to get: `, chromeProxy.runtime.lastError);
        reject(chromeProxy.runtime.lastError);
        return;
      }
      if (tabs.length > 0) {
        console.debug(`[getCurrentTabId] found the tab, ID=${tabs[0].id}`);
        resolve(tabs[0].id);
      } else {
        console.debug(`[getCurrentTabId] cannot find the tab, returns undefined`);
        resolve(undefined);
      }
    });
  });
}

export async function open_new_tab(
  chromeProxy: any,
  url: string,
  windowId?: number
): Promise<chrome.tabs.Tab> {
  if(!windowId){
    const window = await chromeProxy.windows.getCurrent();
    windowId = window.id;
  }
  console.log("windowId: " + windowId);
  let tab = await chromeProxy.tabs.create({
    url: url,
    windowId: windowId,
  });
  console.log("chromeProxy.tabs.create() done");
  let tabId = tab.id as number;
  let completedTab = await waitForTabComplete(chromeProxy, tabId);
  console.log("waitForTabComplete() done");
  await sleep(200);
  console.log("sleep() done");
  return completedTab;
}

export async function executeScript(chromeProxy: any, tabId: number, func: any, args: any[]): Promise<any> {
  let frameResults = await chromeProxy.scripting.executeScript({
    target: { tabId: tabId as number },
    func: func,
    args: args,
  });
  return frameResults[0].result;
}

export async function waitForTabComplete(
  chromeProxy: any,
  tabId: number,
  timeout: number = 30_000
): Promise<chrome.tabs.Tab> {
  return new Promise(async (resolve, reject) => {
    const time = setTimeout(async () => {
      console.log("listener(#1)=", listener);
      chromeProxy.tabs.onUpdated.removeListener(listener);
      console.log("tabId(#1)=", tabId);
      let tab = await chromeProxy.tabs.get(tabId);
      console.log("tab(#1)=", tab);
      if (tab.status === 'complete') {
        console.warn('Timeout: waitForTabComplete, but tab is already complete.');
        resolve(tab);
      } else {
        console.warn("Timeout: waitForTabComplete, and tab is not complete");
        resolve(tab);
      }
    }, timeout);
    console.log("setTimeout done");
    const listener = async (updatedTabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
      console.log("listener start...");
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        console.log("listener(#2)=", listener);
        chromeProxy.tabs.onUpdated.removeListener(listener);
        clearTimeout(time);
        resolve(tab);
      }
    };
    console.log("tabId(#2)=", tabId);
    let tab = await chromeProxy.tabs.get(tabId);
    console.log("tab(#2)=", tab);
    if (tab.status === 'complete') {
      resolve(tab);
      clearTimeout(time);
      return;
    }
    console.log("listener(#3)=", listener);
    chromeProxy.tabs.onUpdated.addListener(listener);
  });
}

export async function doesTabExists(chromeProxy: any, tabId: number) {
  const tabExists = await new Promise((resolve) => {
    chromeProxy.tabs.get(tabId, (tab: any) => {
      if (chromeProxy.runtime.lastError) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
  return tabExists;
}

export async function getPageSize(chromeProxy: any, tabId?: number): Promise<[number, number]> {
  if (!tabId) {
    tabId = await getCurrentTabId(chromeProxy);
  }
  let injectionResult = await chromeProxy.scripting.executeScript({
    target: { tabId: tabId as number },
    func: () => [
      window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
      window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
    ],
  });
  return [injectionResult[0].result[0] as number, injectionResult[0].result[1] as number];
}

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}

export async function injectScript(chromeProxy: any, tabId: number, filename?: string) {
  let files = ['eko/script/common.js'];
  if (filename) {
    files.push('eko/script/' + filename);
  }
  await chromeProxy.scripting.executeScript({
    target: { tabId },
    files: files,
  });
}

export class MsgEvent {
  eventMap: { [key: string]: Function };

  constructor() {
    this.eventMap = {};
  }

  addListener(callback: Function, id: string) {
    if (!id) {
      id = new Date().getTime() + '' + Math.floor(Math.random() * 10000);
    }
    this.eventMap[id] = callback;
    return id;
  }

  removeListener(id: string) {
    delete this.eventMap[id];
  }

  async publish(msg: any) {
    let values = Object.values(this.eventMap);
    for (let i = 0; i < values.length; i++) {
      try {
        let result = values[i](msg);
        if (isPromise(result)) {
          await result;
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
}

/**
 * Counter (Function: Wait for all asynchronous tasks to complete)
 */
export class CountDownLatch {
  resolve?: Function;
  currentCount: number;

  constructor(count: number) {
    this.resolve = undefined;
    this.currentCount = count;
  }

  countDown() {
    this.currentCount = this.currentCount - 1;
    if (this.currentCount <= 0) {
      this.resolve && this.resolve();
    }
  }

  await(timeout: number): Promise<void> {
    const $this = this;
    return new Promise<void>((_resolve, reject) => {
      let resolve = _resolve;
      if (timeout > 0) {
        let timeId = setTimeout(reject, timeout);
        resolve = () => {
          clearTimeout(timeId);
          _resolve();
        };
      }
      $this.resolve = resolve;
      if ($this.currentCount <= 0) {
        resolve();
      }
    });
  }
}

export function isPromise(obj: any) {
  return (
    !!obj &&
    (typeof obj === 'object' || typeof obj === 'function') &&
    typeof obj.then === 'function'
  );
}
