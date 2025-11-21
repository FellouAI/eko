import config from "../config";
import { Agent } from "../agent";
import { Planner } from "./plan";
import Log from "../common/log";
import TaskContext from "./agent-context";
import Chain, { AgentChain } from "./chain";
import { buildAgentTree } from "../common/tree";
import { mergeAgents, uuidv4 } from "../common/utils";
import {
  EkoConfig,
  EkoResult,
  Workflow,
  NormalAgentNode,
} from "../types/agent.types";
import global from "../config/global";
import { checkTaskReplan, replanWorkflow } from "./replan";

export class Eko {
  protected chatId: string;
  protected config: EkoConfig;

  constructor(config: EkoConfig, chatId: string = uuidv4()) {
    this.config = config;
    this.chatId = chatId;
  }

  public async generate(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<Workflow> {
    const agents = [...(this.config.agents || [])];
    const chain: Chain = new Chain(taskPrompt);
    const context = new TaskContext(
      this.chatId,
      taskId,
      this.config,
      agents,
      chain
    );
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }
    try {
      global.taskMap.set(taskId, context);
      if (this.config.a2aClient) {
        const a2aList = await this.config.a2aClient.listAgents(taskPrompt);
        context.agents = mergeAgents(context.agents, a2aList);
      }
      const planner = new Planner(context);
      context.workflow = await planner.plan(taskPrompt);
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
    const context = global.taskMap.get(taskId);
    if (!context) {
      return await this.generate(modifyTaskPrompt, taskId);
    }
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
      context.agents = mergeAgents(context.agents, a2aList);
    }
    const planner = new Planner(context);
    context.workflow = await planner.replan(modifyTaskPrompt);
    return context.workflow;
  }

  public async execute(taskId: string): Promise<EkoResult> {
    const context = this.getTask(taskId);
    if (!context) {
      throw new Error("The task does not exist");
    }
    if (context.pause) {
      context.setPause(false);
    }
    if (context.controller.signal.aborted) {
      context.reset();
    }
    context.conversation = [];
    try {
      return await this.doRunWorkflow(context);
    } catch (e: any) {
      Log.error("execute error", e);
      return {
        taskId,
        success: false,
        stopReason: e?.name == "AbortError" ? "abort" : "error",
        result: e ? e.name + ": " + e.message : "Error",
        error: e,
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
  ): Promise<TaskContext> {
    const agents = this.config.agents || [];
    const chain: Chain = new Chain(workflow.taskPrompt || workflow.name);
    const context = new TaskContext(
      this.chatId,
      workflow.taskId,
      this.config,
      agents,
      chain
    );
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(
        workflow.taskPrompt || workflow.name
      );
      context.agents = mergeAgents(context.agents, a2aList);
    }
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }
    context.workflow = workflow;
    global.taskMap.set(workflow.taskId, context);
    return context;
  }

  private async doRunWorkflow(context: TaskContext): Promise<EkoResult> {
    const agents = context.agents as Agent[];
    const workflow = context.workflow as Workflow;
    if (!workflow || workflow.agents.length == 0) {
      throw new Error("Workflow error");
    }
    const agentNameMap = agents.reduce((map, item) => {
      map[item.Name] = item;
      return map;
    }, {} as { [key: string]: Agent });
    let agentTree = buildAgentTree(workflow.agents);
    const results: string[] = [];
    while (true) {
      await context.checkAborted();
      let lastAgent: Agent | undefined;
      if (agentTree.type === "normal") {
        // normal agent
        const agent = agentNameMap[agentTree.agent.name];
        if (!agent) {
          throw new Error("Unknown Agent: " + agentTree.agent.name);
        }
        lastAgent = agent;
        const agentNode = agentTree.agent;
        const agentChain = new AgentChain(agentNode);
        context.chain.push(agentChain);
        agentTree.result = await this.runAgent(
          context,
          agent,
          agentTree,
          agentChain
        );
        results.push(agentTree.result);
      } else {
        // parallel agent
        const parallelAgents = agentTree.agents;
        const doRunAgent = async (
          agentNode: NormalAgentNode,
          index: number
        ) => {
          const agent = agentNameMap[agentNode.agent.name];
          if (!agent) {
            throw new Error("Unknown Agent: " + agentNode.agent.name);
          }
          lastAgent = agent;
          const agentChain = new AgentChain(agentNode.agent);
          context.chain.push(agentChain);
          const result = await this.runAgent(
            context,
            agent,
            agentNode,
            agentChain
          );
          return { result: result, agentChain, index };
        };
        let agent_results: string[] = [];
        let agentParallel = context.variables.get("agentParallel");
        if (agentParallel === undefined) {
          agentParallel = config.agentParallel;
        }
        if (agentParallel) {
          // parallel execution
          const parallelResults = await Promise.all(
            parallelAgents.map((agent, index) => doRunAgent(agent, index))
          );
          parallelResults.sort((a, b) => a.index - b.index);
          parallelResults.forEach(({ agentChain }) => {
            context.chain.push(agentChain);
          });
          agent_results = parallelResults.map(({ result }) => result);
        } else {
          // serial execution
          for (let i = 0; i < parallelAgents.length; i++) {
            const { result, agentChain } = await doRunAgent(
              parallelAgents[i],
              i
            );
            context.chain.push(agentChain);
            agent_results.push(result);
          }
        }
        results.push(agent_results.join("\n\n"));
      }
      context.conversation.splice(0, context.conversation.length);
      if (
        config.mode == "expert" &&
        !workflow.modified &&
        agentTree.nextAgent &&
        lastAgent?.AgentContext &&
        (await checkTaskReplan(lastAgent.AgentContext))
      ) {
        // replan
        await replanWorkflow(lastAgent.AgentContext);
      }
      if (workflow.modified) {
        workflow.modified = false;
        agentTree = buildAgentTree(
          workflow.agents.filter((agent) => agent.status == "init")
        );
        continue;
      }
      if (!agentTree.nextAgent) {
        break;
      }
      agentTree = agentTree.nextAgent;
    }
    return {
      success: true,
      stopReason: "done",
      taskId: context.taskId,
      result: results[results.length - 1] || "",
    };
  }

  protected async runAgent(
    context: TaskContext,
    agent: Agent,
    agentNode: NormalAgentNode,
    agentChain: AgentChain
  ): Promise<string> {
    try {
      agentNode.agent.status = "running";
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_start",
            agentNode: agentNode.agent,
          },
          agent.AgentContext
        ));
      agentNode.result = await agent.run(context, agentChain);
      agentNode.agent.status = "done";
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            result: agentNode.result,
          },
          agent.AgentContext
        ));
      return agentNode.result;
    } catch (e) {
      agentNode.agent.status = "error";
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            streamType: "agent",
            chatId: context.chatId,
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            error: e,
          },
          agent.AgentContext
        ));
      throw e;
    }
  }

  public getTask(taskId: string): TaskContext | undefined {
    return global.taskMap.get(taskId);
  }

  public getAllTaskId(): string[] {
    return [...global.taskMap.keys()];
  }

  public deleteTask(taskId: string): boolean {
    this.abortTask(taskId);
    const context = global.taskMap.get(taskId);
    if (context) {
      context.variables.clear();
    }
    return global.taskMap.delete(taskId);
  }

  public abortTask(taskId: string, reason?: string): boolean {
    let context = global.taskMap.get(taskId);
    if (context) {
      context.setPause(false);
      this.onTaskStatus(context, "abort", reason);
      context.controller.abort(reason);
      return true;
    } else {
      return false;
    }
  }

  public pauseTask(
    taskId: string,
    pause: boolean,
    abortCurrentStep?: boolean,
    reason?: string
  ): boolean {
    const context = global.taskMap.get(taskId);
    if (context) {
      this.onTaskStatus(context, pause ? "pause" : "resume-pause", reason);
      context.setPause(pause, abortCurrentStep);
      return true;
    } else {
      return false;
    }
  }

  public chatTask(taskId: string, userPrompt: string): string[] | undefined {
    const context = global.taskMap.get(taskId);
    if (context) {
      context.conversation.push(userPrompt);
      return context.conversation;
    }
  }

  public addAgent(agent: Agent): void {
    this.config.agents = this.config.agents || [];
    this.config.agents.push(agent);
  }

  private async onTaskStatus(
    context: TaskContext,
    status: string,
    reason?: string
  ) {
    const [agent] = context.currentAgent() || [];
    if (agent) {
      const onTaskStatus = (agent as any)["onTaskStatus"];
      if (onTaskStatus) {
        await onTaskStatus.call(agent, status, reason);
      }
    }
  }
}
