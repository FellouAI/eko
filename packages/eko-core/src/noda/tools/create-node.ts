import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaNodeProperties } from "../types";

export const TOOL_NAME = "noda_create_node";

/**
 * Tool for creating nodes in Noda VR mind map
 */
export class NodaCreateNodeTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Creates a new node in the Noda VR mind map. Nodes can represent ideas, concepts, or any element in your mind map. You can customize the node's appearance with different shapes, colors, sizes, and add notes or links.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description:
            "Optional unique identifier for the node. If not provided, one will be generated.",
        },
        title: {
          type: "string",
          description:
            "Display text shown above the node. This is the main label for the idea or concept.",
        },
        color: {
          type: "string",
          description:
            "Hex color value in #RRGGBB format (e.g., #FF5733). Determines the node color.",
        },
        opacity: {
          type: "number",
          description:
            "Opacity from 0 (transparent) to 1 (opaque). Default is 1.",
          minimum: 0,
          maximum: 1,
        },
        shape: {
          type: "string",
          description: "The 3D shape of the node.",
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
          description:
            "Public HTTPS URL to an image to display on the node.",
        },
        notes: {
          type: "string",
          description:
            "Free-form text field for additional notes or details about this node.",
        },
        pageUrl: {
          type: "string",
          description: "URL to associate with this node (opens when clicked).",
        },
        size: {
          type: "number",
          description: "Size of the node from 1 to 45. Default is 5.",
          minimum: 1,
          maximum: 45,
        },
        x: {
          type: "number",
          description: "X coordinate for positioning the node in 3D space.",
        },
        y: {
          type: "number",
          description: "Y coordinate for positioning the node in 3D space.",
        },
        z: {
          type: "number",
          description: "Z coordinate for positioning the node in 3D space.",
        },
        relativeTo: {
          type: "string",
          description:
            "Reference frame for positioning: 'world', 'user', or 'node'.",
          enum: ["world", "user", "node"],
        },
      },
      required: ["title"],
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
        uuid: args.uuid as string | undefined,
        title: args.title as string,
        color: args.color as string | undefined,
        opacity: args.opacity as number | undefined,
        shape: args.shape as NodaNodeProperties["shape"],
        imageUrl: args.imageUrl as string | undefined,
        notes: args.notes as string | undefined,
        pageUrl: args.pageUrl as string | undefined,
        size: args.size as number | undefined,
      };

      // Build location if coordinates provided
      if (
        args.x !== undefined ||
        args.y !== undefined ||
        args.z !== undefined
      ) {
        properties.location = {
          x: (args.x as number) || 0,
          y: (args.y as number) || 0,
          z: (args.z as number) || 0,
          relativeTo: args.relativeTo as "world" | "user" | "node" | undefined,
        };
      }

      const result = await noda.createNode(properties);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Node "${result.title || result.uuid}" created successfully`,
              node: result,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to create node: ${error}`);
    }
  }

  private getNodaAPI(agentContext: AgentContext): typeof window.noda | null {
    // Check if we're in a browser environment with Noda
    if (typeof window !== "undefined" && window.noda) {
      return window.noda;
    }
    // Check if Noda API is stored in agent context
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

export default NodaCreateNodeTool;
