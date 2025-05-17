export async function can_use_computer(): Promise<boolean> {
  try {
    await size();
    return true;
  } catch (e) {
    return false;
  }
}

export async function key(key: string, coordinate?: [number, number]): Promise<boolean> {
  if (coordinate) {
    await mouse_move(coordinate);
  }
  let mapping: { [key: string]: string } = {
    space: ' ',
    return: 'enter',
    page_up: 'pageup',
    page_down: 'pagedown',
    back_space: 'backspace',
  };
  let keys = key.replace(/\s+/g, ' ').split(' ');
  let success: boolean = false;
  for (let i = 0; i < keys.length; i++) {
    let _key = keys[i];
    if (_key.indexOf('+') > -1) {
      let mapped_keys = _key
        .split('+')
        .map((k) => mapping[k] || k)
        .reverse();
      success = (await runComputeruseCommand('keyTap', mapped_keys)).success;
    } else {
      let mapped_key = mapping[_key] || _key;
      success = (await runComputeruseCommand('keyTap', [mapped_key])).success;
    }
    await new Promise((resolve: any) => setTimeout(() => resolve(), 100));
  }
  return success;
}

export async function type(text: string, coordinate?: [number, number]): Promise<boolean> {
  if (coordinate) {
    await mouse_move(coordinate);
  }
  return (await runComputeruseCommand('typeString', [text])).success;
}

export async function mouse_move(coordinate: [number, number]): Promise<boolean> {
  return (await runComputeruseCommand('move', coordinate)).success;
}

export async function left_click(coordinate?: [number, number]): Promise<boolean> {
  if (coordinate && coordinate.length > 0) {
    await mouse_move(coordinate);
  }
  return (await runComputeruseCommand('click', ['left'])).success;
}

export async function left_click_drag(coordinate: [number, number]): Promise<boolean> {
  return (await runComputeruseCommand('dragSmooth', coordinate)).success;
}

export async function right_click(coordinate?: [number, number]): Promise<boolean> {
  if (coordinate && coordinate.length > 0) {
    await mouse_move(coordinate);
  }
  return (await runComputeruseCommand('click', ['right'])).success;
}

export async function double_click(coordinate?: [number, number]): Promise<boolean> {
  if (coordinate && coordinate.length > 0) {
    await mouse_move(coordinate);
  }
  return (await runComputeruseCommand('click', ['left', true])).success;
}

// 定义一个异步函数 `screenshot`，用于捕获当前屏幕的截图，返回截图的 Base64 编码。
export async function screenshot(windowId?: number): Promise<{
  image: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg';
    data: string;
  };
}> {
    // 调用 `runComputeruseCommand` 命令，获取全屏截图数据（返回的截图数据可能是 Base64 编码的）
  let screenshot = (await runComputeruseCommand('captureFullScreen')).data;
  let dataUrl = screenshot.startsWith('data:') ? screenshot : 'data:image/png;base64,' + screenshot;
  let data = dataUrl.substring(dataUrl.indexOf('base64,') + 7);
  return {
    image: {
      type: 'base64',
      media_type: dataUrl.indexOf('image/png') > -1 ? 'image/png' : 'image/jpeg',
      data: data,
    },
  };
}

export async function cursor_position(): Promise<{
  coordinate: [number, number];
}> {
  let response = await runComputeruseCommand('mouseLocation');
  return { coordinate: [response.data.x, response.data.y] };
}

// 定义一个异步函数 `size`，返回屏幕的宽度和高度
export async function size(): Promise<[number, number]> {
  let response = await runComputeruseCommand('getScreenSize');
  return [response.data.width, response.data.height];
}

// 定义一个异步函数 `scroll`，接受坐标数组 [x, y] 来控制滚动
export async function scroll(coordinate: [number, number]): Promise<boolean> {
  return (await runComputeruseCommand('scrollTo', coordinate)).success;
}

// 定义一个异步函数 `runComputeruseCommand`，用于发送命令并返回结果
async function runComputeruseCommand(
  func: string,
  args?: Array<any>
): Promise<{ success: boolean; data: any }> {
  let result = (await (window as any).fellou.ai.computeruse.runCommand({
    func,
    args,
  })) as any as { success: boolean; data: any; error?: string };
  if (result.error) {
    // error: 'permission-error'
    throw new Error(result.error);
  }
  return result;
}
