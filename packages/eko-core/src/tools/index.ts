import { JSONSchema7 } from "json-schema";
import { ToolWrapper } from "./wrapper";
import ForeachTaskTool from "./foreach-task";
import WatchTriggerTool from "./watch-trigger";
import HumanInteractTool from "./human-interact";
import TaskNodeStatusTool from "./task-node-status";
import VariableStorageTool from "./variable-storage";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";
import { LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

export class McpTool implements Tool {
  readonly name: string;
  readonly description?: string;
  readonly parameters: JSONSchema7;
  private toolWrapper: ToolWrapper;

  constructor(toolWrapper: ToolWrapper) {
    this.toolWrapper = toolWrapper;
    this.name = toolWrapper.name;
    this.description = toolWrapper.getTool().description;
    this.parameters = toolWrapper.getTool().inputSchema;
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV2ToolCallPart
  ): Promise<ToolResult> {
    return this.toolWrapper.callTool(args, agentContext, toolCall);
  }
}

export {
  ForeachTaskTool,
  HumanInteractTool,
  TaskNodeStatusTool,
  VariableStorageTool,
  WatchTriggerTool,
}