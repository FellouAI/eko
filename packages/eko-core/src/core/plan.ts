import Log from "../common/log";
import Context from "./context";
import { RetryLanguageModel } from "../llm";
import { parseWorkflow } from "../common/xml";
import { LLMRequest } from "../types/llm.types";
import { StreamCallback, Workflow } from "../types/core.types";
import { getPlanSystemPrompt, getPlanUserPrompt } from "../prompt/plan";
import { createCallbackHelper } from "../common/callback-helper";
import {
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
} from "@ai-sdk/provider";

export class Planner {
  private taskId: string;
  private context: Context;
  private callback?: StreamCallback;

  constructor(context: Context, callback?: StreamCallback) {
    this.context = context;
    this.taskId = context.taskId;
    this.callback = callback || context.config.callback;
  }

  async plan(
    taskPrompt: string | LanguageModelV2TextPart,
    saveHistory: boolean = true
  ): Promise<Workflow> {
    let taskPromptStr;
    let userPrompt: LanguageModelV2TextPart;
    if (typeof taskPrompt === "string") {
      taskPromptStr = taskPrompt;
      userPrompt = {
        type: "text",
        text: getPlanUserPrompt(
          taskPrompt,
          this.context.variables.get("task_website"),
          this.context.variables.get("plan_ext_prompt")
        ),
      };
    } else {
      userPrompt = taskPrompt;
      taskPromptStr = taskPrompt.text || "";
    }
    const messages: LanguageModelV2Prompt = [
      {
        role: "system",
        content: await getPlanSystemPrompt(this.context),
      },
      {
        role: "user",
        content: [userPrompt],
      },
    ];
    return await this.doPlan(taskPromptStr, messages, saveHistory);
  }

  async replan(
    taskPrompt: string,
    saveHistory: boolean = true
  ): Promise<Workflow> {
    const chain = this.context.chain;
    if (chain.planRequest && chain.planResult) {
      const messages: LanguageModelV2Prompt = [
        ...chain.planRequest.messages,
        {
          role: "assistant",
          content: [{ type: "text", text: chain.planResult }],
        },
        {
          role: "user",
          content: [{ type: "text", text: taskPrompt }],
        },
      ];
      return await this.doPlan(taskPrompt, messages, saveHistory);
    } else {
      return this.plan(taskPrompt, saveHistory);
    }
  }

  async doPlan(
    taskPrompt: string,
    messages: LanguageModelV2Prompt,
    saveHistory: boolean
  ): Promise<Workflow> {
    const config = this.context.config;
    const rlm = new RetryLanguageModel(config.llms, config.planLlms);
    
    
    // 准备规划启动信息
    const systemPrompt = messages[0]?.content as string || "";
    const userPromptContent = messages[1]?.content?.[0];
    const userPrompt = userPromptContent && typeof userPromptContent === 'object' && 'text' in userPromptContent ? userPromptContent.text : "";


    // CALLBACK: 开始planning的回调消息发送
    const planCbHelper = createCallbackHelper(this.callback, this.taskId, "Planner");

    // CALLBACK: 发送规划开始事件
    await planCbHelper.planStart(
      taskPrompt,
      {
        systemPrompt,
        userPrompt,
      },
      this.context.agents
    );

    const request: LLMRequest = {
      maxTokens: 4096,
      temperature: 0.7,
      messages: messages,
      abortSignal: this.context.controller.signal,
    };

    // CALLBACK: 创建LLM回调助手，作为Planner Callback helper 的子助手
    const llmCbHelper = planCbHelper.createChildHelper("LLM");
    // CALLBACK: 发送LLM请求开始事件
    await llmCbHelper.llmRequestStart(
      request,
      undefined, // rlm.getCurrentModel()?.name 暂时不可用
      {
        messageCount: messages.length,
        toolCount: 0,
        hasSystemPrompt: !!systemPrompt,
      }
    );

    const result = await rlm.callStream(request);
    const reader = result.stream.getReader();
    let streamText = "";
    let thinkingText = "";
    const streamId = `plan_${this.taskId}_${Date.now()}`;

    // CALLBACK: 发送LLM响应开始事件
    await llmCbHelper.llmResponseStart(streamId);

    try {
      while (true) {
        await this.context.checkAborted(true);
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        let chunk = value as LanguageModelV2StreamPart;
        if (chunk.type == "error") {
          Log.error("Plan, LLM Error: ", chunk);
          throw new Error("LLM Error: " + chunk.error);
        }
        if (chunk.type == "reasoning-delta") {
          thinkingText += chunk.delta || "";
          // CALLBACK: 发送思考过程更新
          await llmCbHelper.llmResponseProcess(streamId, "thinking_delta", chunk.delta || "", false);
        }
        if (chunk.type == "text-delta") {
          streamText += chunk.delta || "";
          // CALLBACK: 发送文本更新
          await llmCbHelper.llmResponseProcess(streamId, "text_delta", chunk.delta || "", false);
        }
        
        // 尝试解析部分工作流并发送过程事件
        if (this.callback) {
          let workflow = parseWorkflow(
            this.taskId,
            streamText,
            false,
            thinkingText
          );
          
          
          // 保持旧的兼容性回调
          if (workflow) {
            // 发送新的规划过程事件
            await planCbHelper.planProcess(false, workflow, thinkingText, this.context as any);
            // OLD VERSION CALLBACK
            await this.callback.onMessage({
              taskId: this.taskId,
              agentName: "Planer",
              type: "workflow",
              streamDone: false,
              workflow: workflow as Workflow,
            });
          }
        }
      }
    } finally {
      reader.releaseLock();
      //if (Log.isEnableInfo()) {
      //  Log.info("Planner result: \n" + streamText);
      //}
    }

    if (saveHistory) {
      const chain = this.context.chain;
      chain.planRequest = request;
      chain.planResult = streamText;
    }

    let workflow = parseWorkflow(
      this.taskId,
      streamText,
      true,
      thinkingText
    ) as Workflow;

    if (workflow.taskPrompt) {
      workflow.taskPrompt += "\n" + taskPrompt.trim();
    } else {
      workflow.taskPrompt = taskPrompt.trim();
    }

    // 发送LLM响应完成事件
    await llmCbHelper.llmResponseFinished(streamId, [{ type: "text", text: streamText }]);

    // 发送规划完成事件
    await planCbHelper.planFinished(workflow, request, streamText, this.context as any);

    if (this.callback) {
      // OLD VERSION CALLBACK
      await this.callback.onMessage({
        taskId: this.taskId,
        agentName: "Planer",
        type: "workflow",
        streamDone: true,
        workflow: workflow,
      });
    }
    return workflow;
  }
}
