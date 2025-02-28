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
    let windowId = context.variables.get('windowId') as any;
    if (windowId) {
      try {
        tabId = await getCurrentTabId(context.ekoConfig.chromeProxy, windowId);
      } catch (e) {
        tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
        context.variables.delete('windowId');
      }
    } else {
      tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
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
    chromeProxy.tabs.query({ windowId, active: true, lastFocusedWindow: true }, function (tabs: any) {
      if (chromeProxy.runtime.lastError) {
        console.error('Chrome runtime error:', chromeProxy.runtime.lastError);
        reject(chromeProxy.runtime.lastError);
        return;
      }
      if (tabs.length > 0) {
        resolve(tabs[0].id);
      } else {
        chromeProxy.tabs.query({ windowId, active: true, currentWindow: true }, function (_tabs: any) {
          if (_tabs.length > 0) {
            resolve(_tabs[0].id);
            return;
          } else {
            chromeProxy.tabs.query(
              { windowId, status: 'complete', currentWindow: true },
              function (__tabs: any) {
                resolve(__tabs.length ? __tabs[__tabs.length - 1].id : undefined);
              }
            );
          }
        });
      }
    });
  });
}

export async function open_new_tab(
  chromeProxy: any,
  url: string,
  newWindow: boolean,
  windowId?: number
): Promise<chrome.tabs.Tab> {
  let tabId;
  if (newWindow) {
    let window = await chromeProxy.windows.create({
      type: 'normal',
      state: 'maximized',
      url: url,
    } as any as chrome.windows.CreateData);
    windowId = window.id as number;
    let tabs = window.tabs || [
      await chromeProxy.tabs.create({
        url: url,
        windowId: windowId,
      }),
    ];
    tabId = tabs[0].id as number;
  } else {
    if (!windowId) {
      const window = await chromeProxy.windows.getCurrent();
      windowId = window.id;
    }
    let tab = await chromeProxy.tabs.create({
      url: url,
      windowId: windowId,
    });
    tabId = tab.id as number;
  }
  let tab = await waitForTabComplete(chromeProxy, tabId);
  await sleep(200);
  return tab;
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
  timeout: number = 15_000
): Promise<chrome.tabs.Tab> {
  return new Promise(async (resolve, reject) => {
    let tab = await chromeProxy.tabs.get(tabId);
    if (tab.status === 'complete') {
      resolve(tab);
      return;
    }
    const time = setTimeout(() => {
      chromeProxy.tabs.onUpdated.removeListener(listener);
      reject();
    }, timeout);
    const listener = async (updatedTabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chromeProxy.tabs.onUpdated.removeListener(listener);
        clearTimeout(time);
        resolve(tab);
      }
    };
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
