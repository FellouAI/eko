import Log from "../common/log";
import Context, { AgentContext } from "./context";
import Context from "./context";
import { sleep } from "../common/utils";
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
import { Agent } from "../agent/base";
import { AgentChain } from "./chain";

function createPlannerAgentContext(context: Context): AgentContext {
  const stubAgent = new Agent({
    name: "__planner__",
    description: "Planner execution context",
    tools: [],
  });

  const stubAgentChain = new AgentChain({
    id: "__planner__",
    name: "__planner__",
    task: "Planner",
    dependsOn: [],
    nodes: [],
    status: "init",
    xml: "",
  });

  return new AgentContext(context, stubAgent, stubAgentChain);
}

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
    saveHistory: boolean,
    retryNum: number = 0
  ): Promise<Workflow> {
  const config = this.context.config;
  const plannerAgentContext = createPlannerAgentContext(this.context);
  const rlm = new RetryLanguageModel(config.llms, config.planLlms);
  rlm.setContext(plannerAgentContext);

    const streamId = "plan-" + this.context.taskId + "-" + new Date().getTime();
    
    // Create callback helper for planning
    const planCbHelper = createCallbackHelper(
      this.callback,
      this.context.taskId,
      "Planner",
      null,
    );

    // Send planning started event
    await planCbHelper.planStart(
      taskPrompt,
      {
        systemPrompt: messages[0].content as string,
        userPrompt: (messages[1].content as LanguageModelV2TextPart[]).map(
          (part) => (part.type === "text" ? part.text : "")
        ).join("\n"),
      },
      this.context as any
    );

    const request: LLMRequest = {
      maxTokens: 8192,
      temperature: 0.7,
      messages: messages,
      abortSignal: this.context.controller.signal,
      // Pass callback context to RetryLanguageModel for unified callback triggering
      callbackContext: {
        callback: this.callback,
        taskId: this.taskId,
        agentName: "Planner",
        nodeId: null,
        streamId: streamId,
      },
    };

    // LLM callbacks are now handled inside rlm.callStream
  const result = await rlm.callStream(request);
  rlm.setContext(this.context);
    const reader = result.stream.getReader();
    let streamText = "";
    let thinkingText = "";
    let usagePromptTokens = 0;
    let usageCompletionTokens = 0;
    let usageTotalTokens = 0;

    // Create LLM callback helper for fine-grained streaming callbacks
    const llmCbHelper = planCbHelper.createChildHelper("LLM");

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
          // CALLBACK: thinking delta
          await llmCbHelper.llmResponseProcess(streamId, "thinking_delta", chunk.delta || "", false);
        }
        if (chunk.type == "text-delta") {
          streamText += chunk.delta || "";
          // CALLBACK: text delta
          await llmCbHelper.llmResponseProcess(streamId, "text_delta", chunk.delta || "", false);
        }
        if (chunk.type == "finish") {
          const inputTokens = (chunk as any).usage?.inputTokens || 0;
          const outputTokens = (chunk as any).usage?.outputTokens || 0;
          const totalTokens = (chunk as any).usage?.totalTokens || inputTokens + outputTokens;
          usagePromptTokens = inputTokens;
          usageCompletionTokens = outputTokens;
          usageTotalTokens = totalTokens;
        }
        
        // Try to parse partial workflow and send process event
          if (chunk.finishReason == "content-filter") {
            throw new Error("LLM error: trigger content filtering violation");
          }
          if (chunk.finishReason == "other") {
            throw new Error("LLM error: terminated due to other reasons");
          }
        }
        if (this.callback) {
          let workflow = parseWorkflow(
            this.taskId,
            streamText,
            false,
            thinkingText
          );
          
          
          // Keep legacy callbacks
          if (workflow) {
            // Send new planning process event
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
    } catch (e: any) {
      if (retryNum < 3) {
        await sleep(1000);
        return await this.doPlan(taskPrompt, messages, saveHistory, ++retryNum);
      }
      throw e;
    } finally {
      reader.releaseLock();
      // if (Log.isEnableInfo()) {
      //   Log.info("Planner result: \n" + streamText);
      // }
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

    // LLM response finished is now handled inside rlm.callStream wrapper

    // Send planning finished (with usage)
    await planCbHelper.planFinished(
      workflow,
      request,
      streamText,
      {
        promptTokens: usagePromptTokens,
        completionTokens: usageCompletionTokens,
        totalTokens: usageTotalTokens,
      },
      this.context as any
    );

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
    if (workflow.taskPrompt) {
      workflow.taskPrompt += "\n" + taskPrompt;
    } else {
      workflow.taskPrompt = taskPrompt;
    }
    workflow.taskPrompt = workflow.taskPrompt.trim();
    return workflow;
  }
}
