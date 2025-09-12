/**
 * Chain 模块文件
 *
 * 这个文件实现了 Eko 系统的执行链管理机制，是任务执行过程的核心跟踪和记录系统。
 * Chain 模块采用层次化设计，支持完整的工作流执行状态管理、事件监听和结果追踪。
 *
 * 主要组件：
 * - ToolChain：工具调用链，记录单个工具的执行过程
 * - AgentChain：代理执行链，记录单个代理的完整执行过程
 * - Chain：主执行链，管理整个任务的执行流程
 *
 * 核心概念：
 * - 执行链：记录任务执行的历史轨迹和中间状态
 * - 事件驱动：支持观察者模式的事件监听和通知
 * - 层次跟踪：从工具调用到代理执行再到任务完成的完整链条
 * - 状态同步：实时更新执行状态，支持外部监控
 *
 * 设计特点：
 * 1. 层次化架构：ToolChain -> AgentChain -> Chain
 * 2. 事件驱动：通过监听器模式支持状态变更通知
 * 3. 状态追踪：记录执行历史和中间结果
 * 4. 并发安全：支持并行执行的状态管理
 */

import { ToolResult } from "../types/tools.types";
import { LLMRequest } from "../types/llm.types";
import { WorkflowAgent } from "../types/core.types";
import { LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

/**
 * 执行链事件类型
 *
 * 定义了执行链系统中发生的事件类型，用于事件驱动的架构。
 * 目前支持"update"事件，表示执行链中的某个组件发生了状态更新。
 */
type ChainEvent = {
  /** 事件类型，目前只支持"update" */
  type: "update";
  /** 事件目标，可以是AgentChain或ToolChain */
  target: AgentChain | ToolChain;
};

/**
 * 执行链事件回调接口
 *
 * 定义了处理执行链事件的回调函数签名。
 * 实现此接口的函数可以监听和响应执行链中的状态变化。
 */
interface Callback {
  /** 事件处理函数 */
  (chain: Chain, event: ChainEvent): void;
}

/**
 * 工具调用链
 *
 * ToolChain 类记录和跟踪单个工具调用的完整生命周期。
 * 它是执行链系统中的最小执行单元，负责管理工具调用的参数、结果和状态更新。
 *
 * 主要职责：
 * 1. 记录工具调用信息（名称、ID、请求）
 * 2. 管理工具参数和执行结果
 * 3. 触发状态更新事件通知
 * 4. 提供工具执行的完整追踪
 *
 * 执行流程：
 * 1. 创建时记录工具调用信息
 * 2. 更新参数后触发参数更新事件
 * 3. 执行完成后更新结果并触发结果更新事件
 * 4. 通过事件机制通知上级组件状态变化
 *
 * 设计特点：
 * - 不可变性：toolName、toolCallId、request 都是只读的
 * - 事件驱动：通过 onUpdate 回调通知状态变化
 * - 状态隔离：每个工具调用都有独立的上下文
 */
export class ToolChain {
  /** 工具名称，唯一标识被调用的工具 */
  readonly toolName: string;

  /** 工具调用ID，唯一标识这次具体的工具调用 */
  readonly toolCallId: string;

  /** LLM请求对象，包含了触发这次工具调用的完整上下文 */
  readonly request: LLMRequest;

  /** 工具执行参数，经过JSON序列化的参数对象 */
  params?: Record<string, unknown>;

  /** 工具执行结果，包含执行状态和返回内容 */
  toolResult?: ToolResult;

  /** 更新回调函数，当状态发生变化时调用 */
  onUpdate?: () => void;

  /**
   * 构造函数
   *
   * 创建一个新的工具调用链实例，初始化工具调用的基本信息。
   *
   * @param toolUse 语言模型的工具调用部分，包含工具名称和调用ID
   * @param request 触发这次工具调用的LLM请求对象
   */
  constructor(toolUse: LanguageModelV2ToolCallPart, request: LLMRequest) {
    this.toolName = toolUse.toolName;
    this.toolCallId = toolUse.toolCallId;
    // 深拷贝请求对象，避免后续修改影响原始请求
    this.request = JSON.parse(JSON.stringify(request));
  }

  /**
   * 更新工具参数
   *
   * 设置工具执行所需的参数，并触发更新事件。
   * 这个方法通常在工具调用前被调用，用于传递执行参数。
   *
   * @param params 工具执行参数对象
   */
  updateParams(params: Record<string, unknown>): void {
    this.params = params;
    // 触发更新事件，通知监听器参数已更新
    this.onUpdate && this.onUpdate();
  }

  /**
   * 更新工具执行结果
   *
   * 设置工具执行的返回结果，并触发更新事件。
   * 这个方法在工具执行完成后被调用，用于记录执行结果。
   *
   * @param toolResult 工具执行结果对象
   */
  updateToolResult(toolResult: ToolResult): void {
    this.toolResult = toolResult;
    // 触发更新事件，通知监听器结果已更新
    this.onUpdate && this.onUpdate();
  }
}

/**
 * 代理执行链
 *
 * AgentChain 类记录和跟踪单个智能代理的完整执行过程。
 * 它是执行链系统中的中间层，连接了单个代理和其调用的所有工具。
 *
 * 主要职责：
 * 1. 管理代理的执行信息和状态
 * 2. 跟踪代理调用的所有工具
 * 3. 记录代理的请求和响应
 * 4. 协调工具链的事件传播
 *
 * 执行流程：
 * 1. 创建时绑定到具体的WorkflowAgent
 * 2. 记录代理执行的LLM请求
 * 3. 管理代理调用的所有工具链
 * 4. 收集和记录代理的执行结果
 * 5. 向上级传播工具链的状态更新事件
 *
 * 设计特点：
 * - 聚合管理：将多个ToolChain聚合到一个代理执行单元
 * - 事件转发：转发来自工具链的事件到上级监听器
 * - 状态跟踪：记录代理执行的完整生命周期
 * - 层次关联：连接代理定义和具体执行过程
 */
export class AgentChain {
  /** 工作流代理对象，定义了代理的配置和任务 */
  agent: WorkflowAgent;

  /** 该代理调用的所有工具链列表 */
  tools: ToolChain[] = [];

  /** 代理执行时发送给LLM的请求对象 */
  agentRequest?: LLMRequest;

  /** 代理执行的最终结果字符串 */
  agentResult?: string;

  /** 更新事件回调函数，用于向上级传播状态变化 */
  onUpdate?: (event: ChainEvent) => void;

  /**
   * 构造函数
   *
   * 创建一个新的代理执行链实例，绑定到指定的工作流代理。
   *
   * @param agent 工作流代理对象，定义了代理的配置信息
   */
  constructor(agent: WorkflowAgent) {
    this.agent = agent;
  }

  /**
   * 添加工具调用链
   *
   * 将一个工具调用链添加到当前代理的执行链中，并设置事件转发机制。
   * 这个方法建立了代理和工具之间的层次关系，支持事件传播。
   *
   * 执行步骤：
   * 1. 设置工具链的更新回调，指向代理链的事件处理器
   * 2. 将工具链添加到代理的工具列表中
   * 3. 触发代理链的更新事件，通知上级组件
   *
   * @param tool 要添加的工具调用链实例
   */
  push(tool: ToolChain): void {
    // 设置工具链的更新回调，创建事件转发链
    tool.onUpdate = () => {
      this.onUpdate &&
        this.onUpdate({
          type: "update",
          target: tool,
        });
    };

    // 将工具链添加到列表中
    this.tools.push(tool);

    // 触发代理链的更新事件，通知上级组件新增了工具
    this.onUpdate &&
      this.onUpdate({
        type: "update",
        target: this,
      });
  }
}

/**
 * 主执行链
 *
 * Chain 类是整个执行链系统的顶层管理器，负责协调和管理整个任务的工作流执行。
 * 它是执行链系统的核心，提供了完整的工作流跟踪、状态管理和事件分发功能。
 *
 * 主要职责：
 * 1. 管理工作流的规划和执行过程
 * 2. 协调所有代理的执行顺序和依赖关系
 * 3. 提供事件监听机制，支持外部状态监控
 * 4. 记录任务级别的执行历史和结果
 *
 * 执行流程：
 * 1. 初始化时记录原始任务提示
 * 2. 存储工作流规划的请求和结果
 * 3. 管理所有代理的执行链
 * 4. 转发来自代理链的事件到外部监听器
 * 5. 提供监听器的注册和移除功能
 *
 * 设计特点：
 * - 观察者模式：支持多个监听器同时监听执行状态
 * - 层次化管理：统一管理所有AgentChain
 * - 状态聚合：从工具链到代理链再到主链的完整状态追踪
 * - 事件分发：高效的事件传播机制
 */
export default class Chain {
  /** 原始任务提示文本，任务执行的起点 */
  taskPrompt: string;

  /** 工作流规划时发送给LLM的请求对象 */
  planRequest?: LLMRequest;

  /** 工作流规划的结果字符串 */
  planResult?: string;

  /** 任务中所有代理的执行链列表 */
  agents: AgentChain[] = [];

  /** 事件监听器列表，支持多个组件同时监听状态变化 */
  private listeners: Callback[] = [];

  /**
   * 构造函数
   *
   * 创建一个新的主执行链实例，初始化任务的基本信息。
   *
   * @param taskPrompt 用户提供的原始任务描述
   */
  constructor(taskPrompt: string) {
    this.taskPrompt = taskPrompt;
  }

  /**
   * 添加代理执行链
   *
   * 将一个代理执行链添加到主执行链中，并建立事件转发机制。
   * 这个方法建立了主链和代理链之间的层次关系。
   *
   * 执行步骤：
   * 1. 设置代理链的更新回调，指向主链的事件发布器
   * 2. 将代理链添加到代理列表中
   * 3. 发布代理添加事件，通知所有监听器
   *
   * @param agent 要添加的代理执行链实例
   */
  push(agent: AgentChain): void {
    // 设置代理链的事件回调，建立事件转发链
    agent.onUpdate = (event: ChainEvent) => {
      this.pub(event);
    };

    // 将代理链添加到列表中
    this.agents.push(agent);

    // 发布代理添加事件
    this.pub({
      type: "update",
      target: agent,
    });
  }

  /**
   * 发布事件
   *
   * 向所有已注册的监听器广播执行链事件。
   * 这个方法是观察者模式的核心，支持事件驱动的架构。
   *
   * @param event 要发布的事件对象
   * @private
   */
  private pub(event: ChainEvent): void {
    this.listeners.forEach((listener) => listener(this, event));
  }

  /**
   * 添加事件监听器
   *
   * 注册一个新的监听器来监听执行链的状态变化。
   * 添加的监听器会接收到所有后续的执行链事件。
   *
   * @param callback 事件处理回调函数
   */
  public addListener(callback: Callback): void {
    this.listeners.push(callback);
  }

  /**
   * 移除事件监听器
   *
   * 从监听器列表中移除指定的回调函数。
   * 移除后，该监听器将不再接收执行链事件。
   *
   * @param callback 要移除的事件处理回调函数
   */
  public removeListener(callback: Callback): void {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }
}
