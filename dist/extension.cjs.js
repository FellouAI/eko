'use strict';

async function getWindowId(context) {
    let windowId = context.variables.get('windowId');
    if (windowId) {
        try {
            await chrome.windows.get(windowId);
        }
        catch (e) {
            windowId = null;
            context.variables.delete('windowId');
            let tabId = context.variables.get('tabId');
            if (tabId) {
                try {
                    let tab = await chrome.tabs.get(tabId);
                    windowId = tab.windowId;
                }
                catch (e) {
                    context.variables.delete('tabId');
                }
            }
        }
    }
    if (!windowId) {
        const window = await chrome.windows.getCurrent();
        windowId = window.id;
    }
    return windowId;
}
async function getTabId(context) {
    let tabId = context.variables.get('tabId');
    if (tabId) {
        try {
            await chrome.tabs.get(tabId);
        }
        catch (e) {
            tabId = null;
            context.variables.delete('tabId');
        }
    }
    if (!tabId) {
        let windowId = context.variables.get('windowId');
        if (windowId) {
            try {
                tabId = await getCurrentTabId(windowId);
            }
            catch (e) {
                tabId = await getCurrentTabId();
                context.variables.delete('windowId');
            }
        }
        else {
            tabId = await getCurrentTabId();
        }
        if (!tabId) {
            throw new Error('Could not find a valid tab');
        }
        context.variables.set('tabId', tabId);
    }
    return tabId;
}
function getCurrentTabId(windowId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ windowId, active: true, lastFocusedWindow: true }, function (tabs) {
            if (chrome.runtime.lastError) {
                console.error('Chrome runtime error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            if (tabs.length > 0) {
                resolve(tabs[0].id);
            }
            else {
                chrome.tabs.query({ windowId, active: true, currentWindow: true }, function (_tabs) {
                    if (_tabs.length > 0) {
                        resolve(_tabs[0].id);
                        return;
                    }
                    else {
                        chrome.tabs.query({ windowId, status: 'complete', currentWindow: true }, function (__tabs) {
                            resolve(__tabs.length ? __tabs[__tabs.length - 1].id : undefined);
                        });
                    }
                });
            }
        });
    });
}
async function open_new_tab(url, newWindow, windowId) {
    let tabId;
    if (newWindow) {
        let window = await chrome.windows.create({
            type: 'normal',
            state: 'maximized',
            url: url,
        });
        windowId = window.id;
        let tabs = window.tabs || [
            await chrome.tabs.create({
                url: url,
                windowId: windowId,
            }),
        ];
        tabId = tabs[0].id;
    }
    else {
        if (!windowId) {
            const window = await chrome.windows.getCurrent();
            windowId = window.id;
        }
        let tab = await chrome.tabs.create({
            url: url,
            windowId: windowId,
        });
        tabId = tab.id;
    }
    let tab = await waitForTabComplete(tabId);
    await sleep(200);
    return tab;
}
async function executeScript(tabId, func, args) {
    let frameResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: func,
        args: args,
    });
    return frameResults[0].result;
}
async function waitForTabComplete(tabId, timeout = 15000) {
    return new Promise(async (resolve, reject) => {
        let tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
            resolve(tab);
            return;
        }
        const time = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject();
        }, timeout);
        const listener = async (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(time);
                resolve(tab);
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}
async function doesTabExists(tabId) {
    const tabExists = await new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                resolve(false);
            }
            else {
                resolve(true);
            }
        });
    });
    return tabExists;
}
async function getPageSize(tabId) {
    if (!tabId) {
        tabId = await getCurrentTabId();
    }
    let injectionResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => [
            window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
            window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
        ],
    });
    return [injectionResult[0].result[0], injectionResult[0].result[1]];
}
function sleep(time) {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
}
async function injectScript(tabId, filename) {
    let files = ['eko/script/common.js'];
    if (filename) {
        files.push('eko/script/' + filename);
    }
    await chrome.scripting.executeScript({
        target: { tabId },
        files: files,
    });
}
class MsgEvent {
    constructor() {
        this.eventMap = {};
    }
    addListener(callback, id) {
        if (!id) {
            id = new Date().getTime() + '' + Math.floor(Math.random() * 10000);
        }
        this.eventMap[id] = callback;
        return id;
    }
    removeListener(id) {
        delete this.eventMap[id];
    }
    async publish(msg) {
        let values = Object.values(this.eventMap);
        for (let i = 0; i < values.length; i++) {
            try {
                let result = values[i](msg);
                if (isPromise(result)) {
                    await result;
                }
            }
            catch (e) {
                console.error(e);
            }
        }
    }
}
/**
 * Counter (Function: Wait for all asynchronous tasks to complete)
 */
class CountDownLatch {
    constructor(count) {
        this.resolve = undefined;
        this.currentCount = count;
    }
    countDown() {
        this.currentCount = this.currentCount - 1;
        if (this.currentCount <= 0) {
            this.resolve && this.resolve();
        }
    }
    await(timeout) {
        const $this = this;
        return new Promise((_resolve, reject) => {
            let resolve = _resolve;
            if (timeout > 0) {
                let timeId = setTimeout(reject, timeout);
                resolve = () => {
                    clearTimeout(timeId);
                    _resolve();
                };
            }
            $this.resolve = resolve;
            if ($this.currentCount <= 0) {
                resolve();
            }
        });
    }
}
function isPromise(obj) {
    return (!!obj &&
        (typeof obj === 'object' || typeof obj === 'function') &&
        typeof obj.then === 'function');
}

var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    CountDownLatch: CountDownLatch,
    MsgEvent: MsgEvent,
    doesTabExists: doesTabExists,
    executeScript: executeScript,
    getCurrentTabId: getCurrentTabId,
    getPageSize: getPageSize,
    getTabId: getTabId,
    getWindowId: getWindowId,
    injectScript: injectScript,
    isPromise: isPromise,
    open_new_tab: open_new_tab,
    sleep: sleep,
    waitForTabComplete: waitForTabComplete
});

async function type(tabId, text, coordinate) {
    console.log('Sending type message to tab:', tabId, { text, coordinate });
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
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send type message:', e);
        throw e;
    }
}
async function type_by(tabId, text, xpath, highlightIndex) {
    console.log('Sending type message to tab:', tabId, { text, xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:type',
            text,
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send type message:', e);
        throw e;
    }
}
async function clear_input(tabId, coordinate) {
    console.log('Sending clear_input message to tab:', tabId, { coordinate });
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
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send clear_input message:', e);
        throw e;
    }
}
async function clear_input_by(tabId, xpath, highlightIndex) {
    console.log('Sending clear_input_by message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:type',
            text: '',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send clear_input_by message:', e);
        throw e;
    }
}
async function mouse_move(tabId, coordinate) {
    console.log('Sending mouse_move message to tab:', tabId, { coordinate });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:mouse_move',
            coordinate,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send mouse_move message:', e);
        throw e;
    }
}
async function left_click(tabId, coordinate) {
    console.log('Sending left_click message to tab:', tabId, { coordinate });
    try {
        if (!coordinate) {
            coordinate = (await cursor_position(tabId)).coordinate;
        }
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:left_click',
            coordinate,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send left_click message:', e);
        throw e;
    }
}
async function left_click_by(tabId, xpath, highlightIndex) {
    console.log('Sending left_click_by message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:left_click',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send left_click_by message:', e);
        throw e;
    }
}
async function right_click(tabId, coordinate) {
    console.log('Sending right_click message to tab:', tabId, { coordinate });
    try {
        if (!coordinate) {
            coordinate = (await cursor_position(tabId)).coordinate;
        }
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:right_click',
            coordinate,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send right_click message:', e);
        throw e;
    }
}
async function right_click_by(tabId, xpath, highlightIndex) {
    console.log('Sending right_click_by message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:right_click',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send right_click_by message:', e);
        throw e;
    }
}
async function double_click(tabId, coordinate) {
    console.log('Sending double_click message to tab:', tabId, { coordinate });
    try {
        if (!coordinate) {
            coordinate = (await cursor_position(tabId)).coordinate;
        }
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:double_click',
            coordinate,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send double_click message:', e);
        throw e;
    }
}
async function double_click_by(tabId, xpath, highlightIndex) {
    console.log('Sending double_click_by message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:double_click',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send double_click_by message:', e);
        throw e;
    }
}
async function screenshot(windowId, compress) {
    console.log('Taking screenshot of window:', windowId, { compress });
    try {
        let dataUrl;
        if (compress) {
            dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
                format: 'jpeg',
                quality: 60, // 0-100
            });
            dataUrl = await compress_image(dataUrl, 0.7, 1);
        }
        else {
            dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
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
        };
        console.log('Got screenshot result:', result);
        return result;
    }
    catch (e) {
        console.error('Failed to take screenshot:', e);
        throw e;
    }
}
async function compress_image(dataUrl, scale = 0.8, quality = 0.8) {
    console.log('Compressing image', { scale, quality });
    try {
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
        let width = bitmap.width * scale;
        let height = bitmap.height * scale;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality,
        });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                console.log('Got compressed image result:', result);
                resolve(result);
            };
            reader.readAsDataURL(blob);
        });
    }
    catch (e) {
        console.error('Failed to compress image:', e);
        throw e;
    }
}
async function scroll_to(tabId, coordinate) {
    console.log('Sending scroll_to message to tab:', tabId, { coordinate });
    try {
        let from_coordinate = (await cursor_position(tabId)).coordinate;
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:scroll_to',
            from_coordinate,
            to_coordinate: coordinate,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send scroll_to message:', e);
        throw e;
    }
}
async function scroll_to_by(tabId, xpath, highlightIndex) {
    console.log('Sending scroll_to_by message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:scroll_to',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send scroll_to_by message:', e);
        throw e;
    }
}
async function get_dropdown_options(tabId, xpath, highlightIndex) {
    console.log('Sending get_dropdown_options message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:get_dropdown_options',
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send get_dropdown_options message:', e);
        throw e;
    }
}
async function select_dropdown_option(tabId, text, xpath, highlightIndex) {
    console.log('Sending select_dropdown_option message to tab:', tabId, { text, xpath, highlightIndex });
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:select_dropdown_option',
            text,
            xpath,
            highlightIndex,
        });
        console.log('Got response:', response);
        return response;
    }
    catch (e) {
        console.error('Failed to send select_dropdown_option message:', e);
        throw e;
    }
}
async function cursor_position(tabId) {
    console.log('Sending cursor_position message to tab:', tabId);
    try {
        let result = await chrome.tabs.sendMessage(tabId, {
            type: 'computer:cursor_position',
        });
        console.log('Got cursor position:', result.coordinate);
        return { coordinate: result.coordinate };
    }
    catch (e) {
        console.error('Failed to send cursor_position message:', e);
        throw e;
    }
}
async function size(tabId) {
    console.log('Getting page size for tab:', tabId);
    try {
        const pageSize = await getPageSize(tabId);
        console.log('Got page size:', pageSize);
        return pageSize;
    }
    catch (e) {
        console.error('Failed to get page size:', e);
        throw e;
    }
}

var browser = /*#__PURE__*/Object.freeze({
    __proto__: null,
    clear_input: clear_input,
    clear_input_by: clear_input_by,
    compress_image: compress_image,
    cursor_position: cursor_position,
    double_click: double_click,
    double_click_by: double_click_by,
    get_dropdown_options: get_dropdown_options,
    left_click: left_click,
    left_click_by: left_click_by,
    mouse_move: mouse_move,
    right_click: right_click,
    right_click_by: right_click_by,
    screenshot: screenshot,
    scroll_to: scroll_to,
    scroll_to_by: scroll_to_by,
    select_dropdown_option: select_dropdown_option,
    size: size,
    type: type,
    type_by: type_by
});

/**
 * Browser Use for general
 */
class BrowserUse {
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
                    description: 'index of element, Operation elements must pass the corresponding index of the element',
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
    async execute(context, params) {
        var _a;
        try {
            if (params === null || !params.action) {
                throw new Error('Invalid parameters. Expected an object with a "action" property.');
            }
            let tabId;
            try {
                tabId = await getTabId(context);
                if (!tabId || !Number.isInteger(tabId)) {
                    throw new Error('Could not get valid tab ID');
                }
            }
            catch (e) {
                console.error('Tab ID error:', e);
                return { success: false, error: 'Could not access browser tab' };
            }
            let windowId = await getWindowId(context);
            let selector_map = context.selector_map;
            let selector_xpath;
            if (params.index != null && selector_map) {
                selector_xpath = (_a = selector_map[params.index]) === null || _a === void 0 ? void 0 : _a.xpath;
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
                    await clear_input_by(tabId, selector_xpath, params.index);
                    result = await type_by(tabId, params.text, selector_xpath, params.index);
                    await sleep(200);
                    break;
                case 'click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await left_click_by(tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'right_click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await right_click_by(tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'double_click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await double_click_by(tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'scroll_to':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await scroll_to_by(tabId, selector_xpath, params.index);
                    await sleep(500);
                    break;
                case 'extract_content':
                    let tab = await chrome.tabs.get(tabId);
                    await injectScript(tabId);
                    await sleep(200);
                    let content = await executeScript(tabId, () => {
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
                    result = await get_dropdown_options(tabId, selector_xpath, params.index);
                    break;
                case 'select_dropdown_option':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    if (params.text == null) {
                        throw new Error('text parameter is required');
                    }
                    result = await select_dropdown_option(tabId, params.text, selector_xpath, params.index);
                    break;
                case 'screenshot_extract_element':
                    await sleep(100);
                    await injectScript(tabId, 'build_dom_tree.js');
                    await sleep(100);
                    let element_result = await executeScript(tabId, () => {
                        return window.get_clickable_elements(true);
                    }, []);
                    context.selector_map = element_result.selector_map;
                    let screenshot$1 = await screenshot(windowId, true);
                    await executeScript(tabId, () => {
                        return window.remove_highlight();
                    }, []);
                    result = { image: screenshot$1.image, text: element_result.element_str };
                    break;
                default:
                    throw Error(`Invalid parameters. The "${params.action}" value is not included in the "action" enumeration.`);
            }
            if (result) {
                return { success: true, ...result };
            }
            else {
                return { success: false };
            }
        }
        catch (e) {
            console.error('Browser use error:', e);
            return { success: false, error: e === null || e === void 0 ? void 0 : e.message };
        }
    }
    destroy(context) {
        delete context.selector_map;
    }
}

function exportFile(filename, type, content) {
    const blob = new Blob([content], { type: type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}
/**
 * Extract the elements related to html operability and wrap them into pseudo-html code.
 */
function extractOperableElements() {
    // visible
    const isElementVisible = (element) => {
        const style = window.getComputedStyle(element);
        return (style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0);
    };
    // element original index
    const getElementIndex = (element) => {
        const xpath = document.evaluate('preceding::*', element, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return xpath.snapshotLength;
    };
    // exclude
    const addExclude = (excludes, children) => {
        for (let i = 0; i < children.length; i++) {
            excludes.push(children[i]);
            if (children[i].children) {
                addExclude(excludes, children[i].children);
            }
        }
    };
    // { pseudoId: element }
    let elementMap = {};
    let nextId = 1;
    let elements = [];
    let excludes = [];
    // operable element
    const operableSelectors = 'a, button, input, textarea, select';
    document.querySelectorAll(operableSelectors).forEach((element) => {
        if (isElementVisible(element) && excludes.indexOf(element) == -1) {
            const id = nextId++;
            elementMap[id.toString()] = element;
            const tagName = element.tagName.toLowerCase();
            const attributes = Array.from(element.attributes)
                .filter((attr) => ['id', 'name', 'type', 'value', 'href', 'title', 'placeholder'].includes(attr.name))
                .map((attr) => `${attr.name == 'id' ? 'target' : attr.name}="${attr.value}"`)
                .join(' ');
            elements.push({
                originalIndex: getElementIndex(element),
                id: id,
                html: `<${tagName} id="${id}" ${attributes}>${tagName == 'select' ? element.innerHTML : element.innerText || ''}</${tagName}>`,
            });
            addExclude(excludes, element.children);
        }
    });
    // short text element
    const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
            var _a;
            if (node.matches(operableSelectors) || excludes.indexOf(node) != -1) {
                // skip
                return NodeFilter.FILTER_SKIP;
            }
            // text <= 100
            const text = (_a = node.innerText) === null || _a === void 0 ? void 0 : _a.trim();
            if (isElementVisible(node) &&
                text &&
                text.length <= 100 &&
                text.length > 0 &&
                node.children.length === 0) {
                return NodeFilter.FILTER_ACCEPT;
            }
            // skip
            return NodeFilter.FILTER_SKIP;
        },
    });
    let currentNode;
    while ((currentNode = textWalker.nextNode())) {
        const id = nextId++;
        elementMap[id.toString()] = currentNode;
        const tagName = currentNode.tagName.toLowerCase();
        elements.push({
            originalIndex: getElementIndex(currentNode),
            id: id,
            html: `<${tagName} id="${id}">${currentNode.innerText.trim()}</${tagName}>`,
        });
    }
    // element sort
    elements.sort((a, b) => a.originalIndex - b.originalIndex);
    // cache
    window.operableElementMap = elementMap;
    // pseudo html
    return elements.map((e) => e.html).join('\n');
}
function clickOperableElement(id) {
    let element = window.operableElementMap[id];
    if (!element) {
        return false;
    }
    if (element.click) {
        element.click();
    }
    else {
        element.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
        }));
    }
    return true;
}
function getOperableElementRect(id) {
    let element = window.operableElementMap[id];
    if (!element) {
        return null;
    }
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
    };
}

/**
 * Element click
 */
class ElementClick {
    constructor() {
        this.name = 'element_click';
        this.description = 'Click the element through task prompts';
        this.input_schema = {
            type: 'object',
            properties: {
                task_prompt: {
                    type: 'string',
                    description: 'Task prompt, eg: click search button',
                },
            },
            required: ['task_prompt'],
        };
    }
    async execute(context, params) {
        if (typeof params !== 'object' || params === null || !params.task_prompt) {
            throw new Error('Invalid parameters. Expected an object with a "task_prompt" property.');
        }
        let result;
        let task_prompt = params.task_prompt;
        try {
            result = await executeWithHtmlElement$1(context, task_prompt);
        }
        catch (e) {
            console.log(e);
            result = false;
        }
        if (!result) {
            result = await executeWithBrowserUse$1(context, task_prompt);
        }
        return result;
    }
}
async function executeWithHtmlElement$1(context, task_prompt) {
    let tabId = await getTabId(context);
    let pseudoHtml = await executeScript(tabId, extractOperableElements, []);
    let messages = [
        {
            role: 'user',
            content: `# Task
Determine the operation intent based on user input, find the element ID that the user needs to operate on in the webpage HTML, and if the element does not exist, do nothing.
Output JSON format, no explanation required.

# User input
${task_prompt}

# Output example (when the element exists)
{"elementId": "1", "operationType": "click"}

# Output example (when the element does not exist)
{"elementId": null, "operationType": "unknown"}

# HTML
${pseudoHtml}
`,
        },
    ];
    let llm_params = { maxTokens: 1024 };
    let response = await context.llmProvider.generateText(messages, llm_params);
    let content = typeof response.content == 'string' ? response.content : response.content[0].text;
    let json = content.substring(content.indexOf('{'), content.indexOf('}') + 1);
    let elementId = JSON.parse(json).elementId;
    if (elementId) {
        return await executeScript(tabId, clickOperableElement, [elementId]);
    }
    return false;
}
async function executeWithBrowserUse$1(context, task_prompt) {
    let tabId = await getTabId(context);
    let windowId = await getWindowId(context);
    let screenshot_result = await screenshot(windowId, false);
    let messages = [
        {
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: screenshot_result.image,
                },
                {
                    type: 'text',
                    text: 'click: ' + task_prompt,
                },
            ],
        },
    ];
    let llm_params = {
        maxTokens: 1024,
        toolChoice: {
            type: 'tool',
            name: 'left_click',
        },
        tools: [
            {
                name: 'left_click',
                description: 'click element',
                input_schema: {
                    type: 'object',
                    properties: {
                        coordinate: {
                            type: 'array',
                            description: '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates.',
                        },
                    },
                    required: ['coordinate'],
                },
            },
        ],
    };
    let response = await context.llmProvider.generateText(messages, llm_params);
    let input = response.toolCalls[0].input;
    let coordinate = input.coordinate;
    let click_result = await left_click(tabId, coordinate);
    return click_result;
}

/**
 * Export file
 */
class ExportFile {
    constructor() {
        this.name = 'export_file';
        this.description = 'Content exported as a file, support text format';
        this.input_schema = {
            type: 'object',
            properties: {
                fileType: {
                    type: 'string',
                    description: 'File format type',
                    enum: ['txt', 'csv', 'md', 'html', 'js', 'xml', 'json', 'yml', 'sql'],
                },
                content: {
                    type: 'string',
                    description: 'Export file content',
                },
                filename: {
                    type: 'string',
                    description: 'File name',
                },
            },
            required: ['fileType', 'content'],
        };
    }
    /**
     * export
     *
     * @param {*} params { fileType: 'csv', content: 'field1,field2\ndata1,data2' }
     * @returns > { success: true }
     */
    async execute(context, params) {
        var _a, _b, _c, _d, _e, _f;
        if (typeof params !== 'object' || params === null || !('content' in params)) {
            throw new Error('Invalid parameters. Expected an object with a "content" property.');
        }
        await ((_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onExportFile) === null || _c === void 0 ? void 0 : _c.call(_b, params));
        let type = 'text/plain';
        switch (params.fileType) {
            case 'csv':
                type = 'text/csv';
                break;
            case 'md':
                type = 'text/markdown';
                break;
            case 'html':
                type = 'text/html';
                break;
            case 'js':
                type = 'application/javascript';
                break;
            case 'xml':
                type = 'text/xml';
                break;
            case 'json':
                type = 'application/json';
                break;
        }
        let filename;
        if (!params.filename) {
            filename = new Date().getTime() + '.' + params.fileType;
        }
        else if (!(params.filename + '').endsWith(params.fileType)) {
            filename = params.filename + '.' + params.fileType;
        }
        else {
            filename = params.filename;
        }
        try {
            let tabId = await getTabId(context);
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: exportFile,
                args: [filename, type, params.content],
            });
        }
        catch (e) {
            let tab;
            const url = 'https://www.google.com';
            if (context.ekoConfig.workingWindowId) {
                tab = await open_new_tab(url, false, context.ekoConfig.workingWindowId);
            }
            else {
                tab = await open_new_tab(url, true);
            }
            (_f = (_e = (_d = context.callback) === null || _d === void 0 ? void 0 : _d.hooks) === null || _e === void 0 ? void 0 : _e.onTabCreated) === null || _f === void 0 ? void 0 : _f.call(_e, tab.id);
            let tabId = tab.id;
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: exportFile,
                args: [filename, type, params.content],
            });
            await sleep(5000);
            await chrome.tabs.remove(tabId);
        }
        return { success: true };
    }
}

/**
 * Extract Page Content
 */
class ExtractContent {
    constructor() {
        this.name = 'extract_content';
        this.description = 'Extract the text content of the current webpage';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    /**
     * Extract Page Content
     *
     * @param {*} params {}
     * @returns > { tabId, result: { title, url, content }, success: true }
     */
    async execute(context, params) {
        let tabId = await getTabId(context);
        let tab = await chrome.tabs.get(tabId);
        await injectScript(tabId);
        await sleep(500);
        let content = await executeScript(tabId, () => {
            return eko.extractHtmlContent();
        }, []);
        return {
            tabId,
            result: {
                title: tab.title,
                url: tab.url,
                content: content,
            }
        };
    }
}

/**
 * Find Element Position
 */
class FindElementPosition {
    constructor() {
        this.name = 'find_element_position';
        this.description = 'Locate Element Coordinates through Task Prompts';
        this.input_schema = {
            type: 'object',
            properties: {
                task_prompt: {
                    type: 'string',
                    description: 'Task prompt, eg: find the search input box',
                },
            },
            required: ['task_prompt'],
        };
    }
    async execute(context, params) {
        if (typeof params !== 'object' || params === null || !params.task_prompt) {
            throw new Error('Invalid parameters. Expected an object with a "task_prompt" property.');
        }
        let result;
        let task_prompt = params.task_prompt;
        try {
            result = await executeWithHtmlElement(context, task_prompt);
        }
        catch (e) {
            console.log(e);
            result = null;
        }
        if (!result) {
            result = await executeWithBrowserUse(context, task_prompt);
        }
        return result;
    }
}
async function executeWithHtmlElement(context, task_prompt) {
    let tabId = await getTabId(context);
    let pseudoHtml = await executeScript(tabId, extractOperableElements, []);
    let messages = [
        {
            role: 'user',
            content: `# Task
Find the element ID that the user needs to operate on in the webpage HTML, and if the element does not exist, do nothing.
Output JSON format, no explanation required.

# User input
${task_prompt}

# Output example (when the element exists)
{"elementId": "1"}

# Output example (when the element does not exist)
{"elementId": null}

# HTML
${pseudoHtml}
`,
        },
    ];
    let llm_params = { maxTokens: 1024 };
    let response = await context.llmProvider.generateText(messages, llm_params);
    let content = typeof response.content == 'string' ? response.content : response.content[0].text;
    let json = content.substring(content.indexOf('{'), content.indexOf('}') + 1);
    let elementId = JSON.parse(json).elementId;
    if (elementId) {
        return await executeScript(tabId, getOperableElementRect, [elementId]);
    }
    return null;
}
async function executeWithBrowserUse(context, task_prompt) {
    await getTabId(context);
    let windowId = await getWindowId(context);
    let screenshot_result = await screenshot(windowId, false);
    let messages = [
        {
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: screenshot_result.image,
                },
                {
                    type: 'text',
                    text: 'Find the element: ' + task_prompt,
                },
            ],
        },
    ];
    let llm_params = {
        maxTokens: 1024,
        toolChoice: {
            type: 'tool',
            name: 'get_element_by_coordinate',
        },
        tools: [
            {
                name: 'get_element_by_coordinate',
                description: 'Retrieve element information based on coordinate',
                input_schema: {
                    type: 'object',
                    properties: {
                        coordinate: {
                            type: 'array',
                            description: '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates.',
                        },
                    },
                    required: ['coordinate'],
                },
            },
        ],
    };
    let response = await context.llmProvider.generateText(messages, llm_params);
    let input = response.toolCalls[0].input;
    let coordinate = input.coordinate;
    return {
        left: coordinate[0],
        top: coordinate[1],
    };
}

class GetAllTabs {
    constructor() {
        this.name = 'get_all_tabs';
        this.description = 'Get the tabId, title, url and content from current all tabs without opening new tab.';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    async execute(context, params) {
        const currentWindow = await chrome.windows.getCurrent();
        const windowId = currentWindow.id;
        const tabs = await chrome.tabs.query({ windowId });
        const tabsInfo = [];
        for (const tab of tabs) {
            if (tab.id === undefined) {
                console.warn(`Tab ID is undefined for tab with URL: ${tab.url}`);
                continue;
            }
            await injectScript(tab.id);
            await sleep(500);
            let content = await executeScript(tab.id, () => {
                return eko.extractHtmlContent();
            }, []);
            // Use title as description, but requirement may evolve
            let description = tab.title ? tab.title : "No description available.";
            const tabInfo = {
                id: tab.id,
                url: tab.url,
                title: tab.title,
                content: content,
                description: description,
            };
            console.log("url: " + tab.url);
            console.log("title: " + tab.title);
            console.log("description: " + description);
            tabsInfo.push(tabInfo);
        }
        return tabsInfo;
    }
}

/**
 * Open Url
 */
class OpenUrl {
    constructor() {
        this.name = 'open_url';
        this.description = 'Open the specified URL link in browser window';
        this.input_schema = {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL link address',
                },
                newWindow: {
                    type: 'boolean',
                    description: 'true: Open in a new window; false: Open in the current window.',
                },
            },
            required: ['url'],
        };
    }
    /**
     * Open Url
     *
     * @param {*} params { url: 'https://www.google.com', newWindow: true }
     * @returns > { tabId, windowId, title, success: true }
     */
    async execute(context, params) {
        var _a, _b, _c, _d, _e, _f;
        if (typeof params !== 'object' || params === null || !params.url) {
            throw new Error('Invalid parameters. Expected an object with a "url" property.');
        }
        let url = params.url;
        let newWindow = params.newWindow;
        if (context.ekoConfig.workingWindowId) {
            newWindow = false;
        }
        else if (!newWindow && !context.variables.get('windowId') && !context.variables.get('tabId')) {
            // First mandatory opening of a new window
            newWindow = true;
        }
        let tab;
        if (newWindow) {
            tab = await open_new_tab(url, true);
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
        }
        else {
            let windowId = context.ekoConfig.workingWindowId ? context.ekoConfig.workingWindowId : await getWindowId(context);
            tab = await open_new_tab(url, false, windowId);
            (_f = (_e = (_d = context.callback) === null || _d === void 0 ? void 0 : _d.hooks) === null || _e === void 0 ? void 0 : _e.onTabCreated) === null || _f === void 0 ? void 0 : _f.call(_e, tab.id);
        }
        let windowId = tab.windowId;
        let tabId = tab.id;
        context.variables.set('windowId', windowId);
        context.variables.set('tabId', tabId);
        if (newWindow) {
            let windowIds = context.variables.get('windowIds');
            if (windowIds) {
                windowIds.push(windowId);
            }
            else {
                context.variables.set('windowIds', [windowId]);
            }
        }
        return {
            tabId,
            windowId,
            title: tab.title,
        };
    }
}

/**
 * Current Page Screenshot
 */
class Screenshot {
    constructor() {
        this.name = 'screenshot';
        this.description = 'Screenshot the current webpage window';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    /**
     * Current Page Screenshot
     *
     * @param {*} params {}
     * @returns > { image: { type: 'base64', media_type: 'image/png', data } }
     */
    async execute(context, params) {
        let windowId = await getWindowId(context);
        return await screenshot(windowId);
    }
}

/**
 * Browser tab management
 */
class TabManagement {
    constructor() {
        this.name = 'tab_management';
        this.description = 'Browser tab management, view and operate tabs';
        this.input_schema = {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: `The command to perform. The available commands are:
* \`tab_all\`: View all tabs and return the tabId and title.
* \`current_tab\`: Get current tab information (tabId, url, title).
* \`go_back\`: Go back to the previous page in the current tab.
* \`change_url [url]\`: open URL in the current tab, eg: \`change_url https://www.google.com\`.
* \`close_tab\`: Close the current tab.
* \`switch_tab [tabId]\`: Switch to the specified tab using tabId, eg: \`switch_tab 1000\`.
* \`new_tab [url]\`: Open a new tab window and open the URL, eg: \`new_tab https://www.google.com\``,
                },
            },
            required: ['command'],
        };
    }
    /**
     * Tab management
     *
     * @param {*} params { command: `new_tab [url]` | 'tab_all' | 'current_tab' | 'go_back' | 'close_tab' | 'switch_tab [tabId]' | `change_url [url]` }
     * @returns > { result, success: true }
     */
    async execute(context, params) {
        var _a, _b, _c, _d, _e, _f;
        if (params === null || !params.command) {
            throw new Error('Invalid parameters. Expected an object with a "command" property.');
        }
        let windowId = await getWindowId(context);
        let command = params.command.trim();
        if (command.startsWith('`')) {
            command = command.substring(1);
        }
        if (command.endsWith('`')) {
            command = command.substring(0, command.length - 1);
        }
        let result;
        if (command == 'tab_all') {
            result = [];
            let tabs = await chrome.tabs.query({ windowId: windowId });
            for (let i = 0; i < tabs.length; i++) {
                let tab = tabs[i];
                let tabInfo = {
                    tabId: tab.id,
                    windowId: tab.windowId,
                    title: tab.title,
                    url: tab.url,
                };
                if (tab.active) {
                    tabInfo.active = true;
                }
                result.push(tabInfo);
            }
        }
        else if (command == 'current_tab') {
            let tabId = await getTabId(context);
            let tab = await chrome.tabs.get(tabId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command == 'go_back') {
            let tabId = await getTabId(context);
            await chrome.tabs.goBack(tabId);
            let tab = await chrome.tabs.get(tabId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command == 'close_tab') {
            let closedTabId = await getTabId(context);
            await chrome.tabs.remove(closedTabId);
            await sleep(100);
            let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length == 0) {
                tabs = await chrome.tabs.query({ status: 'complete', currentWindow: true });
            }
            let tab = tabs[tabs.length - 1];
            if (!tab.active) {
                await chrome.tabs.update(tab.id, { active: true });
            }
            let newTabId = tab.id;
            context.variables.set('tabId', tab.id);
            context.variables.set('windowId', tab.windowId);
            let closeTabInfo = { closedTabId, newTabId, newTabTitle: tab.title };
            result = closeTabInfo;
        }
        else if (command.startsWith('switch_tab')) {
            let tabId = parseInt(command.replace('switch_tab', '').replace('[', '').replace(']', ''));
            let tab = await chrome.tabs.update(tabId, { active: true });
            context.variables.set('tabId', tab.id);
            context.variables.set('windowId', tab.windowId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command.startsWith('change_url')) {
            let url = command.substring('change_url'.length).replace('[', '').replace(']', '').trim();
            let tabId = await getTabId(context);
            // await chrome.tabs.update(tabId, { url: url });
            await executeScript(tabId, () => {
                location.href = url;
            }, []);
            let tab = await waitForTabComplete(tabId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command.startsWith('new_tab')) {
            let url = command.replace('new_tab', '').replace('[', '').replace(']', '').replace(/"/g, '');
            // First mandatory opening of a new window
            let newWindow = !context.variables.get('windowId') && !context.variables.get('tabId');
            let tab;
            if (newWindow) {
                tab = await open_new_tab(url, true);
                (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            }
            else {
                let windowId = await getWindowId(context);
                tab = await open_new_tab(url, false, windowId);
                (_f = (_e = (_d = context.callback) === null || _d === void 0 ? void 0 : _d.hooks) === null || _e === void 0 ? void 0 : _e.onTabCreated) === null || _f === void 0 ? void 0 : _f.call(_e, tab.id);
            }
            let windowId = tab.windowId;
            let tabId = tab.id;
            context.variables.set('windowId', windowId);
            context.variables.set('tabId', tabId);
            if (newWindow) {
                let windowIds = context.variables.get('windowIds');
                if (windowIds) {
                    windowIds.push(windowId);
                }
                else {
                    context.variables.set('windowIds', [windowId]);
                }
            }
            let tabInfo = {
                tabId: tab.id,
                windowId: tab.windowId,
                title: tab.title,
                url: tab.url,
            };
            result = tabInfo;
        }
        else {
            throw Error('Unknown command: ' + command);
        }
        return result;
    }
    destroy(context) {
        let windowIds = context.variables.get('windowIds');
        if (windowIds) {
            for (let i = 0; i < windowIds.length; i++) {
                chrome.windows.remove(windowIds[i]);
            }
        }
    }
}

/**
 * Web Search
 */
class WebSearch {
    constructor() {
        this.name = 'web_search';
        this.description = 'Search the web based on keywords and return relevant extracted content from webpages.';
        this.input_schema = {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'search for keywords',
                },
                maxResults: {
                    type: 'integer',
                    description: 'Maximum search results, default 5',
                },
            },
            required: ['query'],
        };
    }
    /**
     * search
     *
     * @param {*} params { url: 'https://www.google.com', query: 'ai agent', maxResults: 5 }
     * @returns > [{ title, url, content }]
     */
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.query) {
            throw new Error('Invalid parameters. Expected an object with a "query" property.');
        }
        let url = params.url;
        let query = params.query;
        let maxResults = params.maxResults;
        if (!url) {
            url = 'https://www.google.com';
        }
        let taskId = new Date().getTime() + '';
        let searchs = [{ url: url, keyword: query }];
        let searchInfo = await deepSearch(context, taskId, searchs, maxResults || 5, context.ekoConfig.workingWindowId);
        let links = ((_a = searchInfo.result[0]) === null || _a === void 0 ? void 0 : _a.links) || [];
        return links.filter((s) => s.content);
    }
}
const deepSearchInjects = {
    'bing.com': {
        filename: 'bing.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://bing.com/search?q=' + encodeURI(keyword);
        },
    },
    'duckduckgo.com': {
        filename: 'duckduckgo.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://duckduckgo.com/?q=' + encodeURI(keyword);
        },
    },
    'google.com': {
        filename: 'google.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://www.google.com/search?q=' + encodeURI(keyword);
        },
    },
    default: {
        filename: 'google.js',
        buildSearchUrl: function (url, keyword) {
            url = url.trim();
            let idx = url.indexOf('//');
            if (idx > -1) {
                url = url.substring(idx + 2);
            }
            idx = url.indexOf('/', 2);
            if (idx > -1) {
                url = url.substring(0, idx);
            }
            keyword = 'site:' + url + ' ' + keyword;
            return 'https://www.google.com/search?q=' + encodeURIComponent(keyword);
        },
    },
};
function buildDeepSearchUrl(url, keyword) {
    let idx = url.indexOf('/', url.indexOf('//') + 2);
    let baseUrl = idx > -1 ? url.substring(0, idx) : url;
    let domains = Object.keys(deepSearchInjects);
    let inject = null;
    for (let j = 0; j < domains.length; j++) {
        let domain = domains[j];
        if (baseUrl == domain || baseUrl.endsWith('.' + domain) || baseUrl.endsWith('/' + domain)) {
            inject = deepSearchInjects[domain];
            break;
        }
    }
    if (!inject) {
        inject = deepSearchInjects['default'];
    }
    return {
        filename: inject.filename,
        url: inject.buildSearchUrl(url, keyword),
    };
}
// Event
const tabsUpdateEvent = new MsgEvent();
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    await tabsUpdateEvent.publish({ tabId, changeInfo, tab });
});
/**
 * deep search
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 */
async function deepSearch(context, taskId, searchs, detailsMaxNum, windowId) {
    let closeWindow = false;
    if (!windowId) {
        // open new window
        let window = await chrome.windows.create({
            type: 'normal',
            state: 'maximized',
            url: null,
        });
        windowId = window.id;
        closeWindow = true;
    }
    windowId = windowId;
    // crawler the search page details page link
    // [{ links: [{ title, url }] }]
    let detailLinkGroups = await doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId);
    // crawler all details page content and comments
    let searchInfo = await doPageContent(context, taskId, detailLinkGroups, windowId);
    console.log('searchInfo: ', searchInfo);
    // close window
    closeWindow && chrome.windows.remove(windowId);
    return searchInfo;
}
/**
 * crawler the search page details page link
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 * @param {*} window
 * @returns [{ links: [{ title, url }] }]
 */
async function doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId) {
    var _a, _b, _c;
    let detailLinkGroups = [];
    let countDownLatch = new CountDownLatch(searchs.length);
    for (let i = 0; i < searchs.length; i++) {
        try {
            // script name & build search URL
            const { filename, url } = buildDeepSearchUrl(searchs[i].url, searchs[i].keyword);
            // open new Tab
            let tab = await chrome.tabs.create({
                url: url,
                windowId,
            });
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            let eventId = taskId + '_' + i;
            // monitor Tab status
            tabsUpdateEvent.addListener(async function (obj) {
                if (obj.tabId != tab.id) {
                    return;
                }
                if (obj.changeInfo.status === 'complete') {
                    tabsUpdateEvent.removeListener(eventId);
                    // inject js
                    await injectScript(tab.id, filename);
                    await sleep(1000);
                    // crawler the search page details page
                    // { links: [{ title, url }] }
                    let detailLinks = await chrome.tabs.sendMessage(tab.id, {
                        type: 'page:getDetailLinks',
                        keyword: searchs[i].keyword,
                    });
                    if (!detailLinks || !detailLinks.links) {
                        // TODO error
                        detailLinks = { links: [] };
                    }
                    console.log('detailLinks: ', detailLinks);
                    let links = detailLinks.links.slice(0, detailsMaxNum);
                    detailLinkGroups.push({ url, links, filename });
                    countDownLatch.countDown();
                    chrome.tabs.remove(tab.id);
                }
                else if (obj.changeInfo.status === 'unloaded') {
                    countDownLatch.countDown();
                    chrome.tabs.remove(tab.id);
                    tabsUpdateEvent.removeListener(eventId);
                }
            }, eventId);
        }
        catch (e) {
            console.error(e);
            countDownLatch.countDown();
        }
    }
    await countDownLatch.await(30000);
    return detailLinkGroups;
}
/**
 * page content
 *
 * @param {string} taskId task id
 * @param {array} detailLinkGroups details page group
 * @param {*} window
 * @returns search info
 */
async function doPageContent(context, taskId, detailLinkGroups, windowId) {
    var _a, _b, _c;
    const searchInfo = {
        total: 0,
        running: 0,
        succeed: 0,
        failed: 0,
        failedLinks: [],
        result: detailLinkGroups,
    };
    for (let i = 0; i < detailLinkGroups.length; i++) {
        let links = detailLinkGroups[i].links;
        searchInfo.total += links.length;
    }
    let countDownLatch = new CountDownLatch(searchInfo.total);
    for (let i = 0; i < detailLinkGroups.length; i++) {
        let filename = detailLinkGroups[i].filename;
        let links = detailLinkGroups[i].links;
        for (let j = 0; j < links.length; j++) {
            let link = links[j];
            // open new tab
            let tab = await chrome.tabs.create({
                url: link.url,
                windowId,
            });
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            searchInfo.running++;
            let eventId = taskId + '_' + i + '_' + j;
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Page load timeout')), 10000); // Timeout after 10 seconds
            });
            // Create a tab monitoring promise
            const monitorTabPromise = new Promise(async (resolve, reject) => {
                tabsUpdateEvent.addListener(async function onTabUpdated(obj) {
                    if (obj.tabId !== tab.id)
                        return;
                    if (obj.changeInfo.status === 'complete') {
                        tabsUpdateEvent.removeListener(eventId);
                        try {
                            // Inject script and get page content
                            await injectScript(tab.id, filename);
                            await sleep(1000);
                            let result = await chrome.tabs.sendMessage(tab.id, {
                                type: 'page:getContent',
                            });
                            if (!result)
                                throw new Error('No Result');
                            link.content = result.content;
                            link.page_title = result.title;
                            searchInfo.succeed++;
                            resolve(); // Resolve the promise if successful
                        }
                        catch (error) {
                            searchInfo.failed++;
                            searchInfo.failedLinks.push(link);
                            reject(error); // Reject the promise on error
                        }
                        finally {
                            searchInfo.running--;
                            countDownLatch.countDown();
                            chrome.tabs.remove(tab.id);
                            tabsUpdateEvent.removeListener(eventId);
                        }
                    }
                    else if (obj.changeInfo.status === 'unloaded') {
                        searchInfo.running--;
                        countDownLatch.countDown();
                        chrome.tabs.remove(tab.id);
                        tabsUpdateEvent.removeListener(eventId);
                        reject(new Error('Tab unloaded')); // Reject if the tab is unloaded
                    }
                }, eventId);
            });
            // Use Promise.race to enforce the timeout
            try {
                await Promise.race([monitorTabPromise, timeoutPromise]);
            }
            catch (e) {
                console.error(`${link.title} failed:`, e);
                searchInfo.running--;
                searchInfo.failed++;
                searchInfo.failedLinks.push(link);
                countDownLatch.countDown();
                chrome.tabs.remove(tab.id); // Clean up tab on failure
            }
        }
    }
    await countDownLatch.await(60000);
    return searchInfo;
}

class RequestLogin {
    constructor() {
        this.name = 'request_login';
        this.description =
            'Login to this website, assist with identity verification when manual intervention is needed, guide users through the login process, and wait for their confirmation of successful login.';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    async execute(context, params) {
        if (!params.force && await this.isLoginIn(context)) {
            return true;
        }
        let tabId = await getTabId(context);
        let task_id = 'login_required_' + tabId;
        const request_user_help = async () => {
            await chrome.tabs.sendMessage(tabId, {
                type: 'request_user_help',
                task_id,
                failure_type: 'login_required',
                failure_message: 'Access page require user authentication.',
            });
        };
        const login_interval = setInterval(async () => {
            try {
                request_user_help();
            }
            catch (e) {
                clearInterval(login_interval);
            }
        }, 2000);
        try {
            return await this.awaitLogin(tabId, task_id);
        }
        finally {
            clearInterval(login_interval);
        }
    }
    async awaitLogin(tabId, task_id) {
        return new Promise((resolve) => {
            const checkTabClosedInterval = setInterval(async () => {
                const tabExists = await doesTabExists(tabId);
                if (!tabExists) {
                    clearInterval(checkTabClosedInterval);
                    resolve(false);
                    chrome.runtime.onMessage.removeListener(listener);
                }
            }, 1000);
            const listener = (message) => {
                if (message.type === 'issue_resolved' && message.task_id === task_id) {
                    resolve(true);
                    clearInterval(checkTabClosedInterval);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
        });
    }
    async isLoginIn(context) {
        let windowId = await getWindowId(context);
        let screenshot_result = await screenshot(windowId, true);
        let messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: screenshot_result.image,
                    },
                    {
                        type: 'text',
                        text: 'Check if the current website is logged in. If not logged in, output `NOT_LOGIN`. If logged in, output `LOGGED_IN`. Output directly without explanation.',
                    },
                ],
            },
        ];
        let response = await context.llmProvider.generateText(messages, { maxTokens: 256 });
        let text = response.textContent;
        if (!text) {
            text = JSON.stringify(response.content);
        }
        return text.indexOf('LOGGED_IN') > -1;
    }
}

class CancelWorkflow {
    constructor() {
        this.name = 'cancel_workflow';
        this.description = 'Cancel the workflow. If any tool consistently encounters exceptions, invoke this tool to cancel the workflow.';
        this.input_schema = {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Why the workflow should be cancelled.',
                },
            },
            required: ['reason'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.reason) {
            throw new Error('Invalid parameters. Expected an object with a "reason" property.');
        }
        const reason = params.reason;
        console.log("The workflow has been cancelled because: " + reason);
        await ((_a = context.workflow) === null || _a === void 0 ? void 0 : _a.cancel());
        return;
    }
}

class HumanInputText {
    constructor() {
        this.name = 'human_input_text';
        this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field. The user will provide you with a text as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here.',
                },
            },
            required: ['question'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question) {
            throw new Error('Invalid parameters. Expected an object with a "question" property.');
        }
        const question = params.question;
        console.log("question: " + question);
        let onHumanInputText = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputText;
        if (onHumanInputText) {
            let answer;
            try {
                answer = await onHumanInputText(question);
            }
            catch (e) {
                console.error(e);
                return { status: "Error: Cannot get user's answer.", answer: "" };
            }
            console.log("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            console.error("`onHumanInputText` not implemented");
            return { status: "Error: Cannot get user's answer.", answer: "" };
        }
    }
}
class HumanInputSingleChoice {
    constructor() {
        this.name = 'human_input_single_choice';
        this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE choice as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here.',
                },
                choices: {
                    type: 'array',
                    description: 'All of the choices.',
                }
            },
            required: ['question', 'choices'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
            throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
        }
        const question = params.question;
        const choices = params.choices;
        console.log("question: " + question);
        console.log("choices: " + choices);
        let onHumanInputSingleChoice = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputSingleChoice;
        if (onHumanInputSingleChoice) {
            let answer;
            try {
                answer = await onHumanInputSingleChoice(question, choices);
            }
            catch (e) {
                console.error(e);
                return { status: "Error: Cannot get user's answer.", answer: "" };
            }
            console.log("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            console.error("`onHumanInputSingleChoice` not implemented");
            return { status: "Error: Cannot get user's answer.", answer: "" };
        }
    }
}
class HumanInputMultipleChoice {
    constructor() {
        this.name = 'human_input_multiple_choice';
        this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE or MORE choice as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here.',
                },
                choices: {
                    type: 'array',
                    description: 'All of the choices.',
                }
            },
            required: ['question', 'choices'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
            throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
        }
        const question = params.question;
        const choices = params.choices;
        console.log("question: " + question);
        console.log("choices: " + choices);
        let onHumanInputMultipleChoice = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputMultipleChoice;
        if (onHumanInputMultipleChoice) {
            let answer;
            try {
                answer = await onHumanInputMultipleChoice(question, choices);
            }
            catch (e) {
                console.error(e);
                return { status: "`onHumanInputMultipleChoice` not implemented", answer: [] };
            }
            console.log("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            console.error("Cannot get user's answer.");
            return { status: "Error: Cannot get user's answer.", answer: [] };
        }
    }
}
class HumanOperate {
    constructor() {
        this.name = 'human_operate';
        this.description = 'When you encounter operations necessitating login, CAPTCHA verification, or any other tasks beyond your reach, kindly invoke this tool, relinquish control to the user, and elucidate the reasons behind this action.\n\nBefore executing the final step of any task that entails external repercussions, such as submitting purchases, deleting entries, editing data, scheduling appointments, sending messages, managing accounts, moving files, and the like, seek the user\'s definitive confirmation.';
        this.input_schema = {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'The reason why you need to transfer control.',
                },
            },
            required: ['reason'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.reason) {
            throw new Error('Invalid parameters. Expected an object with a "reason" property.');
        }
        const reason = params.reason;
        console.log("reason: " + reason);
        let onHumanOperate = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanOperate;
        if (onHumanOperate) {
            let userOperation;
            try {
                userOperation = await onHumanOperate(reason);
            }
            catch (e) {
                console.error(e);
                return { status: "`onHumanOperate` not implemented", userOperation: "" };
            }
            console.log("userOperation: " + userOperation);
            return { status: "OK", userOperation: userOperation };
        }
        else {
            console.error("Cannot get user's operation.");
            return { status: "Error: Cannot get user's operation.", userOperation: "" };
        }
    }
}

class SummaryWorkflow {
    constructor() {
        this.name = 'summary_workflow';
        this.description = 'Summarize briefly what this workflow has accomplished.';
        this.input_schema = {
            type: 'object',
            properties: {
                summary: {
                    type: 'string',
                    description: 'Your summary in markdown format.',
                },
            },
            required: ['summary'],
        };
    }
    async execute(context, params) {
        var _a, _b, _c;
        if (typeof params !== 'object' || params === null || !params.summary) {
            throw new Error('Invalid parameters. Expected an object with a "summary" property.');
        }
        const summary = params.summary;
        console.log("summary: " + summary);
        await ((_c = (_a = context.callback) === null || _a === void 0 ? void 0 : (_b = _a.hooks).onSummaryWorkflow) === null || _c === void 0 ? void 0 : _c.call(_b, summary));
        return { status: "OK" };
    }
}

var tools = /*#__PURE__*/Object.freeze({
    __proto__: null,
    BrowserUse: BrowserUse,
    CancelWorkflow: CancelWorkflow,
    ElementClick: ElementClick,
    ExportFile: ExportFile,
    ExtractContent: ExtractContent,
    FindElementPosition: FindElementPosition,
    GetAllTabs: GetAllTabs,
    HumanInputMultipleChoice: HumanInputMultipleChoice,
    HumanInputSingleChoice: HumanInputSingleChoice,
    HumanInputText: HumanInputText,
    HumanOperate: HumanOperate,
    OpenUrl: OpenUrl,
    RequestLogin: RequestLogin,
    Screenshot: Screenshot,
    SummaryWorkflow: SummaryWorkflow,
    TabManagement: TabManagement,
    WebSearch: WebSearch
});

async function pub(tabId, event, params) {
    return await chrome.tabs.sendMessage(tabId, {
        type: 'eko:message',
        event,
        params,
    });
}
async function getLLMConfig(name = 'llmConfig') {
    let result = await chrome.storage.sync.get([name]);
    return result[name];
}
function loadTools() {
    let toolsMap = new Map();
    for (const key in tools) {
        let tool = tools[key];
        if (typeof tool === 'function' && tool.prototype && 'execute' in tool.prototype) {
            try {
                let instance = new tool();
                toolsMap.set(instance.name || key, instance);
            }
            catch (e) {
                console.error(`Failed to instantiate ${key}:`, e);
            }
        }
    }
    return toolsMap;
}

exports.browser = browser;
exports.getLLMConfig = getLLMConfig;
exports.loadTools = loadTools;
exports.pub = pub;
exports.tools = tools;
exports.utils = utils;
