import type {
  StreamCallback,
  StreamCallbackMessage,
} from "../types/core.types";
import type { AgentContext } from "../core/context";
// Runtime dependency. Used only when enable_langfuse is true and package is installed
// @ts-ignore
import {
  LangfuseAgent,
  LangfuseGeneration,
  LangfuseSpan,
  LangfuseTool,
  startObservation,
} from "@langfuse/tracing";

type Handles = {
  root: LangfuseSpan;
  plan?: LangfuseSpan;
  workflow?: LangfuseSpan;
  agents: Map<string, LangfuseAgent>;
  genSeq: Map<string, number>;
  gens: Map<string, LangfuseGeneration>;
  tools: Map<string, LangfuseTool>;
  genStartAt: Map<string, number>;
  planStartAt?: number;
};

export type LangfuseCallbackOptions = {
  enabled?: boolean;
  recordStreaming?: boolean;
};

export function createLangfuseCallback(
  opts?: LangfuseCallbackOptions
): StreamCallback {
  const enabled = opts?.enabled !== false;
  const taskMap = new Map<string, Handles>();

  function ensureRoot(taskId: string, payload?: any): Handles | null {
    if (!enabled) return null;
    let rec = taskMap.get(taskId);
    if (rec) return rec;

    const root = startObservation(`eko-task-${taskId}`, {
      input: payload?.taskPrompt
        ? {
            taskPrompt: payload.taskPrompt,
            contextParams: payload.contextParams,
          }
        : undefined,
      metadata: payload?.context ? { context: payload.context } : undefined,
    });
    // Use taskId as sessionId
    try {
      root.updateTrace?.({ sessionId: taskId });
    } catch {}

    rec = {
      root,
      plan: undefined,
      workflow: undefined,
      agents: new Map(),
      genSeq: new Map(),
      gens: new Map(),
      tools: new Map(),
      genStartAt: new Map(),
      planStartAt: undefined,
    };
    taskMap.set(taskId, rec);
    return rec;
  }

  function endAll(rec: Handles) {
    rec.tools.forEach((t) => t?.end?.());
    rec.gens.forEach((g) => g?.end?.());
    rec.agents.forEach((a) => a?.end?.());
    rec.workflow?.end?.();
    rec.plan?.end?.();
    rec.root?.end?.();
  }

  function nextGenKey(nodeId: string, rec: Handles): string {
    const curr = (rec.genSeq.get(nodeId) ?? 0) + 1;
    rec.genSeq.set(nodeId, curr);
    return `${nodeId}:${curr}`;
  }

  async function onMessage(
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ): Promise<void> {
    if (!enabled) return;
    const { taskId, type } = message as any;
    if (!taskId || !type) return;

    switch (type) {
      case "debug_task_start": {
        ensureRoot(taskId, {
          taskPrompt: (message as any).taskPrompt,
          contextParams: (message as any).contextParams,
          context: (message as any).context,
        });
        return;
      }
      case "debug_task_finished": {
        const rec = taskMap.get(taskId);
        if (!rec) return;
        try {
          rec.root?.update?.({
            output: {
              success: (message as any).success,
              result: (message as any).result,
              error: (message as any).error,
              stopReason: (message as any).stopReason,
            },
            level: (message as any).error ? "ERROR" : "DEFAULT",
          });
        } catch {}
        endAll(rec);
        taskMap.delete(taskId);
        return;
      }

      case "debug_plan_start": {
        const rec = ensureRoot(taskId);
        if (!rec) return;
        rec.planStartAt = Date.now();
        rec.plan = rec.root.startObservation?.(
          "Planner",
          {
            input: {
              taskPrompt: (message as any).taskPrompt,
              plannerPrompt: (message as any).plannerPrompt,
              availableAgents: ((message as any).availableAgents || []).map(
                (a: any) => a?.Name ?? a?.name
              ),
            },
          },
          { asType: "agent" }
        );
        return;
      }
      case "debug_plan_process": {
        const rec = taskMap.get(taskId);
        if (!rec?.plan || !opts?.recordStreaming) return;
        rec.plan.startObservation?.(
          "plan:process",
          {
            input: {
              streamDone: (message as any).streamDone,
              partialWorkflow: (message as any).partialWorkflow,
              thinkingText: (message as any).thinkingText,
            },
          },
          { asType: "event" }
        );
        return;
      }
      case "debug_plan_finished": {
        const rec = taskMap.get(taskId);
        if (!rec?.plan) return;
        const gen = rec.plan?.startObservation?.(
          "generate plan",
          {
            input: (message as any).planRequest?.messages,
            metadata: { request: (message as any).planRequest },
            usageDetails: (message as any).usage
              ? {
                  input: (message as any).usage.promptTokens,
                  output: (message as any).usage.completionTokens,
                  total: (message as any).usage.totalTokens,
                }
              : undefined,
          },
          { asType: "generation" }
        );
        try {
          gen?.update?.({ output: (message as any).planResult });
        } catch {}
        gen?.end?.();
        try {
          const planLatency = rec.planStartAt ? Date.now() - rec.planStartAt : undefined;
          rec.plan?.update?.({
            output: { planResult: (message as any).planResult },
            metadata: planLatency !== undefined ? { latencyMs: planLatency } : undefined,
          });
        } catch {}
        rec.plan?.end?.();
        rec.planStartAt = undefined;
        rec.plan = undefined;
        return;
      }

      case "debug_workflow_start": {
        const rec = ensureRoot(taskId);
        if (!rec) return;
        rec.workflow = rec.root.startObservation?.("workflow", {
          input: { workflow: (message as any).workflow },
          metadata: { agentTree: (message as any).agentTree },
        });
        return;
      }
      case "debug_workflow_finished": {
        const rec = taskMap.get(taskId);
        if (!rec?.workflow) return;
        try {
          rec.workflow.update?.({
            output: {
              results: (message as any).results,
              finalResult: (message as any).finalResult,
            },
          });
        } catch {}
        rec.workflow.end?.();
        return;
      }

      case "debug_agent_node_start": {
        const rec = ensureRoot(taskId);
        if (!rec?.workflow) return;
        const node =
          (message as any).agentNode?.agent || (message as any).agentNode;
        const nodeId = node?.id || (message as any).nodeId || "unknown";
        const agentObs = rec.workflow?.startObservation?.(
          node?.name || (message as any).agentName || "agent",
          {
            input: {
              task: (message as any).task,
              node,
              agentNode: (message as any).agentNode,
            },
          },
          { asType: "agent" }
        );
        rec.agents.set(nodeId, agentObs);
        return;
      }
      case "debug_agent_node_finished": {
        const rec = taskMap.get(taskId);
        if (!rec) return;
        const node =
          (message as any).agentNode?.agent || (message as any).agentNode;
        const nodeId = node?.id || (message as any).nodeId || "unknown";
        const agentObs = rec.agents.get(nodeId);
        try {
          agentObs?.update?.({
            output: {
              result: (message as any).result,
              error: (message as any).error,
              executionStats: (message as any).executionStats,
            },
            level: (message as any).error ? "ERROR" : "DEFAULT",
          });
        } catch {}
        agentObs?.end?.();
        rec.agents.delete(nodeId);
        return;
      }

      case "debug_llm_request_start": {
        const rec = ensureRoot(taskId);
        if (!rec?.workflow) return;
        const nodeId =
          agentContext?.agentChain?.agent?.id ||
          (message as any).nodeId ||
          "unknown";
        const agentObs = rec.agents.get(nodeId) || rec.workflow;
        const parent = rec.plan ?? agentObs;
        const key = nextGenKey(nodeId, rec);
        const gen = parent.startObservation?.(
          (message as any).modelName || "generation",
          {
            input: (message as any).request?.messages,
            metadata: {
              tools: (message as any).request?.tools?.map((t: any) => t?.name),
              toolChoice: (message as any).request?.toolChoice,
              context: (message as any).context,
              model: (message as any).modelName,
              modelParameters: (message as any).request?.providerOptions,
            },
          },
          { asType: "generation" }
        );
        rec.gens.set(key, gen);
        rec.genStartAt.set(key, Date.now());
        return;
      }
      case "debug_llm_response_finished": {
        const rec = taskMap.get(taskId);
        if (!rec) return;
        const nodeId =
          agentContext?.agentChain?.agent?.id ||
          (message as any).nodeId ||
          "unknown";
        const lastSeq = rec.genSeq.get(nodeId) || 1;
        const key = `${nodeId}:${lastSeq}`;
        const gen = rec.gens.get(key);
        try {
          const startAt = rec.genStartAt.get(key);
          const latency = startAt ? Date.now() - startAt : undefined;
          gen?.update?.({
            output: (message as any).response,
            usageDetails: (message as any).usage 
              ? {
                  input: (message as any).usage.promptTokens,
                  output: (message as any).usage.completionTokens,
                  total:
                    (message as any).usage.totalTokens ??
                    ((message as any).usage.promptTokens || 0) +
                      ((message as any).usage.completionTokens || 0),
                }
              : undefined,
            metadata: latency !== undefined ? { latencyMs: latency } : undefined,
          });
        } catch {}
        gen?.end?.();
        rec.gens.delete(key);
        rec.genStartAt.delete(key);
        return;
      }

      case "debug_tool_call_start": {
        const rec = ensureRoot(taskId);
        if (!rec?.workflow) return;
        const nodeId =
          agentContext?.agentChain?.agent?.id ||
          (message as any).nodeId ||
          "unknown";
        // Tool belongs to the Agent
        const agentObs = rec.agents.get(nodeId) || rec.workflow;
        const tool = agentObs?.startObservation?.(
          (message as any).toolName,
          {
            input: (message as any).params,
            metadata: { toolId: (message as any).toolId },
          },
          { asType: "tool" }
        );
        const toolCallId = (message as any).toolId;
        if (toolCallId && tool) rec.tools.set(toolCallId, tool);
        return;
      }
      case "debug_tool_call_finished": {
        const rec = taskMap.get(taskId);
        if (!rec) return;
        const toolCallId = (message as any).toolId;
        const tool = toolCallId ? rec.tools.get(toolCallId) : undefined;
        try {
          tool?.update?.({
            output: (message as any).toolResult,
            metadata: { duration: (message as any).duration },
            level: (message as any).toolResult?.isError ? "ERROR" : "DEFAULT",
          });
        } catch {}
        tool?.end?.();
        if (toolCallId) rec.tools.delete(toolCallId);
        return;
      }
      default:
        return;
    }
  }

  return { onMessage };
}
