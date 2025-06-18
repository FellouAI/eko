import Log from "../common/log";
import Context from "./context";
import { RetryLanguageModel } from "../llm";
import { parseWorkflow, extractTemplateVariables, validateTemplateVariables } from "../common/xml";
import { Workflow } from "../types/core.types";
import { LLMRequest } from "../types/llm.types";
import { getPlanSystemPrompt, getPlanUserPrompt } from "../prompt/plan";
import {
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";

export class Planner {
  private taskId: string;
  private context: Context;

  constructor(context: Context, taskId: string) {
    this.context = context;
    this.taskId = taskId;
  }

  async plan(taskPrompt: string): Promise<Workflow> {
    return await this.doPlan(taskPrompt, false);
  }

  async replan(taskPrompt: string): Promise<Workflow> {
    return await this.doPlan(taskPrompt, true);
  }

  private async doPlan(
    taskPrompt: string,
    replan: boolean = false
  ): Promise<Workflow> {
    let config = this.context.config;
    let chain = this.context.chain;
    let rlm = new RetryLanguageModel(config.llms, config.planLlms);
    let messages: LanguageModelV1Prompt;
    if (replan && chain.planRequest && chain.planResult) {
      messages = [
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
    } else {
      messages = [
        {
          role: "system",
          content:
            this.context.variables.get("plan_sys_prompt") ||
            (await getPlanSystemPrompt(this.context)),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: getPlanUserPrompt(
                taskPrompt,
                this.context.variables.get("task_website"),
                this.context.variables.get("plan_ext_prompt")
              ),
            },
          ],
        },
      ];
    }
    let request: LLMRequest = {
      maxTokens: 4096,
      temperature: 0.7,
      messages: messages,
      abortSignal: this.context.controller.signal,
    };
    let result = await rlm.callStream(request);
    const reader = result.stream.getReader();
    let streamText = "";
    try {
      while (true) {
        await this.context.checkAborted();
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        let chunk = value as LanguageModelV1StreamPart;
        if (chunk.type == "error") {
          Log.error("Plan, LLM Error: ", chunk);
          throw new Error("LLM Error: " + chunk.error);
        }
        if (chunk.type == "text-delta") {
          streamText += chunk.textDelta || "";
        }
        if (config.callback) {
          // Don't pass template variables during streaming - just parse structure
          let workflow = parseWorkflow(this.taskId, streamText, false);
          if (workflow) {
            await config.callback.onMessage({
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
      Log.info("Planner result: \n" + streamText);
    }
    chain.planRequest = request;
    chain.planResult = streamText;
    // Parse workflow without template variables - they'll be applied later
    let workflow = parseWorkflow(this.taskId, streamText, true) as Workflow;
    if (config.callback) {
      await config.callback.onMessage({
        taskId: this.taskId,
        agentName: "Planer",
        type: "workflow",
        streamDone: true,
        workflow: workflow,
      });
    }
    workflow.taskPrompt = taskPrompt;
    return workflow;
  }
}
