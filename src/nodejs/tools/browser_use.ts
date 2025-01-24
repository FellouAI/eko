import { BrowserUseParam, BrowserUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { chromium, Browser, Page, ElementHandle, BrowserContext } from 'playwright';
import { run_build_dom_tree } from '../script/build_dom_tree';

/**
 * Browser Use => `npx playwright install`
 */
export class BrowserUse implements Tool<BrowserUseParam, BrowserUseResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  private browser: Browser | null = null;
  private browser_context: BrowserContext | null = null;
  private current_page: Page | null = null;

  constructor() {
    this.name = 'browser_use';
    this.description = `Use structured commands to interact with the browser, manipulating page elements through screenshots and webpage element extraction.
* This is a browser GUI interface where you need to analyze webpages by taking screenshots and extracting page element structures, and specify action sequences to complete designated tasks.
* Before performing element operations, please call the \`screenshot_extract_element\` command first, which will return the browser page screenshot and structured element information, both specially processed.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
* NAVIGATION & ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches
   - Handle popups/cookies by accepting or closing them
   - Use scroll to find elements you are looking for`;
    this.input_schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: `The action to perform. The available actions are:
* \`screenshot_extract_element\`: Take a screenshot of the web page and extract operable elements.
  - Screenshots are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshots help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshots, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshots.
* \`open_url\`: . Open the specified URL in the browser, the URL is text parameter.
* \`input_text\`: Enter a string in the interactive element.
* \`click\`: Click to element.
* \`right_click\`: Right-click on the element.
* \`double_click\`: Double-click on the element.
* \`scroll_to\`: Scroll to the specified element.
* \`extract_content\`: Extract the text content of the current webpage.
* \`get_dropdown_options\`: Get all options from a native dropdown element.
* \`select_dropdown_option\`: Select dropdown option for interactive element index by the text of the option you want to select.`,
          enum: [
            'screenshot_extract_element',
            'open_url',
            'input_text',
            'click',
            'right_click',
            'double_click',
            'scroll_to',
            'extract_content',
            'get_dropdown_options',
            'select_dropdown_option',
          ],
        },
        index: {
          type: 'integer',
          description:
            'index of element, Operation elements must pass the corresponding index of the element',
        },
        text: {
          type: 'string',
          description: 'Required by action: open_url, input_text, select_dropdown_option',
        },
      },
      required: ['action'],
    };
  }

  /**
   * browser
   *
   * @param {*} params { action: 'input_text', index: 1, text: 'string' }
   * @returns > { success: true, image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' }, text?: string }
   */
  async execute(context: ExecutionContext, params: BrowserUseParam): Promise<BrowserUseResult> {
    try {
      if (params === null || !params.action) {
        throw new Error('Invalid parameters. Expected an object with a "action" property.');
      }
      let page = this.current_page as Page;
      let selector_map = context.selector_map;
      let selector_xpath;
      if (params.index != null && selector_map) {
        selector_xpath = selector_map[params.index]?.xpath;
        if (!selector_xpath) {
          throw new Error('Element does not exist');
        }
      }
      let result;
      let elementHandle: ElementHandle | null;
      switch (params.action) {
        case 'open_url':
          if (!params.text) {
            throw new Error('text (url) parameter is required');
          }
          page = await this.open_url(context, params.text);
          result = {
            title: await page.title(),
            url: page.url(),
            success: true,
          };
          break;
        case 'input_text':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          elementHandle = await this.get_highlight_element(page, params.index, true);
          if (elementHandle) {
            try {
              await elementHandle.fill('');
              await elementHandle.fill(params.text as string);
              result = true;
            } catch (e) {
              result = await page.evaluate(do_input, { text: params.text, index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(200);
          break;
        case 'click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'left', force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'right_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'right', force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'right_click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'double_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'left', clickCount: 2, force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'double_click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'scroll_to':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await page.evaluate((highlightIndex) => {
            let element = (window as any).get_highlight_element(highlightIndex);
            if (!element) {
              return false;
            }
            element.scrollIntoView({ behavior: 'smooth' });
            return true;
          }, params.index);
          await sleep(500);
          break;
        case 'extract_content':
          let content = await this.extractHtmlContent(page);
          result = {
            title: await page.title(),
            url: page.url(),
            content: content,
          };
          break;
        case 'get_dropdown_options':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await this.get_dropdown_options(page, params.index);
          break;
        case 'select_dropdown_option':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          result = await this.select_dropdown_option(page, params.index, params.text);
          break;
        case 'screenshot_extract_element':
          await sleep(100);
          await this.injectScript(page);
          await sleep(100);
          let element_result = await page.evaluate(() => {
            return (window as any).get_clickable_elements(true);
          });
          context.selector_map = element_result.selector_map;
          let screenshotBuffer = await page.screenshot({
            fullPage: false,
            type: 'jpeg',
            quality: 50,
          });
          let base64 = screenshotBuffer.toString('base64');
          let image = {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64,
          }
          await page.evaluate(() => {
            return (window as any).remove_highlight();
          });
          result = { image: image, text: element_result.element_str };
          break;
        default:
          throw Error(
            `Invalid parameters. The "${params.action}" value is not included in the "action" enumeration.`
          );
      }
      if (result) {
        return { success: true, ...result };
      } else {
        return { success: false };
      }
    } catch (e: any) {
      console.log(e);
      return { success: false, error: e?.message };
    }
  }

  private async open_url(context: ExecutionContext, url: string): Promise<Page> {
    if (!this.browser) {
      this.current_page = null;
      this.browser_context = null;
      this.browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox'],
      });
    }
    if (!this.browser_context) {
      this.current_page = null;
      this.browser_context = await this.browser.newContext();
    }
    const page: Page = await this.browser_context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForLoadState('load');
    this.current_page = page;
    return page;
  }

  private async injectScript(page: Page): Promise<unknown> {
    return await page.evaluate(run_build_dom_tree);
  }

  private async get_highlight_element(
    page: Page,
    highlightIndex: number,
    findInput?: boolean
  ): Promise<ElementHandle | null> {
    return await page.evaluateHandle(
      (params: any) => {
        let element = (window as any).get_highlight_element(params.highlightIndex);
        if (element && params.findInput) {
          if (
            element.tagName != 'INPUT' &&
            element.tagName != 'TEXTAREA' &&
            element.childElementCount != 0
          ) {
            element =
              element.querySelector('input') || element.querySelector('textarea') || element;
          }
        }
        return element;
      },
      { highlightIndex, findInput }
    );
  }

  private async extractHtmlContent(page: Page): Promise<string> {
    return await page.evaluate(() => {
      let element = document.body;
      let main = element.querySelector('main');
      let content = '';
      if (main) {
        let articles = main.querySelectorAll('article');
        if (articles && articles.length > 0) {
          for (let i = 0; i < articles.length; i++) {
            content += articles[i].innerText.trim() + '\n';
          }
        } else {
          content += main.innerText.trim();
        }
      } else {
        let articles = element.querySelectorAll('article');
        if (articles && articles.length > 0) {
          for (let i = 0; i < articles.length; i++) {
            content += articles[i].innerText.trim() + '\n';
          }
        }
      }
      content = content.trim();
      if (!content) {
        content = element.innerText;
      }
      return content.replace(/\n+/g, '\n').replace(/ +/g, ' ').trim();
    });
  }

  private async get_dropdown_options(page: Page, highlightIndex: number): Promise<any> {
    return await page.evaluate((highlightIndex) => {
      let select = (window as any).get_highlight_element(highlightIndex);
      if (!select) {
        return null;
      }
      return {
        options: Array.from(select.options).map((opt: any) => ({
          index: opt.index,
          text: opt.text.trim(),
          value: opt.value,
        })),
        id: select.id,
        name: select.name,
      };
    }, highlightIndex);
  }

  private async select_dropdown_option(
    page: Page,
    highlightIndex: number,
    text: string
  ): Promise<any> {
    return await page.evaluate(
      (param: any) => {
        let select = (window as any).get_highlight_element(param.highlightIndex);
        if (!select || select.tagName.toUpperCase() !== 'SELECT') {
          return { success: false, error: 'Select not found or invalid element type' };
        }
        const option = Array.from(select.options).find(
          (opt: any) => opt.text.trim() === param.text
        ) as any;
        if (!option) {
          return {
            success: false,
            error: 'Option not found',
            availableOptions: Array.from(select.options).map((o: any) => o.text.trim()),
          };
        }
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        return {
          success: true,
          selectedValue: option.value,
          selectedText: option.text.trim(),
        };
      },
      { highlightIndex, text }
    );
  }

  destroy(context: ExecutionContext) {
    delete context.selector_map;
    if (this.browser) {
      this.browser.close();
      this.browser = null;
      this.current_page = null;
      this.browser_context = null;
    }
  }
}

function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}

function do_click(param: any) {
  function simulateMouseEvent(
    eventTypes: Array<string>,
    button: 0 | 1 | 2,
    highlightIndex?: number
  ): boolean {
    let element = (window as any).get_highlight_element(highlightIndex);
    if (!element) {
      return false;
    }
    for (let i = 0; i < eventTypes.length; i++) {
      const event = new MouseEvent(eventTypes[i], {
        view: window,
        bubbles: true,
        cancelable: true,
        button, // 0 left; 2 right
      });
      let result = element.dispatchEvent(event);
      console.log('simulateMouse', element, { eventTypes, button }, result);
    }
    return true;
  }
  if (param.type == 'right_click') {
    return simulateMouseEvent(['mousedown', 'mouseup', 'contextmenu'], 2, param.index);
  } else if (param.type == 'double_click') {
    return simulateMouseEvent(
      ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'],
      0,
      param.index
    );
  } else {
    return simulateMouseEvent(['mousedown', 'mouseup', 'click'], 0, param.index);
  }
}

function do_input(params: any): boolean {
  let text = params.text as string;
  let highlightIndex = params.index as number;
  let element = (window as any).get_highlight_element(highlightIndex);
  if (!element) {
    return false;
  }
  let enter = false;
  if (text.endsWith('\\n')) {
    enter = true;
    text = text.substring(0, text.length - 2);
  } else if (text.endsWith('\n')) {
    enter = true;
    text = text.substring(0, text.length - 1);
  }
  let input: any;
  if (
    element.tagName == 'INPUT' ||
    element.tagName == 'TEXTAREA' ||
    element.childElementCount == 0
  ) {
    input = element;
  } else {
    input = element.querySelector('input') || element.querySelector('textarea') || element;
  }
  input.focus && input.focus();
  if (!text) {
    if (input.value == '') {
      return true;
    }
    input.value = '';
  } else {
    input.value += text;
  }
  let result = input.dispatchEvent(new Event('input', { bubbles: true }));
  if (enter) {
    ['keydown', 'keypress', 'keyup'].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
  }
  console.log('type', input, result);
  return true;
}
