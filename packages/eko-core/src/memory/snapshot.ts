import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../agent/agent-context";
import { buildAgentRootXml } from "../common/xml";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "task_snapshot";

export default class TaskSnapshotTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `Task snapshot archive, recording key information of the current task, updating task node status, facilitating subsequent continuation of operation.`;
    this.parameters = {
      type: "object",
      properties: {
        doneIds: {
          type: "array",
          description:
            "Update task node completion status, list of completed node IDs.",
          items: {
            type: "number",
          },
        },
        taskSnapshot: {
          type: "string",
          description:
            "Current task important information, as detailed as possible, ensure that the task progress can be restored through this information later, output records of completed task information, contextual information, variables used, pending tasks information, etc.",
        },
      },
      required: ["doneIds", "taskSnapshot"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let doneIds = args.doneIds as number[];
    let taskSnapshot = args.taskSnapshot as string;
    let agentNode = agentContext.agentChain.agent;
    let taskPrompt = agentContext.context.chain.taskPrompt;
    let agentXml = buildAgentRootXml(
      agentNode.xml,
      taskPrompt,
      (nodeId, node) => {
        let done = doneIds.indexOf(nodeId) > -1;
        node.setAttribute("status", done ? "done" : "todo");
      }
    );
    let text = "The current task has been interrupted. Below is a snapshot of the task execution history.\n" +
      "# Task Snapshot\n" +
      taskSnapshot.trim() +
      "\n\n# Task\n" +
      agentXml;
    return {
      content: [
        {
          type: "text",
          text: text,
        },
      ],
    };
  }
}

export { TaskSnapshotTool };
