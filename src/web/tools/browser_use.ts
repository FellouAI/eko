import { BrowserActionParam, BrowserActionResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { get_clickable_elements, remove_highlight } from '../script/build_dom_tree';
import * as browser from './browser';

/**
 * Browser Use for general
 */
export class BrowserUse implements Tool<BrowserActionParam, BrowserActionResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'browser_use';
    this.description = `Use structured commands to interact with the browser, manipulating page elements through screenshots and webpage element extraction.
* This is a browser GUI interface where you need to analyze webpages by taking screenshots and extracting page element structures, and specify action sequences to complete designated tasks.
* Before any operation, you must first call the \`screenshot_extract_element\` command, which will return the browser page screenshot and structured element information, both specially processed.
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
          description: 'Required by `action=input_text` and `action=select_dropdown_option`',
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
  async execute(context: ExecutionContext, params: BrowserActionParam): Promise<BrowserActionResult> {
    try {
      if (params === null || !params.action) {
        throw new Error('Invalid parameters. Expected an object with a "action" property.');
      }
      let selector_map = context.selector_map;
      let selector_xpath;
      if (params.index != null && selector_map) {
        selector_xpath = selector_map[params.index]?.xpath;
        if (!selector_xpath) {
          throw new Error('Element does not exist');
        }
      }
      let result;
      switch (params.action) {
        case 'input_text':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          await browser.clear_input(selector_xpath, params.index);
          result = await browser.type(params.text, selector_xpath, params.index);
          await sleep(200);
          break;
        case 'click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.left_click(selector_xpath, params.index);
          await sleep(100);
          break;
        case 'right_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.right_click(selector_xpath, params.index);
          await sleep(100);
          break;
        case 'double_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.double_click(selector_xpath, params.index);
          await sleep(100);
          break;
        case 'scroll_to':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.scroll_to(selector_xpath, params.index);
          await sleep(500);
          break;
        case 'extract_content':
          await sleep(200);
          let content = browser.extractHtmlContent();
          result = {
            title: document.title,
            content: content,
          };
          break;
        case 'get_dropdown_options':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = browser.get_dropdown_options(selector_xpath, params.index);
          break;
        case 'select_dropdown_option':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          result = browser.select_dropdown_option(params.text, selector_xpath, params.index);
          break;
        case 'screenshot_extract_element':
          await sleep(100);
          let element_result = get_clickable_elements(true, null) as any;
          context.selector_map = element_result.selector_map;
          let screenshot = await browser.screenshot(true);
          remove_highlight();
          result = { image: screenshot.image, text: element_result.element_str };
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
      return { success: false, error: e?.message };
    }
  }

  destroy(context: ExecutionContext) {
    delete context.selector_map;
  }
}

function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}
