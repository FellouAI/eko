import { logger } from '@/common/log';
import { ScreenshotResult } from '../../types/tools.types';
import { getPageSize, getCurrentTabId } from '../utils';

function isFellouBrowser(chromeProxy: any): boolean {
  const result =  typeof chromeProxy.browseruse == 'object';
  logger.debug("isFellouBrowser", result);
  return result;
}

export async function type(
  chromeProxy: any,
  tabId: number,
  text: string,
  coordinate?: [number, number]
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending type message to tab:', tabId, { text, coordinate }, isFellou ? ' > fellou' : '');
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    await mouse_move(chromeProxy, tabId, coordinate);
    let response: any;
    if (isFellou) {
      let enter = false;
      if (text.endsWith('\n')) {
        enter = true;
        text = text.substring(0, text.length - 1);
      }
      response = await chromeProxy.browseruse.type(tabId, text);
      if (enter) {
        await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
      }
    } else {
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:type',
        text,
        coordinate,
      });
    }
    logger.debug('type Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send type message:', e);
    throw e;
  }
}

export async function type_by(
  chromeProxy: any,
  tabId: number,
  text: string,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending type_by message to tab:', tabId, { text, xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  try {
    let response: any;
    if (isFellou) {
      let enter = false;
      if (text.endsWith('\n')) {
        enter = true;
        text = text.substring(0, text.length - 1);
      }
      response = await chromeProxy.browseruse.handle.type(tabId, build_fellou_handle_js(xpath, highlightIndex), text);
      if (enter) {
        await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
      }
    } else {
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:type',
        text,
        xpath,
        highlightIndex,
      });
    }
    logger.debug('type_by Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send type message:', e);
    throw e;
  }
}

export async function enter_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending enter_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  try {
    let response: any;
    if (isFellou) {
      response = await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
    } else {
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:type',
        text: '\n',
        xpath,
        highlightIndex,
      });
    }
    logger.debug('enter_by Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send enter_by message:', e);
    throw e;
  }
}

export async function clear_input(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending clear_input message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    await mouse_move(chromeProxy, tabId, coordinate);
    let response: any;
    if (isFellou) {
      await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { count: 3 });
      response = await chromeProxy.browseruse.keyboard.press(tabId, 'Backspace');
    } else {
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:type',
        text: '',
        coordinate,
      });
    }
    logger.debug('clear_input Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send clear_input message:', e);
    throw e;
  }
}

export async function clear_input_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending clear_input_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  try {
    let response: any;
    if (isFellou) {
      await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { count: 3 });
      response = await chromeProxy.browseruse.keyboard.press(tabId, 'Backspace');
    } else {
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:type',
        text: '',
        xpath,
        highlightIndex,
      });
    }
    logger.debug('clear_input_by Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send clear_input_by message:', e);
    throw e;
  }
}

export async function mouse_move(chromeProxy: any, tabId: number, coordinate: [number, number]): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending mouse_move message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.mouse.move(tabId, coordinate[0], coordinate[1]);
  } else {
    response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:mouse_move',
      coordinate,
    });
  }
  logger.debug('mouse_move Got response:', response);
  return response;
}

export async function left_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending left_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
  if (!coordinate) {
    coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
  }
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1]);
  } else {
    response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:left_click',
      coordinate,
    });
  }
  logger.debug('left_click Got response:', response);
  return response;
}

export async function left_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending left_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex));
  } else {
    response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:left_click',
      xpath,
      highlightIndex,
    });
  }
  logger.debug('left_click_by Got response:', response);
  return response;
}

export async function right_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending right_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
  if (!coordinate) {
    coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
  }
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { button: 'right' });
  } else {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      coordinate,
    });
  }
  logger.debug('right_click Got response:', response);
  return response;
}

export async function right_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending right_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { button: 'right' });
  } else {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      xpath,
      highlightIndex,
    });
  }
  logger.debug('right_click_by Got response:', response);
  return response;
}

export async function double_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending double_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
  if (!coordinate) {
    coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
  }
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { count: 2 });
  } else {
    response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      coordinate,
    });
  }
  logger.debug('double_click Got response:', response);
  return response;
}

export async function double_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  const isFellou = isFellouBrowser(chromeProxy);
  logger.debug('Sending double_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
  let response: any;
  if (isFellou) {
    response = await chromeProxy.browseruse.mouse.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { count: 2 });
  } else {
    response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      xpath,
      highlightIndex,
    });
  }
  logger.debug('double_click_by Got response:', response);
  return response;
}

export async function screenshot(chromeProxy: any, windowId: number, compress?: boolean): Promise<ScreenshotResult> {
  logger.debug('Taking screenshot of window:', windowId, { compress });
  try {
    let dataUrl;
    if (compress) {
      dataUrl = await chromeProxy.tabs.captureVisibleTab(windowId as number, {
        format: 'jpeg',
        quality: 60, // 0-100
      });
      dataUrl = await compress_image(dataUrl, 0.7, 1);
    } else {
      dataUrl = await chromeProxy.tabs.captureVisibleTab(windowId as number, {
        format: 'jpeg',
        quality: 50,
      });
    }
    let data = dataUrl.substring(dataUrl.indexOf('base64,') + 7);
    const result = {
      image: {
        type: 'base64',
        media_type: dataUrl.indexOf('image/png') > -1 ? 'image/png' : 'image/jpeg',
        data: data,
      },
    } as ScreenshotResult;
    logger.debug('screenshot Got screenshot result:', result);
    return result;
  } catch (e) {
    if (isFellouBrowser(chromeProxy)) {
      logger.debug('Failed to take screenshot, try fellou...');
      const tabId = await getCurrentTabId(chromeProxy, windowId)
      const base64 = await chromeProxy.browseruse.screenshot(tabId, {
        type: 'jpeg',
        quality: 60,
        encoding: 'base64',
      })
      const result = {
        image: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64,
        },
      } as ScreenshotResult;
      logger.debug('screenshot Got screenshot result, try fellou:', result);
      return result;
    }
    logger.error('Failed to take screenshot:', e);
    throw e;
  }
}

export async function compress_image(
  dataUrl: string,
  scale: number = 0.8,
  quality: number = 0.8
): Promise<string> {
  logger.debug('Compressing image', { scale, quality });
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    let width = bitmap.width * scale;
    let height = bitmap.height * scale;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as any;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality,
    });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        logger.debug('Got compressed image result:', result);
        resolve(result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    logger.error('Failed to compress image:', e);
    return dataUrl;
  }
}

export async function scroll_to(chromeProxy: any, tabId: number, coordinate: [number, number]): Promise<any> {
  logger.debug('Sending scroll_to message to tab:', tabId, { coordinate });
  let from_coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
  const response = await chromeProxy.tabs.sendMessage(tabId, {
    type: 'computer:scroll_to',
    from_coordinate,
    to_coordinate: coordinate,
  });
  logger.debug('scroll_to Got response:', response);
  return response;
}

export async function scroll_to_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  logger.debug('Sending scroll_to_by message to tab:', tabId, { xpath, highlightIndex });
  const response = await chromeProxy.tabs.sendMessage(tabId, {
    type: 'computer:scroll_to',
    xpath,
    highlightIndex,
  });
  logger.debug('scroll_to_by Got response:', response);
  return response;
}

export async function get_dropdown_options(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  logger.debug('Sending get_dropdown_options message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:get_dropdown_options',
      xpath,
      highlightIndex,
    });
    logger.debug('get_dropdown_options Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send get_dropdown_options message:', e);
    throw e;
  }
}

export async function select_dropdown_option(
  chromeProxy: any,
  tabId: number,
  text: string,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  logger.debug('Sending select_dropdown_option message to tab:', tabId, { text, xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:select_dropdown_option',
      text,
      xpath,
      highlightIndex,
    });
    logger.debug('select_dropdown_option Got response:', response);
    return response;
  } catch (e) {
    logger.error('Failed to send select_dropdown_option message:', e);
    throw e;
  }
}

export async function cursor_position(chromeProxy: any, tabId: number): Promise<{
  coordinate: [number, number];
}> {
  logger.debug('Sending cursor_position message to tab:', tabId);
  try {
    let result: any = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:cursor_position',
    });
    logger.debug('Got cursor position:', result.coordinate);
    return { coordinate: result.coordinate as [number, number] };
  } catch (e) {
    logger.error('Failed to send cursor_position message:', e);
    throw e;
  }
}

export async function size(chromeProxy: any, tabId?: number): Promise<[number, number]> {
  logger.debug('Getting page size for tab:', tabId);
  try {
    const pageSize = await getPageSize(chromeProxy, tabId);
    logger.debug('Got page size:', pageSize);
    return pageSize;
  } catch (e) {
    logger.error('Failed to get page size:', e);
    throw e;
  }
}

function build_fellou_handle_js(xpath?: string, highlightIndex?: number): string {
  if (highlightIndex != undefined) {
    return `get_highlight_element(${highlightIndex})`;
  } else {
    return `document.evaluate('${xpath}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`;
  }
}