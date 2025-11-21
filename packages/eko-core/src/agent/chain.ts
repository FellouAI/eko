import { ToolResult } from "../types/tools.types";
import { LLMRequest } from "../types/llm.types";
import { WorkflowAgent } from "../types/agent.types";
import { LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

type ChainEvent = {
  type: "update";
  target: AgentChain | ToolChain;
};

interface Callback {
  (chain: Chain, event: ChainEvent): void;
}

export class ToolChain {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly request: LLMRequest;
  params?: Record<string, unknown>;
  toolResult?: ToolResult;
  onUpdate?: () => void;

  constructor(toolUse: LanguageModelV2ToolCallPart, request: LLMRequest) {
    this.toolName = toolUse.toolName;
    this.toolCallId = toolUse.toolCallId;
    this.request = JSON.parse(JSON.stringify(request));
  }

  updateParams(params: Record<string, unknown>): void {
    this.params = params;
    this.onUpdate && this.onUpdate();
  }

  updateToolResult(toolResult: ToolResult): void {
    this.toolResult = toolResult;
    this.onUpdate && this.onUpdate();
  }
}

export class AgentChain {
  agent: WorkflowAgent;
  tools: ToolChain[] = [];
  agentRequest?: LLMRequest;
  agentResult?: string;
  onUpdate?: (event: ChainEvent) => void;

  constructor(agent: WorkflowAgent) {
    this.agent = agent;
  }

  push(tool: ToolChain): void {
    tool.onUpdate = () => {
      this.onUpdate &&
        this.onUpdate({
          type: "update",
          target: tool,
        });
    };
    this.tools.push(tool);
    this.onUpdate &&
      this.onUpdate({
        type: "update",
        target: this,
      });
  }
}

export default class Chain {
  taskPrompt: string;
  planRequest?: LLMRequest;
  planResult?: string;
  agents: AgentChain[] = [];
  private listeners: Callback[] = [];

  constructor(taskPrompt: string) {
    this.taskPrompt = taskPrompt;
  }

  push(agent: AgentChain): void {
    agent.onUpdate = (event: ChainEvent) => {
      this.pub(event);
    };
    this.agents.push(agent);
    this.pub({
      type: "update",
      target: agent,
    });
  }

  private pub(event: ChainEvent): void {
    this.listeners.forEach((listener) => listener(this, event));
  }

  public addListener(callback: Callback): void {
    this.listeners.push(callback);
  }

  public removeListener(callback: Callback): void {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }
}
