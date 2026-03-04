import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaMindMap, NodaNodeProperties, NodaLinkProperties } from "../types";

export const TOOL_NAME = "noda_build_mindmap";

/**
 * Tool for building complete mind maps from structured data
 */
export class NodaBuildMindmapTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = false;

  constructor() {
    this.description = `Builds a complete mind map in Noda from structured data. Provide an array of nodes and links to create a full mind map at once. This is more efficient than creating nodes and links individually.`;
    this.parameters = {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the mind map (for reference).",
        },
        nodes: {
          type: "array",
          description: "Array of nodes to create in the mind map.",
          items: {
            type: "object",
            properties: {
              uuid: {
                type: "string",
                description: "Unique identifier for the node.",
              },
              title: {
                type: "string",
                description: "Display text for the node.",
              },
              color: {
                type: "string",
                description: "Hex color value (#RRGGBB).",
              },
              shape: {
                type: "string",
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
              size: {
                type: "number",
                minimum: 1,
                maximum: 45,
              },
              notes: {
                type: "string",
              },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
            },
            required: ["uuid", "title"],
          },
        },
        links: {
          type: "array",
          description: "Array of links connecting nodes.",
          items: {
            type: "object",
            properties: {
              uuid: {
                type: "string",
                description: "Unique identifier for the link.",
              },
              fromUuid: {
                type: "string",
                description: "Source node UUID.",
              },
              toUuid: {
                type: "string",
                description: "Target node UUID.",
              },
              title: {
                type: "string",
                description: "Label for the link.",
              },
              color: {
                type: "string",
              },
              shape: {
                type: "string",
                enum: ["Solid", "Dash", "Arrows"],
              },
            },
            required: ["fromUuid", "toUuid"],
          },
        },
        clearExisting: {
          type: "boolean",
          description:
            "If true, clears all existing nodes and links before building. Default is false.",
        },
      },
      required: ["nodes"],
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

      const clearExisting = args.clearExisting as boolean || false;
      const nodes = args.nodes as Array<Record<string, unknown>>;
      const links = (args.links as Array<Record<string, unknown>>) || [];

      // Clear existing if requested
      if (clearExisting) {
        const existingNodes = await noda.listNodes();
        for (const node of existingNodes) {
          await noda.deleteNode({ uuid: node.uuid });
        }
      }

      const createdNodes: string[] = [];
      const createdLinks: string[] = [];
      const errors: string[] = [];

      // Create nodes first
      for (const nodeData of nodes) {
        try {
          const nodeProps: NodaNodeProperties = {
            uuid: nodeData.uuid as string,
            title: nodeData.title as string,
            color: nodeData.color as string | undefined,
            shape: nodeData.shape as NodaNodeProperties["shape"],
            size: nodeData.size as number | undefined,
            notes: nodeData.notes as string | undefined,
            opacity: nodeData.opacity as number | undefined,
            imageUrl: nodeData.imageUrl as string | undefined,
            pageUrl: nodeData.pageUrl as string | undefined,
          };

          if (
            nodeData.x !== undefined ||
            nodeData.y !== undefined ||
            nodeData.z !== undefined
          ) {
            nodeProps.location = {
              x: (nodeData.x as number) || 0,
              y: (nodeData.y as number) || 0,
              z: (nodeData.z as number) || 0,
            };
          }

          const result = await noda.createNode(nodeProps);
          createdNodes.push(result.uuid);
        } catch (e) {
          errors.push(`Node ${nodeData.uuid || nodeData.title}: ${e}`);
        }
      }

      // Create links after all nodes exist
      for (const linkData of links) {
        try {
          const linkProps: NodaLinkProperties = {
            uuid: linkData.uuid as string | undefined,
            fromUuid: linkData.fromUuid as string,
            toUuid: linkData.toUuid as string,
            title: linkData.title as string | undefined,
            color: linkData.color as string | undefined,
            shape: linkData.shape as NodaLinkProperties["shape"],
            size: linkData.size as number | undefined,
          };

          const result = await noda.createLink(linkProps);
          createdLinks.push(result.uuid);
        } catch (e) {
          errors.push(
            `Link ${linkData.fromUuid} -> ${linkData.toUuid}: ${e}`
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: errors.length === 0,
              message: `Created ${createdNodes.length} nodes and ${createdLinks.length} links`,
              createdNodes,
              createdLinks,
              errors: errors.length > 0 ? errors : undefined,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to build mind map: ${error}`);
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

export default NodaBuildMindmapTool;
