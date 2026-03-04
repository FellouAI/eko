import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";
import { NodaLinkFilter } from "../types";

export const TOOL_NAME = "noda_list_links";

/**
 * Tool for listing/querying links in Noda VR mind map
 */
export class NodaListLinksTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Lists links from the Noda VR mind map. You can filter by UUID, source node, target node, or selection state. Returns all links if no filter is provided.`;
    this.parameters = {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "Filter by specific link UUID.",
        },
        fromUuid: {
          type: "string",
          description: "Filter links by source node UUID.",
        },
        toUuid: {
          type: "string",
          description: "Filter links by target node UUID.",
        },
        selected: {
          type: "boolean",
          description: "Filter by selection state (true for selected links).",
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

      const filter: NodaLinkFilter = {};
      if (args.uuid !== undefined) filter.uuid = args.uuid as string;
      if (args.fromUuid !== undefined) filter.fromUuid = args.fromUuid as string;
      if (args.toUuid !== undefined) filter.toUuid = args.toUuid as string;
      if (args.selected !== undefined)
        filter.selected = args.selected as boolean;

      const links = await noda.listLinks(
        Object.keys(filter).length > 0 ? filter : undefined
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: links.length,
              links: links,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to list links: ${error}`);
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

export default NodaListLinksTool;
