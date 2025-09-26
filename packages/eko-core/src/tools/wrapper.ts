/**
 * Tool wrapper module
 *
 * Core wrapper of the tool system that converts custom tools into LLM-friendly
 * standard function-tool format. Provides a unified invocation interface.
 *
 * Key features:
 * 1. Schema conversion: custom ToolSchema -> LLM standard
 * 2. Executer encapsulation: unify invocation via ToolExecuter
 * 3. Context propagation: ensure full context on invocation
 * 4. Error handling: unified exception handling
 */

import { LanguageModelV2FunctionTool, LanguageModelV2ToolCallPart } from "@ai-sdk/provider";
import { ToolResult, ToolExecuter, ToolSchema } from "../types/tools.types";
import { convertToolSchema } from "../common/utils";
import { AgentContext } from "../core/context";

/**
 * ToolWrapper
 *
 * Responsibilities:
 * 1. Standardize tool schema
 * 2. Encapsulate execution logic
 * 3. Carry context
 * 4. Normalize results
 *
 * Design traits:
 * - Bridge pattern: custom definitions <-> LLM interface
 * - Encapsulation: hide implementation details
 * - Extensibility: support various executers
 * - Safety: isolate execution environment
 */
export class ToolWrapper {
  /** Converted LLM tool object in standard function-tool format */
  private tool: LanguageModelV2FunctionTool;

  /** Tool executer handling actual invocation logic */
  private execute: ToolExecuter;

  /**
   * Constructor
   *
   * @param toolSchema Custom tool schema
   * @param execute Tool executer instance
   */
  constructor(toolSchema: ToolSchema, execute: ToolExecuter) {
    // Convert custom tool schema to LLM standard format
    this.tool = convertToolSchema(toolSchema);
    this.execute = execute;
  }

  /**
   * Get tool name
   */
  get name(): string {
    return this.tool.name;
  }

  /**
   * Get standardized LLM tool object
   */
  getTool(): LanguageModelV2FunctionTool {
    return this.tool;
  }

  /**
   * Invoke tool
   *
   * @param args Tool arguments
   * @param agentContext Agent execution context
   * @param toolCall LLM tool-call info
   */
  async callTool(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV2ToolCallPart
  ): Promise<ToolResult> {
    // Delegate to executer
    return this.execute.execute(args, agentContext, toolCall);
  }
}
