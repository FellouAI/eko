import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaLinkProperties } from "../types";

export const TOOL_NAME = "noda_create_link";

/**
 * Tool for creating links between nodes in Noda VR mind map
 */
export class NodaCreateLinkTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Creates a link (connection) between two nodes in the Noda VR mind map. Links represent relationships between ideas or concepts. You can customize the link's appearance with different colors, patterns, and animations.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description:
            "Optional unique identifier for the link. If not provided, one will be generated.",
        },
        fromUuid: {
          type: "string",
          description: "UUID of the starting (source) node.",
        },
        toUuid: {
          type: "string",
          description: "UUID of the ending (target) node.",
        },
        title: {
          type: "string",
          description:
            "Display text shown on the link. Use to describe the relationship.",
        },
        color: {
          type: "string",
          description: "Hex color value in #RRGGBB format for the link.",
        },
        shape: {
          type: "string",
          description: "Link pattern/style.",
          enum: ["Solid", "Dash", "Arrows"],
        },
        size: {
          type: "number",
          description: "Thickness of the link from 1 to 10. Default is 1.",
          minimum: 1,
          maximum: 10,
        },
        curve: {
          type: "string",
          description: "Curve type for the link path.",
          enum: ["none", "cdown", "cup", "sdown", "sup"],
        },
        trail: {
          type: "string",
          description: "Animation trail effect along the link.",
          enum: ["none", "ring", "ball", "cone"],
        },
      },
      required: ["fromUuid", "toUuid"],
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

      const properties: NodaLinkProperties = {
        uuid: args.uuid as string | undefined,
        fromUuid: args.fromUuid as string,
        toUuid: args.toUuid as string,
        title: args.title as string | undefined,
        color: args.color as string | undefined,
        shape: args.shape as NodaLinkProperties["shape"],
        size: args.size as number | undefined,
        curve: args.curve as NodaLinkProperties["curve"],
        trail: args.trail as NodaLinkProperties["trail"],
      };

      const result = await noda.createLink(properties);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Link from "${result.fromUuid}" to "${result.toUuid}" created successfully`,
              link: result,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to create link: ${error}`);
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

export default NodaCreateLinkTool;
