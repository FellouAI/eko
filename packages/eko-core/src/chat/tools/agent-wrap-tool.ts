import { JSONSchema7 } from "json-schema";
import {
  ToolResult,
  DialogueTool,
  DialogueParams,
  NormalAgentNode,
  LanguageModelV2ToolCallPart,
} from "../../types";
import { Agent } from "../../agent";
import global from "../../config/global";
import { sub } from "../../common/utils";
import { ChatContext } from "../chat-context";
import TaskContext from "../../agent/agent-context";
import Chain, { AgentChain } from "../../agent/chain";
import { buildSimpleAgentWorkflow } from "../../common/xml";

export default class AgentWrapTool implements DialogueTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema7;

  private chatContext: ChatContext;
  private params: DialogueParams;
  private agent: Agent;

  constructor(
    chatContext: ChatContext,
    params: DialogueParams,
    agent: Agent,
    extra?: {
      name?: string;
      description?: string;
      parameters?: JSONSchema7;
    }
  ) {
    this.agent = agent;
    this.params = params;
    this.chatContext = chatContext;
    this.name =
      extra?.name ||
      agent.Name.substring(0, 1).toLowerCase() + agent.Name.substring(1);
    this.description =
      extra?.description ||
      agent.PlanDescription ||
      sub(agent.Description, 600, true, false);
    this.parameters = extra?.parameters || {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: "User language used, eg: English",
        },
        taskDescription: {
          type: "string",
          description:
            "Task description, please do not omit any information from the user's instructions, and use the same language as the user's question.",
        },
        tabIds: {
          type: "array",
          description:
            "Browser Tab IDs associated with this task, When user says 'left side' or 'current', it means current active tab",
          items: { type: "integer" },
        },
        dependentVariables: {
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
  }

  async execute(
    args: Record<string, unknown>,
    toolCall: LanguageModelV2ToolCallPart,
    messageId: string
  ): Promise<ToolResult> {
    const chatId = this.chatContext.getChatId();
    const language = args.language as string;
    const taskDescription = args.taskDescription as string;
    const tabIds = args.tabIds as string[];
    const dependentVariables = args.dependentVariables as string[];
    const globalVariables = this.chatContext.getGlobalVariables();
    const attachments = this.params.user
      .filter((part) => part.type === "file")
      .filter((part) => part.data && part.data.length < 500)
      .map((part) => {
        return {
          file_name: part.filename,
          file_path: part.filePath,
          file_url: part.data,
        };
      });
    const taskWebsite = await this.getTaskWebsite(tabIds);
    const config = this.chatContext.getConfig();
    const contextParams: Record<string, any> = {
      ...(this.params.extra || {}),
      ...globalVariables,
      tabIds: tabIds,
      language: language,
      attachments: attachments,
      taskWebsite: taskWebsite,
      dependentVariables: dependentVariables,
      datetime: this.params.datetime || new Date().toLocaleString(),
    };
    const agents = [this.agent];
    const chain: Chain = new Chain(taskDescription);
    const taskId = messageId;
    const context = new TaskContext(
      chatId,
      taskId,
      {
        ...config,
        callback: this.params.callback?.taskCallback,
      },
      agents,
      chain
    );
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }
    context.workflow = buildSimpleAgentWorkflow({
      taskId,
      name: "Task",
      agentName: this.agent.Name,
      task: taskDescription,
    });
    try {
      global.taskMap.set(taskId, context);
      const agentNode = context.workflow.agents[0];
      const resultText = await this.runAgent(
        context,
        this.agent,
        {
          type: "normal",
          agent: agentNode,
        },
        new AgentChain(agentNode)
      );
      return {
        content: [
          {
            type: "text",
            text: resultText || "",
          },
        ],
      };
    } finally {
      global.taskMap.delete(taskId);
    }
  }

  protected async runAgent(
    context: TaskContext,
    agent: Agent,
    agentNode: NormalAgentNode,
    agentChain: AgentChain
  ): Promise<string> {
    const callback = this.params.callback?.taskCallback;
    try {
      agentNode.agent.status = "running";
      callback &&
        (await callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_start",
            agentNode: agentNode.agent,
          },
          agent.AgentContext
        ));
      agentNode.result = await agent.run(context, agentChain);
      agentNode.agent.status = "done";
      callback &&
        (await callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            result: agentNode.result,
          },
          agent.AgentContext
        ));
      return agentNode.result;
    } catch (e) {
      agentNode.agent.status = "error";
      callback &&
        (await callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            error: e,
          },
          agent.AgentContext
        ));
      throw e;
    }
  }

  protected async getTaskWebsite(tabIds: string[]): Promise<any[]> {
    if (!global.browserService) {
      return [];
    }
    const tabs = await global.browserService.loadTabs(
      this.chatContext.getChatId(),
      tabIds
    );
    return tabs.map((tab) => {
      return {
        tabId: tab.tabId,
        title: tab.title,
        url: sub(tab.url, 300),
      };
    });
  }
}

export { AgentWrapTool };
