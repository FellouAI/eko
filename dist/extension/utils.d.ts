import { ExecutionContext } from '../types/action.types';
export declare function getWindowId(context: ExecutionContext): Promise<number>;
export declare function getTabId(context: ExecutionContext): Promise<number>;
export declare function getCurrentTabId(chromeProxy: any, windowId?: number | undefined): Promise<number | undefined>;
export declare function open_new_tab(chromeProxy: any, url: string, newWindow: boolean, windowId?: number): Promise<chrome.tabs.Tab>;
export declare function executeScript(chromeProxy: any, tabId: number, func: any, args: any[]): Promise<any>;
export declare function waitForTabComplete(chromeProxy: any, tabId: number, timeout?: number): Promise<chrome.tabs.Tab>;
export declare function doesTabExists(chromeProxy: any, tabId: number): Promise<unknown>;
export declare function getPageSize(chromeProxy: any, tabId?: number): Promise<[number, number]>;
export declare function sleep(time: number): Promise<void>;
export declare function injectScript(chromeProxy: any, tabId: number, filename?: string): Promise<void>;
export declare class MsgEvent {
    eventMap: {
        [key: string]: Function;
    };
    constructor();
    addListener(callback: Function, id: string): string;
    removeListener(id: string): void;
    publish(msg: any): Promise<void>;
}
/**
 * Counter (Function: Wait for all asynchronous tasks to complete)
 */
export declare class CountDownLatch {
    resolve?: Function;
    currentCount: number;
    constructor(count: number);
    countDown(): void;
    await(timeout: number): Promise<void>;
}
export declare function isPromise(obj: any): boolean;
