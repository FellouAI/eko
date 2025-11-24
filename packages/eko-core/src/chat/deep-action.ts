import { JSONSchema7 } from "json-schema";
import {
  ToolResult,
  DialogueTool,
  DialogueParams,
  GlobalPromptKey,
  LanguageModelV2ToolCallPart,
} from "../types";
import { sub } from "../common/utils";
import global from "../config/global";
import Eko, { Agent } from "../agent";
import { ChatContext } from "./chat-context";
import { recursiveTextNode } from "../common/workflow";

export const TOOL_NAME = "deepAction";

const deep_action_description =
  "Delegate tasks to a Javis AI assistant for completion. This assistant can understand natural language instructions and has full control over both networked computers, browser agent, and multiple specialized agents ({agentNames}). The assistant can autonomously decide to use various software tools, browse the internet to query information, write code, and perform direct operations to complete tasks. He can deliver various digitized outputs (text reports, tables, images, music, videos, websites, deepSearch, programs, etc.) and handle design/analysis tasks. and execute operational tasks (such as batch following bloggers of specific topics on certain websites). For operational tasks, the focus is on completing the process actions rather than delivering final outputs, and the assistant can complete these types of tasks well. It should also be noted that users may actively mention deepsearch, which is also one of the capabilities of this tool. If users mention it, please explicitly tell the assistant to use deepsearch. Supports parallel execution of multiple tasks.";
const deep_action_param_task_description =
  "Task description, please output the user's original instructions without omitting any information from the user's instructions, and use the same language as the user's question.";

export default class DeepActionTool implements DialogueTool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  private chatContext: ChatContext;
  private params: DialogueParams;

  constructor(chatContext: ChatContext, params: DialogueParams) {
    this.chatContext = chatContext;
    const agents = this.chatContext.getConfig().agents || [];
    const agentNames = agents.map((agent: Agent) => agent.Name).join(", ");
    const description =
      global.prompts.get(GlobalPromptKey.deep_action_description) ||
      deep_action_description;
    const paramTaskDescription =
      global.prompts.get(GlobalPromptKey.deep_action_param_task_description) ||
      deep_action_param_task_description;
    this.description = description.replace("{agentNames}", agentNames).trim();
    this.parameters = {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: "User language used, eg: English",
        },
        taskDescription: {
          type: "string",
          description: paramTaskDescription.trim(),
        },
        tabIds: {
          type: "array",
          description:
            "Browser Tab IDs associated with this task, When user says 'left side' or 'current', it means current active tab",
          items: { type: "integer" },
        },
        variables: {
          type: "array",
          description:
            "The current task relies on variable data from prerequisite execution outputs. Provide the name of the dependent variable.",
          items: {
            type: "string",
          },
        },
      },
      required: ["language", "taskDescription"],
    };
    this.params = params;
  }

  async execute(
    args: Record<string, unknown>,
    toolCall: LanguageModelV2ToolCallPart,
    messageId: string
  ): Promise<ToolResult> {
    const chatId = this.chatContext.getChatId();
    const taskDescription = args.taskDescription as string;
    const variables = args.variables as string[];
    const fileIds = args.fileIds as string[];
    const config = this.chatContext.getConfig();
    const globalVariables = this.chatContext.getGlobalVariables();
    const eko = new Eko(
      {
        ...config,
        callback: this.params.callback?.taskCallback,
      },
      chatId,
    );
    this.chatContext.addEko(messageId, eko);
    if (this.params.signal) {
      this.params.signal.addEventListener("abort", () => {
        eko.abortTask(messageId, "user aborted");
      });
    }
    const workflow = await eko.generate(
      taskDescription,
      messageId,
      globalVariables
    );
    const context = eko.getTask(messageId)!;
    console.log("==> workflow", workflow);
    const result = await eko.execute(messageId);
    const variableNames: string[] = [];
    if (context.variables && context.variables.size > 0) {
      workflow.agents
        .map((agent) => agent.nodes)
        .flat()
        .forEach((node) => {
          recursiveTextNode(node, async (textNode) => {
            if (textNode.output) {
              variableNames.push(textNode.output);
              globalVariables.set(
                textNode.output,
                context.variables.get(textNode.output)
              );
            }
          });
        });
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            taskPlan: workflow.xml,
            subAgents: context.chain.agents.map((agent) => {
              return {
                agent: agent.agent.name,
                subTask: agent.agent.task,
                agentResult: sub(agent.agentResult || "", 800, true),
              };
            }),
            variables: variableNames,
            taskResult: result.result,
            success: result.success,
          }),
        },
      ],
    };
  }
}

export { DeepActionTool };
