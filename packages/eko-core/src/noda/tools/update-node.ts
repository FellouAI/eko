import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaNodeProperties } from "../types";

export const TOOL_NAME = "noda_update_node";

/**
 * Tool for updating existing nodes in Noda VR mind map
 */
export class NodaUpdateNodeTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Updates an existing node in the Noda VR mind map. Use this to modify a node's title, appearance, position, or other properties. Requires the node's UUID.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The unique identifier of the node to update.",
        },
        title: {
          type: "string",
          description: "New display text for the node.",
        },
        color: {
          type: "string",
          description: "New hex color value in #RRGGBB format.",
        },
        opacity: {
          type: "number",
          description: "New opacity from 0 to 1.",
          minimum: 0,
          maximum: 1,
        },
        shape: {
          type: "string",
          description: "New 3D shape for the node.",
          enum: [
            "Ball",
            "Box",
            "Tetra",
            "Cylinder",
            "Diamond",
            "Hourglass",
            "Plus",
            "Star",
          ],
        },
        imageUrl: {
          type: "string",
          description: "New image URL to display on the node.",
        },
        notes: {
          type: "string",
          description: "New notes text for the node.",
        },
        pageUrl: {
          type: "string",
          description: "New URL to associate with this node.",
        },
        size: {
          type: "number",
          description: "New size from 1 to 45.",
          minimum: 1,
          maximum: 45,
        },
        x: {
          type: "number",
          description: "New X coordinate.",
        },
        y: {
          type: "number",
          description: "New Y coordinate.",
        },
        z: {
          type: "number",
          description: "New Z coordinate.",
        },
        selected: {
          type: "boolean",
          description: "Whether to select/deselect the node.",
        },
        collapsed: {
          type: "boolean",
          description: "Whether to collapse/expand child nodes.",
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

      const properties: NodaNodeProperties = {
        uuid: args.uuid as string,
      };

      // Only include properties that were explicitly provided
      if (args.title !== undefined) properties.title = args.title as string;
      if (args.color !== undefined) properties.color = args.color as string;
      if (args.opacity !== undefined)
        properties.opacity = args.opacity as number;
      if (args.shape !== undefined)
        properties.shape = args.shape as NodaNodeProperties["shape"];
      if (args.imageUrl !== undefined)
        properties.imageUrl = args.imageUrl as string;
      if (args.notes !== undefined) properties.notes = args.notes as string;
      if (args.pageUrl !== undefined)
        properties.pageUrl = args.pageUrl as string;
      if (args.size !== undefined) properties.size = args.size as number;
      if (args.selected !== undefined)
        properties.selected = args.selected as boolean;
      if (args.collapsed !== undefined)
        properties.collapsed = args.collapsed as boolean;

      // Build location if any coordinate provided
      if (
        args.x !== undefined ||
        args.y !== undefined ||
        args.z !== undefined
      ) {
        properties.location = {
          x: (args.x as number) || 0,
          y: (args.y as number) || 0,
          z: (args.z as number) || 0,
        };
      }

      const result = await noda.updateNode(properties);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Node "${result.uuid}" updated successfully`,
              node: result,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to update node: ${error}`);
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

export default NodaUpdateNodeTool;
