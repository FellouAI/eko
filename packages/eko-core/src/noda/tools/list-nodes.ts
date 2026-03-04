import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaNodeFilter } from "../types";

export const TOOL_NAME = "noda_list_nodes";

/**
 * Tool for listing/querying nodes in Noda VR mind map
 */
export class NodaListNodesTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Lists nodes from the Noda VR mind map. You can filter by UUID, title, selection state, or shape. Returns all nodes if no filter is provided.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "Filter by specific node UUID.",
        },
        title: {
          type: "string",
          description: "Filter nodes containing this title text.",
        },
        selected: {
          type: "boolean",
          description: "Filter by selection state (true for selected nodes).",
        },
        shape: {
          type: "string",
          description: "Filter by node shape.",
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
      },
      required: [],
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

      const filter: NodaNodeFilter = {};
      if (args.uuid !== undefined) filter.uuid = args.uuid as string;
      if (args.title !== undefined) filter.title = args.title as string;
      if (args.selected !== undefined)
        filter.selected = args.selected as boolean;
      if (args.shape !== undefined)
        filter.shape = args.shape as NodaNodeFilter["shape"];

      const nodes = await noda.listNodes(
        Object.keys(filter).length > 0 ? filter : undefined
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: nodes.length,
              nodes: nodes,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to list nodes: ${error}`);
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

export default NodaListNodesTool;
