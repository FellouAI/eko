import { BrowserBaseCapability } from "./base";
import { AgentContext } from "../../core/context";
import { Tool, ToolResult } from "../../types";
import { sleep, toImage } from "../../common/utils";
import config from "../../config";
import { LanguageModelV2FilePart, LanguageModelV2Prompt } from "@ai-sdk/provider";

/**
 * Browser labels capability abstract class
 * 
 * Extends BrowserBaseCapability with DOM element-based interaction tools.
 * Provides tools for clicking elements by index, inputting text, selecting options, etc.
 */
export abstract class BrowserLabelsCapability extends BrowserBaseCapability {
  constructor() {
    super();
    // Merge base tools with labels-specific tools
    this._tools = [...this._tools, ...this.buildLabelsTools()];
  }

  /**
   * Abstract methods to be implemented by concrete browser labels capability implementations
   */
  protected abstract input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any>;

  protected abstract click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any>;

  protected abstract scroll_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void>;

  protected abstract scroll_mouse_wheel(
    agentContext: AgentContext,
    amount: number,
    extract_page_content: boolean
  ): Promise<any>;

  protected abstract hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void>;

  protected abstract get_select_options(
    agentContext: AgentContext,
    index: number
  ): Promise<any>;

  protected abstract select_option(
    agentContext: AgentContext,
    index: number,
    option: string
  ): Promise<any>;

  /**
   * Get screenshot and HTML element information (similar to BaseBrowserLabelsAgent.screenshot_and_html)
   * This method builds DOM tree, gets element information, and takes screenshot
   * Must be implemented by concrete browser capability implementations
   */
  protected abstract screenshot_and_html(agentContext: AgentContext): Promise<{
    imageBase64?: string;
    imageType?: "image/jpeg" | "image/png";
    pseudoHtml: string;
    double_screenshots?: {
      imageBase64: string;
      imageType: "image/jpeg" | "image/png";
    };
    client_rect: { width: number; height: number };
  }>;

  /**
   * Helper method to compress screenshot (similar to BaseBrowserLabelsAgent.screenshot_and_compress)
   * Must be implemented by concrete browser capability implementations
   */
  protected abstract screenshot_and_compress(
    agentContext: AgentContext,
    client_rect?: { width: number; height: number }
  ): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }>;

  /**
   * Determine if double screenshots should be used (similar to BaseBrowserLabelsAgent.double_screenshots)
   * Default implementation checks config.mode == "expert", can be overridden by concrete implementations
   */
  protected async double_screenshots(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<boolean> {
    return config.mode == "expert";
  }

  /**
   * Build labels-specific tools
   */
  private buildLabelsTools(): Tool[] {
    return [
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
        name: "scroll_to_element",
        description:
          "Scroll to make an element visible in the viewport",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to scroll to",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.scroll_to_element(agentContext, args.index as number)
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
      {
        name: "screenshot",
        description: "Take a screenshot of the current page. This tool is REQUIRED before any element interaction in labels mode. It captures the page state, analyzes interactive elements, and generates element indices that are needed for click_element, input_text, and other element-based tools.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          // Wait a bit before taking screenshot (following BaseBrowserLabelsAgent.handleMessages logic)
          await sleep(300);
          
          // Get screenshot and HTML element information
          const result = await this.screenshot_and_html(agentContext);
          
          // Directly manipulate agentContext.messages to add screenshot (following BaseBrowserLabelsAgent.handleMessages logic)
          if (agentContext.messages) {
            const pseudoHtmlDescription =
              "This is the environmental information after the operation, including the latest browser screenshot and page elements. Please perform the next operation based on the environmental information. Do not output the following elements and index information in your response.\n\nIndex and elements:\n";
            
            const image_contents: LanguageModelV2FilePart[] = [];
            
            // Add double screenshots if needed (following BaseBrowserLabelsAgent.handleMessages logic)
            if (await this.double_screenshots(agentContext, agentContext.messages, this._tools)) {
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
            
            // Add main screenshot
            if (result.imageBase64) {
              const image = toImage(result.imageBase64);
              image_contents.push({
                type: "file",
                data: image,
                mediaType: result.imageType || "image/png",
              });
            }
            
            // Add screenshot and pseudoHtml to messages (following BaseBrowserLabelsAgent.handleMessages format)
            agentContext.messages.push({
              role: "user",
              content: [
                ...image_contents,
                {
                  type: "text",
                  text:
                    pseudoHtmlDescription + "```html\n" + result.pseudoHtml + "\n```",
                },
              ],
            });
          }
          
          // Return simple text result
          return {
            content: [
              {
                type: "text",
                text: "Screenshot captured successfully",
              },
            ],
          };
        },
      },
    ];
  }

  /**
   * Get capability guide for system prompt
   */
  getGuide(): string {
    let guide = `Browser operation capability, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.

* CRITICAL: Screenshot is REQUIRED before ANY interaction
  - ⚠️ YOU MUST ALWAYS call the \`screenshot\` tool FIRST before attempting any element interaction (click_element, input_text, scroll_to_element, hover_to_element, get_select_options, select_option)
  - ⚠️ Screenshot MUST be called after every page navigation, page load, or DOM change
  - ⚠️ Screenshot MUST be called before using any element index numbers
  - ⚠️ Without calling screenshot first, element interactions will FAIL because element indices are not available
  - ⚠️ After calling \`navigate_to\` or \`current_page\`, you MUST immediately call \`screenshot\` to get the current page state
  - ⚠️ After any action that changes the page (click, input, scroll, etc.), you MUST call \`screenshot\` again to refresh element indices
  - The screenshot tool initializes the DOM tree and generates element indices that are required for all interaction tools

* Workflow:
  1. First, call \`navigate_to\` or \`current_page\` to load/access the page
  2. IMMEDIATELY call \`screenshot\` to capture the current page state and get element indices
  3. Analyze the screenshot and element list to identify the elements you need to interact with
  4. Use interaction tools (click_element, input_text, etc.) with the indices from the screenshot
  5. After each interaction that may change the page, call \`screenshot\` again to refresh element indices
  6. Repeat steps 3-5 until the task is completed

* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_page_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load, then call \`screenshot\` again.

* Element interaction:
  - ⚠️ NEVER use element indices without first calling \`screenshot\` - the indices will not exist and interactions will fail
  - Only use indexes that exist in the provided element list from the most recent screenshot
  - Browser tools only return elements in visible viewport by default
  - Each element has a unique index number (e.g., "[33]:<button>Submit</button>")
  - Elements marked with "[]:" are non-interactive (for context only, e.g., "[]: Google")
  - Use the latest element index from the most recent screenshot, do not rely on historical outdated element indexes
  - Due to technical limitations, not all interactive elements may be identified; use coordinates to interact with unlisted elements

* Error handling:
  - If you get an error about "get_highlight_element is not a function" or "element index not found", it means you forgot to call \`screenshot\` first - call \`screenshot\` immediately
  - If no suitable elements exist, use other functions to complete the task
  - If stuck, try alternative approaches, don't refuse tasks
  - Handle popups/cookies by accepting or closing them
  - When encountering scenarios that require user assistance such as login, verification codes, QR code scanning, Payment, etc, you can request user help.

* Browser operation:
  - Navigation: Prefer using \`click_element\` to navigate by clicking on links, buttons, or navigation elements on the page. Avoid using browser back/forward navigation (go_back, go_forward) unless absolutely necessary. Clicking on page elements provides better context and maintains the page state more reliably.
  - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content
  - After scrolling, ALWAYS call \`screenshot\` again to refresh element indices for the new viewport
  - Please follow user instructions and don't be lazy until the task is completed. For example, if a user asks you to find 30 people, don't just find 10 - keep searching until you find all 30.
* During execution, please output user-friendly step information. Do not output HTML-related element and index information to users, as this would cause user confusion.`;

    if (config.parallelToolCalls) {
      guide += `
* Parallelism:
   - Do not call the navigate_to tool simultaneously
   - Operations that support parallelism generally only include clicking and input operations
   - When filling out a form, fields that are not dependent on each other should be filled simultaneously
   - Avoid parallel processing for dependent operations, such as those that need to wait for page loading, DOM changes, redirects, subsequent operations that depend on the results of previous operations, or operations that may interfere with each other and affect the same page elements. In these cases, please do not use parallelization.`;
    }

    return guide;
  }
}

