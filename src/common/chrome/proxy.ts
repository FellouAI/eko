/**
 * Get a proxy for the Chrome API by mockClass.
 * This function creates a proxy for the Chrome API, allowing for interception and modification of certain methods.
 * The main logic involves creating a proxy for the `chrome.tabs` and `chrome.windows` namespaces.
 * If a method exists in the mock implementation (e.g., `tabs_get`), it will be used; otherwise, the original Chrome API method will be called.
 * @param mockClass - A **class** that provides mock implementations of Chrome API methods.
 * @example
 * ```typescript
 * class MyMockClass {
 *   public static tabs_get(tabId: number): Promise<chrome.tabs.Tab> {
 *     console.log(tabId);
 *     return chrome.tabs.get(tabId);
 *   }
 *   public static windows_create(createData: chrome.windows.CreateData): Promise<chrome.windows.Window> {
 *     console.log(createData);
 *     return chrome.windows.create(createData);
 *   }
 * }
 * let p = createChromeApiProxy(MyMockClass);
 * p.windows.create(...);
 * ```
 * In this example, `tabs_get` is a mock implementation that logs the `tabId` before calling the original `chrome.tabs.get` method, and the same as `chrome.windows.create` method.
 */
export function createChromeApiProxy(mockClass: any): any {
  console.log("debug mockClass:");
  console.log(mockClass);

  return new Proxy(chrome, {
    get(target: any, prop: string | symbol) {
      if (typeof prop === "string") {
        // If the property is 'tabs' or 'windows', create a nested proxy
        if (prop === "tabs" || prop === "windows") {
          return new Proxy(target[prop], {
            get(targetProp: any, method: string | symbol) {
              if (typeof method === "string") {
                // Construct the mock method name (e.g., 'tabs_create')
                const mockMethodName = `${prop}_${method}`;
                // Check if the mock method exists
                const mockMethod = (mockClass as any)[mockMethodName];
                if (mockMethod) {
                  // If the mock method exists, return it
                  return mockMethod;
                } else {
                  // Otherwise, return the original Chrome API method
                  return targetProp[method];
                }
              } else {
                return targetProp[method];
              }
            }
          });
        } else {
          // For other properties, return the original Chrome property
          return target[prop];
        }
      } else {
        // If the property is not a string, return the original property
        return target[prop];
      }
    }
  });
}