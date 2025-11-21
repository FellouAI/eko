import { JSONSchema7 } from "json-schema";
import { ChatContext } from "./chat-context";
import { DialogueParams, DialogueTool, ToolResult } from "../types";

export const TOOL_NAME = "webpageQa";

export default class WebpageQaTool implements DialogueTool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  private chatContext: ChatContext;
  private params: DialogueParams;

  constructor(chatContext: ChatContext, params: DialogueParams) {
    this.params = params;
    this.chatContext = chatContext;
    this.description = `This tool is designed only for handling simple web-related tasks, including summarizing webpage content, extracting data from web pages, translating webpage content, and converting webpage information into more easily understandable forms. It does not interact with or operate web pages. For more complex browser tasks, please use deepAction.It does not perform operations on the webpage itself, but only involves reading the page content. Users do not need to provide the web page content, as the tool can automatically extract the content of the web page based on the tabId to respond.`;
    this.parameters = {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          description:
            "The browser tab ids to be used for the QA. When the user says 'left side' or 'current', it means current active tab.",
          items: { type: "integer" },
        },
        language: {
          type: "string",
          description: "User language used, eg: English",
        },
      },
      required: ["tabIds", "language"],
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
