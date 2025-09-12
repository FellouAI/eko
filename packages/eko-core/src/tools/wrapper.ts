/**
 * 工具包装器模块
 *
 * 这个文件实现了工具系统的核心包装器，负责将自定义工具转换为LLM可用的标准格式。
 * ToolWrapper 是工具系统的基础组件，提供了统一的工具调用接口。
 *
 * 主要功能：
 * 1. 工具模式转换：将自定义ToolSchema转换为LLM标准格式
 * 2. 执行器封装：包装ToolExecuter提供统一的调用接口
 * 3. 上下文传递：确保工具调用时包含完整的上下文信息
 * 4. 错误处理：统一的工具调用异常处理机制
 */

import { LanguageModelV2FunctionTool, LanguageModelV2ToolCallPart } from "@ai-sdk/provider";
import { ToolResult, ToolExecuter, ToolSchema } from "../types/tools.types";
import { convertToolSchema } from "../common/utils";
import { AgentContext } from "../core/context";

/**
 * 工具包装器
 *
 * ToolWrapper 是工具系统的核心包装器，负责：
 * 1. 工具模式的标准化转换
 * 2. 执行逻辑的封装和调用
 * 3. 上下文信息的传递
 * 4. 统一的结果返回格式
 *
 * 设计特点：
 * - 桥接模式：连接自定义工具定义和LLM标准接口
 * - 封装性：隐藏工具实现的复杂性
 * - 扩展性：支持不同类型的工具执行器
 * - 安全性：隔离工具执行环境和上下文
 */
export class ToolWrapper {
  /** 转换后的LLM工具对象，符合标准函数调用格式 */
  private tool: LanguageModelV2FunctionTool;

  /** 工具执行器，负责实际的工具调用逻辑 */
  private execute: ToolExecuter;

  /**
   * 构造函数
   *
   * 创建工具包装器实例，将自定义工具模式转换为标准格式。
   *
   * @param toolSchema 自定义工具模式定义
   * @param execute 工具执行器实例
   */
  constructor(toolSchema: ToolSchema, execute: ToolExecuter) {
    // 将自定义工具模式转换为LLM标准格式
    this.tool = convertToolSchema(toolSchema);
    this.execute = execute;
  }

  /**
   * 获取工具名称
   *
   * @returns 工具的唯一标识符
   */
  get name(): string {
    return this.tool.name;
  }

  /**
   * 获取LLM工具对象
   *
   * 返回转换后的标准工具对象，用于LLM函数调用。
   *
   * @returns LLM标准格式的工具对象
   */
  getTool(): LanguageModelV2FunctionTool {
    return this.tool;
  }

  /**
   * 调用工具
   *
   * 执行实际的工具调用逻辑，这是工具包装器的核心方法。
   *
   * 调用流程：
   * 1. 接收LLM的工具调用请求
   * 2. 提取工具参数和上下文信息
   * 3. 调用具体的工具执行器
   * 4. 返回标准化的工具结果
   *
   * @param args 工具调用参数
   * @param agentContext 代理执行上下文
   * @param toolCall LLM工具调用信息
   * @returns 工具执行结果
   */
  async callTool(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV2ToolCallPart
  ): Promise<ToolResult> {
    // 调用具体的工具执行器
    return this.execute.execute(args, agentContext, toolCall);
  }
}
