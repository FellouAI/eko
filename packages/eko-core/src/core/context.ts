/**
 * Context module
 *
 * Implements context management for the Eko system: execution environment,
 * state control, and variable storage.
 *
 * Components:
 * - Context: task-level context manager
 * - AgentContext: agent-level context manager
 *
 * Concepts:
 * - Task context: full execution environment for a single task
 * - Agent context: execution state for a single agent
 * - Pause control: pause/resume task execution
 * - Abort control: abort task execution
 * - Variable storage: key-value variable map
 *
 * Traits:
 * 1. Hierarchical contexts
 * 2. State isolation between tasks/agents
 * 3. Lifecycle management
 * 4. Concurrency control for parallel agents
 */

import type { Agent } from "../agent/base";
import { sleep } from "../common/utils";
import Chain from "./chain";
import type { AgentChain } from "./chain";
import {
  EkoConfig,
  LanguageModelV2Prompt,
  Workflow,
  WorkflowAgent,
} from "../types";

/**
 * Task context manager
 *
 * Maintains the full execution environment for a single task.
 *
 * State:
 * - pauseStatus: 0=running, 1=paused, 2=paused and abort current steps
 * - currentStepControllers: controllers for fine-grained step control
 */
export default class Context {
  /** Task unique identifier */
  taskId: string;

  /** Eko configuration (LLMs, agents, callbacks, etc.) */
  config: EkoConfig;

  /** Execution chain: history and intermediate results */
  chain: Chain;

  /** Available agents */
  agents: Agent[];

  /** Abort controller for task execution */
  controller: AbortController;

  /** Variable store (key-value) */
  variables: Map<string, any>;

  /** Workflow execution plan */
  workflow?: Workflow;

  /** Conversation history during execution */
  conversation: string[] = [];

  /** Pause status: 0=running, 1=paused, 2=paused and abort current steps */
  private pauseStatus: 0 | 1 | 2 = 0;

  /** Controllers for current steps (for parallel execution control) */
  readonly currentStepControllers: Set<AbortController> = new Set();

  /**
   * Constructor
   */
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

  /**
   * Check for abort or pause
   *
   * @param noCheckPause If true, skip pause wait-loop
   * @throws AbortError when aborted
   */
  async checkAborted(noCheckPause?: boolean): Promise<void> {
    // Check controller aborted
    if (this.controller.signal.aborted) {
      const error = new Error("Operation was interrupted");
      error.name = "AbortError";
      throw error;
    }

    // Pause loop
    while (this.pauseStatus > 0 && !noCheckPause) {
      // Wait 500ms before re-check
      await sleep(500);

      // If forced pause, abort all current step controllers
      if (this.pauseStatus == 2) {
        this.currentStepControllers.forEach((c) => {
          c.abort("Pause");
        });
        this.currentStepControllers.clear();
      }

      // Re-check controller aborted
      if (this.controller.signal.aborted) {
        const error = new Error("Operation was interrupted");
        error.name = "AbortError";
        throw error;
      }
    }
  }

  /**
   * Get current executing agent triple
   * @returns [Agent, WorkflowAgent, AgentContext] or null
   */
  currentAgent(): [Agent, WorkflowAgent, AgentContext] | null {
    // Get last agent chain
    const agentNode = this.chain.agents[this.chain.agents.length - 1];

    // If none, return null
    if (!agentNode) {
      return null;
    }

    // Find Agent instance by name
    const agent = this.agents.filter(
      (agent) => agent.Name == agentNode.agent.name
    )[0];

    // If not found, return null
    if (!agent) {
      return null;
    }

    // Get AgentContext
    const agentContext = agent.AgentContext as AgentContext;

    // Return triple
    return [agent, agentNode.agent, agentContext];
  }

  /**
   * Whether task is currently paused
   */
  get pause() {
    return this.pauseStatus > 0;
  }

  /**
   * Set pause state
   * @param pause Pause or resume
   * @param abortCurrentStep Abort current steps when pausing
   */
  setPause(pause: boolean, abortCurrentStep?: boolean) {
    // Set pause status
    this.pauseStatus = pause ? (abortCurrentStep ? 2 : 1) : 0;

    // Abort all current steps for forced pause
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

  /**
   * Custom serialization without non-serializable/circular refs
   */
  toJSON(): Record<string, unknown> {
    const variablesObj: Record<string, any> = {};
    this.variables.forEach((v, k) => (variablesObj[k] = v));
    return {
      taskId: this.taskId,
      pause: this.pause,
      conversationLength: this.conversation.length,
      variables: variablesObj,
      workflow: this.workflow
        ? {
            taskId: this.workflow.taskId,
            name: this.workflow.name,
            agentsCount: this.workflow.agents?.length ?? 0,
            modified: this.workflow.modified,
          }
        : undefined,
      chain: this.chain,
      agents: this.agents ? this.agents.map((a) => a.Name) : undefined,
    };
  }
}

/**
 * AgentContext manager
 *
 * Manages execution state and environment for a single agent instance.
 */
export class AgentContext {
  /** Current agent instance */
  agent: Agent;

  /** Owning task context */
  context: Context;

  /** Agent execution chain */
  agentChain: AgentChain;

  /** Agent-scoped variable store */
  variables: Map<string, any>;

  /** Consecutive error counter */
  consecutiveErrorNum: number;

  /** Message history with the LLM */
  messages?: LanguageModelV2Prompt;

  /**
   * Constructor
   */
  constructor(context: Context, agent: Agent, agentChain: AgentChain) {
    this.context = context;
    this.agent = agent;
    this.agentChain = agentChain;
    this.variables = new Map();
    this.consecutiveErrorNum = 0;
  }

  /**
   * Custom serialization without back-references to runtime objects
   */
  toJSON(): Record<string, unknown> {
    const variablesObj: Record<string, any> = {};
    this.variables.forEach((v, k) => (variablesObj[k] = v));
    return {
      agentName: this.agent?.Name,
      consecutiveErrorNum: this.consecutiveErrorNum,
      messagesLength: this.messages?.length ?? 0,
      variables: variablesObj,
      agentChain: this.agentChain,
    };
  }
}
