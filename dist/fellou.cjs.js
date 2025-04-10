'use strict';

async function can_use_computer() {
    try {
        await size();
        return true;
    }
    catch (e) {
        return false;
    }
}
async function key(key, coordinate) {
    if (coordinate) {
        await mouse_move(coordinate);
    }
    let mapping = {
        space: ' ',
        return: 'enter',
        page_up: 'pageup',
        page_down: 'pagedown',
        back_space: 'backspace',
    };
    let keys = key.replace(/\s+/g, ' ').split(' ');
    let success = false;
    for (let i = 0; i < keys.length; i++) {
        let _key = keys[i];
        if (_key.indexOf('+') > -1) {
            let mapped_keys = _key
                .split('+')
                .map((k) => mapping[k] || k)
                .reverse();
            success = (await runComputeruseCommand('keyTap', mapped_keys)).success;
        }
        else {
            let mapped_key = mapping[_key] || _key;
            success = (await runComputeruseCommand('keyTap', [mapped_key])).success;
        }
        await new Promise((resolve) => setTimeout(() => resolve(), 100));
    }
    return success;
}
async function type(text, coordinate) {
    if (coordinate) {
        await mouse_move(coordinate);
    }
    return (await runComputeruseCommand('typeString', [text])).success;
}
async function mouse_move(coordinate) {
    return (await runComputeruseCommand('move', coordinate)).success;
}
async function left_click(coordinate) {
    if (coordinate && coordinate.length > 0) {
        await mouse_move(coordinate);
    }
    return (await runComputeruseCommand('click', ['left'])).success;
}
async function left_click_drag(coordinate) {
    return (await runComputeruseCommand('dragSmooth', coordinate)).success;
}
async function right_click(coordinate) {
    if (coordinate && coordinate.length > 0) {
        await mouse_move(coordinate);
    }
    return (await runComputeruseCommand('click', ['right'])).success;
}
async function double_click(coordinate) {
    if (coordinate && coordinate.length > 0) {
        await mouse_move(coordinate);
    }
    return (await runComputeruseCommand('click', ['left', true])).success;
}
async function screenshot(windowId) {
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
async function cursor_position() {
    let response = await runComputeruseCommand('mouseLocation');
    return { coordinate: [response.data.x, response.data.y] };
}
async function size() {
    let response = await runComputeruseCommand('getScreenSize');
    return [response.data.width, response.data.height];
}
async function scroll(coordinate) {
    return (await runComputeruseCommand('scrollTo', coordinate)).success;
}
async function runComputeruseCommand(func, args) {
    let result = (await window.fellou.ai.computeruse.runCommand({
        func,
        args,
    }));
    if (result.error) {
        // error: 'permission-error'
        throw new Error(result.error);
    }
    return result;
}

var computer = /*#__PURE__*/Object.freeze({
    __proto__: null,
    can_use_computer: can_use_computer,
    cursor_position: cursor_position,
    double_click: double_click,
    key: key,
    left_click: left_click,
    left_click_drag: left_click_drag,
    mouse_move: mouse_move,
    right_click: right_click,
    screenshot: screenshot,
    scroll: scroll,
    size: size,
    type: type
});

/**
 * Computer Use for fellou
 */
class ComputerUse {
    constructor() {
        this.name = 'computer_use';
        this.description = `Use a mouse and keyboard to interact with a computer, and take screenshots.
* This is a browser GUI interface where you do not have access to the address bar or bookmarks. You must operate the browser using inputs like screenshots, mouse, keyboard, etc.
* Some operations may take time to process, so you may need to wait and take successive screenshots to see the results of your actions. E.g. if you clicked submit button, but it didn't work, try taking another screenshot.
* Whenever you intend to move the cursor to click on an element, you should consult a screenshot to determine the coordinates of the element before moving the cursor.
* If you tried clicking on a button or link but it failed to load, even after waiting, try adjusting your cursor position so that the tip of the cursor visually falls on the element that you want to click.
* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element.`;
        this.input_schema = {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description: `The action to perform. The available actions are:
* \`key\`: Press a key or key-combination on the keyboard.
- This supports robotgo hotkey syntax.
- Multiple keys are combined using the "+" symbol.
- Examples: "a", "enter", "ctrl+s", "command+shift+a", "num0".
* \`type\`: Type a string of text on the keyboard.
* \`cursor_position\`: Get the current (x, y) pixel coordinate of the cursor on the screen.
* \`mouse_move\`: Move the cursor to a specified (x, y) pixel coordinate on the screen.
* \`left_click\`: Click the left mouse button.
* \`left_click_drag\`: Click and drag the cursor to a specified (x, y) pixel coordinate on the screen.
* \`right_click\`: Click the right mouse button.
* \`double_click\`: Double-click the left mouse button.
* \`screenshot\`: Take a screenshot of the screen.
* \`scroll\`: Scroll to the specified (x, y) pixel coordinates on the screen.`,
                    enum: [
                        'key',
                        'type',
                        'mouse_move',
                        'left_click',
                        'left_click_drag',
                        'right_click',
                        'double_click',
                        'screenshot',
                        'cursor_position',
                        'scroll',
                    ],
                },
                coordinate: {
                    type: 'array',
                    description: '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to.',
                },
                text: {
                    type: 'string',
                    description: 'Required only by `action=type` and `action=key`',
                },
            },
            required: ['action'],
        };
    }
    /**
     * computer
     *
     * @param {*} params { action: 'mouse_move', coordinate: [100, 200] }
     * @returns { success: true, coordinate?: [], image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' } }
     */
    async execute(context, params) {
        if (params === null || !params.action) {
            throw new Error('Invalid parameters. Expected an object with a "action" property.');
        }
        let result;
        switch (params.action) {
            case 'key':
                result = await key(params.text, params.coordinate);
                break;
            case 'type':
                result = await type(params.text, params.coordinate);
                break;
            case 'mouse_move':
                result = await mouse_move(params.coordinate);
                break;
            case 'left_click':
                result = await left_click(params.coordinate);
                break;
            case 'left_click_drag':
                result = await left_click_drag(params.coordinate);
                break;
            case 'right_click':
                result = await right_click(params.coordinate);
                break;
            case 'double_click':
                result = await double_click(params.coordinate);
                break;
            case 'screenshot':
                result = await screenshot();
                break;
            case 'cursor_position':
                result = await cursor_position();
                break;
            case 'scroll':
                result = await scroll(params.coordinate);
                break;
            default:
                throw Error(`Invalid parameters. The "${params.action}" value is not included in the "action" enumeration.`);
        }
        if (typeof result == 'boolean') {
            return { success: result };
        }
        else {
            return { success: true, ...result };
        }
    }
}

const fellou = {
    computer,
};

exports.ComputerUse = ComputerUse;
exports.fellou = fellou;
