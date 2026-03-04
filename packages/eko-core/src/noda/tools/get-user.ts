import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../../agent/agent-context";
import { Tool, ToolResult } from "../../types/tools.types";

export const TOOL_NAME = "noda_get_user";

/**
 * Tool for getting the current Noda user information
 */
export class NodaGetUserTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  readonly supportParallelCalls: boolean = true;

  constructor() {
    this.description = `Gets information about the current Noda VR user. Returns the userId associated with the current VR headset/installation.`;
    this.parameters = {
      type: "object",
      properties: {},
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

      const user = await noda.getUser();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              user: user,
            }),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(`Failed to get user: ${error}`);
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

export default NodaGetUserTool;
