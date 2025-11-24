import html2canvas from "html2canvas";
import { AgentContext, BrowserLabelsCapability, sleep, config, compressImageData } from "@eko-ai/eko";
// @ts-ignore - run_build_dom_tree is exported from eko-core but TypeScript may not recognize it immediately
import { run_build_dom_tree } from "@eko-ai/eko";
// @ts-ignore - mark_screenshot_highlight_elements is exported from eko-core but TypeScript may not recognize it immediately
import { mark_screenshot_highlight_elements } from "@eko-ai/eko";

/**
 * Browser capability implementation for web environment
 * 
 * Uses html2canvas for screenshots and DOM manipulation for browser operations.
 */
export class BrowserCapability extends BrowserLabelsCapability {
  constructor() {
    super();
  }

  /**
   * Take a screenshot of the current page using html2canvas
   * 
   * This implementation follows the same logic as BaseBrowserLabelsAgent:
   * 1. Run build_dom_tree to setup window.get_clickable_elements and window.get_highlight_element
   * 2. Call get_clickable_elements(true) to highlight elements on the page
   * 3. Take screenshot with html2canvas (which captures the highlighted elements)
   * 4. Remove highlights but keep window.get_highlight_element for interaction
   */
  protected async screenshot(
    agentContext: AgentContext
  ): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }> {
    try {
      // Build DOM tree and highlight elements (following BaseBrowserLabelsAgent.screenshot_and_html logic)
      let element_result;
      for (let i = 0; i < 5; i++) {
        await sleep(200);
        await this.execute_script(agentContext, run_build_dom_tree, []);
        await sleep(50);
        element_result = (await this.execute_script(
          agentContext,
          (markHighlightElements) => {
            return (window as any).get_clickable_elements(
              markHighlightElements
            );
          },
          [config.mode != "fast" && config.markImageMode == "dom"]
        )) as any;
        if (element_result) {
          break;
        }
      }
      await sleep(100);

      // Take screenshot (skip if fast mode, but Capability must always return screenshot)
      if (config.mode == "fast") {
        // In fast mode, Agent doesn't take screenshot, but Capability must return one
        // So we still take a basic screenshot without highlights
    const [width, height] = this.size();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const canvas = await html2canvas(document.documentElement || document.body, {
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
    });
    let dataUrl = canvas.toDataURL("image/jpeg");
    let data = dataUrl.substring(dataUrl.indexOf("base64,") + 7);
    return {
      imageBase64: data,
      imageType: "image/jpeg",
    };
      }

      // Take screenshot with compression (following screenshot_and_compress logic)
      const [width, height] = this.size();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      const canvas = await html2canvas(document.documentElement || document.body, {
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
      });
      let dataUrl = canvas.toDataURL("image/jpeg");
      let data = dataUrl.substring(dataUrl.indexOf("base64,") + 7);
      
      let screenshot: { imageBase64: string; imageType: "image/jpeg" | "image/png" } = {
        imageBase64: data,
        imageType: "image/jpeg",
      };

      // Compress screenshot if client_rect is available
      if (element_result?.client_rect) {
        const compressedImage = await compressImageData(
          screenshot.imageBase64,
          screenshot.imageType,
          {
            resizeWidth: element_result.client_rect.width,
            resizeHeight: element_result.client_rect.height,
          }
        );
        screenshot = {
          imageBase64: compressedImage.imageBase64,
          imageType: compressedImage.imageType,
        };
      }

      // Handle draw mode: draw highlights on canvas instead of DOM
      if (
        config.markImageMode == "draw" &&
        screenshot.imageBase64 &&
        element_result?.area_map
      ) {
        const markImageBase64 = await mark_screenshot_highlight_elements(
          screenshot,
          element_result.area_map,
          element_result.client_rect
        );
        // mark_screenshot_highlight_elements returns a data URL, extract base64 string
        const base64Index = markImageBase64.indexOf("base64,");
        screenshot.imageBase64 = base64Index !== -1
          ? markImageBase64.substring(base64Index + 7)
          : markImageBase64;
      }

      return screenshot;
    } finally {
      // Remove visual highlights but keep window.get_highlight_element for interaction
      try {
        await this.execute_script(
          agentContext,
          () => {
            return (window as any).remove_highlight();
          },
          []
        );
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Get screenshot and HTML element information (similar to BaseBrowserLabelsAgent.screenshot_and_html)
   * This method builds DOM tree, gets element information, and takes screenshot
   */
  protected async screenshot_and_html(agentContext: AgentContext): Promise<{
    imageBase64?: string;
    imageType?: "image/jpeg" | "image/png";
    pseudoHtml: string;
    double_screenshots?: {
      imageBase64: string;
      imageType: "image/jpeg" | "image/png";
    };
    client_rect: { width: number; height: number };
  }> {
    try {
      let element_result;
      let double_screenshots;
      for (let i = 0; i < 5; i++) {
        await sleep(200);
        await this.execute_script(agentContext, run_build_dom_tree, []);
        await sleep(50);
        element_result = (await this.execute_script(
          agentContext,
          (markHighlightElements) => {
            return (window as any).get_clickable_elements(
              markHighlightElements
            );
          },
          [config.mode != "fast" && config.markImageMode == "dom"]
        )) as any;
        if (element_result) {
          break;
        }
      }
      await sleep(100);
      const screenshot =
        config.mode == "fast"
          ? undefined
          : await this.screenshot_and_compress(
              agentContext,
              element_result.client_rect
            );
      if (
        config.markImageMode == "draw" &&
        screenshot?.imageBase64 &&
        element_result.area_map
      ) {
        double_screenshots = { ...screenshot };
        const markImageBase64 = await mark_screenshot_highlight_elements(
          screenshot,
          element_result.area_map,
          element_result.client_rect
        );
        // mark_screenshot_highlight_elements returns a data URL, extract base64 string
        const base64Index = markImageBase64.indexOf("base64,");
        screenshot.imageBase64 = base64Index !== -1
          ? markImageBase64.substring(base64Index + 7)
          : markImageBase64;
      }
      const pseudoHtml = element_result.element_str || "";
      return {
        double_screenshots: double_screenshots,
        imageBase64: screenshot?.imageBase64,
        imageType: screenshot?.imageType,
        pseudoHtml: pseudoHtml,
        client_rect: element_result.client_rect,
      };
    } finally {
      try {
        await this.execute_script(
          agentContext,
          () => {
            return (window as any).remove_highlight();
          },
          []
        );
      } catch (e) {}
    }
  }

  /**
   * Helper method to compress screenshot (similar to BaseBrowserLabelsAgent.screenshot_and_compress)
   */
  protected async screenshot_and_compress(
    agentContext: AgentContext,
    client_rect?: { width: number; height: number }
  ): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }> {
    const screenshot = await this.screenshot(agentContext);
    if (!client_rect || !screenshot) {
      return screenshot;
    }
    const compressedImage = await compressImageData(
      screenshot.imageBase64,
      screenshot.imageType,
      {
        resizeWidth: client_rect.width,
        resizeHeight: client_rect.height,
      }
    );
    return {
      imageBase64: compressedImage.imageBase64,
      imageType: compressedImage.imageType,
    };
  }

  /**
   * Navigate to a URL (only within the same origin for web environment)
   */
  protected async navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{ url: string; title?: string }> {
    let idx = location.href.indexOf("/", 10);
    let baseUrl = idx > -1 ? location.href.substring(0, idx) : location.href;
    if (url.startsWith("/")) {
      history.pushState(null, "", url);
    } else if (url.startsWith(baseUrl)) {
      history.pushState(null, "", url.substring(baseUrl.length));
    } else {
      throw new Error(
        "Unable to access other websites, can only access other subpages within the current website: " +
          baseUrl
      );
    }
    window.dispatchEvent(new PopStateEvent("popstate"));
    await this.sleep(200);
    return {
      url: location.href,
      title: document.title,
    };
  }

  /**
   * Get all browser tabs (web environment only has one tab)
   */
  protected async get_all_tabs(
    agentContext: AgentContext
  ): Promise<Array<{ tabId: number; url: string; title: string }>> {
    return [
      {
        tabId: 0,
        url: location.href,
        title: document.title,
      },
    ];
  }

  /**
   * Switch to a specific tab (web environment only has one tab)
   */
  protected async switch_tab(
    agentContext: AgentContext,
    tabId: number
  ): Promise<{ tabId: number; url: string; title: string }> {
    const tabs = await this.get_all_tabs(agentContext);
    return tabs[0];
  }

  /**
   * Execute a script in the browser context
   */
  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {
    return func(args[0]);
  }

  /**
   * Ensure DOM tree is built and window.get_highlight_element is available
   * This is called before any interaction methods that rely on element indices
   */
  private async ensureDomTreeBuilt(agentContext: AgentContext): Promise<void> {
    try {
      // Check if window.get_highlight_element exists
      const exists = await this.execute_script(
        agentContext,
        () => {
          return typeof (window as any).get_highlight_element === "function";
        },
        []
      );
      
      if (!exists) {
        // Build DOM tree if not already built
        await this.execute_script(agentContext, run_build_dom_tree, []);
        await sleep(50);
      }
    } catch (e) {
      // If check fails, try to build DOM tree anyway
      await this.execute_script(agentContext, run_build_dom_tree, []);
      await sleep(50);
    }
  }

  /**
   * Input text into an element by index
   */
  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    await this.execute_script(agentContext, typing, [{ index, text, enter }]);
    if (enter) {
      await sleep(200);
    }
  }

  /**
   * Click on an element by index
   */
  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    await this.execute_script(agentContext, do_click, [
      { index, num_clicks, button },
    ]);
  }

  /**
   * Scroll to make an element visible
   */
  protected async scroll_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    await this.execute_script(
      agentContext,
      (index) => {
        return (window as any)
          .get_highlight_element(index)
          .scrollIntoView({ behavior: "smooth" });
      },
      [index]
    );
    await sleep(200);
  }

  /**
   * Scroll the mouse wheel
   */
  protected async scroll_mouse_wheel(
    agentContext: AgentContext,
    amount: number,
    extract_page_content: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, scroll_by, [{ amount }]);
    await sleep(200);
    if (extract_page_content) {
      let page_result = await this.extract_page_content(agentContext);
      return {
        result:
          "The current page content has been extracted, latest page content:\n" +
          "title: " +
          page_result.title +
          "\n" +
          "page_url: " +
          page_result.page_url +
          "\n" +
          "page_content: " +
          page_result.page_content,
      };
    }
  }

  /**
   * Hover over an element
   */
  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    await this.execute_script(agentContext, hover_to, [{ index }]);
  }

  /**
   * Get options from a select element
   */
  protected async get_select_options(
    agentContext: AgentContext,
    index: number
  ): Promise<any> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    return await this.execute_script(agentContext, get_select_options, [
      { index },
    ]);
  }

  /**
   * Select an option from a select element
   */
  protected async select_option(
    agentContext: AgentContext,
    index: number,
    option: string
  ): Promise<any> {
    // Ensure DOM tree is built before interaction
    // await this.ensureDomTreeBuilt(agentContext);
    
    return await this.execute_script(agentContext, select_option, [
      { index, option },
    ]);
  }

  /**
   * Helper: Get viewport size
   */
  private size(): [number, number] {
    return [
      window.innerWidth ||
        document.documentElement.clientWidth ||
        (document.documentElement || document.body).clientWidth,
      window.innerHeight ||
        document.documentElement.clientHeight ||
        (document.documentElement || document.body).clientHeight,
    ];
  }

  /**
   * Helper: Sleep utility
   */
  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }
}

// Helper functions for browser operations (ported from browser_labels.ts)

function typing(params: {
  index: number;
  text: string;
  enter: boolean;
}): boolean {
  let { index, text, enter } = params;
  let element = (window as any).get_highlight_element(index);
  if (!element) {
    return false;
  }
  let input: any;
  if (element.tagName == "IFRAME") {
    let iframeDoc = element.contentDocument || element.contentWindow.document;
    input =
      iframeDoc.querySelector("textarea") ||
      iframeDoc.querySelector('*[contenteditable="true"]') ||
      iframeDoc.querySelector("input");
  } else if (
    element.tagName == "INPUT" ||
    element.tagName == "TEXTAREA" ||
    element.childElementCount == 0
  ) {
    input = element;
  } else {
    input = element.querySelector("input") || element.querySelector("textarea");
    if (!input) {
      input = element.querySelector('*[contenteditable="true"]') || element;
      if (input.tagName == "DIV") {
        input =
          input.querySelector("span") || input.querySelector("div") || input;
      }
    }
  }
  input.focus && input.focus();
  if (!text && enter) {
    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
    return true;
  }
  if (input.value == undefined) {
    input.textContent = text;
  } else {
    input.value = text;
    if (input.__proto__) {
      let value_setter = Object.getOwnPropertyDescriptor(
        input.__proto__ as any,
        "value"
      )?.set;
      value_setter && value_setter.call(input, text);
    }
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (enter) {
    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
  }
  return true;
}

function do_click(params: {
  index: number;
  button: "left" | "right" | "middle";
  num_clicks: number;
}): boolean {
  let { index, button, num_clicks } = params;
  function simulateMouseEvent(
    eventTypes: Array<string>,
    button: 0 | 1 | 2
  ): boolean {
    let element = (window as any).get_highlight_element(index);
    if (!element) {
      return false;
    }
    for (let n = 0; n < num_clicks; n++) {
      for (let i = 0; i < eventTypes.length; i++) {
        const eventType = eventTypes[i];

        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true,
          button, // 0 left; 1 middle; 2 right
        });

        if (eventType === "click" && element.click) {
          // support shadow dom element
          element.click();
        } else {
          element.dispatchEvent(event);
        }

        element.focus?.();
      }
    }
    return true;
  }
  if (button == "right") {
    return simulateMouseEvent(["mousedown", "mouseup", "contextmenu"], 2);
  } else if (button == "middle") {
    return simulateMouseEvent(["mousedown", "mouseup", "click"], 1);
  } else {
    return simulateMouseEvent(["mousedown", "mouseup", "click"], 0);
  }
}

function hover_to(params: { index: number }): boolean {
  let element = (window as any).get_highlight_element(params.index);
  if (!element) {
    return false;
  }
  const event = new MouseEvent("mouseenter", {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  element.dispatchEvent(event);
  return true;
}

function get_select_options(params: { index: number }) {
  let element = (window as any).get_highlight_element(params.index);
  if (!element || element.tagName.toUpperCase() !== "SELECT") {
    return "Error: Not a select element";
  }
  return {
    options: Array.from(element.options).map((opt: any) => ({
      index: opt.index,
      text: opt.text.trim(),
      value: opt.value,
    })),
    name: element.name,
  };
}

function select_option(params: { index: number; option: string }) {
  let element = (window as any).get_highlight_element(params.index);
  if (!element || element.tagName.toUpperCase() !== "SELECT") {
    return "Error: Not a select element";
  }
  let text = params.option.trim();
  let option = Array.from(element.options).find(
    (opt: any) => opt.text.trim() === text
  ) as any;
  if (!option) {
    option = Array.from(element.options).find(
      (opt: any) => opt.value.trim() === text
    ) as any;
  }
  if (!option) {
    return {
      success: false,
      error: "Select Option not found",
      availableOptions: Array.from(element.options).map((o: any) =>
        o.text.trim()
      ),
    };
  }
  element.value = option.value;
  element.dispatchEvent(new Event("change"));
  return {
    success: true,
    selectedValue: option.value,
    selectedText: option.text.trim(),
  };
}

function scroll_by(params: { amount: number }) {
  const amount = params.amount;
  const documentElement = document.documentElement || document.body;
  if (documentElement.scrollHeight > window.innerHeight * 1.2) {
    const y = Math.max(
      20,
      Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200)
    );
    window.scrollBy(0, y * amount);
    return;
  }

  function findNodes(element = document, nodes: any = []): Element[] {
    for (const node of Array.from(element.querySelectorAll("*"))) {
      if (node.tagName === "IFRAME" && (node as any).contentDocument) {
        findNodes((node as any).contentDocument, nodes);
      } else {
        nodes.push(node);
      }
    }
    return nodes;
  }

  function findScrollableElements(): Element[] {
    const allElements = findNodes();
    let elements = allElements.filter((el) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.getPropertyValue("overflow-y");
      return (
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      );
    });
    if (elements.length == 0) {
      elements = allElements.filter((el) => {
        const style = window.getComputedStyle(el);
        const overflowY = style.getPropertyValue("overflow-y");
        return (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          el.scrollHeight > el.clientHeight
        );
      });
    }
    return elements;
  }

  function getVisibleArea(element: Element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || documentElement.clientHeight;
    const viewportWidth = window.innerWidth || documentElement.clientWidth;
    const visibleLeft = Math.max(0, Math.min(rect.left, viewportWidth));
    const visibleRight = Math.max(0, Math.min(rect.right, viewportWidth));
    const visibleTop = Math.max(0, Math.min(rect.top, viewportHeight));
    const visibleBottom = Math.max(0, Math.min(rect.bottom, viewportHeight));
    const visibleWidth = visibleRight - visibleLeft;
    const visibleHeight = visibleBottom - visibleTop;
    return visibleWidth * visibleHeight;
  }

  function getComputedZIndex(element: Element | null) {
    while (
      element &&
      element !== document.body &&
      element !== document.body.parentElement
    ) {
      const style = window.getComputedStyle(element);
      let zIndex = style.zIndex === "auto" ? 0 : parseInt(style.zIndex) || 0;
      if (zIndex > 0) {
        return zIndex;
      }
      element = element.parentElement;
    }
    return 0;
  }

  const scrollableElements = findScrollableElements();
  if (scrollableElements.length === 0) {
    const y = Math.max(
      20,
      Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200)
    );
    window.scrollBy(0, y * amount);
    return false;
  }
  const sortedElements = scrollableElements.sort((a, b) => {
    let z = getComputedZIndex(b) - getComputedZIndex(a);
    if (z > 0) {
      return 1;
    } else if (z < 0) {
      return -1;
    }
    let v = getVisibleArea(b) - getVisibleArea(a);
    if (v > 0) {
      return 1;
    } else if (v < 0) {
      return -1;
    }
    return 0;
  });
  const largestElement = sortedElements[0];
  const viewportHeight = largestElement.clientHeight;
  const y = Math.max(20, Math.min(viewportHeight / 10, 200));
  largestElement.scrollBy(0, y * amount);
  const maxHeightElement = sortedElements.sort(
    (a, b) =>
      b.getBoundingClientRect().height - a.getBoundingClientRect().height
  )[0];
  if (maxHeightElement != largestElement) {
    const viewportHeight = maxHeightElement.clientHeight;
    const y = Math.max(20, Math.min(viewportHeight / 10, 200));
    maxHeightElement.scrollBy(0, y * amount);
  }
  return true;
}
