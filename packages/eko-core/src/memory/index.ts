// Utilities for reducing the in-memory conversation footprint while preserving tool
// invocations and important context. These helpers are used when the agent needs to
// trim its prompt history and generate task snapshots that can be restored later.
import {
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2FunctionTool,
} from "@ai-sdk/provider";
import config from "../config";
import { Tool } from "../types";
import Log from "../common/log";
import TaskSnapshotTool from "./snapshot";
import { callAgentLLM } from "../agent/llm";
import { RetryLanguageModel } from "../llm";
import { fixJson, mergeTools, sub } from "../common/utils";
import { AgentContext } from "../core/context";

/**
 * Extracts tool definitions that were actually invoked during the conversation
 * 
 * Traverses the complete message history to identify all tools that have been executed,
 * then retrieves their corresponding definitions from the original tool collection. These
 * definitions are later reattached to compression prompts to ensure the model can continue
 * using the same capabilities in subsequent conversations.
 * 
 * The function scans through messages with role "tool" and collects unique tool names,
 * preventing duplicate tool definitions in the output.
 * 
 * @template T - Tool type, can be either Tool or LanguageModelV2FunctionTool
 * @param messages - Complete conversation history containing all role messages and tool call results
 * @param agentTools - Collection of all available tools declared in the agent's original request
 * @returns Array of tool definitions that were actually used in the conversation, in order of first appearance
 * 
 * @example
 * ```typescript
 * const usedTools = extractUsedTool(messages, allTools);
 * // Returns [weatherTool, calculatorTool] if these tools were invoked
 * ```
 */
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

/**
 * Removes duplicate tool invocations with identical names and payloads
 * 
 * Detects and eliminates duplicate tool calls that have the same tool name and parameters.
 * Some LLM providers may replay tool calls in multi-turn completions; this function keeps
 * only the first occurrence to avoid executing tools multiple times with the same input.
 * 
 * The deduplication logic uses a combination of tool name and JSON-serialized parameters
 * as a unique key. Non-tool-call content (such as text) is always preserved without checking
 * for duplicates.
 * 
 * For performance, the function short-circuits when there are 0-1 results or 0-1 tool calls.
 * 
 * @param results - Mixed content array returned by the LLM, potentially including both text and tool calls
 * @returns Deduplicated content array maintaining original order, with each unique tool call appearing only once
 * 
 * @example
 * ```typescript
 * const deduplicated = removeDuplicateToolUse([
 *   { type: 'tool-call', toolName: 'calc', input: { a: 1 } },
 *   { type: 'text', text: 'hello' },
 *   { type: 'tool-call', toolName: 'calc', input: { a: 1 } }, // Will be removed
 * ]);
 * // Returns first two items only
 * ```
 */
export function removeDuplicateToolUse(
  results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
): Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart> {
  if (
    results.length <= 1 ||
    results.filter((r) => r.type == "tool-call").length <= 1
  ) {
    return results;
  }
  let _results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart> = [];
  let tool_uniques: string[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].type === "tool-call") {
      let tool = results[i] as LanguageModelV2ToolCallPart;
      let key = tool.toolName + JSON.stringify(tool.input);
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

/**
 * Compresses an agent's conversation history when it grows beyond a safe size
 * 
 * When the conversation history reaches a minimum threshold (5 messages), this function
 * initiates compression by invoking the model to generate a task snapshot. The snapshot
 * replaces older messages with a concise summary while preserving tool invocations and
 * essential context.
 * 
 * The compression process is wrapped in a try-catch to ensure failures don't break the
 * agent execution flow. Any compression errors are logged but don't propagate to the caller.
 * 
 * @param agentContext - Execution context the agent is operating within, containing config and state
 * @param messages - Mutable array of conversation turns that will be rewritten in place
 * @param tools - The tools originally available to the agent invocation, used to preserve capabilities
 * @returns Promise that resolves when compression completes (or is skipped)
 * 
 * @example
 * ```typescript
 * await compressAgentMessages(context, messages, tools);
 * // messages array is now modified with compressed history
 * ```
 */
export async function compressAgentMessages(
  agentContext: AgentContext,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
) {
  if (messages.length < 5) {
    return;
  }
  try {
    await doCompressAgentMessages(agentContext, messages, tools);
  } catch (e) {
    Log.error("Error compressing agent messages:", e);
  }
}

/**
 * Internal helper that orchestrates the snapshot tool call and replaces long history with a summary
 * 
 * This function performs the actual compression work by:
 * 1. Creating a RetryLanguageModel configured for compression tasks
 * 2. Extracting only the tools that were actually used in the conversation
 * 3. Adding the TaskSnapshotTool to enable snapshot generation
 * 4. Trimming messages to the last complete tool cycle (backward search for role "tool")
 * 5. Compressing large context messages before generating the snapshot
 * 6. Calling the LLM with forced tool use to generate the snapshot
 * 7. Executing the TaskSnapshotTool with the model's parameters
 * 8. Replacing the middle portion of messages with the synthesized snapshot
 * 
 * The function preserves the structure: system, user, assistant, tool(first), [snapshot], tool(last), ...
 * 
 * @param agentContext - Context container including configuration, task data, and callbacks
 * @param messages - Reference to the messages array that will be mutated in place
 * @param tools - All declared tools; used to ensure the model can still access previously used capabilities
 * @returns Promise that resolves when the compression and message replacement is complete
 * @throws May throw errors during LLM call or tool execution (caller should catch)
 */
async function doCompressAgentMessages(
  agentContext: AgentContext,
  messages: LanguageModelV2Prompt,
  tools: LanguageModelV2FunctionTool[]
) {
  const ekoConfig = agentContext.context.config;
  const rlm = new RetryLanguageModel(ekoConfig.llms, ekoConfig.compressLlms);
  rlm.setContext(agentContext);
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
  // Walk backwards to the most recent tool result so we only compress complete
  // user → assistant → tool cycles.
  for (let r = newMessages.length - 1; r > 3; r--) {
    if (newMessages[r].role == "tool") {
      newMessages = newMessages.slice(0, r + 1);
      lastToolIndex = r;
      break;
    }
  }
  compressLargeContextMessages(newMessages);
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
  const toolCall = result.filter((s): s is Extract<typeof s, { type: "tool-call" }> => s.type == "tool-call")[0];
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

/**
 * Truncates oversized text content in messages to stay within token limits
 * 
 * Mutates the messages array in place by scanning through and truncating text payloads
 * that exceed the configured `largeTextLength` threshold. This preprocessing step helps
 * keep the prompt under hard token limits even before snapshot compression is applied.
 * 
 * The function handles three message roles differently:
 * - assistant: Truncates text parts in the content array
 * - user: Truncates text parts in the content array
 * - tool: Truncates text/error-text output values and text parts within content arrays
 * 
 * Truncated content is replaced with the first N characters plus "..." suffix.
 * The first 2 messages (typically system and initial user) are skipped to preserve context.
 * 
 * @param messages - Conversation turns to inspect and potentially rewrite in place
 * @returns void - Function modifies the messages array directly
 */
function compressLargeContextMessages(messages: LanguageModelV2Prompt) {
  for (let r = 2; r < messages.length; r++) {
    const message = messages[r];
    if (message.role == "assistant") {
      message.content = message.content.map((c) => {
        if (c.type == "text" && c.text.length > config.largeTextLength) {
          return {
            ...c,
            text: sub(c.text, config.largeTextLength, true),
          };
        }
        return c;
      });
    } else if (message.role == "user") {
      message.content = message.content.map((c) => {
        if (c.type == "text" && c.text.length > config.largeTextLength) {
          return {
            ...c,
            text: sub(c.text, config.largeTextLength, true),
          };
        }
        return c;
      });
    } else if (message.role == "tool") {
      message.content = message.content.map((c) => {
        if (c.type == "tool-result" && c.output) {
          const output = c.output;
          if (
            (output.type == "text" || output.type == "error-text") &&
            output.value.length > config.largeTextLength
          ) {
            return {
              ...c,
              output: {
                ...output,
                value: sub(output.value, config.largeTextLength, true),
              },
            };
          } else if (
            (output.type == "json" || output.type == "error-json") &&
            JSON.stringify(output.value).length > config.largeTextLength
          ) {
            const json_str = sub(
              JSON.stringify(output.value),
              config.largeTextLength,
              false
            );
            const json_obj = fixJson(json_str);
            if (JSON.stringify(json_obj).length < 10) {
              return {
                ...c,
                output: {
                  ...output,
                  value: json_str,
                  type: output.type == "error-json" ? "error-text" : "text",
                },
              };
            } else {
              return {
                ...c,
                output: {
                  ...output,
                  value: json_obj,
                },
              };
            }
          } else if (output.type == "content") {
            for (let i = 0; i < output.value.length; i++) {
              const content = output.value[i];
              if (
                content.type == "text" &&
                content.text.length > config.largeTextLength
              ) {
                content.text = sub(content.text, config.largeTextLength, true);
              }
            }
          }
        }
        return c;
      });
    }
  }
}

/**
 * Manages media-heavy conversations by limiting images and files to prevent context overflow
 * 
 * Applies heuristics to control the number of images and files in the conversation history.
 * The function walks backwards through messages (newest to oldest) and counts images and files,
 * replacing excess occurrences with lightweight textual placeholders like "[image]" or "[file]".
 * This allows the model to still reference that media existed without including the full payload.
 * 
 * The function also handles tool results containing:
 * - Media content (images): Replaced with "[image]" after quota exceeded
 * - Long text output: Truncated for repeated tool calls with verbose responses
 * 
 * Quota tracking is separate for images vs non-image files. Long text tool results use
 * per-tool counters to allow the first occurrence to remain full-length while truncating
 * subsequent calls to the same tool.
 * 
 * @param messages - Target dialogue sequence to prune media and long tool outputs in place
 * @returns void - Function modifies the messages array directly
 * 
 * @example
 * ```typescript
 * handleLargeContextMessages(messages);
 * // Images beyond maxDialogueImgFileNum are now "[image]" placeholders
 * ```
 */
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
          // Images are counted separately so we can allow a limited number of
          // screenshots before falling back to lightweight placeholders.
          if (++imageNum <= maxNum) {
            break;
          }
          content = {
            type: "text",
            text: "[image]",
          };
          message.content[j] = content;
        } else if (content.type == "file") {
          // Non-image files count toward the same quota but receive a generic
          // marker to avoid leaking large binary payloads into the prompt window.
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
            // Tool responses that embed media are subject to the same limit.
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
            // Collapse repeated oversized tool outputs to prevent ballooning
            // transcripts when the same tool returns verbose data repeatedly.
            _content = {
              type: "text",
              text: sub(_content.text, config.largeTextLength, true),
            };
            toolContent.value[r] = _content;
          }
        }
      }
    }
  }
}
