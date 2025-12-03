import config from "../config";
import { Agent } from "../agent";
import global from "../config/global";
import { sub } from "../common/utils";
import TaskContext from "../agent/agent-context";
import { buildAgentRootXml } from "../common/xml";
import { PromptTemplate } from "./prompt-template";
import { WorkflowAgent, Tool, GlobalPromptKey } from "../types";
import { TOOL_NAME as foreach_task } from "../tools/foreach-task";
import { TOOL_NAME as watch_trigger } from "../tools/watch-trigger";
import { TOOL_NAME as human_interact } from "../tools/human-interact";
import { TOOL_NAME as variable_storage } from "../tools/variable-storage";
import { TOOL_NAME as task_node_status } from "../tools/task-node-status";

const AGENT_SYSTEM_TEMPLATE = `
You are {{name}}, an autonomous AI agent for {{agent}} agent.

# Agent Description
<if description>
{{description}}
</if>
<if extSysPrompt>
{{extSysPrompt}}
</if>
<if ${human_interact}Tool>
* HUMAN INTERACT
During the task execution process, you can use the \`${human_interact}\` tool to interact with humans, please call it in the following situations:
- When performing dangerous operations such as deleting files, confirmation from humans is required.
- When encountering obstacles while accessing websites, such as requiring user login, captcha verification, QR code scanning, or human verification, you need to request manual assistance.
- Please do not use the \`${human_interact}\` tool frequently.
- The \`${human_interact}\` tool does not support parallel calls.
</if>
<if ${variable_storage}Tool>
* VARIABLE STORAGE
When a step node has input/output variable attributes, use the \`${variable_storage}\` tool to read from and write to these variables, these variables enable context sharing and coordination between multiple agents.
The \`${variable_storage}\` tool does not support parallel calls.
</if>
<if ${foreach_task}Tool>
* forEach node
For repetitive tasks, when executing a forEach node, the \`${foreach_task}\` tool must be used. Loop tasks support parallel tool calls, and during parallel execution, this tool needs to be called interspersed throughout the process.
</if>
<if ${watch_trigger}Tool>
* watch node
monitor changes in webpage DOM elements, when executing to the watch node, require the use of the \`${watch_trigger}\` tool.
</if>

<if mainTask>
Main task: {{mainTask}}
</if>
<if preTaskResult>
Pre-task execution results:
<subtask_results>
{{preTaskResult}}
</subtask_results>
</if>

# User input task instructions
<root>
  <!-- Main task, completed through the collaboration of multiple Agents -->
  <mainTask>main task</mainTask>
  <!-- The tasks that the current agent needs to complete, the current agent only needs to complete the currentTask -->
  <currentTask>specific task</currentTask>
  <!-- Complete the corresponding step nodes of the task, Only for reference -->
  <nodes>
    <!-- node supports input/output variables to pass dependencies -->
    <node input="variable name" output="variable name" status="todo / done">task step node</node>
<if hasForEachNode>
    <!-- duplicate task node, items support list and variable -->
    <forEach items="list or variable name">
      <node>forEach item step node</node>
    </forEach>
</if>
<if hasWatchNode>
    <!-- monitor task node, the loop attribute specifies whether to listen in a loop or listen once -->
    <watch event="dom" loop="true">
      <description>Monitor task description</description>
      <trigger>
        <node>Trigger step node</node>
        <node>...</node>
      </trigger>
    </watch>
</if>
  </nodes>
</root>

Current datetime: {{datetime}}
<if canParallelToolCalls>
For maximum efficiency, when executing multiple independent operations that do not depend on each other or conflict with one another, these tools can be called in parallel simultaneously.
</if>
The output language should follow the language corresponding to the user's task.
`;

export function getAgentSystemPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: TaskContext,
  tools?: Tool[],
  extSysPrompt?: string
): string {
  tools = tools || agent.Tools;
  const toolVars: Record<string, boolean> = {};
  for (let i = 0; i < tools.length; i++) {
    toolVars[tools[i].name + "Tool"] = true;
  }
  let mainTask = "";
  let preTaskResult = "";
  if (context.chain.agents.length > 1) {
    mainTask = context.chain.taskPrompt.trim();
    preTaskResult = buildPreTaskResult(context);
  }
  const agentSysPrompt =
    global.prompts.get(GlobalPromptKey.agent_system) || AGENT_SYSTEM_TEMPLATE;
  return PromptTemplate.render(agentSysPrompt, {
    name: config.name,
    agent: agent.Name,
    description: agent.Description,
    extSysPrompt: extSysPrompt?.trim() || "",
    mainTask: mainTask,
    preTaskResult: preTaskResult.trim(),
    hasWatchNode: agentNode.xml.indexOf("</watch>") > -1,
    hasForEachNode: agentNode.xml.indexOf("</forEach>") > -1,
    canParallelToolCalls: agent.canParallelToolCalls(),
    datetime: context.variables.get("datetime") || new Date().toLocaleString(),
    ...toolVars,
  }).trim();
}

function buildPreTaskResult(context: TaskContext): string {
  let preTaskResult = "";
  for (let i = 0; i < context.chain.agents.length; i++) {
    const agentChain = context.chain.agents[i];
    if (agentChain.agentResult) {
      preTaskResult += `<subtask_result agent="${
        agentChain.agent.name
      }">\nSubtask: ${agentChain.agent.task}\nResult: ${sub(
        agentChain.agentResult,
        600
      ).trim()}\n</subtask_result>`;
    }
  }
  return preTaskResult.trim();
}

export function getAgentUserPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: TaskContext,
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
