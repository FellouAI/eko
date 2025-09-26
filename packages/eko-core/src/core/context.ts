/**
 * Context 模块文件
 *
 * 这个文件实现了 Eko 系统的上下文管理机制，是整个系统状态管理的核心。
 * 上下文管理包括任务执行环境、状态控制、变量存储等功能。
 *
 * 主要组件：
 * - Context 类：任务级别的上下文管理器
 * - AgentContext 类：代理级别的上下文管理器
 *
 * 核心概念：
 * - 任务上下文（Context）：维护单个任务的完整执行环境
 * - 代理上下文（AgentContext）：维护单个代理的执行状态
 * - 暂停控制：支持任务执行的暂停和恢复
 * - 中断控制：支持任务执行的中止操作
 * - 变量存储：提供键值对形式的变量存储机制
 *
 * 设计特点：
 * 1. 层次化上下文：任务上下文包含代理上下文
 * 2. 状态隔离：不同任务和代理的上下文相互独立
 * 3. 生命周期管理：自动处理上下文的创建和清理
 * 4. 并发控制：支持并行代理执行的状态管理
 */

import type { Agent } from "../agent/base";
import { sleep } from "../common/utils";
import Chain from "./chain";
import type { AgentChain } from "./chain";
import {
  EkoConfig,
  LanguageModelV2Prompt,
  Workflow,
  WorkflowAgent,
} from "../types";

/**
 * 任务上下文管理器
 *
 * Context 类是 Eko 系统中最重要的状态管理组件之一，负责维护单个任务的完整执行环境。
 * 每个任务实例都对应一个 Context 对象，包含了任务执行所需的所有状态信息。
 *
 * 主要职责：
 * 1. 任务标识和配置管理
 * 2. 执行链和代理管理
 * 3. 变量存储和状态维护
 * 4. 暂停/恢复控制
 * 5. 中断控制和异常处理
 * 6. 对话历史管理
 *
 * 状态管理：
 * - pauseStatus: 0=运行中, 1=暂停, 2=暂停并中止当前步骤
 * - currentStepControllers: 当前步骤的控制器集合，用于精细化控制
 *
 * 设计模式：
 * - 组合模式：Context 组合了多个管理器（Chain、Agent[]等）
 * - 状态模式：通过 pauseStatus 管理任务的不同状态
 * - 观察者模式：通过回调机制响应状态变化
 */
export default class Context {
  /** 任务唯一标识符 */
  taskId: string;

  /** Eko 系统配置，包含语言模型、代理、回调函数等 */
  config: EkoConfig;

  /** 执行链，记录任务执行的历史和中间结果 */
  chain: Chain;

  /** 可用的智能代理列表 */
  agents: Agent[];

  /** 中断控制器，用于控制任务执行的中止 */
  controller: AbortController;

  /** 变量存储器，支持键值对形式的变量存取 */
  variables: Map<string, any>;

  /** 工作流对象，定义任务的执行计划 */
  workflow?: Workflow;

  /** 对话历史，存储任务执行过程中的人机对话 */
  conversation: string[] = [];

  /** 暂停状态：0=运行中, 1=暂停, 2=暂停并中止当前步骤 */
  private pauseStatus: 0 | 1 | 2 = 0;

  /** 当前步骤的控制器集合，用于并行执行时的精细控制 */
  readonly currentStepControllers: Set<AbortController> = new Set();

  /**
   * 构造函数
   *
   * 创建一个新的任务上下文实例，初始化所有必要的组件。
   *
   * @param taskId 任务的唯一标识符
   * @param config Eko 系统配置
   * @param agents 可用的智能代理列表
   * @param chain 执行链实例
   */
  constructor(
    taskId: string,
    config: EkoConfig,
    agents: Agent[],
    chain: Chain
  ) {
    this.taskId = taskId;
    this.config = config;
    this.agents = agents;
    this.chain = chain;
    this.variables = new Map();
    this.controller = new AbortController();
  }

  /**
   * 检查任务是否被中断或暂停
   *
   * 这个方法是任务执行过程中的关键检查点，用于处理中断和暂停状态。
   * 它会在任务执行的关键节点被调用，确保任务能够正确响应外部控制。
   *
   * 检查逻辑：
   * 1. 检查主控制器是否被中止，如果是则抛出 AbortError
   * 2. 如果任务被暂停且未禁用暂停检查，则进入暂停等待循环
   * 3. 在暂停状态下，如果 pauseStatus 为 2（中止当前步骤），则中止所有当前步骤控制器
   * 4. 循环等待直到暂停状态被解除或任务被中止
   *
   * 暂停机制：
   * - pauseStatus = 1: 普通暂停，等待恢复
   * - pauseStatus = 2: 强制暂停，中止当前步骤后再等待
   *
   * @param noCheckPause 可选参数，如果为 true 则跳过暂停检查
   * @throws AbortError 当任务被中止时抛出
   */
  async checkAborted(noCheckPause?: boolean): Promise<void> {
    // 检查主控制器是否被中止
    if (this.controller.signal.aborted) {
      const error = new Error("Operation was interrupted");
      error.name = "AbortError";
      throw error;
    }

    // 暂停检查循环
    while (this.pauseStatus > 0 && !noCheckPause) {
      // 等待 500ms 后重新检查
      await sleep(500);

      // 如果是强制暂停状态（2），则中止所有当前步骤
      if (this.pauseStatus == 2) {
        this.currentStepControllers.forEach((c) => {
          c.abort("Pause");
        });
        this.currentStepControllers.clear();
      }

      // 再次检查主控制器是否被中止
      if (this.controller.signal.aborted) {
        const error = new Error("Operation was interrupted");
        error.name = "AbortError";
        throw error;
      }
    }
  }

  /**
   * 获取当前正在执行的代理信息
   *
   * 这个方法返回当前执行链中最后一个代理的详细信息，包括：
   * 1. Agent 实例：具体的智能代理对象
   * 2. WorkflowAgent：工作流中的代理节点信息
   * 3. AgentContext：代理执行上下文
   *
   * 获取逻辑：
   * 1. 从执行链中获取最后一个代理链
   * 2. 根据代理名称从代理列表中查找对应的 Agent 实例
   * 3. 获取代理的执行上下文
   * 4. 返回三元组或 null（如果找不到对应代理）
   *
   * 使用场景：
   * - 任务状态监控：查看当前正在执行哪个代理
   * - 错误处理：定位出现问题的代理
   * - 状态变更通知：通知当前代理状态变化
   * - 调试和日志：记录当前执行状态
   *
   * @returns 三元组 [Agent, WorkflowAgent, AgentContext] 或 null
   */
  currentAgent(): [Agent, WorkflowAgent, AgentContext] | null {
    // 从执行链中获取最后一个代理链
    const agentNode = this.chain.agent_chains[this.chain.agent_chains.length - 1];

    // 如果没有代理链，返回 null
    if (!agentNode) {
      return null;
    }

    // 根据名称查找对应的 Agent 实例
    const agent = this.agents.filter(
      (agent) => agent.Name == agentNode.agent.name
    )[0];

    // 如果找不到对应代理，返回 null
    if (!agent) {
      return null;
    }

    // 获取代理的执行上下文
    const agentContext = agent.AgentContext as AgentContext;

    // 返回三元组
    return [agent, agentNode.agent, agentContext];
  }

  /**
   * 获取当前暂停状态
   *
   * @returns true 如果任务当前处于暂停状态，false 如果正在运行
   */
  get pause() {
    return this.pauseStatus > 0;
  }

  /**
   * 设置任务的暂停状态
   *
   * 这个方法控制任务的执行状态，支持三种模式：
   * 1. 运行状态（pauseStatus = 0）：任务正常执行
   * 2. 普通暂停（pauseStatus = 1）：任务暂停，等待恢复
   * 3. 强制暂停（pauseStatus = 2）：暂停并中止当前所有步骤
   *
   * 暂停机制：
   * - 普通暂停：任务执行到下一个检查点时暂停
   * - 强制暂停：立即中止当前步骤，然后暂停
   *
   * 使用场景：
   * - 用户主动暂停：允许用户中断长时间运行的任务
   * - 系统资源控制：当系统负载过高时暂停任务
   * - 等待用户输入：需要人工干预时暂停任务
   * - 错误恢复：出现错误时暂停以便人工检查
   *
   * @param pause 是否暂停任务
   * @param abortCurrentStep 是否同时中止当前步骤（仅在暂停时有效）
   */
  setPause(pause: boolean, abortCurrentStep?: boolean) {
    // 设置暂停状态
    this.pauseStatus = pause ? (abortCurrentStep ? 2 : 1) : 0;

    // 如果是强制暂停状态，立即中止所有当前步骤
    if (this.pauseStatus == 2) {
      this.currentStepControllers.forEach((c) => {
        c.abort("Pause");
      });
      this.currentStepControllers.clear();
    }
  }

  reset() {
    this.pauseStatus = 0;
    if (!this.controller.signal.aborted) {
      this.controller.abort();
    }
    this.currentStepControllers.forEach((c) => {
      c.abort("reset");
    });
    this.currentStepControllers.clear();
    this.controller = new AbortController();
  }

  /**
   * 自定义序列化，去除不可序列化与循环引用
   */
  toJSON(): Record<string, unknown> {
    const variablesObj: Record<string, any> = {};
    this.variables.forEach((v, k) => (variablesObj[k] = v));
    return {
      taskId: this.taskId,
      pause: this.pause,
      conversationLength: this.conversation.length,
      variables: variablesObj,
      workflow: this.workflow
        ? {
            taskId: this.workflow.taskId,
            name: this.workflow.name,
            agentsCount: this.workflow.agents?.length ?? 0,
            modified: this.workflow.modified,
          }
        : undefined,
      chain: this.chain,
      agents: this.agents ? this.agents.map((a) => a.Name) : undefined,
    };
  }
}

/**
 * 代理上下文管理器
 *
 * AgentContext 类负责管理单个智能代理的执行状态和环境信息。
 * 它是代理执行过程中的核心状态容器，提供了代理执行所需的所有上下文信息。
 *
 * 主要职责：
 * 1. 代理实例管理：维护当前执行的代理对象
 * 2. 上下文关联：连接到任务级别的上下文
 * 3. 执行链管理：维护代理的执行历史
 * 4. 变量作用域：提供代理级别的变量存储
 * 5. 错误计数：跟踪连续错误次数
 * 6. 消息历史：存储与语言模型的对话历史
 *
 * 设计特点：
 * - 层次化存储：继承任务级变量，同时支持代理级私有变量
 * - 错误容忍：通过连续错误计数实现智能的重试机制
 * - 状态隔离：每个代理实例都有独立的上下文环境
 * - 消息追踪：完整的对话历史便于调试和分析
 *
 * 错误处理机制：
 * - consecutiveErrorNum 用于跟踪连续失败次数
 * - 超过阈值时会触发特殊处理（如跳过该代理）
 * - 支持错误恢复和状态重置
 *
 * 生命周期：
 * 1. 由 Agent.run() 方法创建
 * 2. 在代理执行期间保持活跃状态
 * 3. 执行完成后通过 Agent.AgentContext 访问
 */
export class AgentContext {
  /** 当前执行的智能代理实例 */
  agent: Agent;

  /** 所属的任务上下文 */
  context: Context;

  /** 代理的执行链，记录执行历史和中间结果 */
  agentChain: AgentChain;

  /** 代理级别的变量存储器，与任务级别变量独立 */
  variables: Map<string, any>;

  /** 连续错误次数计数器，用于错误处理和重试逻辑 */
  consecutiveErrorNum: number;

  /** 消息历史，存储与语言模型的对话记录 */
  messages?: LanguageModelV2Prompt;

  /**
   * 构造函数
   *
   * 创建一个新的代理上下文实例，初始化代理执行环境。
   *
   * @param context 所属的任务上下文
   * @param agent 要执行的智能代理实例
   * @param agentChain 代理的执行链
   */
  constructor(context: Context, agent: Agent, agentChain: AgentChain) {
    this.context = context;
    this.agent = agent;
    this.agentChain = agentChain;
    this.variables = new Map();
    this.consecutiveErrorNum = 0;
  }

  /**
   * 自定义序列化，去除回指 Context/Agent 等运行时对象
   */
  toJSON(): Record<string, unknown> {
    const variablesObj: Record<string, any> = {};
    this.variables.forEach((v, k) => (variablesObj[k] = v));
    return {
      agentName: this.agent?.Name,
      consecutiveErrorNum: this.consecutiveErrorNum,
      messagesLength: this.messages?.length ?? 0,
      variables: variablesObj,
      agentChain: this.agentChain,
    };
  }
}
