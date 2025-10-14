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

  // 新增：统一的 span 池
  allSpans: Map<string, any>;  // spanId -> span 对象

  // 新增：执行栈（按 nodeId 隔离，支持并行 Agent）
  activeSpanStacks: Map<string, string[]>;  // nodeId -> [spanId1, spanId2, ...]

  // 保留原有字段（向后兼容）
  agents: Map<string, LangfuseAgent>;
  genSeq: Map<string, number>;
  gens: Map<string, LangfuseGeneration>;
  tools: Map<string, LangfuseTool>;
  genStartAt: Map<string, number>;
  planStartAt?: number;
};

export type LangfuseCallbackOptions = {
  enabled?: boolean;
  endpoint?: string; // Langfuse OTEL Ingest URL
  serviceName?: string; // 服务名，默认 eko-service
  serviceVersion?: string; // 服务版本，默认 1.0.0
  /** Whether to use navigator.sendBeacon if available (browser only) */
  useSendBeacon?: boolean;
  /** Max payload size in bytes, default 800_000 (800KB) */
  batchBytesLimit?: number;
  /** Whether to record streaming events like plan_process, default false */
  recordStreaming?: boolean;
  /** Whether to auto flush after each export, default true */
  autoFlush?: boolean;
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

    const traceId =
      payload?.contextParams?.traceId ??
      (payload?.context?.variables?.get
        ? payload.context.variables.get("traceId")
        : undefined) ??
      taskId;

    const root = startObservation(
      `eko-task-${taskId}`, 
      {
        input: payload?.taskPrompt
          ? {
            taskPrompt: payload.taskPrompt,
            contextParams: payload.contextParams,
          }
          : undefined,
        metadata: payload?.context ? { context: payload.context } : undefined,
      },
      {
        parentSpanContext: {
          traceId: traceId,
          spanId: traceId.slice(0, 16), // fake spanId
          traceFlags: 1,
        }
      }
    );
  

    rec = {
      root,
      plan: undefined,
      workflow: undefined,
      allSpans: new Map(),
      activeSpanStacks: new Map(),
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

    // 清理新增的数据结构
    rec.allSpans.clear();
    rec.activeSpanStacks.clear();
  }

  function nextGenKey(nodeId: string, rec: Handles): string {
    const curr = (rec.genSeq.get(nodeId) ?? 0) + 1;
    rec.genSeq.set(nodeId, curr);
    return `${nodeId}:${curr}`;
  }

  // 推入栈
  function pushStack(rec: Handles, nodeId: string, spanId: string) {
    if (!rec.activeSpanStacks.has(nodeId)) {
      rec.activeSpanStacks.set(nodeId, []);
    }
    rec.activeSpanStacks.get(nodeId)!.push(spanId);
  }

  // 弹出栈，返回上一层 spanId
  function popStack(rec: Handles, nodeId: string): string | undefined {
    const stack = rec.activeSpanStacks.get(nodeId);
    if (stack && stack.length > 0) {
      stack.pop();  // 弹出当前层
      return stack[stack.length - 1];  // 返回新的栈顶（上一层）
    }
    return undefined;
  }

  // 推断 parent span（核心逻辑）
  function inferParentSpan(
    rec: Handles,
    nodeId: string | undefined,
    agentContext?: AgentContext
  ): any {
    // 1. 优先：从 agentContext.variables 获取当前 spanId（最精确）
    if (agentContext) {
      const spanId = agentContext.variables.get('_langfuse_current_span_id');
      if (spanId && rec.allSpans.has(spanId)) {
        return rec.allSpans.get(spanId);
      }
    }

    // 2. 从执行流的栈顶获取
    if (nodeId) {
      const stack = rec.activeSpanStacks.get(nodeId);
      if (stack && stack.length > 0) {
        const topSpanId = stack[stack.length - 1];
        if (rec.allSpans.has(topSpanId)) {
          return rec.allSpans.get(topSpanId);
        }
      }
    }

    // 3. Plan 阶段特殊处理（仅在 Plan 执行中有效）
    if (rec.plan) return rec.plan;

    // 4. Workflow fallback
    if (rec.workflow) return rec.workflow;

    // 5. Root fallback
    return rec.root;
  }

  async function onMessage(
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ): Promise<void> {
    if (!enabled) return;
    const { taskId, type } = message as any;
    if (!taskId || !type) return;

    // DEBUG: Log all incoming messages
    console.warn(`收到消息: ${type} (任务 ID: ${taskId})`);

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
        } catch { }
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
        } catch { }
        gen?.end?.();
        try {
          const planLatency = rec.planStartAt ? Date.now() - rec.planStartAt : undefined;
          rec.plan?.update?.({
            output: { planResult: (message as any).planResult },
            metadata: planLatency !== undefined ? { latencyMs: planLatency } : undefined,
          });
        } catch { }
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
        } catch { }
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

        // 存储到原有 Map（兼容性）
        rec.agents.set(nodeId, agentObs);

        // 新增：存储到 allSpans + 推入栈 + 注入到 agentContext
        const spanId = `agent_${nodeId}`;
        rec.allSpans.set(spanId, agentObs);
        pushStack(rec, nodeId, spanId);

        if (agentContext) {
          agentContext.variables.set('_langfuse_current_span_id', spanId);
        }

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
        } catch { }
        agentObs?.end?.();

        // 新增：弹出栈 + 恢复上一层 spanId
        const prevSpanId = popStack(rec, nodeId);
        if (agentContext) {
          if (prevSpanId) {
            agentContext.variables.set('_langfuse_current_span_id', prevSpanId);
          } else {
            // Agent 是顶层，清空 spanId
            agentContext.variables.delete('_langfuse_current_span_id');
          }
        }

        // 清理
        rec.agents.delete(nodeId);
        const spanId = `agent_${nodeId}`;
        rec.allSpans.delete(spanId);

        return;
      }

      case "debug_llm_request_start": {
        const rec = ensureRoot(taskId);
        if (!rec?.workflow) return;
        const nodeId =
          agentContext?.agentChain?.agent?.id ||
          (message as any).nodeId ||
          "unknown";

        // 核心改动：使用 inferParentSpan 动态推断 parent
        const parent = inferParentSpan(rec, nodeId, agentContext);

        // 优先使用 streamId 作为唯一标识，避免并行冲突
        const streamId = (message as any).streamId;
        const key = streamId || nextGenKey(nodeId, rec);

        // 获取自定义名称，默认为 "generation"
        const customName = (message as any).name;
        const spanName = customName || (message as any).modelName || "generation";

        // DEBUG: Log key generation
        // console.warn('[Langfuse] debug_llm_request_start - key:', key, 'nodeId:', nodeId, 'streamId:', streamId);

        const gen = parent.startObservation?.(
          spanName,
          {
            input: (message as any).request?.messages,
            metadata: {
              tools: (message as any).request?.tools?.map((t: any) => t?.name),
              toolChoice: (message as any).request?.toolChoice,
              context: (message as any).context,
              model: (message as any).modelName,
              modelParameters: (message as any).request?.providerOptions,
              streamId: streamId,  // 保存 streamId 到 metadata
            },
          },
          { asType: "generation" }
        );
        rec.gens.set(key, gen);
        rec.genStartAt.set(key, Date.now());

        // DEBUG: Log span storage
        // console.warn('[Langfuse] Stored generation span with key:', key, 'total gens:', rec.gens.size);

        // Generation 是叶子节点，不推入栈
        return;
      }
      case "debug_llm_response_finished": {
        const rec = taskMap.get(taskId);
        if (!rec) return;
        const nodeId =
          agentContext?.agentChain?.agent?.id ||
          (message as any).nodeId ||
          "unknown";

        // 优先使用 streamId 匹配，避免并行冲突
        const streamId = (message as any).streamId;
        const lastSeq = rec.genSeq.get(nodeId) || 1;
        const key = streamId || `${nodeId}:${lastSeq}`;

        // DEBUG: Log key lookup
        // console.warn('[Langfuse] debug_llm_response_finished - key:', key, 'nodeId:', nodeId, 'streamId:', streamId);
        // console.warn('[Langfuse] Available keys in rec.gens:', Array.from(rec.gens.keys()));

        const gen = rec.gens.get(key);

        // DEBUG: Log span retrieval
        // if (!gen) {
        //   console.warn('[Langfuse] WARNING: Generation span not found for key:', key);
        // } else {
        //   console.warn('[Langfuse] Found generation span for key:', key);
        // }

        try {
          const startAt = rec.genStartAt.get(key);
          const latency = startAt ? Date.now() - startAt : undefined;

          // DEBUG: Log response data
          // console.warn('[Langfuse] Response data:', {
          //   hasResponse: !!(message as any).response,
          //   response: (message as any).response,
          //   hasUsage: !!(message as any).usage
          // });
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
        } catch { }
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

        // 核心改动：使用 inferParentSpan 替代固定的 agentObs
        const parent = inferParentSpan(rec, nodeId, agentContext);

        const tool = parent?.startObservation?.(
          (message as any).toolName,
          {
            input: (message as any).params,
            metadata: { toolId: (message as any).toolId },
          },
          { asType: "tool" }
        );

        const toolCallId = (message as any).toolId;
        if (toolCallId && tool) {
          // 存储到原有 Map（兼容性）
          rec.tools.set(toolCallId, tool);

          // 新增：存储到 allSpans + 推入栈 + 注入到 agentContext
          const spanId = `tool_${toolCallId}`;
          rec.allSpans.set(spanId, tool);
          pushStack(rec, nodeId, spanId);

          if (agentContext) {
            agentContext.variables.set('_langfuse_current_span_id', spanId);
          }
        }

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
        } catch { }
        tool?.end?.();

        // 新增：弹出栈 + 恢复上一层 spanId
        if (toolCallId) {
          const nodeId = agentContext?.agentChain?.agent?.id || (message as any).nodeId || "unknown";
          const prevSpanId = popStack(rec, nodeId);

          if (agentContext) {
            if (prevSpanId) {
              agentContext.variables.set('_langfuse_current_span_id', prevSpanId);
            } else {
              // 理论上 Tool 结束后应该还在 Agent 内
              agentContext.variables.delete('_langfuse_current_span_id');
            }
          }

          // 清理
          rec.tools.delete(toolCallId);
          const spanId = `tool_${toolCallId}`;
          rec.allSpans.delete(spanId);
        }

        return;
      }
      default:
        return;
    }
  }

  return { onMessage };
}
