import { BrowserActionParam, BrowserActionResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getWindowId, getTabId, sleep, injectScript, executeScript } from '../utils';
import * as browser from './browser';
import { ToolReturnsScreenshot } from './tool_returns_screenshot';
import { logger } from '@/common/log';

/**
 * Browser Use for general
 */
export class BrowserAction extends ToolReturnsScreenshot<BrowserActionParam> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    super();
    this.name = 'browser_action';
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
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_content' instead.
* \`input_text\`: Enter a string in the interactive element, If you need to press the Enter key, please end with '\\n'. For search tasks, you MUST end with '\\n' to simulate pressing the Enter key.
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
  async realExecute(context: ExecutionContext, params: BrowserActionParam): Promise<BrowserActionResult> {
    logger.debug("debug 'browser_action'...");
    logger.debug(params);
    try {
      if (params === null || !params.action) {
        throw new Error('Invalid parameters. Expected an object with a "action" property.');
      }
      let tabId: number;
      try {
        tabId = await getTabId(context);
        logger.debug(tabId);
        if (!tabId || !Number.isInteger(tabId)) {
          throw new Error('Could not get valid tab ID');
        }
      } catch (e) {
        logger.error('Tab ID error:', e);
        return { success: false, error: 'Could not access browser tab' };
      }
      let windowId = await getWindowId(context);
      let selector_map = context.selector_map;
      let selector_xpath;
      if (params.index != null && selector_map) {
        selector_xpath = selector_map[params.index]?.xpath;
        if (!selector_xpath) {
          throw new Error('Element does not exist');
        }
      }
      let result;
      logger.debug("switch cases...");
      switch (params.action) {
        case 'input_text':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          await browser.clear_input_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          result = await browser.type_by(context.ekoConfig.chromeProxy, tabId, params.text, selector_xpath, params.index);
          await sleep(200);
          break;
        case 'click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.left_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'right_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.right_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'double_click':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.double_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'scroll_to':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.scroll_to_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          await sleep(500);
          break;
        case 'extract_content':
          let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
          await injectScript(context.ekoConfig.chromeProxy, tabId);
          await sleep(200);
          let content = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
            return eko.extractHtmlContent();
          }, []);
          result = {
            title: tab.title,
            url: tab.url,
            content: content,
          };
          break;
        case 'get_dropdown_options':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          result = await browser.get_dropdown_options(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
          break;
        case 'select_dropdown_option':
          if (params.index == null) {
            throw new Error('index parameter is required');
          }
          if (params.text == null) {
            throw new Error('text parameter is required');
          }
          result = await browser.select_dropdown_option(
            context.ekoConfig.chromeProxy, 
            tabId,
            params.text,
            selector_xpath,
            params.index
          );
          break;
        case 'screenshot_extract_element':
          logger.debug("execute 'screenshot_extract_element'...");
          await sleep(100);
          logger.debug("injectScript...");
          await injectScript(context.ekoConfig.chromeProxy, tabId, 'build_dom_tree.js');
          await sleep(100);
          try {
            logger.debug("executeScript...");
            let element_result = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
              return (window as any).get_clickable_elements(true);
            }, []);
            context.selector_map = element_result.selector_map;
            logger.debug("browser.screenshot...");
            let screenshot = await browser.screenshot(context.ekoConfig.chromeProxy, windowId, true);
            result = { image: screenshot.image, text: element_result.element_str };
          } finally {
            await sleep(500);
            logger.debug("executeScript #2...");
            await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
              return (window as any).remove_highlight();
            }, []);
          }
          logger.debug("execute 'screenshot_extract_element'...done");
          break;
        default:
          throw Error(
            `Invalid parameters. The "${params.action}" value is not included in the "action" enumeration.`
          );
      }
      logger.debug(`execute 'browser_action'...done, result=${result}`);
      return result
    } catch (e: any) {
      logger.error('Browser use error:', e);
      return { success: false, error: e?.message };
    }
  }

  destroy(context: ExecutionContext) {
    delete context.selector_map;
  }
}
