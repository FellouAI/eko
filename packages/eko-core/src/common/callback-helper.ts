/**
 * 回调辅助工具模块
 *
 * 这个文件提供了统一的回调管理和发送功能，简化了可观测性事件的触发。
 * 主要目标是提供标准化的方式来发送不同类型的观测事件。
 */

import {
  StreamCallback,
  StreamCallbackMessage,
  Workflow,
  AgentNode,
} from "../types/core.types";
import { LLMRequest } from "../types/llm.types";
import { ToolResult } from "../types/tools.types";
import type { Agent } from "../agent/base";
import type { AgentContext } from "../core/context";
import type Context from "../core/context";

/**
 * 回调辅助类
 *
 * 提供标准化的回调事件发送方法，统一管理时间戳和基础信息
 */
export class CallbackHelper {
  private callback?: StreamCallback;
  private taskId: string;
  private agentName: string;
  private nodeId?: string | null;

  constructor(
    callback: StreamCallback | undefined,
    taskId: string,
    agentName: string = "System",
    nodeId?: string | null
  ) {
    this.callback = callback;
    this.taskId = taskId;
    this.agentName = agentName;
    this.nodeId = nodeId;
  }

  /**
   * 发送回调消息的通用方法
   */
  private async sendMessage(
    partialMessage: any,
    agentContext?: AgentContext
  ): Promise<void> {
    if (!this.callback) return;

    const message: StreamCallbackMessage = {
      taskId: this.taskId,
      agentName: this.agentName,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      ...partialMessage,
    } as StreamCallbackMessage;

    await this.callback.onMessage(message, agentContext);
  }

  // ========== 任务级别事件 ==========

  async taskStart(
    taskPrompt: string,
    contextParams?: Record<string, any>,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_task_start",
      taskPrompt,
      contextParams,
      context,
    });
  }

  async taskFinished(
    success: boolean,
    result?: string,
    error?: any,
    stopReason?: string,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_task_finished",
      success,
      result,
      error,
      stopReason,
      context,
    });
  }

  // ========== 规划阶段事件 ==========

  async planStart(
    taskPrompt: string,
    plannerPrompt: { systemPrompt: string; userPrompt: string },
    availableAgents: Array<Agent>
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_plan_start",
      taskPrompt,
      plannerPrompt,
      availableAgents,
    });
  }

  async planProcess(
    streamDone: boolean,
    partialWorkflow?: Workflow,
    thinkingText?: string,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_plan_process",
      streamDone,
      partialWorkflow,
      thinkingText,
      context,
    });
  }

  async planFinished(
    workflow: Workflow,
    planRequest: LLMRequest,
    planResult: string,
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_plan_finished",
      workflow,
      planRequest,
      planResult,
      usage,
      context,
    });
  }

  // ========== 工作流执行事件 ==========

  async workflowStart(workflow: Workflow, agentTree: AgentNode): Promise<void> {
    await this.sendMessage({
      type: "debug_workflow_start",
      workflow,
      agentTree,
    });
  }

  async workflowFinished(
    results: string[],
    finalResult: string,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_workflow_finished",
      results,
      finalResult,
      context,
    });
  }

  // ========== 代理级别事件 ==========

  async agentStart(agent: Agent, agentContext: AgentContext): Promise<void> {
    await this.sendMessage({
      type: "debug_agent_start",
      agent: agent,
      agentContext: agentContext,
    });
  }

  async agentProcess(
    loopNum: number,
    maxReactNum: number,
    agentContext: AgentContext,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_agent_process",
      loopNum: loopNum,
      maxReactNum: maxReactNum,
      agentContext: agentContext,
      context,
    });
  }

  async agentFinished(
    agent: Agent,
    agentContext: AgentContext,
    result: string,
    error?: any,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_agent_finished",
      agent: agent,
      agentContext: agentContext,
      result: result,
      error: error,
      context,
    });
  }

  // ========== 代理节点级别事件 ==========

  async agentNodeStart(agentNode: AgentNode, task: string, context?: Context): Promise<void> {
    await this.sendMessage({
      type: "debug_agent_node_start",
      agentNode: agentNode,
      task: task,
      context,
    });
  }

  async agentNodeFinished(
    agentNode: AgentNode,
    result: string,
    executionStats: {
      loopCount: number;
      toolCallCount: number;
      duration: number;
    },
    error?: any,
    context?: Context
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_agent_node_finished",
      agentNode: agentNode,
      result: result,
      error: error,
      executionStats: executionStats,
      context,
    });
  }

  // ========== LLM交互事件 ==========

  async llmRequestStart(
    request: LLMRequest,
    modelName?: string,
    context?: {
      messageCount: number;
      toolCount: number;
      hasSystemPrompt: boolean;
    },
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_llm_request_start",
      request,
      modelName,
      context: context || {
        messageCount: 0,
        toolCount: 0,
        hasSystemPrompt: false,
      },
    });
  }

  async llmResponseStart(streamId: string): Promise<void> {
    await this.sendMessage({
      type: "debug_llm_response_start",
      streamId,
    });
  }

  async llmResponseProcess(
    streamId: string,
    deltaType:
      | "text_start"
      | "text_delta"
      | "text_end"
      | "thinking_start"
      | "thinking_delta"
      | "thinking_end"
      | "tool_call_start"
      | "tool_call_delta"
      | "tool_call_end",
    delta: string,
    streamDone: boolean
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_llm_response_process",
      streamId,
      deltaType,
      delta,
      streamDone,
    });
  }

  async llmResponseFinished(
    streamId: string,
    response: Array<any>,
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_llm_response_finished",
      streamId,
      response,
      usage,
    });
  }

  // ========== 工具调用事件 ==========

  async toolCallStart(
    toolName: string,
    toolId: string,
    params: Record<string, any>
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_tool_call_start",
      toolName,
      toolId,
      params,
    });
  }

  async toolCallProcess(
    toolName: string,
    toolId: string,
    streamId: string,
    text: string,
    streamDone: boolean
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_tool_call_process",
      toolName,
      toolId,
      streamId,
      text,
      streamDone,
    });
  }

  async toolCallFinished(
    toolName: string,
    toolId: string,
    params: Record<string, any>,
    toolResult: ToolResult,
    duration: number
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_tool_call_finished",
      toolName,
      toolId,
      params,
      toolResult,
      duration,
    });
  }

  // ========== 工厂方法 ==========

  /**
   * 创建子级回调助手，用于代理执行中的回调
   */
  createChildHelper(agentName: string, nodeId?: string | null): CallbackHelper {
    return new CallbackHelper(this.callback, this.taskId, agentName, nodeId);
  }

  /**
   * 检查是否有回调函数
   */
  hasCallback(): boolean {
    return !!this.callback;
  }
}

/**
 * 创建回调助手的便捷函数
 */
export function createCallbackHelper(
  callback: StreamCallback | undefined,
  taskId: string,
  agentName: string = "System",
  nodeId?: string | null
): CallbackHelper {
  return new CallbackHelper(callback, taskId, agentName, nodeId);
}
