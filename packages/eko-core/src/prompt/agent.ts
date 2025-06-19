import { Agent } from "../agent";
import config from "../config";
import Context from "../core/context";
import { sub } from "../common/utils";
import { WorkflowAgent, Tool } from "../types";
import { buildAgentRootXml } from "../common/xml";
import { TOOL_NAME as foreach_task } from "../tools/foreach_task";
import { TOOL_NAME as watch_trigger } from "../tools/watch_trigger";
import { TOOL_NAME as human_interact } from "../tools/human_interact";
import { TOOL_NAME as variable_storage } from "../tools/variable_storage";
import { TOOL_NAME as task_node_status } from "../tools/task_node_status";

const AGENT_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI agent for {agent} agent.

# Agent Description
{description}
{prompt}

# User input task instructions
<root>
  <!-- Main task, completed through the collaboration of multiple Agents -->
  <mainTask>main task</mainTask>
  <!-- The tasks that the current agent needs to complete, the current agent only needs to complete the currentTask -->
  <currentTask>specific task</currentTask>
  <!-- Complete the corresponding step nodes of the task, Only for reference -->
  <nodes>
    <!-- node supports input/output variables to pass dependencies -->
    <node input="variable name" output="variable name" status="todo / done">task step node</node>{nodePrompt}
  </nodes>
</root>

The output language should follow the language corresponding to the user's task.
`;

const HUMAN_PROMPT = `
* HUMAN INTERACT
During the task execution process, you can use the \`${human_interact}\` tool to interact with humans, please call it in the following situations:
- When performing dangerous operations such as deleting files, confirmation from humans is required.
- When encountering obstacles while accessing websites, such as requiring user login, captcha verification, QR code scanning, or human verification, you need to request manual assistance.
- Please do not use the \`${human_interact}\` tool frequently.
`;

const VARIABLE_PROMPT = `
* VARIABLE STORAGE
If you need to read and write the input/output variables in the node, require the use of the \`${variable_storage}\` tool.
`;

const FOR_EACH_NODE = `
    <!-- duplicate task node, items support list and variable -->
    <forEach items="list or variable name">
      <node>forEach item step node</node>
    </forEach>`;

const FOR_EACH_PROMPT = `
* forEach node
repetitive tasks, when executing to the forEach node, require the use of the \`${foreach_task}\` tool.
`;

const WATCH_NODE = `
    <!-- monitor task node, the loop attribute specifies whether to listen in a loop or listen once -->
    <watch event="dom" loop="true">
      <description>Monitor task description</description>
      <trigger>
        <node>Trigger step node</node>
        <node>...</node>
      </trigger>
    </watch>`;

const WATCH_PROMPT = `
* watch node
monitor changes in webpage DOM elements, when executing to the watch node, require the use of the \`${watch_trigger}\` tool.
`;

const ACTION_NODE = `
    <!-- node with deterministic action block -->
    <node>
      task step description
      <action type="browser.click">
        <selector css=".button" xpath="//button[@class='button']" />
      </action>
    </node>`;

const ACTION_PROMPT = `
* Action blocks
Some nodes contain structured action blocks with predefined selectors and parameters.
- Use the \`execute_action_block\` tool to execute nodes that have <action> elements
- If the tool reports failure, complete the step using your standard browser tools
- Nodes without action blocks should be executed using your normal approach
`;

const SEQUENTIAL_MODE_PROMPT = `
* IMPORTANT: Sequential Execution Mode
You are operating in sequential execution mode. This means:
- You MUST complete ALL nodes in order, one by one
- Each node shows its status: "done", "current", or "pending"
- The instruction shows your progress (e.g., "3/11 - 8 steps remaining")
- DO NOT consider the task complete until ALL nodes are marked as "done"
- Even if you think the main goal is achieved, continue executing remaining nodes
- Only stop when there are no more pending nodes

* Node Completion Requirements
- Action blocks are executed automatically and marked complete when they succeed
- For LLM nodes (nodes without action blocks), YOU must call task_node_status to mark completion
- For failed action blocks that require LLM fallback, YOU must call task_node_status when complete
- ONLY mark a node as "done" when its goal is genuinely achieved and verified
- NEVER mark nodes complete based on assumptions or context - verify actual results

* Verification Examples
- ❌ WRONG: "I assume the return date was selected based on previous actions"
- ✅ CORRECT: Take screenshot, verify the return date field shows "July 3, 2025", then mark complete
- ❌ WRONG: "The form should be filled based on my actions"
- ✅ CORRECT: Check that input fields contain expected values, then mark complete
- ❌ WRONG: "Since I clicked the button, the task must be done"
- ✅ CORRECT: Verify the expected UI change occurred (new page, dialog, etc.), then mark complete

* Action Block Verification Responsibility
- Previous nodes with action blocks have been executed automatically with built-in verification
- When handling your current node, you should:
  1. Check if previous action blocks achieved their intended effects
  2. Look for expected results (new page elements, URL changes, form values, etc.)
  3. If previous actions didn't fully work, use alternative methods to achieve those goals
  4. Perform additional interactions as needed to complete the node's goal
  5. Verify the final result matches the node's objective
  6. Call task_node_status with the current node ID in doneIds ONLY when truly complete
- Action execution results are shown in the conversation history
- Trust but verify: even if an action reports success, confirm the expected outcome is visible

* Critical: Verify Task Completion
- Before marking nodes done, verify their objectives are met through direct observation
- Take screenshots, check form values, confirm UI states - do not rely on assumptions
- Do not mark nodes complete based on attempts - only on successful, verified results
- Use task_node_status tool to explicitly track your progress through the workflow
`;

export function getAgentSystemPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: Context,
  tools?: Tool[],
  extSysPrompt?: string
): string {
  let prompt = "";
  let nodePrompt = "";
  tools = tools || agent.Tools;
  let agentNodeXml = agentNode.xml;
  let hasWatchNode = agentNodeXml.indexOf("</watch>") > -1;
  let hasForEachNode = agentNodeXml.indexOf("</forEach>") > -1;
  let hasActionNode = agentNodeXml.indexOf("</action>") > -1;
  let hasHumanTool =
    tools.filter((tool) => tool.name == human_interact).length > 0;
  let hasVariable =
    agentNodeXml.indexOf("input=") > -1 ||
    agentNodeXml.indexOf("output=") > -1 ||
    tools.filter((tool) => tool.name == variable_storage).length > 0;
  let hasSelectorTools = tools.some(tool =>
    ["clickSelector", "inputSelector", "keypressSelector", "extractSelector"].includes(tool.name)
  );

  if (hasHumanTool) {
    prompt += HUMAN_PROMPT;
  }
  if (hasVariable) {
    prompt += VARIABLE_PROMPT;
  }
  if (hasForEachNode) {
    if (tools.filter((tool) => tool.name == foreach_task).length > 0) {
      prompt += FOR_EACH_PROMPT;
    }
    nodePrompt += FOR_EACH_NODE;
  }
  if (hasWatchNode) {
    if (tools.filter((tool) => tool.name == watch_trigger).length > 0) {
      prompt += WATCH_PROMPT;
    }
    nodePrompt += WATCH_NODE;
  }
  if (hasActionNode && hasSelectorTools) {
    prompt += ACTION_PROMPT;
    nodePrompt += ACTION_NODE;
  }
  if (agentNode.sequentialMode) {
    prompt += SEQUENTIAL_MODE_PROMPT;
  }
  if (extSysPrompt && extSysPrompt.trim()) {
    prompt += "\n" + extSysPrompt.trim() + "\n";
  }
  prompt += "\nCurrent datetime: {datetime}";
  if (context.chain.agents.length > 1) {
    prompt += "\n Main task: " + context.chain.taskPrompt;
    prompt += "\n\n# Pre-task execution results";
    for (let i = 0; i < context.chain.agents.length; i++) {
      let agentChain = context.chain.agents[i];
      if (agentChain.agentResult) {
        prompt += `\n## ${
          agentChain.agent.task || agentChain.agent.name
        }\n${sub(agentChain.agentResult, 500, true)}`;
      }
    }
  }
  return AGENT_SYSTEM_TEMPLATE.replace("{name}", config.name)
    .replace("{agent}", agent.Name)
    .replace("{description}", agent.Description)
    .replace("{prompt}", "\n" + prompt.trim())
    .replace("{nodePrompt}", nodePrompt)
    .replace("{datetime}", new Date().toLocaleString())
    .trim();
}

export function getAgentUserPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: Context,
  tools?: Tool[]
): string {
  let hasTaskNodeStatusTool =
    (tools || agent.Tools).filter((tool) => tool.name == task_node_status)
      .length > 0;

  // Convert context variables to plain object for template replacement
  const templateVariables: Record<string, any> = {};
  context.variables.forEach((value, key) => {
    templateVariables[key] = value;
  });

  // In sequential mode, we need to provide focused context
  if (agentNode.sequentialMode) {
    const completedNodeIds = context.variables.get('completedNodeIds') || new Set<number>();
    
    // Find the current node ID
    let currentNodeId = -1;
    for (let i = 0; i < agentNode.nodes.length; i++) {
      if (!completedNodeIds.has(i)) {
        currentNodeId = i;
        break;
      }
    }
    
    if (currentNodeId === -1) {
      // All nodes completed
      return buildAgentRootXml(
        agentNode.xml,
        context.chain.taskPrompt,
        (nodeId, node) => {
          node.setAttribute("status", "done");
        },
        templateVariables
      );
    }
    
    // Build XML with focus on current node
    return buildAgentRootXml(
      agentNode.xml,
      context.chain.taskPrompt,
      (nodeId, node) => {
        if (nodeId < currentNodeId) {
          node.setAttribute("status", "done");
        } else if (nodeId === currentNodeId) {
          node.setAttribute("status", "current");
          const remaining = agentNode.nodes.length - completedNodeIds.size;
          node.setAttribute("instruction", `Please complete this task step. (${completedNodeIds.size + 1}/${agentNode.nodes.length} - ${remaining} steps remaining)`);
        } else {
          node.setAttribute("status", "pending");
        }
      },
      templateVariables
    );
  } else {
    // Non-sequential mode: original behavior
    return buildAgentRootXml(
      agentNode.xml,
      context.chain.taskPrompt,
      (nodeId, node) => {
        if (hasTaskNodeStatusTool) {
          node.setAttribute("status", "todo");
        }
      },
      templateVariables
    );
  }
}
