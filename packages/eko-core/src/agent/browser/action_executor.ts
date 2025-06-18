import { BrowserAction } from "../../types/core.types";
import { AgentContext } from "../../core/context";
import { sleep } from "../../common/utils";

/**
 * Execute browser actions using structured action definitions
 * Falls back to throwing an error if execution fails
 */
export class ActionExecutor {
  private browserAgent: any;

  constructor(browserAgent: any) {
    this.browserAgent = browserAgent;
  }

  /**
   * Execute a browser action
   * @returns true if successful, throws error if failed
   */
  async execute(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    try {
      switch (action.type) {
        case "browser.click":
          return await this.executeClick(action, agentContext);

        case "browser.input":
          return await this.executeInput(action, agentContext);

        case "browser.key_press":
          return await this.executeKeyPress(action, agentContext);

        case "browser.navigate":
          return await this.executeNavigate(action, agentContext);

        case "browser.extract":
          return await this.executeExtract(action, agentContext);

        case "browser.wait":
          return await this.executeWait(action, agentContext);

        case "browser.scroll":
          return await this.executeScroll(action, agentContext);

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      // Re-throw with context for fallback handling
      throw {
        originalError: error,
        action: action,
        message: `Action execution failed: ${error}`
      };
    }
  }

  private async executeClick(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Click action requires CSS or XPath selector");
    }

    const result = await this.browserAgent.execute_script(
      agentContext,
      (css: string | undefined, xpath: string | undefined) => {
        let element: Element | null = null;

        if (css) {
          element = document.querySelector(css);
        } else if (xpath) {
          const xpathResult = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          element = xpathResult.singleNodeValue as Element;
        }

        if (!element || !(element instanceof HTMLElement)) {
          throw new Error("Element not found");
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();
        return true;
      },
      [action.selector.css, action.selector.xpath]
    );

    await sleep(200); // Brief wait after click
    return result;
  }

  private async executeInput(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Input action requires CSS or XPath selector");
    }

    const result = await this.browserAgent.execute_script(
      agentContext,
      (css: string | undefined, xpath: string | undefined, value: string) => {
        let element: Element | null = null;

        if (css) {
          element = document.querySelector(css);
        } else if (xpath) {
          const xpathResult = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          element = xpathResult.singleNodeValue as Element;
        }

        if (!element || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
          throw new Error("Input element not found");
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus();
        element.value = '';
        element.value = value;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
      },
      [action.selector.css, action.selector.xpath, action.value || '']
    );

    return result;
  }

  private async executeKeyPress(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Key press action requires CSS or XPath selector");
    }

    const result = await this.browserAgent.execute_script(
      agentContext,
      (css: string | undefined, xpath: string | undefined, key: string) => {
        let element: Element | null = null;

        if (css) {
          element = document.querySelector(css);
        } else if (xpath) {
          const xpathResult = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          element = xpathResult.singleNodeValue as Element;
        }

        if (!element || !(element instanceof HTMLElement)) {
          throw new Error("Element not found");
        }

        element.focus();

        const event = new KeyboardEvent('keydown', {
          key: key,
          code: key,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(event);

        return true;
      },
      [action.selector.css, action.selector.xpath, action.key || 'Enter']
    );

    await sleep(200);
    return result;
  }

  private async executeNavigate(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (action.url) {
      await this.browserAgent.navigate_to(agentContext, action.url);
      return true;
    } else if (action.command === "back") {
      await this.browserAgent.go_back(agentContext);
      return true;
    } else {
      throw new Error("Navigate action requires URL or command");
    }
  }

  private async executeExtract(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Extract action requires CSS or XPath selector");
    }

    const result = await this.browserAgent.execute_script(
      agentContext,
      (css: string | undefined, xpath: string | undefined) => {
        let elements: Element[] = [];

        if (css) {
          elements = Array.from(document.querySelectorAll(css));
        } else if (xpath) {
          const xpathResult = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );

          for (let i = 0; i < xpathResult.snapshotLength; i++) {
            const element = xpathResult.snapshotItem(i) as Element;
            if (element) elements.push(element);
          }
        }

        if (elements.length === 0) {
          throw new Error("No elements found");
        }

        return elements.map(el => el.textContent || "");
      },
      [action.selector.css, action.selector.xpath]
    );

    // Store extracted data in context if needed
    console.log("Extracted data:", result);
    return true;
  }

  private async executeWait(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    const duration = action.duration || 1000;
    await sleep(duration);
    return true;
  }

  private async executeScroll(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    await this.browserAgent.execute_script(
      agentContext,
      (selector: string | undefined) => {
        if (selector) {
          const element = document.querySelector(selector);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          window.scrollBy(0, 300);
        }
      },
      [action.selector?.css]
    );

    await sleep(200);
    return true;
  }
}
