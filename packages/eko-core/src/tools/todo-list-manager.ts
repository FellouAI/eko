import { JSONSchema7 } from "json-schema";
import { RetryLanguageModel } from "../llm";
import { extractUsedTool } from "../memory";
import { mergeTools } from "../common/utils";
import { callAgentLLM } from "../agent/agent-llm";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";
import {
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import Log from "../common/log";

export const TOOL_NAME = "todo_list_manager";

export default class TodoListManagerTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description =
      "Current task to-do list management, used for managing the to-do list of current tasks. During task execution, the to-do list needs to be updated according to the task execution status: completed, pending. It also detects whether tasks are being executed in repetitive loops during the execution process.";
    this.parameters = {
      type: "object",
      properties: {
        completedList: {
          type: "array",
          description:
            "Current completed task list items. Please update the completed list items based on the current task completion status.",
          items: {
            type: "string",
          },
        },
        todoList: {
          type: "array",
          description:
            "Current pending task list items. Please update the pending list items based on the current task pending status.",
          items: {
            type: "string",
          },
        },
        loopDetection: {
          type: "string",
          description:
            "Check if the current step is being repeatedly executed by comparing with previous steps.",
          enum: ["loop", "no_loop"],
        },
      },
      required: ["completedList", "todoList", "loopDetection"],
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

async function doTodoListManager(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
) {
  try {
    // extract used tool
    const usedTools = extractUsedTool(messages, tools);
    const todoListManager = new TodoListManagerTool();
    const newTools = mergeTools(usedTools, [
      {
        type: "function",
        name: todoListManager.name,
        description: todoListManager.description,
        inputSchema: todoListManager.parameters,
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
        toolName: todoListManager.name,
      }
    );
    const toolCall = result.filter((s) => s.type == "tool-call")[0];
    const args =
      typeof toolCall.input == "string"
        ? JSON.parse(toolCall.input || "{}")
        : toolCall.input || {};
    const toolResult = await todoListManager.execute(args, agentContext);
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
    let userPrompt = "# Task Execution Status\n";
    if (args.completedList && args.completedList.length > 0) {
      userPrompt += "## Completed task list\n";
      for (let i = 0; i < args.completedList.length; i++) {
        userPrompt += `- ${args.completedList[i]}\n`;
      }
      userPrompt += "\n";
    }
    if (args.todoList && args.todoList.length > 0) {
      userPrompt += "## Pending task list\n";
      for (let i = 0; i < args.todoList.length; i++) {
        userPrompt += `- ${args.todoList[i]}\n`;
      }
      userPrompt += "\n";
    }
    if (args.loopDetection == "loop") {
      userPrompt += `## Loop detection\nIt seems that your task is being executed in a loop, Please change the execution strategy and try other methods to complete the current task.\n\n`;
    }
    userPrompt += "Please continue executing the remaining tasks.";
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: userPrompt.trim(),
        },
      ],
    });
  } catch (e) {
    Log.error("TodoListManagerTool error", e);
  }
}

export { TodoListManagerTool, doTodoListManager };
