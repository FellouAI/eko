/**
 * Dialogue 模块文件
 *
 * 这个文件实现了 Eko 系统的对话管理核心，是整个系统与用户交互的统一入口。
 * Dialogue 模块采用工具驱动的对话架构，通过集成多种专用工具来处理复杂的用户需求。
 *
 * 核心架构：
 * - EkoDialogue：对话管理器，协调整个对话流程
 * - TaskPlannerTool：任务规划工具，负责生成和修改任务计划
 * - ExecuteTaskTool：任务执行工具，负责执行规划好的任务
 * - TaskVariableStorageTool：变量存储工具，负责管理对话上下文数据
 * - EkoMemory：对话历史管理器，负责存储和压缩对话记录
 *
 * 对话流程：
 * 1. 用户输入 → 2. 对话管理器 → 3. 工具调用 → 4. 任务规划 → 5. 任务执行 → 6. 结果返回
 *
 * 设计特点：
 * 1. 工具驱动架构：通过工具系统扩展对话能力
 * 2. 分段执行机制：支持复杂的多步骤任务执行
 * 3. 上下文管理：全局变量和对话历史的统一管理
 * 4. 事件驱动：支持实时状态更新和外部监控
 * 5. 错误处理：完善的异常处理和重试机制
 *
 * 系统优势：
 * - 模块化设计：每个工具职责单一，便于维护和扩展
 * - 智能规划：基于大语言模型的任务规划能力
 * - 状态持久化：完整的对话历史和上下文保存
 * - 并发安全：支持多任务的并行执行和管理
 */

import Log from "../common/log";
import {
  EkoMessage,
  ToolResult,
  DialogueTool,
  DialogueParams,
  DialogueCallback,
  EkoDialogueConfig,
  EkoMessageUserPart,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from "../types";
import {
  callChatLLM,
  convertToolResults,
  convertUserContent,
  convertAssistantToolResults,
} from "./dialogue/llm";
import { Eko } from "./eko";
import TaskPlannerTool, {
  TOOL_NAME as task_planner,
} from "./dialogue/task_planner";
import { RetryLanguageModel } from "../llm";
import { EkoMemory } from "../memory/memory";
import ExecuteTaskTool from "./dialogue/execute_task";
import { getDialogueSystemPrompt } from "../prompt/dialogue";
import TaskVariableStorageTool from "./dialogue/variable_storage";
import { convertTools, getTool, convertToolResult } from "../agent/llm";

/**
 * Eko 对话管理器
 *
 * EkoDialogue 类是整个对话系统的核心控制器，负责协调和管理复杂的对话交互流程。
 * 它集成了任务规划、执行、变量管理等多个专用工具，提供统一的对话接口。
 *
 * 核心职责：
 * 1. 对话流程控制：管理完整的对话生命周期
 * 2. 工具协调：集成和管理各种对话工具
 * 3. 任务管理：创建、执行和管理Eko任务实例
 * 4. 上下文管理：维护全局变量和对话状态
 * 5. 历史记录：通过EkoMemory管理对话历史
 * 6. 事件处理：处理工具调用结果和状态更新
 *
 * 架构设计：
 * - 组合模式：组合多个工具和管理器
 * - 策略模式：通过工具系统实现不同的对话策略
 * - 状态模式：通过分段执行管理对话状态
 * - 观察者模式：通过回调机制响应外部事件
 *
 * 工作模式：
 * 1. 标准对话：直接处理用户输入并返回结果
 * 2. 分段执行：将复杂任务分解为规划和执行两个阶段
 * 3. 工具调用：通过内置工具扩展对话能力
 * 4. 上下文继承：任务执行结果自动同步到全局上下文
 */
export class EkoDialogue {
  /** 对话历史管理器，负责存储和压缩对话记录 */
  protected memory: EkoMemory;

  /** 外部对话工具列表，支持扩展对话能力 */
  protected tools: DialogueTool[];

  /** 对话系统配置，包含LLM、代理等配置信息 */
  protected config: EkoDialogueConfig;

  /** Eko任务实例映射表，key为taskId，value为Eko实例 */
  protected ekoMap: Map<string, Eko>;

  /** 全局上下文存储器，共享变量在对话中的状态 */
  protected globalContext: Map<string, any>;

  /**
   * 构造函数
   *
   * 创建一个新的对话管理器实例，初始化所有必要的组件和服务。
   *
   * @param config 对话系统配置，包含LLM配置、代理列表等
   * @param memory 对话历史管理器，可选，如果不提供则创建默认实例
   * @param tools 外部对话工具列表，可选，用于扩展对话能力
   */
  constructor(
    config: EkoDialogueConfig,
    memory?: EkoMemory,
    tools?: DialogueTool[]
  ) {
    this.config = config;
    this.tools = tools ?? [];
    this.ekoMap = new Map<string, Eko>();
    this.globalContext = new Map<string, any>();

    // 初始化对话历史管理器，使用对话专用系统提示
    this.memory = memory ?? new EkoMemory(getDialogueSystemPrompt());
  }

  /**
   * 标准对话接口
   *
   * 处理用户的对话输入，这是最常用的对话入口方法。
   * 该方法会完整地处理用户输入，包括工具调用、任务规划和执行。
   *
   * 处理流程：
   * 1. 接收用户输入消息
   * 2. 调用内部对话处理引擎
   * 3. 返回最终的对话结果
   *
   * 适用于：
   * - 简单的问答对话
   * - 直接的任务执行请求
   * - 不需要分段处理的场景
   *
   * @param params 对话参数，包含用户输入、回调函数等
   * @returns 对话结果字符串
   */
  public async chat(params: DialogueParams): Promise<string> {
    return this.doChat(params, false);
  }

  /**
   * 分段执行对话接口
   *
   * 专门用于处理分段执行的任务，这是对话系统的核心特性之一。
   * 分段执行将复杂任务分解为"规划"和"执行"两个独立阶段，提高了系统的可靠性和可控性。
   *
   * 分段执行流程：
   * 1. 检查对话历史中是否存在任务规划工具调用
   * 2. 提取最后的用户消息作为任务上下文
   * 3. 调用分段执行处理器
   * 4. 返回执行结果
   *
   * 适用场景：
   * - 复杂多步骤任务
   * - 需要人工审核的任务规划
   * - 大规模数据处理任务
   * - 需要精确控制执行流程的任务
   *
   * 前置条件：
   * - 对话历史中必须包含任务规划工具调用
   * - 必须存在用户消息作为上下文
   *
   * @param params 分段执行参数，不包含用户输入（从历史中提取）
   * @returns 执行结果字符串
   * @throws 当不满足分段执行条件时抛出错误
   */
  public async segmentedExecution(
    params: Omit<DialogueParams, "user">
  ): Promise<string> {
    // 获取完整的对话历史
    const messages = this.memory.getMessages();
    const lastMessage = messages[messages.length - 1];

    // 验证是否存在任务规划工具调用
    if (
      lastMessage.role !== "tool" ||
      !lastMessage.content.some((part) => part.toolName === task_planner)
    ) {
      throw new Error("No task planner tool call found");
    }

    // 提取最后的用户消息作为上下文
    const userMessages = messages.filter((message) => message.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    // 调用分段执行处理器
    return this.doChat(
      {
        ...params,
        user: lastUserMessage.content as string | EkoMessageUserPart[],
        callback: params.callback,
        messageId: params.messageId || lastUserMessage.id,
        signal: params.signal,
      },
      true
    );
  }

  /**
   * 内部对话处理引擎
   *
   * 这是对话系统的核心处理逻辑，实现了完整的对话循环和工具调用机制。
   * 该方法采用迭代重试策略，确保对话能够成功完成或返回明确的失败状态。
   *
   * 处理流程：
   * 1. 消息准备：处理用户消息和消息ID
   * 2. 工具准备：构建内置工具和外部工具列表
   * 3. LLM调用：发送消息到语言模型并获取响应
   * 4. 结果处理：处理工具调用结果和状态更新
   * 5. 状态判断：根据配置和结果决定是否继续或返回
   *
   * 迭代策略：
   * - 最多进行15次迭代，避免无限循环
   * - 每次迭代都可能触发工具调用
   * - 通过分段执行标记控制对话阶段
   * - 返回明确的完成状态或失败原因
   *
   * 错误处理：
   * - 网络错误：通过RetryLanguageModel自动重试
   * - 工具错误：在handleCallResult中处理
   * - 配置错误：通过参数验证避免
   * - 超时控制：通过AbortSignal实现
   *
   * @param params 对话参数
   * @param segmentedExecution 是否为分段执行模式
   * @returns 对话结果或状态字符串
   * @private
   */
  private async doChat(
    params: DialogueParams,
    segmentedExecution: boolean
  ): Promise<string> {
    // 处理用户消息（仅在非分段执行模式下）
    if (!segmentedExecution) {
      // 生成或使用提供的消息ID
      params.messageId = params.messageId ?? this.memory.genMessageId();
      // 将用户消息添加到对话历史
      await this.addUserMessage(params.user, params.messageId);
    }

    // 初始化重试语言模型
    const rlm = new RetryLanguageModel(this.config.llms, this.config.chatLlms);

    // 主对话循环，最多15次迭代
    for (let i = 0; i < 15; i++) {
      // 构建当前对话消息历史
      const messages = this.memory.buildMessages();

      // 构建完整的工具列表（内置工具 + 外部工具）
      const chatTools = [...this.buildInnerTools(params), ...this.tools];

      // 调用语言模型获取响应
      const results = await callChatLLM(
        params.messageId as string,
        rlm,
        messages,
        convertTools(chatTools),
        undefined,
        0,
        params.callback,
        params.signal
      );

      // 处理工具调用结果
      const finalResult = await this.handleCallResult(
        chatTools,
        results,
        params.callback
      );

      // 如果获得最终结果，返回
      if (finalResult) {
        return finalResult;
      }

      // 检查是否需要触发分段执行
      if (
        this.config.segmentedExecution &&
        results.some((r) => r.type == "tool-call" && r.toolName == task_planner)
      ) {
        return "segmentedExecution";
      }
    }

    // 达到最大迭代次数，返回未完成状态
    return "Unfinished";
  }

  /**
   * 添加用户消息到对话历史
   *
   * 将用户输入的消息添加到对话历史中，这是对话系统的基础操作。
   * 该方法会创建标准化的消息格式并存储到内存管理系统中。
   *
   * 处理内容：
   * - 文本消息：直接存储字符串内容
   * - 复合消息：支持文本和文件等多媒体内容
   * - 时间戳：自动生成消息时间戳
   * - 消息ID：使用提供的唯一标识符
   *
   * 存储策略：
   * - 消息按时间顺序存储
   * - 支持消息去重和压缩
   * - 自动管理内存使用限制
   *
   * @param user 用户输入内容，支持纯文本或复合消息格式
   * @param messageId 消息的唯一标识符
   * @returns 创建的消息对象
   * @protected
   */
  protected async addUserMessage(
    user: string | EkoMessageUserPart[],
    messageId: string
  ): Promise<EkoMessage> {
    // 创建标准化消息对象
    const message: EkoMessage = {
      id: messageId,
      role: "user",
      timestamp: Date.now(),
      content: user,
    };

    // 将消息添加到对话历史
    await this.memory.addMessages([message]);
    return message;
  }

  /**
   * 构建内置对话工具
   *
   * 创建对话系统内置的核心工具集合，这些工具提供了对话系统的核心功能。
   * 每个工具都专注于特定的对话处理任务，共同构成了完整的对话能力体系。
   *
   * 内置工具组成：
   * 1. TaskPlannerTool：任务规划工具
   *    - 负责分析用户需求
   *    - 生成详细的任务执行计划
   *    - 支持计划的动态修改
   *
   * 2. ExecuteTaskTool：任务执行工具
   *    - 负责执行规划好的任务
   *    - 管理任务执行生命周期
   *    - 返回详细的执行结果
   *
   * 3. TaskVariableStorageTool：变量存储工具
   *    - 管理对话上下文变量
   *    - 支持变量的读写操作
   *    - 维护全局状态信息
   *
   * 工具协作机制：
   * - 规划工具生成任务计划
   * - 执行工具根据计划执行任务
   * - 存储工具管理执行过程中的状态
   *
   * @param params 对话参数，用于初始化工具上下文
   * @returns 内置对话工具数组
   * @protected
   */
  protected buildInnerTools(params: DialogueParams): DialogueTool[] {
    return [
      // 任务规划工具：负责生成和修改任务计划
      new TaskPlannerTool(this, params),

      // 任务执行工具：负责执行规划好的任务
      new ExecuteTaskTool(this),

      // 变量存储工具：负责管理对话上下文变量
      new TaskVariableStorageTool(this),
    ];
  }

  /**
   * 添加Eko任务实例
   *
   * 将创建的Eko任务实例注册到对话管理器中，便于后续的任务管理和状态跟踪。
   * 这个方法建立了对话系统和具体任务执行引擎之间的关联。
   *
   * 注册机制：
   * - 使用任务ID作为唯一键
   * - 支持任务实例的快速查找
   * - 便于任务状态的集中管理
   * - 支持任务执行结果的回调处理
   *
   * 使用场景：
   * - 任务规划工具生成新任务时
   * - 需要跟踪任务执行状态时
   * - 任务修改或重新执行时
   *
   * @param taskId 任务的唯一标识符
   * @param eko Eko任务执行引擎实例
   */
  public addEko(taskId: string, eko: Eko): void {
    this.ekoMap.set(taskId, eko);
  }

  /**
   * 获取Eko任务实例
   *
   * 根据任务ID查找对应的Eko任务实例，用于任务的执行、修改或状态查询。
   * 这个方法提供了对话系统对具体任务的访问接口。
   *
   * 查找策略：
   * - 通过任务ID进行精确匹配
   * - 返回完整的Eko实例或undefined
   * - 支持任务生命周期的完整管理
   *
   * @param taskId 要查找的任务ID
   * @returns 对应的Eko实例，如果不存在则返回undefined
   */
  public getEko(taskId: string): Eko | undefined {
    return this.ekoMap.get(taskId);
  }

  /**
   * 获取全局上下文存储器
   *
   * 返回对话系统的全局上下文存储器，用于在对话过程中共享和访问全局变量。
   * 全局上下文是对话系统状态管理的重要组成部分。
   *
   * 上下文作用：
   * - 存储跨任务的共享变量
   * - 维护对话系统的全局状态
   * - 支持任务间的状态传递
   * - 提供变量的持久化存储
   *
   * 访问模式：
   * - 直接返回Map实例，支持原地修改
   * - 调用者负责变量的类型安全
   * - 支持变量的动态读写操作
   *
   * @returns 全局上下文存储器实例
   */
  public getGlobalContext(): Map<string, any> {
    return this.globalContext;
  }

  /**
   * 获取对话系统配置
   *
   * 返回当前的对话系统配置信息，包含LLM配置、代理列表、分段执行设置等。
   * 这个方法提供了对系统配置的只读访问。
   *
   * 配置内容：
   * - 基础LLM配置和对话专用LLM配置
   * - 可用的智能代理列表
   * - 分段执行功能的开关
   * - 其他对话相关配置参数
   *
   * @returns 对话系统配置对象
   */
  public getConfig(): EkoDialogueConfig {
    return this.config;
  }

  /**
   * 处理工具调用结果
   *
   * 这是对话系统的核心结果处理逻辑，负责处理语言模型的响应并执行相应的工具调用。
   * 该方法实现了完整的工具调用生命周期管理，包括参数解析、工具执行、结果处理和状态更新。
   *
   * 处理流程：
   * 1. 解析LLM响应：区分文本响应和工具调用
   * 2. 执行工具调用：参数验证、工具查找、异常处理
   * 3. 结果转换：将工具结果转换为LLM可理解的格式
   * 4. 状态更新：更新对话历史和全局上下文
   * 5. 回调通知：触发外部监听器的状态更新
   *
   * 工具调用机制：
   * - 参数解析：支持JSON字符串和对象格式
   * - 工具查找：通过工具名称匹配可用工具
   * - 错误处理：完善的异常捕获和错误信息构造
   * - 结果转换：标准化工具结果格式
   *
   * 对话历史管理：
   * - 助理消息：记录LLM的原始响应
   * - 工具消息：记录工具执行结果
   * - 用户消息：记录工具生成的用户交互消息
   * - 时间戳管理：确保消息的时间顺序正确
   *
   * 返回策略：
   * - 有工具调用：返回null，继续对话循环
   * - 纯文本响应：返回文本内容，结束对话循环
   * - 空结果：返回null，可能触发重试
   *
   * @param chatTools 可用的对话工具列表
   * @param results LLM响应的结果数组
   * @param dialogueCallback 对话回调函数，用于状态通知
   * @returns 最终文本结果或null（表示需要继续对话）
   * @protected
   */
  protected async handleCallResult(
    chatTools: DialogueTool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>,
    dialogueCallback?: DialogueCallback
  ): Promise<string | null> {
    let text: string | null = null;
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];

    // 如果没有结果，返回null
    if (results.length == 0) {
      return null;
    }

    // 处理每个结果项
    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      // 处理文本响应
      if (result.type == "text") {
        text = result.text;
        continue;
      }

      // 处理工具调用
      let toolResult: ToolResult;
      try {
        // 解析工具参数
        const args =
          typeof result.input == "string"
            ? JSON.parse(result.input || "{}")
            : result.input || {};

        // 查找对应的工具
        const tool = getTool(chatTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }

        // 执行工具
        toolResult = await tool.execute(args, result);
      } catch (e) {
        // 记录工具调用错误
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
      }

      // 触发工具结果回调
      const callback = dialogueCallback?.chatCallback;
      if (callback) {
        await callback.onMessage({
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult,
        });
      }

      // 转换工具结果为LLM格式
      const llmToolResult = convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }

    // 添加助理消息到对话历史
    await this.memory.addMessages([
      {
        id: this.memory.genMessageId(),
        role: "assistant",
        timestamp: Date.now(),
        content: convertAssistantToolResults(results),
      },
    ]);

    // 如果有工具结果，添加到对话历史
    if (toolResults.length > 0) {
      await this.memory.addMessages([
        {
          id: this.memory.genMessageId(),
          role: "tool",
          timestamp: Date.now(),
          content: convertToolResults(toolResults),
        },
      ]);

      // 处理工具生成的用户消息
      for (let i = 0; i < user_messages.length; i++) {
        const message = user_messages[i];
        if (message.role == "user") {
          await this.memory.addMessages([
            {
              id: this.memory.genMessageId(),
              role: "user",
              timestamp: Date.now(),
              content: convertUserContent(message.content),
            },
          ]);
        }
      }
      return null;
    } else {
      // 返回纯文本结果
      return text;
    }
  }
}
