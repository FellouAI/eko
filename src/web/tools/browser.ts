import html2canvas from 'html2canvas';
import { ScreenshotResult } from '../../types/tools.types';

export function type(text: string, xpath?: string, highlightIndex?: number): boolean {
  return do_input(text, xpath, highlightIndex);
}

export function clear_input(xpath?: string, highlightIndex?: number): boolean {
  return do_input('', xpath, highlightIndex);
}

export function left_click(xpath?: string, highlightIndex?: number): boolean {
  return simulateMouseEvent(['mousedown', 'mouseup', 'click'], 0, xpath, highlightIndex);
}

export function right_click(xpath?: string, highlightIndex?: number): boolean {
  return simulateMouseEvent(['mousedown', 'mouseup', 'contextmenu'], 2, xpath, highlightIndex);
}

export function double_click(xpath?: string, highlightIndex?: number): boolean {
  return simulateMouseEvent(
    ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'],
    0,
    xpath,
    highlightIndex
  );
}

export async function screenshot(compress?: boolean): Promise<ScreenshotResult> {
  const [width, height] = size();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const canvas = await html2canvas(document.body, {
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    x: scrollX,
    y: scrollY,
    scrollX: -scrollX,
    scrollY: -scrollY,
    useCORS: true,
    foreignObjectRendering: true,
    // backgroundColor: 'white',
    // scale: window.devicePixelRatio || 1,
  });
  let dataUrl = canvas.toDataURL('image/png');
  if (compress) {
    dataUrl = await compress_image(dataUrl, 0.7, 0.8);
  }
  let data = dataUrl.substring(dataUrl.indexOf('base64,') + 7);
  return {
    image: {
      type: 'base64',
      media_type: dataUrl.indexOf('image/png') > -1 ? 'image/png' : 'image/jpeg',
      data: data,
    },
  };
}

export function compress_image(
  dataUrl: string,
  scale: number = 0.8,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d') as any;
      let width = img.width * scale;
      let height = img.height * scale;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function () {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

export function scroll_to(xpath?: string, highlightIndex?: number): boolean {
  let element = null;
  if (highlightIndex != null) {
    element = (window as any).get_highlight_element(highlightIndex);
  } else if (xpath) {
    element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as any;
  }
  if (!element) {
    return false;
  }
  element.scrollIntoView({
    behavior: 'smooth',
  });
  return true;
}

export function get_dropdown_options(
  xpath?: string,
  highlightIndex?: number
): {
  options: Array<{
    index: number;
    text: string;
    value?: string;
  }>;
  id?: string;
  name?: string;
} | null {
  let select = null;
  if (highlightIndex != null) {
    select = (window as any).get_highlight_element(highlightIndex);
  } else if (xpath) {
    select = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as any;
  }
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
}

export function select_dropdown_option(text: string, xpath?: string, highlightIndex?: number): any {
  let select = null;
  if (highlightIndex != null) {
    select = (window as any).get_highlight_element(highlightIndex);
  } else if (xpath) {
    select = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as any;
  }
  if (!select || select.tagName.toUpperCase() !== 'SELECT') {
    return { success: false, error: 'Select not found or invalid element type' };
  }
  const option = Array.from(select.options).find((opt: any) => opt.text.trim() === text) as any;
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
}

export function extractHtmlContent(): string {
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
}

export function size(): [number, number] {
  return [
    window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
    window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
  ];
}

function do_input(text: string, xpath?: string, highlightIndex?: number): boolean {
  let element = null;
  if (highlightIndex != null) {
    element = (window as any).get_highlight_element(highlightIndex);
  } else if (xpath) {
    element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as any;
  }
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
    if (input.value == undefined) {
      input.textContent = '';
    } else {
      input.value = '';
    }
  } else {
    if (input.value == undefined) {
      input.textContent += text;
    } else {
      input.value += text;
    }
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

function simulateMouseEvent(
  eventTypes: Array<string>,
  button: 0 | 1 | 2,
  xpath?: string,
  highlightIndex?: number
): boolean {
  let element = null;
  if (highlightIndex != null) {
    element = (window as any).get_highlight_element(highlightIndex);
  } else if (xpath) {
    element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as any;
  }
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
    console.log('simulateMouse', element, { xpath, eventTypes, button }, result);
  }
  return true;
}
