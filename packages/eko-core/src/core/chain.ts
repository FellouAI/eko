/**
 * Chain module
 *
 * Execution-chain management: hierarchical tracking of tools, agents, and
 * tasks with event-driven updates.
 */

import { ToolResult } from "../types/tools.types";
import { LLMRequest } from "../types/llm.types";
import { WorkflowAgent } from "../types/core.types";
import { LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

/**
 * Execution-chain event type
 */
type ChainEvent = {
  /** Event type (currently only "update") */
  type: "update";
  /** Event target (AgentChain | ToolChain) */
  target: AgentChain | ToolChain;
};

/**
 * Execution-chain event callback interface
 */
interface Callback {
  /** Event handler */
  (chain: Chain, event: ChainEvent): void;
}

/**
 * ToolChain: tracks a single tool invocation lifecycle
 */
export class ToolChain {
  /** Tool name */
  readonly toolName: string;

  /** Tool-call id */
  readonly toolCallId: string;

  /** LLM request associated with this call */
  readonly request: LLMRequest;

  /** Tool parameters */
  params?: Record<string, unknown>;

  /** Tool result */
  toolResult?: ToolResult;

  /** Update callback */
  onUpdate?: () => void;

  /**
   * Constructor
   */
  constructor(toolUse: LanguageModelV2ToolCallPart, request: LLMRequest) {
    this.toolName = toolUse.toolName;
    this.toolCallId = toolUse.toolCallId;
    // Deep copy to avoid mutation of original request
    this.request = JSON.parse(JSON.stringify(request));
  }

  /**
   * Update tool parameters
   */
  updateParams(params: Record<string, unknown>): void {
    this.params = params;
    // Notify listeners
    this.onUpdate && this.onUpdate();
  }

  /**
   * Update tool result
   */
  updateToolResult(toolResult: ToolResult): void {
    this.toolResult = toolResult;
    // Notify listeners
    this.onUpdate && this.onUpdate();
  }

  /**
   * Custom serialization without functions/cycles
   */
  toJSON(): Record<string, unknown> {
    return {
      toolName: this.toolName,
      toolCallId: this.toolCallId,
      params: this.params,
      toolResult: this.toolResult,
    };
  }
}

/**
 * AgentChain: tracks an agent's execution lifecycle
 */
export class AgentChain {
  /** Workflow agent node */
  agent: WorkflowAgent;

  /** Tool chains invoked by the agent */
  tool_chains: ToolChain[] = [];

  /** LLM request for agent execution */
  agentRequest?: LLMRequest;

  /** Final result text */
  agentResult?: string;

  /** Update event callback for bubbling up */
  onUpdate?: (event: ChainEvent) => void;

  /**
   * Constructor
   */
  constructor(agent: WorkflowAgent) {
    this.agent = agent;
  }

  /**
   * Push a tool chain and wire event forwarding
   */
  push(tool: ToolChain): void {
    // Wire event forwarding from tool -> agent chain
    tool.onUpdate = () => {
      this.onUpdate &&
        this.onUpdate({
          type: "update",
          target: tool,
        });
    };

    // Add to list
    this.tool_chains.push(tool);

    // Notify parent listeners
    this.onUpdate &&
      this.onUpdate({
        type: "update",
        target: this,
      });
  }

  /**
   * Custom serialization with traceable info only
   */
  toJSON(): Record<string, unknown> {
    return {
      agent: {
        id: this.agent.id,
        name: this.agent.name,
      },
      agentRequest: this.agentRequest
        ? {
            messagesCount: (this.agentRequest as any).messages?.length ?? 0,
            toolCount: (this.agentRequest as any).tools?.length ?? 0,
            toolChoice: (this.agentRequest as any).toolChoice,
          }
        : undefined,
      agentResult: this.agentResult,
      tools: this.tool_chains,
    };
  }
}

/**
 * Chain: top-level manager coordinating workflow execution
 */
export default class Chain {
  /** Original task prompt */
  taskPrompt: string;

  /** LLM request sent during planning */
  planRequest?: LLMRequest;

  /** Planning result text */
  planResult?: string;

  /** All AgentChains */
  agent_chains: AgentChain[] = [];

  /** Event listeners */
  private listeners: Callback[] = [];

  /**
   * Constructor
   */
  constructor(taskPrompt: string) {
    this.taskPrompt = taskPrompt;
  }

  /**
   * Push an AgentChain and wire event forwarding
   */
  push(agent: AgentChain): void {
    // Wire event forwarding from agent chain -> chain
    agent.onUpdate = (event: ChainEvent) => {
      this.pub(event);
    };

    // Add to list
    this.agent_chains.push(agent);

    // Publish update event
    this.pub({
      type: "update",
      target: agent,
    });
  }

  /**
   * Publish event to all listeners
   * @private
   */
  private pub(event: ChainEvent): void {
    this.listeners.forEach((listener) => listener(this, event));
  }

  /**
   * Add event listener
   */
  public addListener(callback: Callback): void {
    this.listeners.push(callback);
  }

  /**
   * Remove event listener
   */
  public removeListener(callback: Callback): void {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  /**
   * Custom serialization with essential info only
   */
  toJSON(): Record<string, unknown> {
    return {
      taskPrompt: this.taskPrompt,
      planRequest: this.planRequest
        ? {
            messagesCount: (this.planRequest as any).messages?.length ?? 0,
            toolCount: (this.planRequest as any).tools?.length ?? 0,
            toolChoice: (this.planRequest as any).toolChoice,
          }
        : undefined,
      planResult: this.planResult,
      agents: this.agent_chains,
    };
  }
}
