import config from "../../config";
import { AgentContext } from "../agent-context";
import { run_build_dom_tree } from "./build-dom-tree";
import { BaseBrowserAgent, AGENT_NAME } from "./browser-base";
import {
  LanguageModelV2Prompt,
  LanguageModelV2FilePart,
  LanguageModelV2ToolCallPart,
} from "@ai-sdk/provider";
import { Tool, ToolResult, IMcpClient } from "../../types";
import { mark_screenshot_highlight_elements } from "./utils";
import { mergeTools, sleep, toImage, compressImageData } from "../../common/utils";

/**
 * Loop detection state for tracking repeated actions
 */
interface LoopDetectionState {
  actionHistory: Array<{
    toolName: string;
    params: string;
    timestamp: number;
    pageUrl?: string;
  }>;
  consecutiveFailures: number;
  lastDomHash: string;
  stuckCounter: number;
  fallbackMode: boolean;
  lastSuccessfulAction: number;
}

/**
 * Hybrid Browser Agent - DOM-first with Visual Fallback
 *
 * This agent prioritizes DOM-based navigation for speed and reliability,
 * but automatically falls back to visual/coordinate-based interaction when:
 * - DOM interactions fail repeatedly
 * - Loop/stuck states are detected
 * - Elements cannot be found in DOM
 */
export default abstract class BaseBrowserHybridAgent extends BaseBrowserAgent {
  private loopState: LoopDetectionState = {
    actionHistory: [],
    consecutiveFailures: 0,
    lastDomHash: "",
    stuckCounter: 0,
    fallbackMode: false,
    lastSuccessfulAction: Date.now(),
  };

  // Configuration for loop detection (loaded from config)
  private get LOOP_THRESHOLD(): number {
    return config.fallbackConfig?.loopThreshold ?? 3;
  }
  private get STUCK_THRESHOLD(): number {
    return config.fallbackConfig?.stuckThreshold ?? 5;
  }
  private get HISTORY_SIZE(): number {
    return config.fallbackConfig?.historySize ?? 20;
  }
  private get FALLBACK_RECOVERY_ACTIONS(): number {
    return config.fallbackConfig?.recoveryActions ?? 3;
  }
  private get ENABLE_AUTO_FALLBACK(): boolean {
    return config.fallbackConfig?.enableAutoFallback ?? true;
  }

  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    let description = `You are a browser operation agent using DOM-first navigation with visual fallback.
* This agent prioritizes fast DOM-based interactions but can fall back to visual/coordinate-based clicks when needed.
* For your first visit, please start by calling either the \`navigate_to\` or \`current_page\` tool.
* After each action, you will receive updated page state information.

* Navigation Strategy:
  - PRIMARY: Use DOM element indexes (e.g., click_element with index) - fastest and most reliable
  - FALLBACK: Use coordinate-based clicks (click_at_coordinates) when DOM fails or loops detected
  - The system automatically detects when you're stuck and enables fallback mode

* Screenshot and Elements:
  - Screenshots show labeled bounding boxes corresponding to element indexes
  - Elements are returned as indexed list: "[33]:<button>Submit</button>"
  - Elements marked with "[]:" are non-interactive context
  - When in fallback mode, use visual coordinates from screenshots

* Element interaction:
  - Only use indexes that exist in the provided element list
  - Each element has a unique index number
  - If DOM interaction fails, try click_at_coordinates with x,y from screenshot
  - Use the latest element index, do not rely on historical outdated element indexes

* Error handling:
  - If stuck in a loop, the system will automatically switch to fallback mode
  - In fallback mode, prefer coordinate-based interactions
  - Handle popups/cookies by accepting or closing them

* Speed optimizations:
  - DOM interactions are preferred as they're faster than visual processing
  - Avoid unnecessary waits - the system handles timing automatically
  - Use scroll only when content is not visible`;

    if (config.parallelToolCalls) {
      description += `
* Parallelism:
   - Do not call navigate_to simultaneously
   - Click and input operations can be parallel if independent
   - When filling forms, fill independent fields simultaneously`;
    }

    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: description,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "Browser operation agent with DOM-first navigation and visual fallback.",
    });

    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  /**
   * Reset loop detection state
   */
  protected resetLoopState(): void {
    this.loopState = {
      actionHistory: [],
      consecutiveFailures: 0,
      lastDomHash: "",
      stuckCounter: 0,
      fallbackMode: false,
      lastSuccessfulAction: Date.now(),
    };
  }

  /**
   * Track an action for loop detection
   */
  private trackAction(toolName: string, params: Record<string, unknown>, pageUrl?: string): void {
    const paramsStr = JSON.stringify(params);
    this.loopState.actionHistory.push({
      toolName,
      params: paramsStr,
      timestamp: Date.now(),
      pageUrl,
    });

    // Keep history bounded
    if (this.loopState.actionHistory.length > this.HISTORY_SIZE) {
      this.loopState.actionHistory.shift();
    }
  }

  /**
   * Detect if we're in a loop (same action repeated multiple times)
   */
  private detectLoop(): boolean {
    const history = this.loopState.actionHistory;
    if (history.length < this.LOOP_THRESHOLD) {
      return false;
    }

    const recentActions = history.slice(-this.LOOP_THRESHOLD);
    const firstAction = recentActions[0];

    // Check if all recent actions are identical
    const isLoop = recentActions.every(
      (action) =>
        action.toolName === firstAction.toolName &&
        action.params === firstAction.params
    );

    if (isLoop) {
      this.loopState.stuckCounter++;
    }

    return isLoop;
  }

  /**
   * Check if we should switch to fallback mode
   */
  private shouldUseFallback(): boolean {
    // Auto fallback disabled
    if (!this.ENABLE_AUTO_FALLBACK) {
      return false;
    }

    // Already in fallback mode
    if (this.loopState.fallbackMode) {
      return true;
    }

    // Too many consecutive failures
    if (this.loopState.consecutiveFailures >= this.STUCK_THRESHOLD) {
      this.loopState.fallbackMode = true;
      return true;
    }

    // Loop detected
    if (this.detectLoop()) {
      this.loopState.fallbackMode = true;
      return true;
    }

    return false;
  }

  /**
   * Record successful action and potentially exit fallback mode
   */
  private recordSuccess(): void {
    this.loopState.consecutiveFailures = 0;
    this.loopState.lastSuccessfulAction = Date.now();

    // Check if we can exit fallback mode
    if (this.loopState.fallbackMode) {
      const recentSuccesses = this.loopState.actionHistory
        .slice(-this.FALLBACK_RECOVERY_ACTIONS)
        .filter((a) => a.timestamp > this.loopState.lastSuccessfulAction - 10000);

      if (recentSuccesses.length >= this.FALLBACK_RECOVERY_ACTIONS) {
        this.loopState.fallbackMode = false;
        this.loopState.stuckCounter = 0;
      }
    }
  }

  /**
   * Record failure
   */
  private recordFailure(): void {
    this.loopState.consecutiveFailures++;
  }

  /**
   * Generate a simple hash of DOM state for change detection
   */
  private async getDomHash(agentContext: AgentContext): Promise<string> {
    try {
      const hash = await this.execute_script(
        agentContext,
        () => {
          const body = document.body;
          if (!body) return "";
          // Simple hash based on element count and some text content
          const elementCount = body.getElementsByTagName("*").length;
          const textSample = body.innerText?.substring(0, 500) || "";
          return `${elementCount}-${textSample.length}-${document.title}`;
        },
        []
      );
      return hash || "";
    } catch {
      return "";
    }
  }

  /**
   * Check if page state has changed
   */
  private async hasPageChanged(agentContext: AgentContext): Promise<boolean> {
    const currentHash = await this.getDomHash(agentContext);
    const changed = currentHash !== this.loopState.lastDomHash;
    this.loopState.lastDomHash = currentHash;
    return changed;
  }

  // DOM-based input
  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    this.trackAction("input_text", { index, text, enter });

    try {
      await this.execute_script(agentContext, typing, [{ index, text, enter }]);
      if (enter) {
        await sleep(150); // Reduced from 200
      }
      this.recordSuccess();
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }

  // DOM-based click
  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    this.trackAction("click_element", { index, num_clicks, button });

    try {
      const result = await this.execute_script(agentContext, do_click, [
        { index, num_clicks, button },
      ]);

      if (result === false) {
        this.recordFailure();
        throw new Error(`Element with index ${index} not found`);
      }

      this.recordSuccess();
      return result;
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }

  // Coordinate-based click (fallback)
  protected async click_at_coordinates(
    agentContext: AgentContext,
    x: number,
    y: number,
    num_clicks: number = 1,
    button: "left" | "right" | "middle" = "left"
  ): Promise<any> {
    this.trackAction("click_at_coordinates", { x, y, num_clicks, button });

    try {
      const result = await this.execute_script(agentContext, do_click_at_coords, [
        { x, y, num_clicks, button },
      ]);
      this.recordSuccess();
      return result;
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }

  // Coordinate-based input (fallback)
  protected async input_at_coordinates(
    agentContext: AgentContext,
    x: number,
    y: number,
    text: string,
    enter: boolean = false
  ): Promise<any> {
    this.trackAction("input_at_coordinates", { x, y, text, enter });

    try {
      // Click to focus first
      await this.execute_script(agentContext, do_click_at_coords, [
        { x, y, num_clicks: 1, button: "left" },
      ]);
      await sleep(50);

      // Then type
      await this.execute_script(agentContext, typing_focused, [{ text, enter }]);
      this.recordSuccess();
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }

  protected async scroll_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    await this.execute_script(
      agentContext,
      (index) => {
        const element = (window as any).get_highlight_element(index);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      },
      [index]
    );
    await sleep(150); // Reduced from 200
  }

  protected async scroll_mouse_wheel(
    agentContext: AgentContext,
    amount: number,
    extract_page_content: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, scroll_by, [{ amount }]);
    await sleep(150); // Reduced from 200

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
          "title: " + page_result.title + "\n" +
          "page_url: " + page_result.page_url + "\n" +
          "page_content: " + page_result.page_content,
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
    fallbackMode: boolean;
  }> {
    try {
      let element_result;
      let double_screenshots;

      // Get displayHighlights config (default false for clean UI - no colorful boxes)
      const displayHighlights = config.displayHighlights ?? false;

      // Optimized: Reduce retries and sleep times
      for (let i = 0; i < 3; i++) { // Reduced from 5
        await sleep(100); // Reduced from 200
        await this.execute_script(agentContext, run_build_dom_tree, []);
        await sleep(30); // Reduced from 50
        element_result = (await this.execute_script(
          agentContext,
          (markHighlightElements: boolean, displayHighlights: boolean) => {
            return (window as any).get_clickable_elements(
              markHighlightElements,
              undefined,
              displayHighlights
            );
          },
          [config.mode != "fast" && config.markImageMode == "dom", displayHighlights]
        )) as any;
        if (element_result) {
          break;
        }
      }

      await sleep(50); // Reduced from 100

      const screenshot =
        config.mode == "fast"
          ? undefined
          : await this.screenshot_and_compress(
              agentContext,
              element_result?.client_rect
            );

      if (
        config.markImageMode == "draw" &&
        screenshot?.imageBase64 &&
        element_result?.area_map
      ) {
        double_screenshots = { ...screenshot };
        const markImageBase64 = await mark_screenshot_highlight_elements(
          screenshot,
          element_result.area_map,
          element_result.client_rect
        );
        screenshot.imageBase64 = markImageBase64;
      }

      const pseudoHtml = element_result?.element_str || "";

      // Check for page changes and update loop detection
      await this.hasPageChanged(agentContext);

      return {
        double_screenshots: double_screenshots,
        imageBase64: screenshot?.imageBase64,
        imageType: screenshot?.imageType,
        pseudoHtml: pseudoHtml,
        client_rect: element_result?.client_rect || { width: 1920, height: 1080 },
        fallbackMode: this.shouldUseFallback(),
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
          this.resetLoopState(); // Reset on navigation
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
          this.resetLoopState();
          return await this.callInnerTool(() => this.go_back(agentContext));
        },
      },
      {
        name: "input_text",
        description:
          "Inputs text into a DOM element by index. Clicks to focus, clears existing text, and types new text. Optionally presses Enter.",
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
              description: "Press Enter after input (for search boxes)",
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
        description: "Click on a DOM element by its index (primary method)",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to click",
            },
            num_clicks: {
              type: "number",
              description: "Number of times to click (default 1)",
            },
            button: {
              type: "string",
              description: "Mouse button type (default left)",
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
        name: "click_at_coordinates",
        description:
          "Click at specific x,y coordinates on the page. Use as FALLBACK when DOM-based click_element fails or when in fallback mode. Coordinates are relative to viewport.",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "X coordinate (pixels from left edge)",
            },
            y: {
              type: "number",
              description: "Y coordinate (pixels from top edge)",
            },
            num_clicks: {
              type: "number",
              description: "Number of times to click (default 1)",
            },
            button: {
              type: "string",
              description: "Mouse button type (default left)",
              enum: ["left", "right", "middle"],
            },
          },
          required: ["x", "y"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.click_at_coordinates(
              agentContext,
              args.x as number,
              args.y as number,
              (args.num_clicks || 1) as number,
              (args.button || "left") as any
            )
          );
        },
      },
      {
        name: "input_at_coordinates",
        description:
          "Click at coordinates to focus, then type text. Use as FALLBACK when DOM-based input_text fails.",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "X coordinate to click for focus",
            },
            y: {
              type: "number",
              description: "Y coordinate to click for focus",
            },
            text: {
              type: "string",
              description: "The text to input",
            },
            enter: {
              type: "boolean",
              description: "Press Enter after input",
              default: false,
            },
          },
          required: ["x", "y", "text"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.input_at_coordinates(
              agentContext,
              args.x as number,
              args.y as number,
              args.text as string,
              args.enter as boolean
            )
          );
        },
      },
      {
        name: "scroll_mouse_wheel",
        description:
          "Scroll the page. Only scroll when you need to load more content or find elements.",
        parameters: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "Scroll amount (1-10)",
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
              description: "Extract page content after scrolling",
            },
          },
          required: ["amount", "direction"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(async () => {
            let amount = args.amount as number;
            return await this.scroll_mouse_wheel(
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
          "Hover the mouse over an element to display tooltips or dropdowns",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to hover over",
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
          "Extracts all text content and image links from the current webpage.",
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
        description: "Get all options from a native dropdown (<select>).",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the select element",
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
        description: "Select an option from a native dropdown.",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the select element",
            },
            option: {
              type: "string",
              description: "Text of the option to select",
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
        description: "Get all browser tabs with tabId, URL, and title",
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
        description: "Switch to a specific tab by tabId",
        parameters: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Tab ID from get_all_tabs",
            },
          },
          required: ["tabId"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          this.resetLoopState();
          return await this.callInnerTool(() =>
            this.switch_tab(agentContext, args.tabId as number)
          );
        },
      },
      {
        name: "wait",
        noPlan: true,
        description: "Wait for a specified duration (for page loading)",
        parameters: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "Wait duration in milliseconds (200-10000)",
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
        name: "get_fallback_status",
        noPlan: true,
        description:
          "Check if the agent is in fallback mode due to detected loops or failures",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          const status = {
            fallbackMode: this.loopState.fallbackMode,
            consecutiveFailures: this.loopState.consecutiveFailures,
            stuckCounter: this.loopState.stuckCounter,
            recommendation: this.loopState.fallbackMode
              ? "Use coordinate-based tools (click_at_coordinates, input_at_coordinates)"
              : "Use DOM-based tools (click_element, input_text)",
          };
          return {
            content: [{ type: "text", text: JSON.stringify(status) }],
          };
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
    const pseudoHtmlDescription =
      "This is the environmental information after the operation, including the latest browser screenshot and page elements. Please perform the next operation based on the environmental information. Do not output the following elements and index information in your response.\n\nIndex and elements:\n";

    let lastTool = this.lastToolResult(messages);
    if (
      lastTool &&
      lastTool.toolName !== "extract_page_content" &&
      lastTool.toolName !== "get_all_tabs" &&
      lastTool.toolName !== "variable_storage" &&
      lastTool.toolName !== "get_fallback_status"
    ) {
      await sleep(200); // Reduced from 300
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

      // Add fallback mode indicator to the message
      let statusNote = "";
      if (result.fallbackMode) {
        statusNote = "\n\n[FALLBACK MODE ACTIVE: Use coordinate-based tools (click_at_coordinates, input_at_coordinates) for more reliable interactions]";
      }

      messages.push({
        role: "user",
        content: [
          ...image_contents,
          {
            type: "text",
            text:
              pseudoHtmlDescription + "```html\n" + result.pseudoHtml + "\n```" + statusNote,
          },
        ],
      });
    }

    super.handleMessages(agentContext, messages, tools);
    this.handlePseudoHtmlText(messages, pseudoHtmlDescription);
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

// Helper functions injected into the page

function typing(params: {
  index: number;
  text: string;
  enter: boolean;
  natural?: boolean; // Enable natural character-by-character typing
}): boolean {
  let { index, text, enter, natural = true } = params;
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
        input = input.querySelector("span") || input.querySelector("div") || input;
      }
    }
  }

  // Click to focus first (simulates real user behavior)
  input.click && input.click();
  input.focus && input.focus();

  // Clear existing content
  if (input.value !== undefined) {
    input.value = "";
  } else if (input.textContent !== undefined) {
    input.textContent = "";
  }

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

  // Natural typing: simulate character-by-character input
  if (natural && text) {
    const typeCharacter = (char: string, currentValue: string) => {
      const newValue = currentValue + char;

      // Dispatch keydown event
      const keydownEvent = new KeyboardEvent("keydown", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keydownEvent);

      // Update value
      if (input.value !== undefined) {
        input.value = newValue;
        if (input.__proto__) {
          const value_setter = Object.getOwnPropertyDescriptor(
            input.__proto__ as any,
            "value"
          )?.set;
          value_setter && value_setter.call(input, newValue);
        }
      } else if (input.textContent !== undefined) {
        input.textContent = newValue;
      }

      // Dispatch input event
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: char
      }));

      // Dispatch keyup event
      const keyupEvent = new KeyboardEvent("keyup", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keyupEvent);

      return newValue;
    };

    // Type each character with natural timing variation
    let currentValue = "";
    for (let i = 0; i < text.length; i++) {
      currentValue = typeCharacter(text[i], currentValue);
    }
  } else {
    // Fallback: set value directly (faster but less natural)
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
  }

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

function typing_focused(params: { text: string; enter: boolean; natural?: boolean }): boolean {
  const { text, enter, natural = true } = params;
  const input = document.activeElement as any;
  if (!input) {
    return false;
  }

  // Clear existing content first
  if (input.value !== undefined) {
    input.value = "";
  } else if (input.textContent !== undefined) {
    input.textContent = "";
  }

  // Natural typing: simulate character-by-character input
  if (natural && text) {
    const typeCharacter = (char: string, currentValue: string) => {
      const newValue = currentValue + char;

      // Dispatch keydown event
      const keydownEvent = new KeyboardEvent("keydown", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keydownEvent);

      // Update value
      if (input.value !== undefined) {
        input.value = newValue;
        if (input.__proto__) {
          const value_setter = Object.getOwnPropertyDescriptor(
            input.__proto__ as any,
            "value"
          )?.set;
          value_setter && value_setter.call(input, newValue);
        }
      } else if (input.textContent !== undefined) {
        input.textContent = newValue;
      }

      // Dispatch input event
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: char
      }));

      // Dispatch keyup event
      const keyupEvent = new KeyboardEvent("keyup", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keyupEvent);

      return newValue;
    };

    // Type each character
    let currentValue = "";
    for (let i = 0; i < text.length; i++) {
      currentValue = typeCharacter(text[i], currentValue);
    }
  } else {
    // Fallback: set value directly
    if (input.value !== undefined) {
      input.value = text;
      if (input.__proto__) {
        const value_setter = Object.getOwnPropertyDescriptor(
          input.__proto__ as any,
          "value"
        )?.set;
        value_setter && value_setter.call(input, text);
      }
    } else if (input.textContent !== undefined) {
      input.textContent = text;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

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
  natural?: boolean; // Enable natural cursor movement simulation
}): boolean {
  let { index, button, num_clicks, natural = true } = params;

  function simulateMouseEvent(
    eventTypes: Array<string>,
    button: 0 | 1 | 2
  ): boolean {
    let element = (window as any).get_highlight_element(index);
    if (!element) {
      return false;
    }

    // Get element center coordinates for natural mouse movement
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Simulate natural mouse movement to element (mousemove, mouseenter, mouseover)
    if (natural) {
      const moveEvents = ["mousemove", "mouseenter", "mouseover"];
      for (const eventType of moveEvents) {
        const moveEvent = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
        });
        element.dispatchEvent(moveEvent);
      }
    }

    for (let n = 0; n < num_clicks; n++) {
      for (let i = 0; i < eventTypes.length; i++) {
        const eventType = eventTypes[i];
        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true,
          button,
          clientX: centerX,
          clientY: centerY,
        });
        if (eventType === "click" && element.click) {
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

function do_click_at_coords(params: {
  x: number;
  y: number;
  button: "left" | "right" | "middle";
  num_clicks: number;
  natural?: boolean; // Enable natural cursor movement simulation
}): boolean {
  const { x, y, button, num_clicks, natural = true } = params;
  const element = document.elementFromPoint(x, y);
  if (!element) {
    return false;
  }

  const buttonMap = { left: 0, middle: 1, right: 2 };
  const buttonNum = buttonMap[button] || 0;

  // Simulate natural mouse movement to coordinates
  if (natural) {
    const moveEvents = ["mousemove", "mouseenter", "mouseover"];
    for (const eventType of moveEvents) {
      const moveEvent = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      element.dispatchEvent(moveEvent);
    }
  }

  for (let n = 0; n < num_clicks; n++) {
    const eventTypes =
      button === "right"
        ? ["mousedown", "mouseup", "contextmenu"]
        : ["mousedown", "mouseup", "click"];

    for (const eventType of eventTypes) {
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: buttonNum,
      });

      if (eventType === "click" && (element as any).click) {
        (element as any).click();
      } else {
        element.dispatchEvent(event);
      }
    }
    (element as any).focus?.();
  }
  return true;
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

export { BaseBrowserHybridAgent };
