import {
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
} from "@ai-sdk/provider";
import config from "../config";
import { Tool } from "../types";
import TaskSnapshotTool from "./snapshot";
import { callAgentLLM } from "../agent/llm";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { AgentContext } from "../core/context";
import Log from "../common/log";

export function extractUsedTool<T extends Tool | LanguageModelV2FunctionTool>(
  messages: LanguageModelV2Prompt,
  agentTools: T[]
): T[] {
  let tools: T[] = [];
  let toolNames: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    let message = messages[i];
    if (message.role == "tool") {
      for (let j = 0; j < message.content.length; j++) {
        let toolName = message.content[j].toolName;
        if (toolNames.indexOf(toolName) > -1) {
          continue;
        }
        toolNames.push(toolName);
        let tool = agentTools.filter((tool) => tool.name === toolName)[0];
        if (tool) {
          tools.push(tool);
        }
      }
    }
  }
  return tools;
}

export function removeDuplicateToolUse(
  results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
): Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart> {
  if (
    results.length <= 1 ||
    results.filter((r) => r.type == "tool-call").length <= 1
  ) {
    return results;
  }
  let _results = [];
  let tool_uniques = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].type === "tool-call") {
      let tool = results[i] as LanguageModelV2ToolCallPart;
      let key = tool.toolName + tool.input;
      if (tool_uniques.indexOf(key) == -1) {
        _results.push(results[i]);
        tool_uniques.push(key);
      }
    } else {
      _results.push(results[i]);
    }
  }
  return _results;
}

export async function compressAgentMessages(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
) {
  if (messages.length < 5) {
    return;
  }
  try {
    await doCompressAgentMessages(agentContext, rlm, messages, tools);
  } catch (e) {
    Log.error("Error compressing agent messages:", e);
  }
}

async function doCompressAgentMessages(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
) {
  // extract used tool
  const usedTools = extractUsedTool(messages, tools);
  const snapshotTool = new TaskSnapshotTool();
  const newTools = mergeTools(usedTools, [
    {
      type: "function",
      name: snapshotTool.name,
      description: snapshotTool.description,
      inputSchema: snapshotTool.parameters,
    },
  ]);
  // handle messages
  let lastToolIndex = messages.length - 1;
  let newMessages: LanguageModelV2Prompt = messages;
  for (let r = newMessages.length - 1; r > 3; r--) {
    if (newMessages[r].role == "tool") {
      newMessages = newMessages.slice(0, r + 1);
      lastToolIndex = r;
      break;
    }
  }
  newMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: "Please create a snapshot backup of the current task, keeping only key important information and node completion status.",
      },
    ],
  });
  // compress snapshot
  const result = await callAgentLLM(
    agentContext,
    rlm,
    newMessages,
    newTools,
    true,
    {
      type: "tool",
      toolName: snapshotTool.name,
    }
  );
  const toolCall = result.filter((s) => s.type == "tool-call")[0];
  const args =
    typeof toolCall.input == "string"
      ? JSON.parse(toolCall.input || "{}")
      : toolCall.input || {};
  const toolResult = await snapshotTool.execute(args, agentContext);
  const callback = agentContext.context.config.callback;
  if (callback) {
    await callback.onMessage(
      {
        taskId: agentContext.context.taskId,
        agentName: agentContext.agent.Name,
        nodeId: agentContext.agentChain.agent.id,
        type: "tool_result",
        toolId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        params: args,
        toolResult: toolResult,
      },
      agentContext
    );
  }
  // handle original messages
  let firstToolIndex = 3;
  for (let i = 0; i < messages.length; i++) {
    if (messages[0].role == "tool") {
      firstToolIndex = i;
      break;
    }
  }
  // system, user, assistant, tool(first), [...], <user>, assistant, tool(last), ...
  messages.splice(firstToolIndex + 1, lastToolIndex - firstToolIndex - 2, {
    role: "user",
    content: toolResult.content.filter((s) => s.type == "text") as Array<{
      type: "text";
      text: string;
    }>,
  });
}

export function handleLargeContextMessages(messages: LanguageModelV2Prompt) {
  let imageNum = 0;
  let fileNum = 0;
  let maxNum = config.maxDialogueImgFileNum;
  let longTextTools: Record<string, number> = {};
  for (let i = messages.length - 1; i >= 0; i--) {
    let message = messages[i];
    if (message.role == "user") {
      for (let j = 0; j < message.content.length; j++) {
        let content = message.content[j];
        if (content.type == "file" && content.mediaType.startsWith("image/")) {
          if (++imageNum <= maxNum) {
            break;
          }
          content = {
            type: "text",
            text: "[image]",
          };
          message.content[j] = content;
        } else if (content.type == "file") {
          if (++fileNum <= maxNum) {
            break;
          }
          content = {
            type: "text",
            text: "[file]",
          };
          message.content[j] = content;
        }
      }
    } else if (message.role == "tool") {
      for (let j = 0; j < message.content.length; j++) {
        let toolResult = message.content[j];
        let toolContent = toolResult.output;
        if (!toolContent || toolContent.type != "content") {
          continue;
        }
        for (let r = 0; r < toolContent.value.length; r++) {
          let _content = toolContent.value[r];
          if (
            _content.type == "media" &&
            _content.mediaType.startsWith("image/")
          ) {
            if (++imageNum <= maxNum) {
              break;
            }
            _content = {
              type: "text",
              text: "[image]",
            };
            toolContent.value[r] = _content;
          }
        }
        for (let r = 0; r < toolContent.value.length; r++) {
          let _content = toolContent.value[r];
          if (
            _content.type == "text" &&
            _content.text?.length > config.largeTextLength
          ) {
            if (!longTextTools[toolResult.toolName]) {
              longTextTools[toolResult.toolName] = 1;
              break;
            } else {
              longTextTools[toolResult.toolName]++;
            }
            _content = {
              type: "text",
              text: _content.text.substring(0, config.largeTextLength) + "...",
            };
            toolContent.value[r] = _content;
          }
        }
      }
    }
  }
}
