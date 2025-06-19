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
    } catch (error: any) {
      // Re-throw with context for fallback handling
      const errorMessage = error.message || error.toString();
      const enhancedMessage = `Action execution failed: ${errorMessage}. Action type: ${action.type}, CSS selector: ${action.selector?.css || 'none'}, XPath selector: ${action.selector?.xpath || 'none'}`;
      
      throw new Error(enhancedMessage);
    }
  }

  private async executeClick(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Click action requires CSS or XPath selector");
    }

    // Capture state before click
    let stateBefore: any;
    try {
      stateBefore = await this.browserAgent.execute_script(
        agentContext,
        () => ({
          url: window.location.href,
          bodyLength: document.body.innerHTML.length,
          elementsCount: document.querySelectorAll('*').length,
          title: document.title
        }),
        []
      );
    } catch (e) {
      throw new Error(`Cannot execute click action: ${e}. Make sure a page is loaded first.`);
    }

    // Execute the click
    const clickResult = await this.browserAgent.execute_script(
      agentContext,
      (args: any[]) => {
        const [css, xpath] = args;
        let element: Element | null = null;

        // Try CSS selector first
        if (css) {
          element = document.querySelector(css);
        }
        
        // If CSS didn't work, try XPath
        if (!element && xpath) {
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
          throw new Error(`Element not found with CSS selector: '${css || 'none'}' or XPath: '${xpath || 'none'}'`);
        }

        // Capture element info before click
        const elementInfo = {
          tagName: element.tagName,
          text: element.textContent?.trim() || '',
          className: element.className,
          isButton: element.tagName === 'BUTTON' || element.getAttribute('role') === 'button',
          isLink: element.tagName === 'A',
          isInput: element.tagName === 'INPUT'
        };

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();
        
        return { clicked: true, elementInfo };
      },
      [action.selector.css, action.selector.xpath]
    );

    // Wait for potential page changes
    await sleep(500);

    // Capture state after click
    const stateAfter = await this.browserAgent.execute_script(
      agentContext,
      () => ({
        url: window.location.href,
        bodyLength: document.body.innerHTML.length,
        elementsCount: document.querySelectorAll('*').length,
        title: document.title
      }),
      []
    );

    // Verify the click had an effect
    const urlChanged = stateBefore.url !== stateAfter.url;
    const contentChanged = Math.abs(stateAfter.bodyLength - stateBefore.bodyLength) > 100;
    const elementsChanged = Math.abs(stateAfter.elementsCount - stateBefore.elementsCount) > 5;
    const titleChanged = stateBefore.title !== stateAfter.title;

    const hasEffect = urlChanged || contentChanged || elementsChanged || titleChanged;

    if (!hasEffect) {
      // Check for more specific UI changes that might not affect overall page structure
      const detailedCheck = await this.browserAgent.execute_script(
        agentContext,
        () => {
          // Look for common UI changes that clicks might trigger
          const hasModalOrDialog = document.querySelector('[role="dialog"], .modal, .popup') !== null;
          const hasDropdownOrMenu = document.querySelector('[role="listbox"], [role="menu"], .dropdown') !== null;
          const hasNewFocusedElement = document.activeElement !== document.body;
          const hasVisibleTooltip = document.querySelector('.tooltip:not([style*="display: none"])') !== null;
          
          return {
            url: window.location.href,
            bodyLength: document.body.innerHTML.length,
            elementsCount: document.querySelectorAll('*').length,
            hasModalOrDialog,
            hasDropdownOrMenu,
            hasNewFocusedElement,
            hasVisibleTooltip,
            activeElementTag: document.activeElement?.tagName || 'BODY'
          };
        },
        []
      );
      
      // More flexible effect detection
      const urlChanged = stateBefore.url !== detailedCheck.url;
      const contentChanged = Math.abs(detailedCheck.bodyLength - stateBefore.bodyLength) > 50; // More lenient threshold
      const elementsChanged = Math.abs(detailedCheck.elementsCount - stateBefore.elementsCount) > 3; // More lenient threshold
      const uiStateChanged = detailedCheck.hasModalOrDialog || detailedCheck.hasDropdownOrMenu || 
                            detailedCheck.hasNewFocusedElement || detailedCheck.hasVisibleTooltip;
      
      const hasAnyEffect = urlChanged || contentChanged || elementsChanged || uiStateChanged;
      
      if (!hasAnyEffect && (clickResult.elementInfo.isButton || clickResult.elementInfo.isLink)) {
        // For interactive elements, wait longer and check again
        await sleep(1500);
        
        const finalCheck = await this.browserAgent.execute_script(
          agentContext,
          () => ({
            url: window.location.href,
            bodyLength: document.body.innerHTML.length,
            elementsCount: document.querySelectorAll('*').length,
            hasDropdown: document.querySelector('[role="listbox"], [role="menu"], .dropdown') !== null,
            hasModal: document.querySelector('[role="dialog"], .modal') !== null
          }),
          []
        );
        
        const finalEffect = stateBefore.url !== finalCheck.url ||
          Math.abs(finalCheck.bodyLength - stateBefore.bodyLength) > 50 ||
          Math.abs(finalCheck.elementsCount - stateBefore.elementsCount) > 3 ||
          finalCheck.hasDropdown || finalCheck.hasModal;
        
        if (!finalEffect) {
          // More informative error message for LLM fallback
          throw new Error(
            `Click may not have achieved intended effect. Clicked ${clickResult.elementInfo.tagName} ` +
            `"${clickResult.elementInfo.text.substring(0, 50)}" but detected minimal page changes. ` +
            `This could be normal for some UI elements. ` +
            `Context: URL=${stateBefore.url}, elements=${stateBefore.elementsCount}, ` +
            `activeElement=${detailedCheck.activeElementTag}`
          );
        }
      }
    }

    return true;
  }

  private async executeInput(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Input action requires CSS or XPath selector");
    }

    const inputResult = await this.browserAgent.execute_script(
      agentContext,
      (args: any[]) => {
        const [css, xpath, value] = args;
        let element: Element | null = null;

        // Try CSS selector first
        if (css) {
          element = document.querySelector(css);
        }
        
        // If CSS didn't work, try XPath
        if (!element && xpath) {
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
          throw new Error(`Input element not found with CSS selector: '${css || 'none'}' or XPath: '${xpath || 'none'}'`);
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus();
        
        const previousValue = element.value;
        element.value = '';
        element.value = value;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        // Return verification info with more context
        const hasAutocomplete = element.hasAttribute('autocomplete') || element.getAttribute('role') === 'combobox';
        const isLocationInput = (element.getAttribute('placeholder') || '').toLowerCase().includes('where');
        
        return {
          previousValue,
          newValue: element.value,
          elementType: element.tagName,
          placeholder: element.getAttribute('placeholder') || '',
          name: element.getAttribute('name') || '',
          hasAutocomplete,
          isLocationInput
        };
      },
      [action.selector.css, action.selector.xpath, action.value || '']
    );

    // Wait briefly for any autocomplete or validation
    await sleep(300);

    // Enhanced verification that's more flexible for autocomplete/suggestion systems
    const verification = await this.browserAgent.execute_script(
      agentContext,
      (args: any[]) => {
        const [css, xpath, expectedValue] = args;
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
          return { verified: false, actualValue: null, context: 'element_not_found' };
        }

        const actualValue = element.value;
        const placeholder = element.getAttribute('placeholder') || '';
        const hasAutocomplete = element.hasAttribute('autocomplete') || element.getAttribute('role') === 'combobox';
        
        // Check for various types of dropdowns/suggestions
        const hasDropdown = document.querySelector('[role="listbox"], .autocomplete, .suggestions, ul.dropdown, [role="option"]') !== null;
        
        // Check for suggestions that contain the expected value
        const suggestions = Array.from(document.querySelectorAll('[role="option"], .suggestion, .autocomplete-item'))
          .map(el => el.textContent || '')
          .filter(text => text.toLowerCase().includes(expectedValue.toLowerCase()));

        // Different verification strategies based on context
        let verified = false;
        let strategy = 'exact_match';
        
        if (actualValue === expectedValue) {
          // Exact match - always good
          verified = true;
          strategy = 'exact_match';
        } else if (hasDropdown && suggestions.length > 0) {
          // Autocomplete/suggestion system detected with relevant suggestions
          verified = true;
          strategy = 'autocomplete_triggered';
        } else if (hasAutocomplete && actualValue.toLowerCase().includes(expectedValue.toLowerCase())) {
          // Partial match in autocomplete field
          verified = true;
          strategy = 'partial_match';
        } else if (placeholder.toLowerCase().includes('where') && hasDropdown) {
          // Location input fields (like Google Flights) with dropdowns
          verified = true;
          strategy = 'location_autocomplete';
        }
        
        return {
          verified,
          actualValue,
          expectedValue,
          hasDropdown,
          hasAutocomplete,
          suggestions: suggestions.slice(0, 3), // First 3 suggestions
          strategy,
          placeholder
        };
      },
      [action.selector.css, action.selector.xpath, action.value || '']
    );

    if (!verification.verified) {
      throw new Error(
        `Input action may not have achieved intended effect. Expected: "${action.value}", ` +
        `but found: "${verification.actualValue}". ` +
        `Element: ${inputResult.elementType} with placeholder "${inputResult.placeholder}". ` +
        `Context: ${verification.hasDropdown ? 'dropdown detected' : 'no dropdown'}, ` +
        `${verification.hasAutocomplete ? 'autocomplete enabled' : 'no autocomplete'}, ` +
        `suggestions: [${verification.suggestions.join(', ')}]`
      );
    }

    return true;
  }

  private async executeKeyPress(action: BrowserAction, agentContext: AgentContext): Promise<boolean> {
    if (!action.selector?.css && !action.selector?.xpath) {
      throw new Error("Key press action requires CSS or XPath selector");
    }

    const result = await this.browserAgent.execute_script(
      agentContext,
      (args: any[]) => {
        const [css, xpath, key] = args;
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
      let urlBefore: string | null = null;
      
      // Try to get current URL if a page exists
      try {
        urlBefore = await this.browserAgent.execute_script(
          agentContext,
          () => window.location.href,
          []
        );
      } catch (e) {
        // No page yet, this is the first navigation
        urlBefore = null;
      }

      await this.browserAgent.navigate_to(agentContext, action.url);
      
      // Wait for navigation
      await sleep(1000);
      
      // Verify navigation
      let urlAfter: any;
      try {
        urlAfter = await this.browserAgent.execute_script(
          agentContext,
          () => ({
            url: window.location.href,
            readyState: document.readyState,
            title: document.title
          }),
          []
        );
      } catch (e) {
        throw new Error(
          `Navigation failed. Attempted to navigate to "${action.url}" but could not verify the result. Error: ${e}`
        );
      }

      // Check if we're still on the same URL (navigation failed)
      if (urlBefore && urlAfter.url === urlBefore && urlBefore !== action.url) {
        throw new Error(
          `Navigation failed. Attempted to navigate to "${action.url}" ` +
          `but still at "${urlAfter.url}". Document state: ${urlAfter.readyState}`
        );
      }

      // Wait for page to be ready
      if (urlAfter.readyState !== 'complete') {
        await sleep(2000);
      }

      return true;
    } else if (action.command === "back") {
      const urlBefore = await this.browserAgent.execute_script(
        agentContext,
        () => window.location.href,
        []
      );

      await this.browserAgent.go_back(agentContext);
      await sleep(500);

      const urlAfter = await this.browserAgent.execute_script(
        agentContext,
        () => window.location.href,
        []
      );

      if (urlAfter === urlBefore) {
        throw new Error("Browser back navigation had no effect - still at the same URL");
      }

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
      (args: any[]) => {
        const [css, xpath] = args;
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
      (args: any[]) => {
        const [selector] = args;
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
