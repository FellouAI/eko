// Tool implementation responsible for creating human-readable snapshots of the
// current task graph. Used by the memory compression flow to persist progress
// when the conversation history needs to be truncated.
import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../core/context";
import { buildAgentRootXml } from "../common/xml";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "task_snapshot";

/**
 * Tool for generating task execution snapshots during conversation compression
 * 
 * Creates a structured textual archive that captures the current state of the agent's
 * task hierarchy, including which nodes have been completed and a human-readable summary
 * of progress. This snapshot enables downstream consumers to replay or resume the task
 * from the captured state after the conversation history has been compressed.
 * 
 * The tool is automatically injected during memory compression flows and is invoked with
 * forced tool use to ensure snapshot generation occurs reliably.
 * 
 * @implements Tool
 */
export default class TaskSnapshotTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  /**
   * Initializes the TaskSnapshotTool with schema and description
   * 
   * Sets up the JSON schema that defines the expected parameters for snapshot generation:
   * - doneIds: Array of completed node IDs to mark in the task graph
   * - taskSnapshot: Detailed natural-language summary of task progress and context
   * 
   * The schema ensures the language model provides both structured completion status
   * and free-form contextual information needed for task restoration.
   */
  constructor() {
    this.description = `Task snapshot archive, recording key information of the current task, updating task node status, facilitating subsequent continuation of operation.`;
    // Schema ensures the language model marks which nodes are complete and
    // provides a detailed natural-language summary for humans.
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

  /**
   * Generates a task snapshot by combining completion status with the task graph
   * 
   * This method performs the core snapshot generation logic:
   * 1. Extracts doneIds and taskSnapshot from the LLM's parameters
   * 2. Retrieves the current agent node and task prompt from context
   * 3. Builds an augmented XML representation of the task graph with status attributes
   * 4. Injects "done" or "todo" status into each node based on doneIds
   * 5. Combines the free-form summary with the annotated XML structure
   * 6. Returns a formatted text result ready for conversation history replacement
   * 
   * The resulting snapshot format allows the planner to resume work without recomputing
   * which branches have been handled, since every node carries explicit completion state.
   * 
   * @param args - Parameters provided by the LLM, containing doneIds array and taskSnapshot string
   * @param agentContext - Current agent execution context with task graph and chain information
   * @returns ToolResult containing structured text snapshot suitable for prompt injection
   * 
   * @example
   * ```typescript
   * const result = await tool.execute({
   *   doneIds: [1, 2, 3],
   *   taskSnapshot: "Completed data fetching and validation..."
   * }, context);
   * // Returns formatted snapshot with XML and summary
   * ```
   */
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
        // Every node carries an explicit status so the planner can resume work
        // without recomputing which branches have been handled already.
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
