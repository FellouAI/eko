import { JSONSchema7 } from "json-schema";
import { buildAgentRootXml } from "../common/xml";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "task_node_status";

export default class TaskNodeStatusTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `After completing each step of the task, you need to call this tool to update the status of the task node, and think about the tasks to be processed and the next action plan.`;
    this.parameters = {
      type: "object",
      properties: {
        thought: {
          type: "string",
          description: "Current thinking content, which can be analysis of the problem, assumptions, insights, reflections, or a summary of the previous, suggest the next action step to be taken, which should be specific, executable, and verifiable."
        },
        doneIds: {
          type: "array",
          description: "List of completed node IDs.",
          items: {
            type: "number",
          },
        },
        todoIds: {
          type: "array",
          description: "List of pending node IDs.",
          items: {
            type: "number",
          },
        },
      },
      required: ["thought", "doneIds", "todoIds"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let doneIds = args.doneIds as number[];
    let todoIds = args.todoIds as number[];
    let agentNode = agentContext.agentChain.agent;
    let taskPrompt = agentContext.context.chain.taskPrompt;
    let agentXml = buildAgentRootXml(agentNode.xml, taskPrompt, (nodeId, node) => {
      let done = doneIds.indexOf(nodeId) > -1;
      let todo = todoIds.indexOf(nodeId) > -1;
      if (done && todo) {
        throw new Error(
          "The ID cannot appear in both doneIds and todoIds simultaneously, nodeId: " +
            nodeId
        );
      } else if (!done && !todo) {
        // throw new Error("Node status update exception, nodeId: " + i);
      }
      node.setAttribute("status", done ? "done" : "todo");
    });
    return {
      content: [
        {
          type: "text",
          text: agentXml,
        },
      ],
    };
  }
}

export { TaskNodeStatusTool };