import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaLinkProperties } from "../types";

export const TOOL_NAME = "noda_update_link";

/**
 * Tool for updating existing links in Noda VR mind map
 */
export class NodaUpdateLinkTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Updates an existing link in the Noda VR mind map. Use this to modify a link's appearance, title, or other properties. Requires the link's UUID.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The unique identifier of the link to update.",
        },
        fromUuid: {
          type: "string",
          description: "New starting node UUID (changes the connection).",
        },
        toUuid: {
          type: "string",
          description: "New ending node UUID (changes the connection).",
        },
        title: {
          type: "string",
          description: "New display text for the link.",
        },
        color: {
          type: "string",
          description: "New hex color value in #RRGGBB format.",
        },
        shape: {
          type: "string",
          description: "New link pattern/style.",
          enum: ["Solid", "Dash", "Arrows"],
        },
        size: {
          type: "number",
          description: "New thickness from 1 to 10.",
          minimum: 1,
          maximum: 10,
        },
        selected: {
          type: "boolean",
          description: "Whether to select/deselect the link.",
        },
        curve: {
          type: "string",
          description: "New curve type.",
          enum: ["none", "cdown", "cup", "sdown", "sup"],
        },
        trail: {
          type: "string",
          description: "New trail animation effect.",
          enum: ["none", "ring", "ball", "cone"],
        },
      },
      required: ["uuid"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    try {
      const noda = this.getNodaAPI(agentContext);
      if (!noda) {
        return this.errorResult(
          "Noda API not available. Make sure you are running inside the Noda VR environment."
        );
      }

      // We need fromUuid and toUuid for the interface, but they may not change
      const properties: NodaLinkProperties = {
        uuid: args.uuid as string,
        fromUuid: args.fromUuid as string || "",
        toUuid: args.toUuid as string || "",
      };

      // Only include properties that were explicitly provided
      if (args.title !== undefined) properties.title = args.title as string;
      if (args.color !== undefined) properties.color = args.color as string;
      if (args.shape !== undefined)
        properties.shape = args.shape as NodaLinkProperties["shape"];
      if (args.size !== undefined) properties.size = args.size as number;
      if (args.selected !== undefined)
        properties.selected = args.selected as boolean;
      if (args.curve !== undefined)
        properties.curve = args.curve as NodaLinkProperties["curve"];
      if (args.trail !== undefined)
        properties.trail = args.trail as NodaLinkProperties["trail"];

      const result = await noda.updateLink(properties);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Link "${result.uuid}" updated successfully`,
              link: result,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to update link: ${error}`);
    }
  }

  private getNodaAPI(agentContext: AgentContext): typeof window.noda | null {
    if (typeof window !== "undefined" && window.noda) {
      return window.noda;
    }
    const nodaApi = agentContext.context.variables.get("nodaApi");
    return nodaApi || null;
  }

  private errorResult(message: string): ToolResult {
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}

export default NodaUpdateLinkTool;
