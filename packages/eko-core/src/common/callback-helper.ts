/**
 * Callback helper module
 *
 * Unified helpers to send standardized observability events.
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
import { AgentContext } from "../core/context";
import type Context from "../core/context";

/**
 * CallbackHelper: standardizes callback event sending and timestamps
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
   * Send a callback message
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

  // ========== Task-level events ==========

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

  // ========== Planning events ==========

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

  // ========== Workflow events ==========

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

  // ========== Agent-level events ==========

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

  // ========== Agent-node level events ==========

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

  // ========== LLM interaction events ==========

  async llmRequestStart(
    request: LLMRequest,
    modelName?: string,
    context?: {
      messageCount: number;
      toolCount: number;
      hasSystemPrompt: boolean;
    },
    agentContext?: AgentContext,
    streamId?: string,
    name?: string  // 自定义 generation span 名称
  ): Promise<void> {
    await this.sendMessage(
      {
        type: "debug_llm_request_start",
        request,
        modelName,
        streamId,
        name,  // 添加 name
        context: context || {
          messageCount: 0,
          toolCount: 0,
          hasSystemPrompt: false,
        },
      },
      agentContext
    );
  }

  async llmResponseStart(streamId: string, agentContext?: AgentContext): Promise<void> {
    await this.sendMessage(
      {
        type: "debug_llm_response_start",
        streamId,
      },
      agentContext
    );
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
    },
    agentContext?: AgentContext
  ): Promise<void> {
    await this.sendMessage({
      type: "debug_llm_response_finished",
      streamId,
      response,
      usage,
    }, agentContext);
  }

  // ========== Tool-call events ==========

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

  // ========== Factory methods ==========

  /**
   * Create a child helper for agent-scoped callbacks
   */
  createChildHelper(agentName: string, nodeId?: string | null): CallbackHelper {
    return new CallbackHelper(this.callback, this.taskId, agentName, nodeId);
  }

  /**
   * Whether callback is present
   */
  hasCallback(): boolean {
    return !!this.callback;
  }
}

/**
 * Convenience factory to create CallbackHelper
 */
export function createCallbackHelper(
  callback: StreamCallback | undefined,
  taskId: string,
  agentName: string = "System",
  nodeId?: string | null
): CallbackHelper {
  return new CallbackHelper(callback, taskId, agentName, nodeId);
}
