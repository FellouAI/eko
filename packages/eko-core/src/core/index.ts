import { EkoConfig, EkoResult, Workflow } from "../types/core.types";
import Context from "./context";
import { Agent } from "../agent";
import { Planner } from "./plan";
import Chain, { AgentChain } from "./chain";
import { mergeAgents, uuidv4, replaceTemplateVariables } from "../common/utils";
import { extractTemplateVariables, validateTemplateVariables } from "../common/xml";
import Log from "../common/log";

export class Eko {
  private config: EkoConfig;
  private taskMap: Map<string, Context>;

  constructor(config: EkoConfig) {
    this.config = config;
    this.taskMap = new Map();
  }

  public async generate(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<Workflow> {
    const agents = [...(this.config.agents || [])];
    let chain: Chain = new Chain(taskPrompt);
    let context = new Context(taskId, this.config, agents, chain);
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }
    try {
      this.taskMap.set(taskId, context);
      if (this.config.a2aClient) {
        let a2aList = await this.config.a2aClient.listAgents(taskPrompt);
        context.agents = mergeAgents(context.agents, a2aList);
      }
      let planner = new Planner(context, taskId);
      context.workflow = await planner.plan(taskPrompt);

      // If workflow has template variables and contextParams provided, replace them
      if (context.workflow.template && contextParams) {
        // Validate required variables
        const missingVars = validateTemplateVariables(
          context.workflow.template.variables,
          contextParams
        );
        if (missingVars.length > 0) {
          throw new Error(
            `Missing required template variables: ${missingVars.join(", ")}`
          );
        }

        // Replace template variables in the workflow XML
        context.workflow.xml = replaceTemplateVariables(
          context.workflow.xml,
          contextParams
        );

        // Also update each agent's XML
        for (const agent of context.workflow.agents) {
          agent.xml = replaceTemplateVariables(agent.xml, contextParams);
          // Update task text if it contains variables
          agent.task = replaceTemplateVariables(agent.task, contextParams);

          // Update node text if it contains variables
          for (const node of agent.nodes) {
            if (node.type === "normal" && node.text) {
              node.text = replaceTemplateVariables(node.text, contextParams);
            }
          }
        }
      }

      return context.workflow;
    } catch (e) {
      this.deleteTask(taskId);
      throw e;
    }
  }

  public async modify(
    taskId: string,
    modifyTaskPrompt: string
  ): Promise<Workflow> {
    let context = this.taskMap.get(taskId);
    if (!context) {
      return await this.generate(modifyTaskPrompt, taskId);
    }
    if (this.config.a2aClient) {
      let a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
      context.agents = mergeAgents(context.agents, a2aList);
    }
    let planner = new Planner(context, taskId);
    context.workflow = await planner.replan(modifyTaskPrompt);
    return context.workflow;
  }

  public async execute(taskId: string): Promise<EkoResult> {
    let context = this.getTask(taskId);
    if (!context) {
      throw new Error("The task does not exist");
    }
    if (context.paused) {
      context.paused = false;
    }
    context.conversation = [];
    if (context.controller.signal.aborted) {
      context.controller = new AbortController();
    }
    try {
      return await this.doRunWorkflow(context);
    } catch (e: any) {
      Log.error("execute error", e);
      return {
        taskId,
        success: false,
        stopReason: e?.name == "AbortError" ? "abort" : "error",
        result: e,
      };
    }
  }

  public async run(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<EkoResult> {
    await this.generate(taskPrompt, taskId, contextParams);
    return await this.execute(taskId);
  }

  public async initContext(
    workflow: Workflow,
    contextParams?: Record<string, any>
  ): Promise<Context> {
    const agents = this.config.agents || [];
    let chain: Chain = new Chain(workflow.taskPrompt || workflow.name);
    let context = new Context(workflow.taskId, this.config, agents, chain);
    if (this.config.a2aClient) {
      let a2aList = await this.config.a2aClient.listAgents(
        workflow.taskPrompt || workflow.name
      );
      context.agents = mergeAgents(context.agents, a2aList);
    }
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }

    // If workflow has template variables and contextParams provided, replace them
    if (workflow.template && contextParams) {
      // Validate required variables
      const missingVars = validateTemplateVariables(
        workflow.template.variables,
        contextParams
      );
      if (missingVars.length > 0) {
        throw new Error(
          `Missing required template variables: ${missingVars.join(", ")}`
        );
      }

      // Replace template variables in the workflow XML
      workflow.xml = replaceTemplateVariables(workflow.xml, contextParams);

      // Also update each agent's XML
      for (const agent of workflow.agents) {
        agent.xml = replaceTemplateVariables(agent.xml, contextParams);
        // Update task text if it contains variables
        agent.task = replaceTemplateVariables(agent.task, contextParams);

        // Update node text if it contains variables
        for (const node of agent.nodes) {
          if (node.type === "normal" && node.text) {
            node.text = replaceTemplateVariables(node.text, contextParams);
          }
        }
      }
    }

    context.workflow = workflow;
    this.taskMap.set(workflow.taskId, context);
    return context;
  }

  private async doRunWorkflow(context: Context): Promise<EkoResult> {
    let agents = context.agents as Agent[];
    let workflow = context.workflow as Workflow;
    if (!workflow || workflow.agents.length == 0) {
      throw new Error("Workflow error");
    }
    let agentMap = agents.reduce((map, item) => {
      map[item.Name] = item;
      return map;
    }, {} as { [key: string]: Agent & { result?: any } });
    let results: string[] = [];
    for (let i = 0; i < workflow.agents.length; i++) {
      await context.checkAborted();
      let agentNode = workflow.agents[i];
      let agent = agentMap[agentNode.name];
      if (!agent) {
        throw new Error("Unknown Agent: " + agentNode.name);
      }
      let agentChain = new AgentChain(agentNode);
      context.chain.push(agentChain);
      agent.result = await agent.run(context, agentChain);
      results.push(agent.result);
      if (agentNode.name === "Timer") {
        break;
      }
    }
    return {
      success: true,
      stopReason: "done",
      result: results[results.length - 1],
      taskId: context.taskId,
    };
  }

  public getTask(taskId: string): Context | undefined {
    return this.taskMap.get(taskId);
  }

  public getAllTaskId(): string[] {
    return [...this.taskMap.keys()];
  }

  public deleteTask(taskId: string): boolean {
    this.abortTask(taskId);
    return this.taskMap.delete(taskId);
  }

  public abortTask(taskId: string): boolean {
    let context = this.taskMap.get(taskId);
    if (context) {
      context.paused = false;
      this.onTaskStatus(context, "abort");
      context.controller.abort();
      return true;
    } else {
      return false;
    }
  }

  public pauseTask(taskId: string, paused: boolean): boolean {
    let context = this.taskMap.get(taskId);
    if (context) {
      this.onTaskStatus(context, paused ? "pause" : "resume-pause");
      context.paused = paused;
      return true;
    } else {
      return false;
    }
  }

  public chatTask(taskId: string, userPrompt: string): string[] | undefined {
    let context = this.taskMap.get(taskId);
    if (context) {
      context.conversation.push(userPrompt);
      return context.conversation;
    }
  }

  public addAgent(agent: Agent): void {
    this.config.agents = this.config.agents || [];
    this.config.agents.push(agent);
  }

  private async onTaskStatus(context: Context, status: string) {
    const [agent] = context.currentAgent() || [];
    if (agent) {
      const onTaskStatus = (agent as any)["onTaskStatus"];
      if (onTaskStatus) {
        await onTaskStatus.call(agent, status);
      }
    }
  }
}
