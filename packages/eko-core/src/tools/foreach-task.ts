import { JSONSchema7 } from "json-schema";
import { extractAgentXmlNode } from "../common/xml";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "foreach_task";

export default class ForeachTaskTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `When executing the \`forEach\` node, please use the current tool for counting to ensure tasks are executed sequentially, the tool needs to be called with each loop iteration.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "forEach node ID.",
        },
        progress: {
          type: "string",
          description: "Current execution progress.",
        },
        next_step: {
          type: "string",
          description: "Next task description.",
        },
      },
      required: ["nodeId", "progress", "next_step"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let nodeId = args.nodeId as number;
    let agentXml = agentContext.agentChain.agent.xml;
    let node = extractAgentXmlNode(agentXml, nodeId);
    if (node == null) {
      throw new Error("Node ID does not exist: " + nodeId);
    }
    if (node.tagName !== "forEach") {
      throw new Error("Node ID is not a forEach node: " + nodeId);
    }
    let items = node.getAttribute("items");
    let varValue = null;
    let resultText = "Recorded";
    if (items && items != "list") {
      varValue = agentContext.context.variables.get(items.trim());
      if (varValue) {
        let key = "foreach_" + nodeId;
        let loop_count = agentContext.variables.get(key) || 0;
        if (loop_count % 5 == 0) {
          resultText = `Variable information associated with the current loop task.\nvariable_name: ${items.trim()}\nvariable_value: ${varValue}`;
        }
        agentContext.variables.set(key, ++loop_count);
      }
    }
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }
}

export { ForeachTaskTool };
