import { JSONSchema7 } from "json-schema";
import { ChatContext } from "./chat-context";
import { DialogueParams, DialogueTool, ToolResult } from "../types";

export const TOOL_NAME = "webSearch";

export default class WebSearchTool implements DialogueTool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  private chatContext: ChatContext;
  private params: DialogueParams;

  constructor(chatContext: ChatContext, params: DialogueParams) {
    this.params = params;
    this.chatContext = chatContext;
    this.description = `Search the web for information using search engine API. This tool can perform web searches to find current information, news, articles, and other web content related to the query. It returns search results with titles, descriptions, URLs, and other relevant metadata, use this tool when users need the latest data/information and have NOT specified a particular platform or website, use the search tool.`;
    this.parameters = {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query to execute. Use specific keywords and phrases for better results. Current UTC time: {current_utc_time}",
        },
        keywords: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "The search keywords to execute. Contains 2-4 keywords, representing different search perspectives for the query. Use specific keywords and phrases for better results. Current UTC time: {current_utc_time}",
        },
        language: {
          type: "string",
          description:
            "Language code for search results (e.g., 'en', 'zh', 'ja'). If not specified, will be auto-detected from query.",
        },
        count: {
          type: "integer",
          description:
            "Number of search results to return (default: 10, max: 50)",
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query", "keywords"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return {
      content: [
        {
          type: "text",
          text: "Error: not implemented",
        },
      ],
    };
  }
}
