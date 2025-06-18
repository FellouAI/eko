import { JSONSchema7 } from "json-schema";
import { ToolWrapper } from "./wrapper";
import { AgentContext } from "../core/context";
import ForeachTaskTool from "./foreach_task";
import HumanInteractTool from "./human_interact";
import TaskNodeStatusTool from "./task_node_status";
import VariableStorageTool from "./variable_storage";
import WatchTriggerTool from "./watch_trigger";
import ActionBlockTool from "./action_block";
import { Tool, ToolResult } from "../types/tools.types";
import { LanguageModelV1ToolCallPart } from "@ai-sdk/provider";

export class McpTool implements Tool {
  readonly name: string;
  readonly description?: string;
  readonly parameters: JSONSchema7;
  private toolWrapper: ToolWrapper;

  constructor(toolWrapper: ToolWrapper) {
    this.toolWrapper = toolWrapper;
    this.name = toolWrapper.name;
    this.description = toolWrapper.getTool().description;
    this.parameters = toolWrapper.getTool().parameters;
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV1ToolCallPart
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
  ActionBlockTool,
}
