/**
 * Eko 核心引擎文件
 *
 * 这个文件实现了 Eko 系统的核心执行引擎，负责管理工作流的任务生成、执行和生命周期管理。
 * Eko 系统是一个基于大语言模型的智能代理编排框架，支持复杂任务的自动化执行。
 *
 * 核心概念：
 * - Agent（智能代理）：执行具体任务的实体，拥有特定的工具和能力
 * - Workflow（工作流）：由多个 Agent 组成的任务执行计划，包含依赖关系
 * - Context（上下文）：任务执行时的上下文环境，包含变量、配置等信息
 * - Chain（执行链）：记录任务执行的历史和中间结果
 *
 * 主要组件：
 * - Eko 类：主引擎类，负责任务的生成、执行和管理
 * - Planner 类：工作流规划器，负责根据任务提示生成执行计划
 * - Context 类：任务上下文管理器
 * - Agent 类：智能代理基类
 * - Chain 类：执行链管理器
 */

import config from "../config";
import Context from "./context";
import { Agent } from "../agent";
import { Planner } from "./plan";
import Log from "../common/log";
import Chain, { AgentChain } from "./chain";
import { buildAgentTree } from "../common/tree";
import { mergeAgents, uuidv4 } from "../common/utils";
import { createCallbackHelper } from "../common/callback-helper";
import {
  EkoConfig,
  EkoResult,
  Workflow,
  NormalAgentNode,
  WorkflowAgent,
} from "../types/core.types";
import { composeCallbacks } from "../common/compose-callbacks";
import { createLangfuseCallback } from "../common/langfuse-callback";

/**
 * Eko 主引擎类
 *
 * 这是 Eko 系统的核心类，负责整个任务执行生命周期的管理。
 * 每个 Eko 实例都维护着一个任务映射表，可以同时管理多个任务的执行。
 *
 * 主要职责：
 * 1. 任务生成（generate）：根据用户输入生成执行工作流
 * 2. 任务执行（execute）：执行生成的工作流
 * 3. 任务修改（modify）：修改已存在任务的工作流
 * 4. 任务管理：暂停、恢复、中止任务等
 * 5. 上下文管理：维护任务执行的上下文环境
 */
export class Eko {
  /** Eko 系统配置，包含语言模型、代理、回调函数等配置信息 */
  protected config: EkoConfig;

  /** 任务映射表，key 为任务 ID，value 为对应的上下文对象 */
  protected taskMap: Map<string, Context>;

  /**
   * 构造函数
   * @param config Eko 系统配置对象
   */
  constructor(config: EkoConfig) {
    this.config = config;

    if (this.config.enable_langfuse) {

      const required = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"];
      // @ts-ignore
      const missing = required.filter((k) => !process.env[k]);
      const enabled = missing.length === 0;
      if (!enabled) {
        Log.warn(
          `[Langfuse] Missing environment variables: ${missing.join(", ")}. Langfuse tracing will be disabled.`
        );
      }
      this.config.callback = composeCallbacks(
        this.config.callback,
        createLangfuseCallback({
          enabled,
          recordStreaming: this.config.langfuse_options?.recordStreaming === true,
        })
      );
    }

    this.taskMap = new Map();
  }

  /**
   * 生成任务工作流
   *
   * 这是 Eko 系统中最核心的方法之一，负责根据用户提供的任务提示生成完整的工作流。
   * 生成过程包括以下步骤：
   * 1. 初始化上下文环境
   * 2. 集成 A2A（Agent-to-Agent）客户端提供的外部代理
   * 3. 使用 Planner 生成详细的工作流计划
   * 4. 返回生成的工作流供后续执行
   *
   * @param taskPrompt 用户提供的任务描述文本
   * @param taskId 任务唯一标识符，如果不提供则自动生成 UUID
   * @param contextParams 额外的上下文参数，用于初始化任务变量
   * @returns 生成的工作流对象，包含任务执行计划
   *
   * @throws 如果工作流生成失败，会清理任务并抛出异常
   */
  public async generate(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<Workflow> {
    // 获取配置中的所有代理，并创建副本避免修改原始配置
    const agents = [...(this.config.agents || [])];

    // 创建执行链，用于记录任务执行的历史和中间结果
    const chain: Chain = new Chain(taskPrompt);

    // 创建任务上下文，包含任务ID、配置、代理列表和执行链
    const context = new Context(taskId, this.config, agents, chain);

    // 如果提供了上下文参数，将其设置到上下文中
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }

    try {
      // 将任务上下文存储到任务映射表中
      this.taskMap.set(taskId, context);

      // 如果配置了 A2A 客户端，获取外部代理并合并到当前代理列表中
      if (this.config.a2aClient) {
        const a2aList = await this.config.a2aClient.listAgents(taskPrompt);
        context.agents = mergeAgents(context.agents, a2aList);
      }

      // 使用规划器根据任务提示生成详细的工作流
      const planner = new Planner(context);

      // CALLBACK：发送 Task 开始的消息
      const taskStartCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      await taskStartCbHelper.taskStart(taskPrompt, contextParams, context as any);

      context.workflow = await planner.plan(taskPrompt);

      // 返回生成的工作流
      return context.workflow;
    } catch (e) {
      const taskErrorCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      // 如果生成过程中出现异常，清理任务并重新抛出异常
      this.deleteTask(taskId);
      // CALLBACK：发送 Task 错误的消息
      await taskErrorCbHelper.taskFinished(
        false,
        `Task Failed at generate state\nError: ${
          e instanceof Error ? e.message : String(e)
        }`,
        e,
        "error",
        context as any
      );
      throw e;
    }
  }

  /**
   * 修改已存在任务的工作流
   *
   * 这个方法允许在任务执行过程中动态修改任务计划。当用户想要改变任务目标或
   * 调整执行策略时，可以使用此方法重新规划工作流。
   *
   * 修改流程：
   * 1. 检查任务是否存在，不存在则创建新任务
   * 2. 重新获取 A2A 客户端的外部代理（如果配置了）
   * 3. 使用 Planner 的 replan 方法重新规划工作流
   * 4. 返回修改后的工作流
   *
   * @param taskId 要修改的任务 ID
   * @param modifyTaskPrompt 新的任务描述，用于重新规划工作流
   * @returns 修改后的工作流对象
   */
  public async modify(
    taskId: string,
    modifyTaskPrompt: string
  ): Promise<Workflow> {
    // 获取现有任务的上下文
    const context = this.taskMap.get(taskId);

    // 如果任务不存在，则创建新任务
    if (!context) {
      return await this.generate(modifyTaskPrompt, taskId);
    }

    // 如果配置了 A2A 客户端，重新获取外部代理并合并
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
      context.agents = mergeAgents(context.agents, a2aList);
    }

    // 使用规划器的 replan 方法重新规划工作流
    // replan 会基于现有的执行历史进行重新规划
    const planner = new Planner(context);
    context.workflow = await planner.replan(modifyTaskPrompt);

    return context.workflow;
  }

  /**
   * 执行指定的任务
   *
   * 这是 Eko 系统中最核心的执行方法，负责执行已生成的工作流。
   * 执行过程包括状态检查、环境准备、实际执行和结果处理。
   *
   * 执行前的准备工作：
   * 1. 检查任务是否存在
   * 2. 恢复暂停状态（如果任务被暂停）
   * 3. 清空对话历史
   * 4. 重置中断控制器
   *
   * 执行过程：
   * 1. 调用 doRunWorkflow 方法执行实际的工作流
   * 2. 处理执行过程中的异常
   * 3. 返回执行结果
   *
   * @param taskId 要执行的任务 ID
   * @returns 执行结果，包含成功状态、停止原因和执行结果
   *
   * @throws 如果任务不存在会抛出错误
   */
  public async execute(taskId: string): Promise<EkoResult> {
    // 获取任务上下文
    const context = this.getTask(taskId);

    // 检查任务是否存在
    if (!context) {
      throw new Error("The task does not exist");
    }

    // CALLBACK:创建回调助手

    // 如果任务处于暂停状态，恢复执行
    if (context.pause) {
      context.setPause(false);
    }
    if (context.controller.signal.aborted) {
      context.reset();
    }
    context.conversation = [];

    try {
      // 执行实际的工作流
      const result = await this.doRunWorkflow(context);

      const taskEndCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );

      // 发送任务完成事件
      await taskEndCbHelper.taskFinished(
        result.success,
        result.result,
        result.error,
        result.stopReason,
        context as any
      );

      return result;
    } catch (e: any) {
      // 记录执行错误
      Log.error("execute error", e);

      const taskErrorCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      // 发送任务失败事件
      await taskErrorCbHelper.taskFinished(
        false,
        e ? e.name + ": " + e.message : "Error",
        e,
        e?.name == "AbortError" ? "abort" : "error",
        context as any
      );

      // 返回错误结果
      return {
        taskId,
        success: false,
        stopReason: e?.name == "AbortError" ? "abort" : "error",
        result: e ? e.name + ": " + e.message : "Error",
        error: e,
      };
    }
  }

  /**
   * 一键运行任务
   *
   * 这是最常用的方法，提供了从任务生成到执行的完整流程。
   * 对于简单场景，这个方法可以一步到位地完成整个任务。
   *
   * 执行流程：
   * 1. 调用 generate 方法生成工作流
   * 2. 调用 execute 方法执行生成的工作流
   * 3. 返回执行结果
   *
   * 这个方法实际上是 generate 和 execute 方法的组合，
   * 适合不需要中间干预的简单任务场景。
   *
   * @param taskPrompt 用户提供的任务描述
   * @param taskId 任务唯一标识符，自动生成 UUID 如果未提供
   * @param contextParams 额外的上下文参数
   * @returns 任务执行结果
   */
  public async run(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<EkoResult> {

    // 先生成工作流
    await this.generate(taskPrompt, taskId, contextParams);

    // 然后执行工作流
    return await this.execute(taskId);
  }

  /**
   * 初始化任务上下文
   *
   * 这个方法用于基于已存在的工作流创建任务上下文。主要用于以下场景：
   * 1. 从外部导入工作流
   * 2. 重新加载之前保存的工作流
   * 3. 基于模板创建任务上下文
   *
   * 初始化过程：
   * 1. 创建基础的上下文环境
   * 2. 集成 A2A 客户端的外部代理
   * 3. 设置上下文参数
   * 4. 绑定工作流到上下文
   * 5. 将上下文注册到任务映射表
   *
   * @param workflow 已存在的工作流对象
   * @param contextParams 额外的上下文参数
   * @returns 初始化完成的上下文对象
   */
  public async initContext(
    workflow: Workflow,
    contextParams?: Record<string, any>
  ): Promise<Context> {
    // 获取配置中的代理列表
    const agents = this.config.agents || [];

    // 创建执行链，使用工作流的提示文本或名称作为任务提示
    const chain: Chain = new Chain(workflow.taskPrompt || workflow.name);

    // 创建任务上下文
    const context = new Context(workflow.taskId, this.config, agents, chain);

    // 如果配置了 A2A 客户端，获取并合并外部代理
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(
        workflow.taskPrompt || workflow.name
      );
      context.agents = mergeAgents(context.agents, a2aList);
    }

    // 设置额外的上下文参数
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }

    // 绑定工作流到上下文
    context.workflow = workflow;

    // 将上下文注册到任务映射表
    this.taskMap.set(workflow.taskId, context);

    return context;
  }

  /**
   * 执行工作流的私有方法
   *
   * 这是 Eko 系统中最核心的执行逻辑，负责实际执行工作流中的所有代理。
   * 这个方法实现了复杂的工作流执行引擎，支持：
   * 1. 顺序执行代理
   * 2. 并行执行代理
   * 3. 依赖关系管理
   * 4. 动态工作流修改
   * 5. 执行状态跟踪
   *
   * 执行流程：
   * 1. 验证工作流有效性
   * 2. 构建代理名称映射表
   * 3. 构建执行树（处理依赖关系）
   * 4. 按照执行树顺序执行代理
   * 5. 处理并行/串行执行模式
   * 6. 处理工作流动态修改
   * 7. 返回执行结果
   *
   * @param context 任务上下文，包含工作流和执行环境
   * @returns 执行结果
   * @private
   */
  private async doRunWorkflow(context: Context): Promise<EkoResult> {
    // 获取上下文中的代理列表和工作流
    const agents = context.agents as Agent[];
    const workflow = context.workflow as Workflow;

    // 验证工作流有效性
    if (!workflow || workflow.agents.length == 0) {
      throw new Error("Workflow error");
    }

    // 创建回调助手
    const workflowExecutorCbHelper = createCallbackHelper(
      this.config.callback,
      context.taskId,
      "WorkflowExecutor"
    );

    // 构建代理名称到代理对象的映射表，便于快速查找
    const agentNameMap = agents.reduce((map, item) => {
      map[item.Name] = item;
      return map;
    }, {} as { [key: string]: Agent });

    // 构建代理执行树，处理代理间的依赖关系
    let agentTree = buildAgentTree(workflow.agents);

    // CALLBACK:发送工作流开始事件
    await workflowExecutorCbHelper.workflowStart(workflow, agentTree);

    // 存储所有代理的执行结果
    const results: string[] = [];

    // 主执行循环，按照执行树遍历所有代理
    while (true) {
      // 检查是否被中断
      await context.checkAborted();

      if (agentTree.type === "normal" && agentTree.agent.status === "init") {
        // 单个代理执行分支

        // 根据代理名称查找对应的代理实例
        const agent = agentNameMap[agentTree.agent.name];
        if (!agent) {
          throw new Error("Unknown Agent: " + agentTree.agent.name);
        }

        // 获取代理节点信息
        const agentNode = agentTree.agent;

        // 创建代理链，用于记录这个代理的执行历史
        const agentChain = new AgentChain(agentNode);

        // 将代理链添加到上下文的执行链中
        context.chain.push(agentChain);

        // 执行代理并获取结果
        agentTree.result = await this.runAgent(
          context,
          agent,
          agentTree,
          agentChain
        );

        // 将执行结果添加到结果列表
        results.push(agentTree.result);
      } else if (agentTree.type === "parallel" && agentTree.agents.every((agent) => agent.agent.status === "init")) {
        // 并行代理执行分支

        const parallelAgents = agentTree.agents;

        // 定义单个代理的执行函数
        const doRunAgent = async (
          agentNode: NormalAgentNode,
          index: number
        ) => {
          // 查找代理实例
          const agent = agentNameMap[agentNode.agent.name];
          if (!agent) {
            throw new Error("Unknown Agent: " + agentNode.agent.name);
          }

          // 创建代理链
          const agentChain = new AgentChain(agentNode.agent);
          context.chain.push(agentChain);

          // 执行代理
          const result = await this.runAgent(
            context,
            agent,
            agentNode,
            agentChain
          );

          return { result: result, agentChain, index };
        };

        // 存储并行执行的结果
        let agent_results: string[] = [];

        // 获取并行执行配置
        let agentParallel = context.variables.get("agentParallel");
        if (agentParallel === undefined) {
          agentParallel = config.agentParallel;
        }

        if (agentParallel) {
          // 并行执行模式

          // 使用 Promise.all 并行执行所有代理
          const parallelResults = await Promise.all(
            parallelAgents.map((agent, index) => doRunAgent(agent, index))
          );

          // 按照索引排序确保结果顺序正确
          parallelResults.sort((a, b) => a.index - b.index);

          // 将所有代理链添加到上下文执行链中
          parallelResults.forEach(({ agentChain }) => {
            context.chain.push(agentChain);
          });

          // 提取执行结果
          agent_results = parallelResults.map(({ result }) => result);
        } else {
          // 串行执行模式

          // 依次执行每个代理
          for (let i = 0; i < parallelAgents.length; i++) {
            const { result, agentChain } = await doRunAgent(
              parallelAgents[i],
              i
            );
            context.chain.push(agentChain);
            agent_results.push(result);
          }
        }

        // 将所有代理的结果合并为单个字符串
        results.push(agent_results.join("\n\n"));
      }

      // 清空对话历史，为下一个代理执行做准备
      context.conversation.splice(0, context.conversation.length);

      // 检查工作流是否被修改
      if (workflow.modified) {
        // 重置修改标志
        workflow.modified = false;

        // 重新构建执行树，只包含状态为 "init" 的代理
        agentTree = buildAgentTree(
          workflow.agents.filter((agent) => agent.status == "init")
        );

        // 继续执行循环
        continue;
      }

      // 检查是否还有下一个代理需要执行
      if (!agentTree.nextAgent) {
        break;
      }

      // 移动到下一个代理
      agentTree = agentTree.nextAgent;
    }

    // 发送工作流完成事件
    const finalResult = results[results.length - 1] || "";
    await workflowExecutorCbHelper.workflowFinished(results, finalResult, context as any);

    // 返回执行成功的结果
    return {
      success: true,
      stopReason: "done",
      taskId: context.taskId,
      result: finalResult,
    };
  }

  /**
   * 执行单个代理
   *
   * 这个方法负责执行单个智能代理，是代理执行的包装器。
   * 它处理了代理执行的完整生命周期，包括：
   * 1. 状态管理（运行中、完成、错误）
   * 2. 回调通知（开始、结果、错误）
   * 3. 异常处理和传播
   * 4. 结果返回
   *
   * 执行流程：
   * 1. 设置代理状态为 "running"
   * 2. 发送代理开始执行的回调通知
   * 3. 调用代理的 run 方法执行具体任务
   * 4. 设置代理状态为 "done"
   * 5. 发送代理执行结果的回调通知
   * 6. 返回执行结果
   *
   * 如果执行过程中出现异常：
   * 1. 设置代理状态为 "error"
   * 2. 发送错误回调通知
   * 3. 重新抛出异常
   *
   * @param context 任务上下文
   * @param agent 要执行的代理实例
   * @param agentNode 代理节点信息
   * @param agentChain 代理执行链
   * @returns 代理执行结果
   * @protected
   */
  protected async runAgent(
    context: Context,
    agent: Agent,
    agentNode: NormalAgentNode,
    agentChain: AgentChain
  ): Promise<string> {
    const startTime = Date.now();
    let toolCallCount = 0;

    // 创建代理专用的回调助手
    const runAgentNodeCbHelper = createCallbackHelper(
      this.config.callback,
      context.taskId,
      agentNode.agent.name,
      agentNode.agent.id
    );

    try {
      // 设置代理状态为运行中
      agentNode.agent.status = "running";

      // 发送新的代理开始事件
      await runAgentNodeCbHelper.agentNodeStart(
        agentNode,
        (agentNode.agent as WorkflowAgent).task || "",
        context as any
      );
      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage({
          taskId: context.taskId,
          agentName: agentNode.agent.name,
          nodeId: agentNode.agent.id,
          type: "agent_start",
          agentNode: agentNode.agent,
          requirements: (agentNode.agent as any).requirement || "",
        } as any));

      // 执行代理并获取结果
      agentNode.result = await agent.run(context, agentChain);

      // 设置代理状态为完成
      agentNode.agent.status = "done";

      // 计算执行统计信息
      const duration = Date.now() - startTime;
      // 从agentChain中获取工具调用次数
      toolCallCount = agentChain.tool_chains.length;

      // 发送新的代理完成事件
      await runAgentNodeCbHelper.agentNodeFinished(
        agentNode, 
        agentNode.result, {
          loopCount: 0, // 这个需要从agent中获取，暂时设为0
          toolCallCount,
          duration,
      }, undefined, context as any);
      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            result: agentNode.result,
          },
          agent.AgentContext
        ));

      // 返回执行结果
      return agentNode.result;
    } catch (e) {
      // 设置代理状态为错误
      agentNode.agent.status = "error";

      // 计算执行统计信息
      const duration = Date.now() - startTime;
      toolCallCount = agentChain.tool_chains.length;

      const runAgentErrorCbHelper = runAgentNodeCbHelper.createChildHelper(agentNode.agent.name);

      // 发送新的代理失败事件
      await runAgentErrorCbHelper.agentNodeFinished(
        agentNode,
        "",
        {
          loopCount: 0,
          toolCallCount,
          duration,
        },
        `runAgent error: ${e instanceof Error ? e.message : String(e)}`,
        context as any
      );

      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            error: e,
          },
          agent.AgentContext
        ));

      // 重新抛出异常
      throw e;
    }
  }

  /**
   * 获取指定任务的上下文
   *
   * @param taskId 任务 ID
   * @returns 任务上下文对象，如果任务不存在则返回 undefined
   */
  public getTask(taskId: string): Context | undefined {
    return this.taskMap.get(taskId);
  }

  /**
   * 获取所有任务 ID
   *
   * @returns 所有任务 ID 的数组
   */
  public getAllTaskId(): string[] {
    return [...this.taskMap.keys()];
  }

  /**
   * 删除指定任务
   *
   * 删除任务时会：
   * 1. 中止任务执行
   * 2. 清理上下文变量
   * 3. 从任务映射表中移除任务
   *
   * @param taskId 要删除的任务 ID
   * @returns 删除是否成功
   */
  public deleteTask(taskId: string): boolean {
    // 首先中止任务执行
    this.abortTask(taskId);

    // 获取任务上下文
    const context = this.taskMap.get(taskId);
    if (context) {
      // 清理上下文中的所有变量
      context.variables.clear();
    }

    // 从任务映射表中删除任务
    return this.taskMap.delete(taskId);
  }

  /**
   * 中止指定任务
   *
   * 中止任务会：
   * 1. 取消暂停状态
   * 2. 通知代理任务状态改变
   * 3. 调用中断控制器中止执行
   *
   * @param taskId 要中止的任务 ID
   * @param reason 中止原因
   * @returns 中止是否成功
   */
  public abortTask(taskId: string, reason?: string): boolean {
    // 获取任务上下文
    let context = this.taskMap.get(taskId);
    if (context) {
      // 取消暂停状态
      context.setPause(false);

      // 通知代理任务状态改变
      this.onTaskStatus(context, "abort", reason);

      // 中止执行
      context.controller.abort(reason);
      return true;
    } else {
      return false;
    }
  }

  /**
   * 暂停或恢复指定任务
   *
   * 暂停任务时可以选择是否同时中止当前步骤。
   * 这个方法主要用于：
   * 1. 用户主动暂停任务执行
   * 2. 系统资源紧张时暂停任务
   * 3. 等待用户输入时暂停任务
   *
   * @param taskId 任务 ID
   * @param pause 是否暂停（true 为暂停，false 为恢复）
   * @param abortCurrentStep 是否同时中止当前步骤
   * @param reason 暂停原因
   * @returns 操作是否成功
   */
  public pauseTask(
    taskId: string,
    pause: boolean,
    abortCurrentStep?: boolean,
    reason?: string
  ): boolean {
    // 获取任务上下文
    const context = this.taskMap.get(taskId);
    if (context) {
      // 通知代理任务状态改变
      this.onTaskStatus(context, pause ? "pause" : "resume-pause", reason);

      // 设置暂停状态
      context.setPause(pause, abortCurrentStep);
      return true;
    } else {
      return false;
    }
  }

  /**
   * 向指定任务添加聊天消息
   *
   * 这个方法用于在任务执行过程中添加用户输入，
   * 常用于人机交互场景。
   *
   * @param taskId 任务 ID
   * @param userPrompt 用户输入的消息
   * @returns 更新后的对话历史，如果任务不存在则返回 undefined
   */
  public chatTask(taskId: string, userPrompt: string): string[] | undefined {
    // 获取任务上下文
    const context = this.taskMap.get(taskId);
    if (context) {
      // 将用户消息添加到对话历史中
      context.conversation.push(userPrompt);
      return context.conversation;
    }
  }

  /**
   * 添加智能代理到配置中
   *
   * 这个方法允许动态地向 Eko 实例添加新的代理。
   * 添加的代理可以在后续的任务执行中使用。
   *
   * @param agent 要添加的代理实例
   */
  public addAgent(agent: Agent): void {
    // 确保代理数组存在
    this.config.agents = this.config.agents || [];

    // 添加代理到配置中
    this.config.agents.push(agent);
  }

  /**
   * 任务状态改变通知
   *
   * 这个私有方法负责通知当前正在执行的代理任务状态的改变。
   * 它会查找当前代理实例，并调用其 onTaskStatus 方法。
   *
   * @param context 任务上下文
   * @param status 新的任务状态
   * @param reason 状态改变的原因
   * @private
   */
  private async onTaskStatus(
    context: Context,
    status: string,
    reason?: string
  ) {
    // 获取当前正在执行的代理
    const [agent] = context.currentAgent() || [];
    if (agent) {
      // 获取代理的 onTaskStatus 方法
      const onTaskStatus = (agent as any)["onTaskStatus"];
      if (onTaskStatus) {
        // 调用代理的状态改变处理方法
        await onTaskStatus.call(agent, status, reason);
      }
    }
  }
}
