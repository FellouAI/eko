import { Agent } from "../agent";
import { sleep } from "../common/utils";
import Chain, { AgentChain } from "./chain";
import {
  EkoConfig,
  LanguageModelV2Prompt,
  Workflow,
  WorkflowAgent,
} from "../types";

export default class Context {
  taskId: string;
  config: EkoConfig;
  chain: Chain;
  agents: Agent[];
  controller: AbortController;
  variables: Map<string, any>;
  workflow?: Workflow;
  conversation: string[] = [];
  private pauseStatus: 0 | 1 | 2 = 0;
  readonly currentStepControllers: Set<AbortController> = new Set();

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

  async checkAborted(noCheckPause?: boolean): Promise<void> {
    if (this.controller.signal.aborted) {
      const error = new Error("Operation was interrupted");
      error.name = "AbortError";
      throw error;
    }
    while (this.pauseStatus > 0 && !noCheckPause) {
      await sleep(500);
      if (this.pauseStatus == 2) {
        this.currentStepControllers.forEach((c) => {
          c.abort("Pause");
        });
        this.currentStepControllers.clear();
      }
      if (this.controller.signal.aborted) {
        const error = new Error("Operation was interrupted");
        error.name = "AbortError";
        throw error;
      }
    }
  }

  currentAgent(): [Agent, WorkflowAgent, AgentContext] | null {
    const agentNode = this.chain.agents[this.chain.agents.length - 1];
    if (!agentNode) {
      return null;
    }
    const agent = this.agents.filter(
      (agent) => agent.Name == agentNode.agent.name
    )[0];
    if (!agent) {
      return null;
    }
    const agentContext = agent.AgentContext as AgentContext;
    return [agent, agentNode.agent, agentContext];
  }

  get pause() {
    return this.pauseStatus > 0;
  }

  setPause(pause: boolean, abortCurrentStep?: boolean) {
    this.pauseStatus = pause ? (abortCurrentStep ? 2 : 1) : 0;
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
}

export class AgentContext {
  agent: Agent;
  context: Context;
  agentChain: AgentChain;
  variables: Map<string, any>;
  consecutiveErrorNum: number;
  messages?: LanguageModelV2Prompt;

  constructor(context: Context, agent: Agent, agentChain: AgentChain) {
    this.context = context;
    this.agent = agent;
    this.agentChain = agentChain;
    this.variables = new Map();
    this.consecutiveErrorNum = 0;
  }
}
