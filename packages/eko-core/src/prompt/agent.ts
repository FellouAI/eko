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
When a step node has input/output variable attributes, use the \`${variable_storage}\` tool to read from and write to these variables, these variables enable context sharing and coordination between multiple agents.
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
  let hasHumanTool =
    tools.filter((tool) => tool.name == human_interact).length > 0;
  let hasVariable =
    agentNodeXml.indexOf("input=") > -1 ||
    agentNodeXml.indexOf("output=") > -1 ||
    tools.filter((tool) => tool.name == variable_storage).length > 0;
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
        }\n${sub(agentChain.agentResult, 800, true)}`;
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
  const hasTaskNodeStatusTool =
    (tools || agent.Tools).filter((tool) => tool.name == task_node_status)
      .length > 0;
  return buildAgentRootXml(
    agentNode.xml,
    context.chain.taskPrompt,
    (nodeId, node) => {
      if (hasTaskNodeStatusTool) {
        node.setAttribute("status", "todo");
      }
    }
  );
}
