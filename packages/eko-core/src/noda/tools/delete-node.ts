import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";

export const TOOL_NAME = "noda_delete_node";

/**
 * Tool for deleting nodes from Noda VR mind map
 */
export class NodaDeleteNodeTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Deletes a node from the Noda VR mind map. This will also remove any links connected to this node. Use with caution as this action cannot be undone.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The unique identifier of the node to delete.",
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

      const uuid = args.uuid as string;
      await noda.deleteNode({ uuid });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Node "${uuid}" deleted successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to delete node: ${error}`);
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

export default NodaDeleteNodeTool;
