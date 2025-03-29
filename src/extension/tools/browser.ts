import { ScreenshotResult } from '../../types/tools.types';
import { getPageSize, sleep } from '../utils';

export async function type(
  chromeProxy: any,
  tabId: number,
  text: string,
  coordinate?: [number, number]
): Promise<any> {
  console.log('Sending type message to tab:', tabId, { text, coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    await mouse_move(chromeProxy, tabId, coordinate);
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text,
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send type message:', e);
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
  console.log('Sending type message to tab:', tabId, { text, xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text,
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send type message:', e);
    throw e;
  }
}

export async function clear_input(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  console.log('Sending clear_input message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    await mouse_move(chromeProxy, tabId, coordinate);
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text: '',
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send clear_input message:', e);
    throw e;
  }
}

export async function clear_input_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending clear_input_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:type',
      text: '',
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send clear_input_by message:', e);
    throw e;
  }
}

export async function mouse_move(chromeProxy: any, tabId: number, coordinate: [number, number]): Promise<any> {
  console.log('Sending mouse_move message to tab:', tabId, { coordinate });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:mouse_move',
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send mouse_move message:', e);
    throw e;
  }
}

export async function left_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  console.log('Sending left_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:left_click',
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send left_click message:', e);
    throw e;
  }
}

export async function left_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending left_click_by message to tab:', tabId, { xpath, highlightIndex });
  let tries = 3;
  for (let retry_counter = 0; retry_counter <= tries; retry_counter++) {
    console.log("retry_counter: " + retry_counter);
    let response: any;
    try {
      await sleep(1000);
      response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:left_click',
        xpath,
        highlightIndex,
      });
    } catch (e) {
      console.error(e);
      continue;
    }
    console.log('Got response:', response);
    if (response === true) {
      return response;
    } else {
      console.warn("invalid response:", response);
      continue;
    }
  }
  let msg = "Failed to send left_click_by message, please retry";
  console.error(msg);
  throw Error(msg);
}

export async function right_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  console.log('Sending right_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send right_click message:', e);
    throw e;
  }
}

export async function right_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending right_click_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:right_click',
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send right_click_by message:', e);
    throw e;
  }
}

export async function double_click(chromeProxy: any, tabId: number, coordinate?: [number, number]): Promise<any> {
  console.log('Sending double_click message to tab:', tabId, { coordinate });
  try {
    if (!coordinate) {
      coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send double_click message:', e);
    throw e;
  }
}

export async function double_click_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending double_click_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:double_click',
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send double_click_by message:', e);
    throw e;
  }
}

export async function screenshot(chromeProxy: any, windowId: number, compress?: boolean): Promise<ScreenshotResult> {
  console.log('Taking screenshot of window:', windowId, { compress });
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
    console.log('Got screenshot result:', result);
    return result;
  } catch (e) {
    console.error('Failed to take screenshot:', e);
    throw e;
  }
}

export async function compress_image(
  dataUrl: string,
  scale: number = 0.8,
  quality: number = 0.8
): Promise<string> {
  console.log('Compressing image', { scale, quality });
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
        console.log('Got compressed image result:', result);
        resolve(result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to compress image:', e);
    throw e;
  }
}

export async function scroll_to(chromeProxy: any, tabId: number, coordinate: [number, number]): Promise<any> {
  console.log('Sending scroll_to message to tab:', tabId, { coordinate });
  try {
    let from_coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:scroll_to',
      from_coordinate,
      to_coordinate: coordinate,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send scroll_to message:', e);
    throw e;
  }
}

export async function scroll_to_by(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending scroll_to_by message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:scroll_to',
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send scroll_to_by message:', e);
    throw e;
  }
}

export async function get_dropdown_options(
  chromeProxy: any,
  tabId: number,
  xpath?: string,
  highlightIndex?: number
): Promise<any> {
  console.log('Sending get_dropdown_options message to tab:', tabId, { xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:get_dropdown_options',
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send get_dropdown_options message:', e);
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
  console.log('Sending select_dropdown_option message to tab:', tabId, { text, xpath, highlightIndex });
  try {
    const response = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:select_dropdown_option',
      text,
      xpath,
      highlightIndex,
    });
    console.log('Got response:', response);
    return response;
  } catch (e) {
    console.error('Failed to send select_dropdown_option message:', e);
    throw e;
  }
}

export async function cursor_position(chromeProxy: any, tabId: number): Promise<{
  coordinate: [number, number];
}> {
  console.log('Sending cursor_position message to tab:', tabId);
  try {
    let result: any = await chromeProxy.tabs.sendMessage(tabId, {
      type: 'computer:cursor_position',
    });
    console.log('Got cursor position:', result.coordinate);
    return { coordinate: result.coordinate as [number, number] };
  } catch (e) {
    console.error('Failed to send cursor_position message:', e);
    throw e;
  }
}

export async function size(chromeProxy: any, tabId?: number): Promise<[number, number]> {
  console.log('Getting page size for tab:', tabId);
  try {
    const pageSize = await getPageSize(chromeProxy, tabId);
    console.log('Got page size:', pageSize);
    return pageSize;
  } catch (e) {
    console.error('Failed to get page size:', e);
    throw e;
  }
}
