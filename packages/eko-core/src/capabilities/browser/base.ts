import { BaseCapability } from "../base";
import { AgentContext } from "../../core/context";
import { Tool, ToolResult } from "../../types";
import { sleep, toImage } from "../../common/utils";
import * as utils from "../../agent/browser/utils";
import { LanguageModelV2FilePart } from "@ai-sdk/provider";

/**
 * Browser base capability abstract class
 * 
 * Provides basic browser navigation and page management tools.
 * Subclasses must implement the abstract browser operation methods.
 */
export abstract class BrowserBaseCapability extends BaseCapability {
  name = "Browser";

  constructor() {
    super();
    this._tools = this.buildTools();
  }

  /**
   * Abstract methods to be implemented by concrete browser capability implementations
   */
  protected abstract screenshot(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }>;

  protected abstract navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{
    url: string;
    title?: string;
  }>;

  protected abstract get_all_tabs(agentContext: AgentContext): Promise<
    Array<{
      tabId: number;
      url: string;
      title: string;
    }>
  >;

  protected abstract switch_tab(
    agentContext: AgentContext,
    tabId: number
  ): Promise<{
    tabId: number;
    url: string;
    title: string;
  }>;

  protected abstract execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any>;

  /**
   * Helper method: navigate back in browser history
   */
  protected async go_back(agentContext: AgentContext): Promise<void> {
    try {
      await this.execute_script(
        agentContext,
        () => {
          (window as any).navigation.back();
        },
        []
      );
      await sleep(100);
    } catch (e) {}
  }

  /**
   * Helper method: get current page info
   */
  protected async get_current_page(agentContext: AgentContext): Promise<{
    url: string;
    title?: string;
    tabId?: number;
  }> {
    return await this.execute_script(
      agentContext,
      () => {
        return {
          url: (window as any).location.href,
          title: (window as any).document.title,
        };
      },
      []
    );
  }

  /**
   * Helper method: extract page content
   */
  protected async extract_page_content(
    agentContext: AgentContext,
    variable_name?: string
  ): Promise<{
    title: string;
    page_url: string;
    page_content: string;
  }> {
    let content = await this.execute_script(
      agentContext,
      utils.extract_page_content,
      []
    );
    let pageInfo = await this.get_current_page(agentContext);
    let result = `title: ${pageInfo.title}\npage_url: ${pageInfo.url}\npage_content: \n${content}`;
    if (variable_name) {
      agentContext.context.variables.set(variable_name, result);
    }
    return {
      title: pageInfo.title || "",
      page_url: pageInfo.url,
      page_content: content,
    };
  }

  /**
   * Helper method to format tool result
   */
  protected async callInnerTool(fun: () => Promise<any>): Promise<ToolResult> {
    let result = await fun();
    return {
      content: [
        {
          type: "text",
          text: result
            ? typeof result == "string"
              ? result
              : JSON.stringify(result)
            : "Successful",
        },
      ],
    };
  }

  /**
   * Build tools for browser base operations
   */
  private buildTools(): Tool[] {
    return [
      {
        name: "navigate_to",
        description: "Navigate to a specific url",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The url to navigate to",
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
        description: "Get the information of the current webpage (url, title)",
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
        description: "Navigate back in browser history",
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
        name: "get_all_tabs",
        description: "Get all open browser tabs",
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
        description: "Switch to a specific browser tab",
        parameters: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Tab ID to switch to",
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
        name: "extract_page_content",
        description: "Extract text content from the current page",
        parameters: {
          type: "object",
          properties: {
            variable_name: {
              type: "string",
              description: "Optional variable name to store the extracted content",
            },
          },
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.extract_page_content(
              agentContext,
              args.variable_name as string
            )
          );
        },
      },
    ];
  }

  /**
   * Get capability guide for system prompt
   */
  getGuide(): string {
    return `Browser operation agent, interact with the browser using the mouse and keyboard.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first.
* BROWSER OPERATIONS:
  - Navigate to URLs and manage history
  - Fill forms and submit data
  - Click elements and interact with pages
  - Extract text and HTML content
  - Wait for elements to load
  - Scroll pages and handle infinite scroll`;
  }
}

