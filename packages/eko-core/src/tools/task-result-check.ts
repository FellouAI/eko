import { JSONSchema7 } from "json-schema";
import { RetryLanguageModel } from "../llm";
import { extractUsedTool } from "../memory";
import { mergeTools } from "../common/utils";
import { callAgentLLM } from "../agent/agent-llm";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";
import {
  LanguageModelV2Prompt,
  LanguageModelV2FunctionTool,
} from "@ai-sdk/provider";
import Log from "../common/log";

export const TOOL_NAME = "task_result_check";

export default class TaskResultCheckTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `Check the current task execution process and results, evaluate the overall completion status of the current task, and whether the output variables in the nodes are stored.`;
    this.parameters = {
      type: "object",
      properties: {
        thought: {
          type: "string",
          description:
            "Please conduct thoughtful analysis of the overall execution process and results of the current task, analyzing whether the task has been completed.",
        },
        completionStatus: {
          type: "string",
          description:
            "The completion status of the current task is only considered complete when the entire current task is finished; partial completion or task failure is considered incomplete",
          enum: ["completed", "incomplete"],
        },
        todoList: {
          type: "string",
          description:
            "Pending task list for incomplete tasks, when tasks are not fully completed, please describe which tasks remain to be completed",
        },
      },
      required: ["thought", "completionStatus"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    return {
      content: [
        {
          type: "text",
          text: "success",
        },
      ],
    };
  }
}

async function doTaskResultCheck(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
): Promise<{ completionStatus: "completed" | "incomplete" }> {
  try {
    // extract used tool
    const usedTools = extractUsedTool(messages, tools);
    const taskResultCheck = new TaskResultCheckTool();
    const newTools = mergeTools(usedTools, [
      {
        type: "function",
        name: taskResultCheck.name,
        description: taskResultCheck.description,
        inputSchema: taskResultCheck.parameters,
      },
    ]);
    // handle messages
    const newMessages: LanguageModelV2Prompt = [...messages];
    newMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Task:\n${agentContext.agentChain.agent.xml}\n\nPlease check the completion status of the current task.`,
        },
      ],
    });
    const result = await callAgentLLM(
      agentContext,
      rlm,
      newMessages,
      newTools,
      true,
      {
        type: "tool",
        toolName: taskResultCheck.name,
      }
    );
    const toolCall = result.filter((s) => s.type == "tool-call")[0];
    const args =
      typeof toolCall.input == "string"
        ? JSON.parse(toolCall.input || "{}")
        : toolCall.input || {};
    const toolResult = await taskResultCheck.execute(args, agentContext);
    const callback = agentContext.context.config.callback;
    if (callback) {
      await callback.onMessage(
        {
          streamType: "agent",
          chatId: agentContext.context.chatId,
          taskId: agentContext.context.taskId,
          agentName: agentContext.agent.Name,
          nodeId: agentContext.agentChain.agent.id,
          type: "tool_result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          params: args,
          toolResult: toolResult,
        },
        agentContext
      );
    }
    if (args.completionStatus == "incomplete") {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `It seems that your task has not been fully completed. Please continue with the remaining steps:\n${
              args.todoList || ""
            }`,
          },
        ],
      });
    }
    return {
      completionStatus: args.completionStatus,
    };
  } catch (e) {
    Log.error("TaskResultCheckTool error", e);
    return {
      completionStatus: "completed",
    };
  }
}

export { TaskResultCheckTool, doTaskResultCheck };
