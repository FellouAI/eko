import { ScreenshotResult } from '../../types/tools.types';
import { getPageSize } from '../utils';
import { log } from '../../log';

export async function type(
  tabId: number,
  text: string,
  coordinate?: [number, number]
): Promise<any> {
  log.info('Sending type message to tab:', tabId, { text, coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(tabId)).coordinate;
    }
    await mouse_move(tabId, coordinate);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text,
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send type message:', e);
    throw e;
  }
}

export async function type_by(
  tabId: number,
  text: string,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending type message to tab:', tabId, { text, xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text,
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send type message:', e);
    throw e;
  }
}

export async function clear_input(tabId: number, coordinate?: [number, number]): Promise<any> {
  log.info('Sending clear_input message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(tabId)).coordinate;
    }
    await mouse_move(tabId, coordinate);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text: '',
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send clear_input message:', e);
    throw e;
  }
}

export async function clear_input_by(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending clear_input_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text: '',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send clear_input_by message:', e);
    throw e;
  }
}

export async function mouse_move(tabId: number, coordinate: [number, number]): Promise<any> {
  log.info('Sending mouse_move message to tab:', tabId, { coordinate });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:mouse_move',
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send mouse_move message:', e);
    throw e;
  }
}

export async function left_click(tabId: number, coordinate?: [number, number]): Promise<any> {
  log.info('Sending left_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(tabId)).coordinate;
    }
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:left_click',
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send left_click message:', e);
    throw e;
  }
}

export async function left_click_by(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending left_click_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:left_click',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send left_click_by message:', e);
    throw e;
  }
}

export async function right_click(tabId: number, coordinate?: [number, number]): Promise<any> {
  log.info('Sending right_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(tabId)).coordinate;
    }
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send right_click message:', e);
    throw e;
  }
}

export async function right_click_by(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending right_click_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send right_click_by message:', e); 
    throw e;
  }
}

export async function double_click(tabId: number, coordinate?: [number, number]): Promise<any> {
  log.info('Sending double_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(tabId)).coordinate;
    }
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send double_click message:', e);
    throw e;
  }
}

export async function double_click_by(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending double_click_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send double_click_by message:', e);
    throw e;
  }
}

export async function screenshot(windowId: number, compress?: boolean): Promise<ScreenshotResult> {
  log.info('Taking screenshot of window:', windowId, { compress });
  try {
    let dataUrl;
    if (compress) {
      dataUrl = await chrome.tabs.captureVisibleTab(windowId as number, {
        format: 'jpeg',
        quality: 60, // 0-100
      });
      dataUrl = await compress_image(dataUrl, 0.7, 1);
    } else {
      dataUrl = await chrome.tabs.captureVisibleTab(windowId as number, {
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
    log.info('Got screenshot result:', result);
    return result;
  } catch (e) {
    log.error('Failed to take screenshot:', e);
    throw e;
  }
}

export async function compress_image(
  dataUrl: string,
  scale: number = 0.8,
  quality: number = 0.8
): Promise<string> {
  log.info('Compressing image', { scale, quality });
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
        log.info('Got compressed image result:', result);
        resolve(result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    log.error('Failed to compress image:', e);
    throw e;
  }
}

export async function scroll_to(tabId: number, coordinate: [number, number]): Promise<any> {
  log.info('Sending scroll_to message to tab:', tabId, { coordinate });
  try {
    let from_coordinate = (await cursor_position(tabId)).coordinate;
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:scroll_to',
      from_coordinate,
      to_coordinate: coordinate,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send scroll_to message:', e);
    throw e;
  }
}

export async function scroll_to_by(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending scroll_to_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:scroll_to',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send scroll_to_by message:', e);
    throw e;
  }
}

export async function get_dropdown_options(
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending get_dropdown_options message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:get_dropdown_options',
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send get_dropdown_options message:', e);
    throw e;
  }
}

export async function select_dropdown_option(
  tabId: number,
  text: string,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  log.info('Sending select_dropdown_option message to tab:', tabId, { text, xpath, highlightIndex });
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:select_dropdown_option',
      text,
      xpath,
      highlightIndex,
    });
    log.info('Got response:', response);
    return response;
  } catch (e) {
    log.error('Failed to send select_dropdown_option message:', e);
    throw e;
  }
}

export async function cursor_position(tabId: number): Promise<{
  coordinate: [number, number];
}> {
  log.info('Sending cursor_position message to tab:', tabId);
  try {
    let result: any = await chrome.tabs.sendMessage(tabId, {
      type: 'computer:cursor_position',
    });
    log.info('Got cursor position:', result.coordinate);
    return { coordinate: result.coordinate as [number, number] };
  } catch (e) {
    log.error('Failed to send cursor_position message:', e);
    throw e;
  }
}

export async function size(tabId?: number): Promise<[number, number]> {
  log.info('Getting page size for tab:', tabId);
  try {
    const pageSize = await getPageSize(tabId);
    log.info('Got page size:', pageSize);
    return pageSize;
  } catch (e) {
    log.error('Failed to get page size:', e);
    throw e;
  }
}
