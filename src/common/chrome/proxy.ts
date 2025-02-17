let ChromeProxy: any = chrome;

/**
 * Sets a proxy for the Chrome API.
 * This function creates a proxy for the Chrome API, allowing for interception and modification of certain methods.
 * The main logic involves creating a proxy for the `chrome` namespaces.
 * If a method exists in the mock implementation (e.g., `a` or `a_b` or `a_b_c` and so on), it will be used; otherwise, the original Chrome API method will be called.
 * @param chromeProxy - An object that provides mock implementations of Chrome API methods.
 * @example
 * ```typescript
 * class MyChromeProxy {
 *   public static tabs_onUpdated_removeListener(callback: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void): void {
 *     console.log(callback);
 *     return chrome.tabs.onUpdated.removeListener(callback);
 *   }
 *   public static tabs_get(tabId: number): Promise<chrome.tabs.Tab> {
 *     console.log(tabId);
 *     return chrome.tabs.get(tabId);
 *   }
 *   public static windows_create(createData: chrome.windows.CreateData): Promise<chrome.windows.Window> {
 *     console.log(createData);
 *     return chrome.windows.create(createData);
 *   }
 * }
 * setChromeProxy(MyChromeProxy);
 * ```
 */
export function setChromeProxy(chromeProxy: any): void {
  // Helper function to recursively create nested proxies
  function createNestedProxy(target: any, path: string[]): any {
    return new Proxy(target, {
      get(targetProp: any, prop: string | symbol) {
        if (typeof prop === "string") {
          // Construct the full path of the current property
          const currentPath = [...path, prop];
          const mockMethodName = currentPath.join("_");

          // Check if the mock method exists in the chromeProxy
          const mockMethod = (chromeProxy as any)[mockMethodName];
          if (mockMethod) {
            // If the mock method exists, return it
            return mockMethod;
          } else {
            // Otherwise, create a nested proxy if the property is an object
            if (typeof targetProp[prop] === "object" && targetProp[prop] !== null) {
              return createNestedProxy(targetProp[prop], currentPath);
            } else {
              // Return the original property/method
              return targetProp[prop];
            }
          }
        } else {
          console.warn("undefined property in ChromeProxy: " + String(prop));
          return undefined;
        }
      }
    });
  }

  // Create the initial proxy for the `chrome` object
  ChromeProxy = createNestedProxy(chrome, []);
}

/**
 * Retrieves the current Chrome API proxy.
 * This function returns the proxy object created by `setChromeProxy`, which can be used to access the proxied Chrome API methods.
 * @returns The proxied Chrome API object.
 * @example
 * ```typescript
 * getChromeProxy().tabs.get(1).then(tab => console.log(tab));
 * ```
 * In this example, `getChromeProxy` is used to retrieve the proxied Chrome API object, and then `tabs.get` is called on it.
 */
export function getChromeProxy(): any {
  return ChromeProxy;
}
