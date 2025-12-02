import config from "../../config";
import Log from "../../common/log";
import {
  LanguageModelV2Prompt,
  LanguageModelV2FilePart,
  LanguageModelV2ToolCallPart,
} from "@ai-sdk/provider";
import {
  sleep,
  toImage,
  mergeTools,
  compressImageData,
} from "../../common/utils";
import { AgentContext } from "../agent-context";
import { run_build_dom_tree } from "./build-dom-tree";
import { Tool, ToolResult, IMcpClient } from "../../types";
import { mark_screenshot_highlight_elements } from "./utils";
import { BaseBrowserAgent, AGENT_NAME } from "./browser-base";

export default abstract class BaseBrowserLabelsAgent extends BaseBrowserAgent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    let description = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For your first visit, please start by calling either the \`navigate_to\` or \`current_page\` tool. After each action you perform, I will provide you with updated information about the current state, including page screenshots and structured element data that has been specially processed for easier analysis.
* During execution, please output user-friendly step information. Do not output HTML-related element and index information to users, as this would cause user confusion.

* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_page_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load.
* Element interaction:
  - Only use indexes that exist in the provided element list
  - Browser tools only return elements in visible viewport by default
  - Each element has a unique index number (e.g., "[33]:<button>Submit</button>")
  - Elements marked with "[]:" are non-interactive (for context only, e.g., "[]: Google")
  - Use the latest element index, do not rely on historical outdated element indexes
  - Due to technical limitations, not all interactive elements may be identified; use coordinates to interact with unlisted elements
* Error handling:
  - If no suitable elements exist, use other functions to complete the task
  - If stuck, try alternative approaches, don't refuse tasks
  - Handle popups/cookies by accepting or closing them
  - When encountering scenarios that require user assistance such as login, verification codes, QR code scanning, Payment, etc, you can request user help.
* Browser operation:
  - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content
  - Please follow user instructions and don't be lazy until the task is completed. For example, if a user asks you to find 30 people, don't just find 10 - keep searching until you find all 30.`;
    if (config.parallelToolCalls) {
      description += `
* Parallelism:
   - Do not call the navigate_to tool simultaneously
   - Operations that support parallelism generally only include clicking and input operations
   - When filling out a form, fields that are not dependent on each other should be filled simultaneously
   - Avoid parallel processing for dependent operations, such as those that need to wait for page loading, DOM changes, redirects, subsequent operations that depend on the results of previous operations, or operations that may interfere with each other and affect the same page elements. In these cases, please do not use parallelization.`;
    }
    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: description,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "Browser operation agent, interact with the browser using the mouse and keyboard.",
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, typing, [{ index, text, enter }]);
    if (enter) {
      await sleep(200);
    }
  }

  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    await this.execute_script(agentContext, do_click, [
      { index, num_clicks, button },
    ]);
  }

  protected async scroll_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
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

  protected async scroll_mouse_wheel(
    agentContext: AgentContext,
    amount: number,
    extract_page_content: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, scroll_by, [{ amount }]);
    await sleep(200);
    if (!extract_page_content) {
      const tools = this.toolUseNames(
        agentContext.agentChain.agentRequest?.messages
      );
      let scroll_count = 0;
      for (let i = tools.length - 1; i >= Math.max(tools.length - 8, 0); i--) {
        if (tools[i] == "scroll_mouse_wheel") {
          scroll_count++;
        }
      }
      if (scroll_count >= 3) {
        extract_page_content = true;
      }
    }
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

  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    await this.execute_script(agentContext, hover_to, [{ index }]);
  }

  protected async get_select_options(
    agentContext: AgentContext,
    index: number
  ): Promise<any> {
    return await this.execute_script(agentContext, get_select_options, [
      { index },
    ]);
  }

  protected async select_option(
    agentContext: AgentContext,
    index: number,
    option: string
  ): Promise<any> {
    return await this.execute_script(agentContext, select_option, [
      { index, option },
    ]);
  }

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
        screenshot.imageBase64 = markImageBase64;
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

  protected get_element_script(index: number): string {
    return `window.get_highlight_element(${index});`;
  }

  public canParallelToolCalls(
    toolCalls?: LanguageModelV2ToolCallPart[]
  ): boolean {
    if (toolCalls) {
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        if (
          toolCall.toolName == "wait" ||
          toolCall.toolName == "navigate_to" ||
          toolCall.toolName == "switch_tab" ||
          toolCall.toolName == "scroll_mouse_wheel"
        ) {
          return false;
        }
      }
    }
    return super.canParallelToolCalls(toolCalls);
  }

  private buildInitTools(): Tool[] {
    return [
      {
        name: "navigate_to",
        description:
          "Navigate to a specific URL in the browser. Use this tool when you need to visit a webpage or change the current page location.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The complete URL to navigate to",
            },
          },
          required: ["url"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.navigate_to(agentContext, args.url as string)
          );
        },
      },
      {
        name: "current_page",
        description:
          "Get the currently active webpage information, return tabId, URL and title",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_current_page(agentContext)
          );
        },
      },
      {
        name: "go_back",
        description: "Go back to the previous page in browser history",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() => this.go_back(agentContext));
        },
      },
      {
        name: "input_text",
        description:
          "Inputs text into a element by first clicking to focus the element, then clearing any existing text and typing the new text. Optionally presses Enter after input completion.",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to input text into",
            },
            text: {
              type: "string",
              description: "The text to input",
            },
            enter: {
              type: "boolean",
              description:
                "When text input is completed, press Enter (applicable to search boxes)",
              default: false,
            },
          },
          required: ["index", "text"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.input_text(
              agentContext,
              args.index as number,
              args.text as string,
              args.enter as boolean
            )
          );
        },
      },
      {
        name: "click_element",
        description: "Click on an element by index",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to click",
            },
            num_clicks: {
              type: "number",
              description: "number of times to click the element, default 1",
            },
            button: {
              type: "string",
              description: "Mouse button type, default left",
              enum: ["left", "right", "middle"],
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.click_element(
              agentContext,
              args.index as number,
              (args.num_clicks || 1) as number,
              (args.button || "left") as any
            )
          );
        },
      },
      {
        name: "scroll_mouse_wheel",
        description:
          "Scroll the mouse wheel at current position, only scroll when you need to load more content",
        parameters: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "Scroll amount (up / down)",
              minimum: 1,
              maximum: 10,
            },
            direction: {
              type: "string",
              enum: ["up", "down"],
            },
            extract_page_content: {
              type: "boolean",
              default: false,
              description:
                "After scrolling is completed, whether to extract the current latest page content",
            },
          },
          required: ["amount", "direction", "extract_page_content"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(async () => {
            let amount = args.amount as number;
            await this.scroll_mouse_wheel(
              agentContext,
              args.direction == "up" ? -amount : amount,
              args.extract_page_content == true
            );
          });
        },
      },
      {
        name: "hover_to_element",
        description:
          "Hover the mouse over an element, use it when you need to hover to display more interactive information",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to input text into",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.hover_to_element(agentContext, args.index as number)
          );
        },
      },
      {
        name: "extract_page_content",
        description:
          "Extracts all content from the current webpage, including text and image links. Please use this tool when you need to retrieve webpage content.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.extract_page_content(agentContext)
          );
        },
      },
      {
        name: "get_select_options",
        description:
          "Get all options from a native dropdown element (<select>).",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to select",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_select_options(agentContext, args.index as number)
          );
        },
      },
      {
        name: "select_option",
        description:
          "Select the native dropdown option, Use this after get_select_options and when you need to select an option from a dropdown.",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to select",
            },
            option: {
              type: "string",
              description: "Text option",
            },
          },
          required: ["index", "option"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.select_option(
              agentContext,
              args.index as number,
              args.option as string
            )
          );
        },
      },
      {
        name: "get_all_tabs",
        description:
          "Get all tabs of the current browser, returns the tabId, URL, and title of all tab pages",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_all_tabs(agentContext)
          );
        },
      },
      {
        name: "switch_tab",
        description: "Switch to the specified tab (based on tabId)",
        parameters: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Tab ID, obtained through get_all_tabs",
            },
          },
          required: ["tabId"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.switch_tab(agentContext, args.tabId as number)
          );
        },
      },
      {
        name: "wait",
        noPlan: true,
        description:
          "Wait/pause execution for a specified duration. Use this tool when you need to wait for data loading, page rendering, or introduce delays between operations.",
        parameters: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "Wait duration in milliseconds",
              default: 500,
              minimum: 200,
              maximum: 10000,
            },
          },
          required: ["duration"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            sleep((args.duration || 200) as number)
          );
        },
      },
    ];
  }

  protected async double_screenshots(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<boolean> {
    return config.mode == "expert";
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<void> {
    try {
      const pseudoHtmlDescription =
        "This is the environmental information after the operation, including the latest browser screenshot and page elements. Please perform the next operation based on the environmental information. Do not output the following elements and index information in your response.\n\nIndex and elements:\n";
      let lastTool = this.lastToolResult(messages);
      if (
        lastTool &&
        lastTool.toolName !== "extract_page_content" &&
        lastTool.toolName !== "get_all_tabs" &&
        lastTool.toolName !== "variable_storage"
      ) {
        await sleep(300);
        const image_contents: LanguageModelV2FilePart[] = [];
        const result = await this.screenshot_and_html(agentContext);
        if (await this.double_screenshots(agentContext, messages, tools)) {
          const imageResult = result.double_screenshots
            ? result.double_screenshots
            : await this.screenshot_and_compress(
                agentContext,
                result.client_rect
              );
          const image = toImage(imageResult.imageBase64);
          image_contents.push({
            type: "file",
            data: image,
            mediaType: imageResult.imageType,
          });
        }
        if (result.imageBase64) {
          const image = toImage(result.imageBase64);
          image_contents.push({
            type: "file",
            data: image,
            mediaType: result.imageType || "image/png",
          });
        }
        messages.push({
          role: "user",
          content: [
            ...image_contents,
            {
              type: "text",
              text:
                pseudoHtmlDescription +
                "```html\n" +
                result.pseudoHtml +
                "\n```",
            },
          ],
        });
      }
      super.handleMessages(agentContext, messages, tools);
      this.handlePseudoHtmlText(messages, pseudoHtmlDescription);
    } catch (error) {
      Log.error("browser handleMessages error: ", error);
    }
  }

  private handlePseudoHtmlText(
    messages: LanguageModelV2Prompt,
    pseudoHtmlDescription: string
  ) {
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      if (message.role !== "user" || message.content.length <= 1) {
        continue;
      }
      let content = message.content;
      for (let j = 0; j < content.length; j++) {
        let _content = content[j];
        if (
          _content.type == "text" &&
          _content.text.startsWith(pseudoHtmlDescription)
        ) {
          if (i >= 2 && i < messages.length - 3) {
            _content.text = this.removePseudoHtmlAttr(_content.text, [
              "class",
              "src",
              "href",
            ]);
          }
        }
      }
      if (
        (content[0] as any).text == "[image]" &&
        (content[1] as any).text == "[image]"
      ) {
        content.splice(0, 1);
      }
    }
  }

  private removePseudoHtmlAttr(
    pseudoHtml: string,
    remove_attrs: string[]
  ): string {
    return pseudoHtml
      .split("\n")
      .map((line) => {
        if (!line.startsWith("[") || line.indexOf("]:<") == -1) {
          return line;
        }
        line = line.substring(line.indexOf("]:<") + 2);
        for (let i = 0; i < remove_attrs.length; i++) {
          let sIdx = line.indexOf(remove_attrs[i] + '="');
          if (sIdx == -1) {
            continue;
          }
          let eIdx = line.indexOf('"', sIdx + remove_attrs[i].length + 3);
          if (eIdx == -1) {
            continue;
          }
          line = line.substring(0, sIdx) + line.substring(eIdx + 1).trim();
        }
        return line.replace('" >', '">').replace(" >", ">");
      })
      .join("\n");
  }
}

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

export { BaseBrowserLabelsAgent };
