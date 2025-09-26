/**
 * Agent 基类模块
 *
 * 这个文件实现了 Eko 系统的智能代理基类，是整个代理系统的核心。
 * Agent 类定义了智能代理的标准接口和生命周期管理，为各种具体代理提供统一的框架。
 *
 * 核心架构：
 * - Agent基类：定义代理的标准接口和行为
 * - 工具集成：支持多种工具的注册和调用
 * - LLM集成：通过RetryLanguageModel实现多模型支持
 * - 上下文管理：完整的执行上下文和状态跟踪
 * - 生命周期：从创建到执行再到销毁的完整生命周期
 *
 * 设计理念：
 * 1. 组合优于继承：通过组合工具、LLM、上下文等组件
 * 2. 接口标准化：统一的Agent接口便于系统集成
 * 3. 错误容忍：完善的错误处理和重试机制
 * 4. 状态隔离：每个代理实例都有独立的执行环境
 * 5. 扩展性：插件式的工具系统支持功能扩展
 *
 * 代理生命周期：
 * 1. 构造：初始化代理配置和工具
 * 2. 运行：接收任务并开始执行
 * 3. 推理：通过LLM进行任务分析和规划
 * 4. 工具调用：根据需要调用各种工具
 * 5. 结果生成：整合所有信息生成最终结果
 * 6. 清理：释放资源和清理状态
 */

import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import { createCallbackHelper } from "../common/callback-helper";
import {
  McpTool,
  ForeachTaskTool,
  WatchTriggerTool,
  VariableStorageTool,
} from "../tools";
import {
  Tool,
  IMcpClient,
  LLMRequest,
  ToolResult,
  ToolSchema,
  ToolExecuter,
  WorkflowAgent,
  HumanCallback,
  StreamCallback,
} from "../types";
import {
  LanguageModelV2Prompt,
  LanguageModelV2FilePart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from "@ai-sdk/provider";
import {
  getTool,
  convertTools,
  callAgentLLM,
  convertToolResult,
  defaultMessageProviderOptions,
} from "./llm";
import { doTaskResultCheck } from "../tools/task_result_check";
import { doTodoListManager } from "../tools/todo_list_manager";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";

/**
 * 代理参数配置类型
 *
 * 定义了创建智能代理时所需的配置参数。
 * 这些参数决定了代理的能力范围、行为特征和集成选项。
 */
export type AgentParams = {
  /** 代理的唯一名称，用于标识和引用 */
  name: string;

  /** 代理的功能描述，说明代理能够执行的任务类型 */
  description: string;

  /** 代理内置的工具集合，定义了代理可用的能力 */
  tools: Tool[];

  /** 可选的LLM模型列表，指定代理可使用的语言模型 */
  llms?: string[];

  /** 可选的MCP客户端，用于外部工具和服务集成 */
  mcpClient?: IMcpClient;

  /** 可选的规划描述，用于工作流规划阶段的代理选择 */
  planDescription?: string;

  /** 可选的请求处理器，用于自定义LLM请求的预处理 */
  requestHandler?: (request: LLMRequest) => void;
};

/**
 * 智能代理基类
 *
 * Agent 类是 Eko 系统中所有智能代理的基类，定义了智能代理的标准接口和核心行为。
 * 每个 Agent 实例都具备独立的能力配置、工具集合和执行环境。
 *
 * 核心职责：
 * 1. 任务执行：接收并执行具体的任务请求
 * 2. 工具管理：组织和管理代理可用的工具集合
 * 3. LLM集成：与语言模型进行交互和推理
 * 4. 上下文管理：维护执行状态和对话历史
 * 5. 结果生成：整合多源信息生成最终结果
 *
 * 执行模式：
 * 1. 工具调用模式：通过工具扩展代理能力
 * 2. 推理模式：基于LLM进行复杂问题分析
 * 3. 协作模式：与其他代理或系统组件协作
 * 4. 学习模式：根据执行历史优化行为
 *
 * 状态管理：
 * - 执行上下文：通过AgentContext维护执行状态
 * - 工具状态：跟踪工具调用的成功和失败
 * - 对话历史：记录与LLM的完整交互过程
 * - 错误统计：监控执行过程中的异常情况
 *
 * 扩展机制：
 * - 工具插件：通过addTool方法动态添加工具
 * - LLM定制：通过llms配置指定使用的模型
 * - 回调集成：支持实时状态通知和用户交互
 * - MCP集成：通过mcpClient连接外部服务
 */
export class Agent {
  /** 代理的唯一名称标识符 */
  public name: string;

  /** 代理的功能描述，说明代理的能力范围 */
  public description: string;

  /** 代理内置的工具集合，定义了代理的核心能力 */
  public tools: Tool[] = [];

  /** 可选的LLM模型列表，指定代理可使用的语言模型 */
  protected llms?: string[];

  /** 可选的MCP客户端，用于连接外部工具和服务 */
  protected mcpClient?: IMcpClient;

  /** 可选的规划描述，用于工作流规划阶段 */
  protected planDescription?: string;

  /** 可选的请求处理器，用于自定义LLM请求 */
  protected requestHandler?: (request: LLMRequest) => void;

  /** 可选的回调处理器，用于状态通知和用户交互 */
  protected callback?: StreamCallback & HumanCallback;

  /** 当前代理的执行上下文，维护执行状态和环境 */
  protected agentContext?: AgentContext;

  /**
   * 构造函数
   *
   * 创建一个新的智能代理实例，初始化代理的基本配置和能力。
   *
   * 初始化过程：
   * 1. 基础配置：设置代理的标识和描述信息
   * 2. 能力配置：初始化工具集合和模型配置
   * 3. 扩展配置：设置MCP客户端和回调处理器
   * 4. 状态初始化：准备执行环境和上下文管理
   *
   * 配置验证：
   * - name: 必须唯一，用于代理标识
   * - description: 描述代理功能，用于规划阶段选择
   * - tools: 工具集合，定义代理的核心能力
   * - llms: 可选，用于指定特定的语言模型
   * - mcpClient: 可选，用于外部服务集成
   *
   * @param params 代理配置参数
   */
  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
    this.requestHandler = params.requestHandler;
  }

  /**
   * 执行代理任务
   *
   * 这是智能代理的核心执行方法，负责接收任务并生成相应的执行结果。
   * 该方法建立了完整的代理执行环境，包括上下文创建、MCP连接管理和资源清理。
   *
   * 执行流程：
   * 1. 环境准备：创建代理上下文和初始化执行环境
   * 2. MCP连接：建立与外部服务的连接（如需要）
   * 3. 任务执行：调用核心执行逻辑处理任务
   * 4. 资源清理：确保所有连接和资源被正确释放
   *
   * 错误处理：
   * - 网络异常：通过MCP客户端的连接错误处理
   * - 执行异常：在runWithContext中处理并可能重试
   * - 资源泄漏：通过finally块确保资源释放
   *
   * 并发安全：
   * - 每个代理实例的执行是独立的
   * - 通过AgentContext实现状态隔离
   * - MCP连接在执行完成后自动关闭
   *
   * @param context 任务执行上下文
   * @param agentChain 代理执行链，用于记录执行历史
   * @returns 代理执行结果字符串
   */
  public async run(context: Context, agentChain: AgentChain): Promise<string> {
    const mcpClient = this.mcpClient || context.config.defaultMcpClient;
    const agentContext = new AgentContext(context, this, agentChain);
    try {
      // 保存当前代理上下文引用
      this.agentContext = agentContext;

      // 连接MCP客户端（如果配置了且未连接）
      mcpClient &&
        !mcpClient.isConnected() &&
        (await mcpClient.connect(context.controller.signal));
      return await this.runWithContext(
        agentContext,
        mcpClient,
        config.maxReactNum
      );
    } finally {
      // 确保MCP连接被关闭，防止资源泄漏
      mcpClient && (await mcpClient.close());
    }
  }

  /**
   * 基于上下文执行代理任务
   *
   * 这是代理执行的核心方法，实现了完整的推理循环和工具调用机制。
   * 该方法通过迭代的方式与LLM交互，逐步解决复杂任务。
   *
   * 执行策略：
   * 1. 推理循环：通过多次LLM调用逐步解决问题
   * 2. 工具集成：在推理过程中动态调用工具扩展能力
   * 3. 状态管理：维护对话历史和执行上下文
   * 4. 错误恢复：通过重试机制处理执行异常
   *
   * 推理流程：
   * 1. 构建系统提示和用户提示
   * 2. 准备工具集合（内置工具 + MCP工具）
   * 3. 调用LLM进行推理和工具调用
   * 4. 处理工具调用结果并更新上下文
   * 5. 重复推理直到获得最终结果或达到限制
   *
   * 高级特性：
   * - 专家模式：启用时使用额外的推理优化
   * - 任务结果检查：验证执行结果的完成度
   * - 待办事项管理：处理复杂任务的步骤规划
   * - 上下文压缩：管理长对话的内存使用
   *
   * @param agentContext 代理执行上下文
   * @param mcpClient 可选的MCP客户端
   * @param maxReactNum 最大推理次数，默认100
   * @param historyMessages 历史消息，用于继续之前的对话
   * @returns 代理执行的最终结果
   */
  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100,
    historyMessages: LanguageModelV2Prompt = []
  ): Promise<string> {
    // 初始化推理循环变量
    let loopNum = 0;  // 当前推理轮数
    let checkNum = 0; // 任务检查次数

    // 保存代理上下文引用
    this.agentContext = agentContext;

    // 获取任务执行上下文和代理节点
    const context = agentContext.context;
    const agentNode = agentContext.agentChain.agent;

    // 创建回调助手
    const agentRunCbHelper = createCallbackHelper(
      this.callback || context.config.callback,
      context.taskId,
      this.name,
      agentNode.id
    );

    // 构建完整的工具集合（代理工具 + 系统自动工具）
    const tools = [...this.tools, ...this.system_auto_tools(agentNode)];

    // 构建系统提示和用户提示
    const systemPrompt = await this.buildSystemPrompt(agentContext, tools);
    const userPrompt = await this.buildUserPrompt(agentContext, tools);

    // 构造完整的消息列表
    const messages: LanguageModelV2Prompt = [
      {
        role: "system",
        content: systemPrompt,
        providerOptions: defaultMessageProviderOptions(),
      },
      ...historyMessages,
      {
        role: "user",
        content: userPrompt,
        providerOptions: defaultMessageProviderOptions(),
      },
    ];

    // 保存消息到代理上下文
    agentContext.messages = messages;

    // 初始化LLM管理器
    const rlm = new RetryLanguageModel(context.config.llms, this.llms);

    // 初始化代理工具集合
    let agentTools = tools;

    await agentRunCbHelper.agentStart(
      this, 
      agentContext
    )

    // 主推理循环
    while (loopNum < maxReactNum) {
      // 检查是否被中断
      await context.checkAborted();

      // 发送代理处理过程事件
      await agentRunCbHelper.agentProcess(
        loopNum,
        maxReactNum,
        agentContext,
        agentContext.context as any
      );

      // MCP工具动态加载
      if (mcpClient) {
        const controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          // 获取MCP工具列表
          const mcpTools = await this.listTools(
            context,
            mcpClient,
            agentNode,
            controlMcp.mcpParams
          );
          // 提取已使用的工具
          const usedTools = memory.extractUsedTool(messages, agentTools);
          // 合并所有工具
          const _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }

      // 处理消息（压缩、清理等）
      await this.handleMessages(agentContext, messages, tools);

      // 转换工具为LLM格式
      const llm_tools = convertTools(agentTools);

      // 调用LLM进行推理
      const results = await callAgentLLM(
        agentContext,
        rlm,
        messages,
        llm_tools,
        false,
        undefined,
        0,
        this.callback || context.config.callback,
        this.requestHandler
      );

      // 检查是否强制停止
      const forceStop = agentContext.variables.get("forceStop");
      if (forceStop) {
        return forceStop;
      }

      // 处理工具调用结果
      const finalResult = await this.handleCallResult(
        agentContext,
        messages,
        agentTools,
        results
      );

      // 增加循环计数
      loopNum++;

      // 如果没有最终结果，继续推理
      if (!finalResult) {
        // 专家模式：定期进行待办事项管理
        if (config.expertMode && loopNum % config.expertModeTodoLoopNum == 0) {
          await doTodoListManager(agentContext, rlm, messages, llm_tools);
        }
        continue;
      }

      // 专家模式：任务结果验证
      if (config.expertMode && checkNum == 0) {
        checkNum++;
        const { completionStatus } = await doTaskResultCheck(
          agentContext,
          rlm,
          messages,
          llm_tools
        );
        if (completionStatus == "incomplete") {
          continue;
        }
      }

      await agentRunCbHelper.agentFinished(
        this,
        agentContext,
        finalResult,
        undefined,
        agentContext.context as any
      );

      // 返回最终结果
      return finalResult;
    }

    await agentRunCbHelper.agentFinished(
      this,
      agentContext,
      "Unfinished",
      undefined,
      agentContext.context as any
    );

    return "Unfinished";
  }

  /**
   * 处理工具调用结果
   *
   * 这个方法是代理推理循环的核心，负责处理LLM的响应并执行相应的工具调用。
   * 它是连接LLM推理和工具执行的桥梁。
   *
   * 处理逻辑：
   * 1. 遍历LLM响应结果
   * 2. 区分文本响应和工具调用
   * 3. 执行工具调用并处理结果
   * 4. 更新对话历史
   * 5. 返回最终结果或null（继续推理）
   *
   * 工具调用流程：
   * 1. 解析工具参数
   * 2. 查找对应的工具实现
   * 3. 执行工具调用
   * 4. 处理执行结果和错误
   * 5. 转换结果格式
   * 6. 更新对话上下文
   *
   * 错误处理：
   * - 工具不存在：抛出错误
   * - 工具执行失败：记录错误但继续执行
   * - 参数解析失败：使用默认参数
   *
   * @param agentContext 代理执行上下文
   * @param messages 对话消息历史
   * @param agentTools 可用的工具列表
   * @param results LLM响应结果
   * @returns 最终结果字符串或null（需要继续推理）
   * @protected
   */
  protected async handleCallResult(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>
  ): Promise<string | null> {
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];
    // results = memory.removeDuplicateToolUse(results);
    messages.push({
      role: "assistant",
      content: results,
    });
    if (results.length == 0) {
      return null;
    }
    const textParts = results.filter(
      (s): s is LanguageModelV2TextPart => s.type === "text"
    );
    if (textParts.length === results.length) {
      return textParts.map((s) => s.text).join("\n\n");
    }
    const toolCalls = results.filter(
      (s): s is LanguageModelV2ToolCallPart => s.type === "tool-call"
    );
    if (
      toolCalls.length > 1 &&
      this.canParallelToolCalls(toolCalls) &&
      toolCalls.every(
        (s) => agentTools.find((t) => t.name == s.toolName)?.supportParallelCalls === true
      )
    ) {
      const resultsArr = await Promise.all(
        toolCalls.map((toolCall) =>
          this.callToolCall(agentContext, agentTools, toolCall, user_messages)
        )
      );
      for (let i = 0; i < resultsArr.length; i++) {
        toolResults.push(resultsArr[i]);
      }
    } else {
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        const toolResult = await this.callToolCall(
          agentContext,
          agentTools,
          toolCall,
          user_messages
        );
        toolResults.push(toolResult);
      }
    }
    if (toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: toolResults,
      });
      user_messages.forEach((message) => messages.push(message));
      return null;
    } else {
      return textParts.map((s) => s.text).join("\n\n");
    }
  }

  protected async callToolCall(
    agentContext: AgentContext,
    agentTools: Tool[],
    result: LanguageModelV2ToolCallPart,
    user_messages: LanguageModelV2Prompt = []
  ): Promise<LanguageModelV2ToolResultPart> {
    const context = agentContext.context;
    const toolChain = new ToolChain(
      result,
      agentContext.agentChain.agentRequest as LLMRequest
    );
    agentContext.agentChain.push(toolChain);

    const args =
      typeof result.input == "string"
        ? JSON.parse(result.input || "{}")
        : result.input || {};
    toolChain.params = args;

    const toolcallCbHelper = createCallbackHelper(
      this.callback || context.config.callback,
      context.taskId,
      this.name,
      agentContext.agentChain.agent.id
    );

    let toolResult: ToolResult;
    const startTime = Date.now();
    try {
      await toolcallCbHelper.toolCallStart(
        result.toolName,
        result.toolCallId,
        args
      );
      const tool = getTool(agentTools, result.toolName);
      if (!tool) {
        throw new Error(result.toolName + " tool does not exist");
      }
      toolResult = await tool.execute(args, agentContext, result);
      toolChain.updateToolResult(toolResult);
      agentContext.consecutiveErrorNum = 0;
    } catch (e) {
      Log.error("tool call error: ", result.toolName, result.input, e);
      toolResult = {
        content: [
          {
            type: "text",
            text: e + "",
          },
        ],
        isError: true,
      };
      toolChain.updateToolResult(toolResult);
      const durationErr = Date.now() - startTime;
      await toolcallCbHelper.toolCallFinished(
        result.toolName,
        result.toolCallId,
        args,
        toolResult,
        durationErr
      );
      if (++agentContext.consecutiveErrorNum >= 10) {
        throw e;
      }
      const callback = this.callback || context.config.callback;
      if (callback) {
        await callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentContext.agent.Name,
            nodeId: agentContext.agentChain.agent.id,
            type: "tool_result",
            toolId: result.toolCallId,
            toolName: result.toolName,
            params: result.input || {},
            toolResult: toolResult,
          },
          agentContext
        );
      }
      return convertToolResult(result, toolResult, user_messages);
    }

    const duration = Date.now() - startTime;
    await toolcallCbHelper.toolCallFinished(
      result.toolName,
      result.toolCallId,
      args,
      toolResult,
      duration
    );

    const callback = this.callback || context.config.callback;
    if (callback) {
      await callback.onMessage(
        {
          taskId: context.taskId,
          agentName: agentContext.agent.Name,
          nodeId: agentContext.agentChain.agent.id,
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        },
        agentContext
      );
    }
    return convertToolResult(result, toolResult, user_messages);
  }

  /**
   * 生成系统自动工具
   *
   * 根据代理节点的工作流配置，自动生成所需的系统工具。
   * 这些工具是基于工作流XML配置动态添加的，不是代理预定义的工具。
   *
   * 自动工具映射：
   * - VariableStorageTool：当工作流包含变量输入/输出时
   * - ForeachTaskTool：当工作流包含循环结构时
   * - WatchTriggerTool：当工作流包含监听触发器时
   *
   * 工具去重：
   * 确保不会添加与代理已有工具重复的系统工具。
   *
   * @param agentNode 工作流代理节点
   * @returns 系统自动生成的工具列表
   * @protected
   */
  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    let tools: Tool[] = [];
    let agentNodeXml = agentNode.xml;

    // 检查是否包含变量操作
    let hasVariable =
      agentNodeXml.indexOf("input=") > -1 ||
      agentNodeXml.indexOf("output=") > -1;
    if (hasVariable) {
      tools.push(new VariableStorageTool());
    }

    // 检查是否包含循环结构
    let hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
    if (hasForeach) {
      tools.push(new ForeachTaskTool());
    }

    // 检查是否包含监听触发器
    let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
    if (hasWatch) {
      tools.push(new WatchTriggerTool());
    }

    // 过滤掉与已有工具重复的系统工具
    let toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

  /**
   * 构建系统提示
   *
   * 生成发送给LLM的系统级提示信息，定义代理的行为规范和能力边界。
   * 系统提示是代理推理的基础，影响代理的决策和响应质量。
   *
   * 提示构建流程：
   * 1. 获取标准的代理系统提示模板
   * 2. 集成代理的个性化和扩展提示
   * 3. 包含工具使用说明和格式规范
   * 4. 添加上下文相关的指导信息
   *
   * @param agentContext 代理执行上下文
   * @param tools 可用的工具列表
   * @returns 完整的系统提示字符串
   * @protected
   */
  protected async buildSystemPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return getAgentSystemPrompt(
      this,
      agentContext.agentChain.agent,
      agentContext.context,
      tools,
      await this.extSysPrompt(agentContext, tools)
    );
  }

  /**
   * 构建用户提示
   *
   * 生成发送给LLM的用户级提示信息，包含具体的任务要求和上下文信息。
   * 用户提示定义了代理需要解决的具体问题和目标。
   *
   * 提示内容：
   * - 任务描述和要求
   * - 上下文信息和约束条件
   * - 期望的输出格式
   * - 特殊处理指示
   *
   * @param agentContext 代理执行上下文
   * @param tools 可用的工具列表
   * @returns 用户提示内容数组
   * @protected
   */
  protected async buildUserPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<Array<LanguageModelV2TextPart | LanguageModelV2FilePart>> {
    return [
      {
        type: "text",
        text: getAgentUserPrompt(
          this,
          agentContext.agentChain.agent,
          agentContext.context,
          tools
        ),
      },
    ];
  }

  /**
   * 扩展系统提示
   *
   * 允许子类扩展基础的系统提示，添加特定于代理类型的额外指导。
   * 这个方法为不同类型的代理提供定制化的提示扩展能力。
   *
   * 扩展场景：
   * - 特定领域的专业知识
   * - 特殊的推理策略
   * - 个性化的行为规范
   * - 领域特定的约束条件
   *
   * @param agentContext 代理执行上下文
   * @param tools 可用的工具列表
   * @returns 扩展的系统提示内容
   * @protected
   */
  protected async extSysPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return "";
  }

  /**
   * 列出MCP工具
   *
   * 从MCP客户端获取可用的外部工具，并转换为标准工具格式。
   * 这个方法实现了外部工具服务的动态发现和集成。
   *
   * 工具发现流程：
   * 1. 确保MCP客户端连接
   * 2. 请求工具列表
   * 3. 转换工具模式
   * 4. 创建工具包装器
   * 5. 返回标准工具实例
   *
   * 错误处理：
   * - 连接失败：记录错误，返回空列表
   * - 工具获取失败：记录错误，返回空列表
   * - 工具转换失败：跳过该工具，继续处理其他工具
   *
   * @param context 任务执行上下文
   * @param mcpClient MCP客户端实例
   * @param agentNode 可选的工作流代理节点
   * @param mcpParams 可选的MCP参数
   * @returns MCP工具列表
   * @private
   */
  private async listTools(
    context: Context,
    mcpClient: IMcpClient,
    agentNode?: WorkflowAgent,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      // 确保MCP客户端已连接
      if (!mcpClient.isConnected()) {
        await mcpClient.connect(context.controller.signal);
      }

      // 获取工具列表
      let list = await mcpClient.listTools(
        {
          taskId: context.taskId,
          nodeId: agentNode?.id,
          environment: config.platform,
          agent_name: agentNode?.name || this.name,
          params: {},
          prompt: agentNode?.task || context.chain.taskPrompt,
          ...(mcpParams || {}),
        },
        context.controller.signal
      );

      // 转换工具并创建包装器
      let mcpTools: Tool[] = [];
      for (let i = 0; i < list.length; i++) {
        let toolSchema: ToolSchema = list[i];
        let execute = this.toolExecuter(mcpClient, toolSchema.name);
        let toolWrapper = new ToolWrapper(toolSchema, execute);
        mcpTools.push(new McpTool(toolWrapper));
      }
      return mcpTools;
    } catch (e) {
      // 记录MCP工具获取错误
      Log.error("Mcp listTools error", e);
      return [];
    }
  }

  /**
   * 控制MCP工具加载
   *
   * 决定何时以及如何加载MCP工具的策略方法。
   * 这个方法允许子类控制MCP工具的动态加载时机和参数。
   *
   * 默认策略：
   * - 只在第一次推理循环（loopNum == 0）时加载MCP工具
   * - 避免在后续循环中重复加载相同的工具
   *
   * 扩展点：
   * - 子类可以重写此方法实现更复杂的加载策略
   * - 可以根据推理进度、工具使用情况等动态调整
   * - 支持传递额外的MCP参数进行精细化控制
   *
   * @param agentContext 代理执行上下文
   * @param messages 当前对话消息
   * @param loopNum 当前推理循环次数
   * @returns MCP工具控制信息
   * @protected
   */
  protected async controlMcpTools(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    loopNum: number
  ): Promise<{
    mcpTools: boolean;
    mcpParams?: Record<string, unknown>;
  }> {
    // 默认只在第一次循环加载MCP工具
    return {
      mcpTools: loopNum == 0,
    };
  }

  /**
   * 创建MCP工具执行器
   *
   * 为指定的MCP工具创建执行器函数，封装了工具调用的具体逻辑。
   * 这个方法建立了本地工具调用与远程MCP服务的桥梁。
   *
   * 执行器功能：
   * - 接收工具参数和代理上下文
   * - 构造MCP工具调用请求
   * - 添加扩展信息（任务ID、节点ID、环境信息等）
   * - 处理调用结果和错误
   *
   * 错误处理：
   * - 网络错误：通过MCP客户端处理
   * - 参数错误：在调用前验证
   * - 权限错误：通过MCP服务端控制
   *
   * @param mcpClient MCP客户端实例
   * @param name 工具名称
   * @returns 工具执行器对象
   * @protected
   */
  protected toolExecuter(mcpClient: IMcpClient, name: string): ToolExecuter {
    return {
      execute: async function (args, agentContext): Promise<ToolResult> {
        // 调用MCP工具
        return await mcpClient.callTool(
          {
            name: name,
            arguments: args,
            extInfo: {
              taskId: agentContext.context.taskId,
              nodeId: agentContext.agentChain.agent.id,
              environment: config.platform,
              agent_name: agentContext.agent.Name,
            },
          },
          agentContext.context.controller.signal
        );
      },
    };
  }

  /**
   * 处理消息
   *
   * 对对话消息进行预处理和优化，确保消息质量和上下文效率。
   * 这个方法主要处理大上下文消息的压缩和清理工作。
   *
   * 处理内容：
   * - 大型消息压缩：减少token使用
   * - 文件和图片清理：保留最新的媒体内容
   * - 工具结果优化：压缩大型工具输出
   * - 上下文整理：确保消息格式规范
   *
   * 优化策略：
   * - 保留关键信息，压缩冗余内容
   * - 保持时间顺序和逻辑连贯性
   * - 确保重要数据不丢失
   *
   * @param agentContext 代理执行上下文
   * @param messages 待处理的消息列表
   * @param tools 可用的工具列表
   * @protected
   */
  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<void> {
    // 处理大型上下文消息，保留最新的图片/文件和工具结果
    memory.handleLargeContextMessages(messages);
  }

  /**
   * 调用内部工具
   *
   * 执行内部工具函数并格式化返回结果的辅助方法。
   * 这个方法简化了内部工具的调用和结果处理流程。
   *
   * 处理逻辑：
   * 1. 执行传入的异步函数
   * 2. 格式化执行结果
   * 3. 构造标准工具结果格式
   * 4. 处理不同类型的返回值
   *
   * 结果格式化：
   * - 字符串结果：直接返回
   * - 对象结果：JSON序列化
   * - null/undefined：返回"Successful"
   *
   * @param fun 要执行的异步函数
   * @returns 格式化的工具结果
   * @protected
   */
  protected async callInnerTool(fun: () => Promise<any>): Promise<ToolResult> {
    let result = await fun();
    return {
      content: [
        {
          type: "text",
          text: result
            ? typeof result == "string"
              ? result
              : JSON.stringify(result)
            : "Successful",
        },
      ],
    };
  }

  /**
   * 加载工具
   *
   * 加载代理的所有可用工具，包括内置工具和MCP工具。
   * 这个方法在代理初始化时被调用，确保代理拥有完整的工具集合。
   *
   * 工具加载策略：
   * 1. 获取MCP外部工具（如果配置了）
   * 2. 合并MCP工具和内置工具
   * 3. 去重处理，避免工具冲突
   * 4. 返回完整的工具列表
   *
   * 错误处理：
   * - MCP连接失败：返回内置工具
   * - 工具加载失败：记录错误，继续执行
   *
   * @param context 任务执行上下文
   * @returns 完整的工具列表
   */
  public async loadTools(context: Context): Promise<Tool[]> {
    // 如果配置了MCP客户端，加载外部工具
    if (this.mcpClient) {
      let mcpTools = await this.listTools(context, this.mcpClient);
      if (mcpTools && mcpTools.length > 0) {
        // 合并MCP工具和内置工具
        return mergeTools(this.tools, mcpTools);
      }
    }
    // 返回内置工具
    return this.tools;
  }

  /**
   * 添加工具
   *
   * 动态向代理添加新的工具，扩展代理的能力范围。
   * 这个方法允许在运行时为代理添加新的功能。
   *
   * 添加策略：
   * - 直接添加到工具列表末尾
   * - 不进行去重检查（由调用者负责）
   * - 支持运行时动态扩展
   *
   * 使用场景：
   * - 插件系统集成
   * - 任务特定工具添加
   * - 功能模块动态加载
   *
   * @param tool 要添加的工具实例
   */
  public addTool(tool: Tool) {
    this.tools.push(tool);
  }

  /**
   * 任务状态变更处理
   *
   * 响应任务状态的变化事件，执行相应的清理和状态管理操作。
   * 这个方法是任务生命周期管理的重要组成部分。
   *
   * 处理的状态变更：
   * - "abort"：任务中止，清理代理上下文变量
   * - "pause"：任务暂停，可选择是否清理状态
   * - "resume-pause"：从暂停状态恢复
   *
   * 状态清理策略：
   * - abort事件：清除所有上下文变量
   * - pause事件：保持变量状态，便于恢复
   * - resume事件：恢复正常执行状态
   *
   * 扩展点：
   * - 子类可以重写此方法添加特定的状态处理逻辑
   * - 支持自定义的状态清理策略
   * - 可以添加状态变更的日志记录
   *
   * @param status 新的任务状态
   * @param reason 状态变更的原因描述
   * @protected
   */
  protected async onTaskStatus(
    status: "pause" | "abort" | "resume-pause",
    reason?: string
  ) {
    // 任务中止时清理上下文变量
    if (status == "abort" && this.agentContext) {
      this.agentContext?.variables.clear();
    }
  }

  public canParallelToolCalls(
    toolCalls?: LanguageModelV2ToolCallPart[]
  ): boolean {
    return config.parallelToolCalls;
  }

  get Llms(): string[] | undefined {
    return this.llms;
  }

  /**
   * 获取代理名称
   *
   * 返回代理的唯一标识符，用于代理识别和引用。
   * 这个名称在整个系统中应该是唯一的。
   *
   * @returns 代理的唯一名称
   */
  get Name(): string {
    return this.name;
  }

  /**
   * 获取代理描述
   *
   * 返回代理的功能描述，说明代理能够执行的任务类型。
   * 这个描述用于工作流规划阶段的代理选择。
   *
   * @returns 代理的功能描述
   */
  get Description(): string {
    return this.description;
  }

  /**
   * 获取代理工具列表
   *
   * 返回代理配置的所有内置工具，定义了代理的核心能力范围。
   * 这些工具是代理的基础功能集合。
   *
   * @returns 代理的工具列表
   */
  get Tools(): Tool[] {
    return this.tools;
  }

  /**
   * 获取规划描述
   *
   * 返回代理的规划阶段描述，用于工作流规划算法的决策。
   * 这个描述帮助规划器选择合适的代理来执行特定任务。
   *
   * @returns 代理的规划描述
   */
  get PlanDescription() {
    return this.planDescription;
  }

  /**
   * 获取MCP客户端
   *
   * 返回代理配置的MCP客户端实例，用于外部工具和服务集成。
   * MCP客户端提供了与外部系统的连接能力。
   *
   * @returns MCP客户端实例或undefined
   */
  get McpClient() {
    return this.mcpClient;
  }

  /**
   * 获取代理上下文
   *
   * 返回当前代理的执行上下文，包含执行状态和环境信息。
   * 这个上下文在代理执行过程中动态创建和更新。
   *
   * @returns 当前代理的执行上下文或undefined
   */
  get AgentContext(): AgentContext | undefined {
    return this.agentContext;
  }
}
