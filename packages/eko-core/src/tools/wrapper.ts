import { convertToolSchema } from "../common/utils";
import { AgentContext } from "../agent/agent-context";
import { ToolResult, ToolExecuter, ToolSchema } from "../types/tools.types";
import { LanguageModelV2FunctionTool, LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

export class ToolWrapper {
  private tool: LanguageModelV2FunctionTool;
  private execute: ToolExecuter;

  constructor(toolSchema: ToolSchema, execute: ToolExecuter) {
    this.tool = convertToolSchema(toolSchema);
    this.execute = execute;
  }

  get name(): string {
    return this.tool.name;
  }

  getTool(): LanguageModelV2FunctionTool {
    return this.tool;
  }

  async callTool(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV2ToolCallPart
  ): Promise<ToolResult> {
    return await this.execute.execute(args, agentContext, toolCall);
  }
}
