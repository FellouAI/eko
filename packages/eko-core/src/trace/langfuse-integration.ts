/**
 * Langfuse Integration for Eko Framework
 * 
 * This module provides seamless integration with Langfuse tracing system through
 * a composable callback architecture. It captures hierarchical execution traces
 * of Eko tasks, workflows, agents, LLM calls, and tool executions.
 * 
 * ## Architecture Overview
 * 
 * ### Event-Driven Tracing
 * The system operates on a debug event stream (`debug_*` events from core.types.ts).
 * Each event type has a corresponding default handler that creates/updates Langfuse spans.
 * 
 * ### Handler Composition
 * Users can provide custom event handlers via `LangfuseCallbackOptions.eventHandler`.
 * The execution logic follows this pattern:
 * 
 * 1. **Custom handler always executes first** (if provided)
 * 2. **Default handler executes unless explicitly bypassed**
 *    - Bypass requires BOTH conditions:
 *      a) `customHandler.bypassDefault === true`
 *      b) `couldbeBypass[eventType] === true`
 * 
 * This ensures critical events (task, agent, workflow lifecycle) always create
 * proper trace structure, while allowing customization of leaf events (LLM streaming).
 * 
 * ### Span Hierarchy & Parent Inference
 * 
 * The module maintains execution context through:
 * - **Span Pool** (`allSpans`): Global registry of all active spans
 * - **Execution Stacks** (`activeSpanStacks`): Per-nodeId call stacks for parallel execution
 * - **AgentContext Variables**: Injected `_langfuse_current_span_id` for precise parent tracking
 * 
 * Parent span inference priority:
 * 1. AgentContext variable (most precise)
 * 2. Execution stack top (per nodeId)
 * 3. Current plan span (during planning phase)
 * 4. Workflow span (during execution phase)
 * 5. Root task span (fallback)
 * 
 * ### Lifecycle Events
 * 
 * **Task Level**: `debug_task_start` → `debug_task_finished`
 * **Planning**: `debug_plan_start` → `debug_plan_process` → `debug_plan_finished`
 * **Workflow**: `debug_workflow_start` → `debug_workflow_finished`
 * **Agent**: `debug_agent_start` → `debug_agent_process` → `debug_agent_finished`
 * **LLM**: `debug_llm_request_start` → `debug_llm_response_*` → `debug_llm_response_finished`
 * **Tool**: `debug_tool_call_start` → `debug_tool_call_process` → `debug_tool_call_finished`
 * 
 * @module langfuse-integration
 */

import type {
  StreamCallback,
  StreamCallbackMessage,
} from "../types/core.types";
import type { AgentContext } from "../core/context";
import type {
  LangfuseCallbackOptions,
  DebugEventType,
  LangfuseSpanContext,
} from "../types/trace.types";

import {
  LangfuseSpan,
  LangfuseAgent,
  LangfuseGeneration,
  LangfuseTool,
  startObservation,
} from "@langfuse/tracing";

/**
 * Internal state tracking structure for each task execution.
 * Maintains Langfuse observation handles and execution context.
 */
type Handles = {
  /** Root task-level span */
  root: LangfuseSpan;
  
  /** Planning phase span (active during plan generation) */
  plan?: LangfuseSpan;
  
  /** Workflow execution span */
  workflow?: LangfuseSpan;

  /** Unified span registry: spanId -> span instance */
  allSpans: Map<string, any>;

  /** Per-agent execution stacks for parallel execution support: nodeId -> [spanId1, spanId2, ...] */
  activeSpanStacks: Map<string, string[]>;

  // Legacy data structures (maintained for backward compatibility)
  
  /** Agent spans indexed by nodeId */
  agents: Map<string, LangfuseAgent>;
  
  /** Generation sequence counter per nodeId to create unique keys */
  genSeq: Map<string, number>;
  
  /** Active generation spans indexed by composite keys */
  gens: Map<string, LangfuseGeneration>;
  
  /** Tool execution spans indexed by toolCallId */
  tools: Map<string, LangfuseTool>;
  
  /** Generation start timestamps for latency calculation */
  genStartAt: Map<string, number>;
  
  /** Plan phase start timestamp for latency calculation */
  planStartAt?: number;
};

const ROOT_SPAN_KEY = "root";
const PLAN_SPAN_KEY = "plan";
const WORKFLOW_SPAN_KEY = "workflow";

/**
 * Creates a Langfuse-integrated callback for Eko task execution tracing.
 * 
 * This factory function returns a StreamCallback that captures all debug events
 * and translates them into Langfuse observations (spans, generations, tools).
 * 
 * @param opts - Configuration options for Langfuse integration
 * @returns StreamCallback instance for use in Eko config
 * 
 * @example
 * ```typescript
 * const callback = createLangfuseCallback({
 *   enabled: true,
 *   recordStreaming: false,
 *   eventHandler: {
 *     debug_llm_request_start: {
 *       handle: async (msg, ctx) => console.log('Custom LLM handler'),
 *       bypassDefault: false
 *     }
 *   }
 * });
 * 
 * const eko = new Eko({
 *   llms: { ... },
 *   callback,
 *   enable_langfuse: true
 * });
 * ```
 */
export function createLangfuseCallback(
  opts?: LangfuseCallbackOptions
): StreamCallback {
  // Global state
  const enabled = opts?.enabled !== false;
  const taskMap = new Map<string, Handles>(); // taskId -> execution handles
  const customEventHandler = opts?.eventHandler;

  /**
   * Ensures a root span exists for the given task.
   * Creates a new root observation if this is the first event for the task.
   * 
   * @param taskId - Unique task identifier
   * @param payload - Optional context data (taskPrompt, contextParams, etc.)
   * @returns Handles object or null if tracing is disabled
   */
  function ensureRoot(taskId: string, payload?: any): Handles | null {
    // Early return if tracing is disabled
    if (!enabled) return null;
    
    // Return existing handles if already initialized
    let rec = taskMap.get(taskId);
    if (rec) return rec;

    // Extract or generate traceId from context
    // Priority: contextParams.traceId > context.variables.traceId > taskId
    const traceId =
      payload?.contextParams?.traceId ??
      (payload?.context?.variables?.get
        ? payload.context.variables.get("traceId")
        : undefined) ??
      taskId;

    // Create root Langfuse observation with explicit trace context
    // This enables trace continuation across distributed systems
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
          spanId: traceId.slice(0, 16), // Truncate to valid spanId length
          traceFlags: 1, // Sampled
        }
      }
    );
  
    // Initialize tracking structures
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
    rec.allSpans.set(ROOT_SPAN_KEY, root);
    return rec;
  }

  /**
   * Cleans up all spans and tracking structures for a completed task.
   * Ends all active observations in proper order (leaf to root).
   * 
   * @param rec - Handles object to clean up
   */
  function endAll(rec: Handles) {
    // End spans in reverse order: leaf observations first
    rec.tools.forEach((t) => t?.end?.());
    rec.gens.forEach((g) => g?.end?.());
    rec.agents.forEach((a) => a?.end?.());
    rec.workflow?.end?.();
    rec.plan?.end?.();
    rec.root?.end?.();

    // Clear tracking structures to prevent memory leaks
    rec.allSpans.clear();
    rec.activeSpanStacks.clear();
  }

  /**
   * Generates the next unique generation key for a given nodeId.
   * Used to create distinct keys for multiple LLM calls within the same agent.
   * 
   * @param nodeId - Agent/node identifier
   * @param rec - Handles object containing sequence counters
   * @returns Composite key in format "nodeId:sequence"
   */
  function nextGenKey(nodeId: string, rec: Handles): string {
    const curr = (rec.genSeq.get(nodeId) ?? 0) + 1;
    rec.genSeq.set(nodeId, curr);
    return `${nodeId}:${curr}`;
  }

  /**
   * Pushes a span onto the execution stack for the given nodeId.
   * This maintains the call hierarchy for parallel agent execution.
   * 
   * @param rec - Handles object
   * @param nodeId - Agent/node identifier
   * @param spanId - Span identifier to push
   */
  function pushStack(rec: Handles, nodeId: string, spanId: string) {
    // Initialize stack if this is the first span for this nodeId
    if (!rec.activeSpanStacks.has(nodeId)) {
      rec.activeSpanStacks.set(nodeId, []);
    }
    rec.activeSpanStacks.get(nodeId)!.push(spanId);
  }

  /**
   * Pops the current span from the execution stack and returns the previous parent.
   * Used when finishing agent/tool spans to restore context.
   * 
   * @param rec - Handles object
   * @param nodeId - Agent/node identifier
   * @returns Previous parent spanId, or undefined if stack is empty
   */
  function popStack(rec: Handles, nodeId: string): string | undefined {
    const stack = rec.activeSpanStacks.get(nodeId);
    if (stack && stack.length > 0) {
      stack.pop();  // Remove current span
      return stack[stack.length - 1];  // Return new top (parent span)
    }
    return undefined;
  }

  /**
   * Infers the appropriate parent span for a new observation.
   * Implements a priority-based resolution strategy for correct hierarchy.
   * 
   * Priority order:
   * 1. AgentContext variable (most precise, set by agent/tool handlers)
   * 2. Execution stack top (per-nodeId context)
   * 3. Current plan span (during planning phase)
   * 4. Workflow span (during execution phase)
   * 5. Root task span (fallback)
   * 
   * @param rec - Handles object
   * @param nodeId - Agent/node identifier (optional)
   * @param agentContext - Current agent execution context (optional)
   * @returns Parent span instance
   */
  function inferParentSpan(
    rec: Handles,
    nodeId: string | undefined,
    agentContext?: AgentContext
  ): LangfuseSpan | LangfuseAgent | LangfuseTool {
    // Priority 1: Check AgentContext variable (most precise)
    // This is set by agent_start and tool_call_start handlers
    if (agentContext) {
      const spanId = agentContext.variables.get('_langfuse_current_span_id');
      if (spanId && rec.allSpans.has(spanId)) {
        return rec.allSpans.get(spanId);
      }
    }

    // Priority 2: Get from execution stack top (per-nodeId isolation)
    // Supports parallel agent execution
    if (nodeId) {
      const stack = rec.activeSpanStacks.get(nodeId);
      if (stack && stack.length > 0) {
        const topSpanId = stack[stack.length - 1];
        if (rec.allSpans.has(topSpanId)) {
          return rec.allSpans.get(topSpanId);
        }
      }
    }

    // Priority 3: Current plan span (active during planning phase)
    if (rec.plan) return rec.plan;

    // Priority 4: Workflow span (active during execution phase)
    if (rec.workflow) return rec.workflow;

    // Priority 5: Root task span (ultimate fallback)
    return rec.root;
  }

  function findSpanId(rec: Handles, span: any): string | undefined {
    for (const [spanId, current] of rec.allSpans.entries()) {
      if (current === span) return spanId;
    }

    if (span === rec.root) return ROOT_SPAN_KEY;
    if (span === rec.plan) return PLAN_SPAN_KEY;
    if (span === rec.workflow) return WORKFLOW_SPAN_KEY;
    return undefined;
  }

  function createSpanContextAccessor(
    rec: Handles,
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ): LangfuseSpanContext {
    const defaultNodeId =
      agentContext?.agentChain?.agent?.id || (message as any).nodeId;

    const resolveParent = (nodeIdOverride?: string) =>
      inferParentSpan(rec, nodeIdOverride ?? defaultNodeId, agentContext);

    return {
      getParentSpanId: (nodeIdOverride?: string) => {
        const parent = resolveParent(nodeIdOverride);
        if (!parent) return undefined;
        return findSpanId(rec, parent);
      },
      getParentSpan: (nodeIdOverride?: string) => resolveParent(nodeIdOverride),
      getSpan: (spanId: string) => rec.allSpans.get(spanId),
      listSpanIds: () => Array.from(rec.allSpans.keys()),
    };
  }

  // ========== Default Event Handlers ==========
  
  /**
   * Event handler function signature.
   * All handlers receive taskId, message, and optional agentContext.
   */
  type EventHandler = (
    taskId: string,
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ) => void;

  /**
   * Handles task start events.
   * Creates the root observation for the entire task execution.
   */
  const defaultDebugTaskStartHandler: EventHandler = (taskId, message, agentContext) => {
    // Initialize root span with task context
    ensureRoot(taskId, {
      taskPrompt: (message as any).taskPrompt,
      contextParams: (message as any).contextParams,
      context: (message as any).context,
    });
  };

  /**
   * Handles task completion events.
   * Updates root span with final results and cleans up all resources.
   */
  const defaultDebugTaskFinishedHandler: EventHandler = (taskId, message) => {
    const rec = taskMap.get(taskId);
    if (!rec) return;
    
    // Update root span with final output and error level
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
    
    // End all spans and cleanup
    endAll(rec);
    taskMap.delete(taskId);
  };

  /**
   * Handles planning phase start.
   * Creates a planner agent observation under the root span.
   */
  const defaultDebugPlanStartHandler: EventHandler = (taskId, message) => {
    const rec = ensureRoot(taskId);
    if (!rec) return;
    
    // Record start time for latency calculation
    rec.planStartAt = Date.now();
    
    // Create planner agent observation
    const rawAvailableAgents = (message as any).availableAgents;
    const availableAgentsList = Array.isArray(rawAvailableAgents)
      ? rawAvailableAgents
      : rawAvailableAgents && typeof rawAvailableAgents === "object"
        ? Object.values(rawAvailableAgents)
        : [];

    rec.plan = rec.root.startObservation(
      "Planner",
      {
        input: {
          taskPrompt: (message as any).taskPrompt,
          plannerPrompt: (message as any).plannerPrompt,
          availableAgents: availableAgentsList.map(
            (a: any) => a?.Name ?? a?.name
          ),
        },
      },
      { asType: "agent" }
    );
    
    console.log("[Langfuse] debug_plan_start handler invoked");

    if (rec.plan) {
      rec.allSpans.set(PLAN_SPAN_KEY, rec.plan);
    }
  };

  /**
   * Handles planning process events (streaming).
   * Only records if `recordStreaming` option is enabled.
   */
  const defaultDebugPlanProcessHandler: EventHandler = (taskId, message) => {
    const rec = taskMap.get(taskId);
    if (!rec?.plan || !opts?.recordStreaming) return;
    
    // Create event observation for streaming progress
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
  };

  /**
   * Handles planning phase completion.
   * Creates a generation observation for the plan LLM call and ends the planner span.
   */
  const defaultDebugPlanFinishedHandler: EventHandler = (taskId, message) => {
    const rec = taskMap.get(taskId);
    if (!rec?.plan) return;

    // DEBUG
    console.warn("[Langfuse] debug_plan_finished handler invoked");

    
    // // Create generation observation for the plan LLM call
    // const gen = rec.plan?.startObservation?.(
    //   "generate plan",
    //   {
    //     input: (message as any).planRequest?.messages,
    //     metadata: { request: (message as any).planRequest },
    //     usageDetails: (message as any).usage
    //       ? {
    //         input: (message as any).usage.promptTokens,
    //         output: (message as any).usage.completionTokens,
    //         total: (message as any).usage.totalTokens,
    //       }
    //       : undefined,
    //   },
    //   { asType: "generation" }
    // );
    
    // Update generation with output and end it
    // try {
    //   gen?.update?.({ output: (message as any).planResult });
    // } catch { }
    // gen?.end?.();
    
    // Calculate planning latency and update plan span
    try {
      const planLatency = rec.planStartAt ? Date.now() - rec.planStartAt : undefined;
      rec.plan?.update?.({
        output: { planResult: (message as any).planResult },
        metadata: planLatency !== undefined ? { latencyMs: planLatency } : undefined,
      });
    } catch { }
    
    // End plan span and cleanup
    rec.plan?.end?.();
    rec.planStartAt = undefined;
    rec.allSpans.delete(PLAN_SPAN_KEY);
    rec.plan = undefined;
  };

  /**
   * Handles workflow execution start.
   * Creates a workflow observation under the root span.
   */
  const defaultDebugWorkflowStartHandler: EventHandler = (taskId, message) => {
    const rec = ensureRoot(taskId);
    if (!rec) return;
    
    // Create workflow observation with execution plan
    rec.workflow = rec.root.startObservation?.("workflow", {
      input: { workflow: (message as any).workflow },
      metadata: { agentTree: (message as any).agentTree },
    });

    if (rec.workflow) {
      rec.allSpans.set(WORKFLOW_SPAN_KEY, rec.workflow);
    }
  };

  /**
   * Handles workflow execution completion.
   * Updates workflow span with final results.
   */
  const defaultDebugWorkflowFinishedHandler: EventHandler = (taskId, message) => {
    const rec = taskMap.get(taskId);
    if (!rec?.workflow) return;
    
    // Update workflow span with aggregated results
    try {
      rec.workflow.update?.({
        output: {
          results: (message as any).results,
          finalResult: (message as any).finalResult,
        },
      });
    } catch { }
    rec.workflow.end?.();
    rec.allSpans.delete(WORKFLOW_SPAN_KEY);
  };

  /**
   * Handles agent execution start.
   * Creates an agent observation and establishes execution context.
   * 
   * This handler:
   * 1. Creates an agent observation under the workflow span
   * 2. Stores the span in the registry and legacy map
   * 3. Pushes the span onto the execution stack
   * 4. Injects the spanId into AgentContext for precise parent tracking
   */
  const defaultDebugAgentStartHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = ensureRoot(taskId);
    if (!rec?.workflow) return;
    
    // Extract agent node information
    const node =
      (message as any).agentNode?.agent || (message as any).agentNode;
    const nodeId = node?.id || (message as any).nodeId || "unknown";
    
    // Create agent observation under workflow
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

    // Store in legacy map (backward compatibility)
    rec.agents.set(nodeId, agentObs);

    // Store in unified span pool
    const spanId = `agent_${nodeId}`;
    rec.allSpans.set(spanId, agentObs);
    
    // Push onto execution stack (enables nested context)
    pushStack(rec, nodeId, spanId);

    // Inject into AgentContext for precise parent inference
    if (agentContext) {
      agentContext.variables.set('_langfuse_current_span_id', spanId);
    }
  };

  /**
   * Handles agent execution completion.
   * Updates agent span with results and restores parent context.
   * 
   * This handler:
   * 1. Updates agent span with execution results and stats
   * 2. Pops the agent span from execution stack
   * 3. Restores previous parent spanId in AgentContext
   * 4. Cleans up span references
   */
  const defaultDebugAgentFinishedHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = taskMap.get(taskId);
    if (!rec) return;
    
    // Extract agent node information
    const node =
      (message as any).agentNode?.agent || (message as any).agentNode;
    const nodeId = node?.id || (message as any).nodeId || "unknown";
    const agentObs = rec.agents.get(nodeId);
    
    // Update agent span with execution results
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

    // Pop from execution stack and restore parent context
    const prevSpanId = popStack(rec, nodeId);
    if (agentContext) {
      if (prevSpanId) {
        // Restore previous parent span in context
        agentContext.variables.set('_langfuse_current_span_id', prevSpanId);
      } else {
        // No parent, clear context (agent was top-level)
        agentContext.variables.delete('_langfuse_current_span_id');
      }
    }

    // Cleanup span references
    rec.agents.delete(nodeId);
    const spanId = `agent_${nodeId}`;
    rec.allSpans.delete(spanId);
  };

  /**
   * Handles LLM request start.
   * Creates a generation observation with dynamic parent inference.
   * 
   * This handler:
   * 1. Uses inferParentSpan to find the correct parent (agent or tool)
   * 2. Creates a generation observation with full request context
   * 3. Uses streamId for unique identification to support parallel calls
   * 4. Does NOT push onto stack (generations are leaf nodes)
   */
  const defaultDebugLlmRequestStartHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = ensureRoot(taskId);
    if (!rec) return; // Planner generations can fire before workflow span exists
    
    // Extract nodeId from context
    const nodeId =
      agentContext?.agentChain?.agent?.id ||
      (message as any).nodeId ||
      "unknown";

    // Infer parent span dynamically (agent or tool)
    const parent = inferParentSpan(rec, nodeId, agentContext);

    // Use streamId for unique identification (supports parallel LLM calls)
    const streamId = (message as any).streamId;
    const key = streamId || nextGenKey(nodeId, rec);

    // Support custom span names (e.g., for different LLM purposes)
    const customName = (message as any).name;
    const spanName = customName || (message as any).modelName || "generation";

    // Create generation observation under inferred parent
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
          streamId: streamId,  // Store for matching with response
        },
      },
      { asType: "generation" }
    );
    
    // Store generation span and start time
    rec.gens.set(key, gen);
    rec.genStartAt.set(key, Date.now());

    // NOTE: Generations are leaf nodes, do NOT push onto stack
  };

  /**
   * Handles LLM response completion.
   * Updates generation observation with final output and token usage.
   */
  const defaultDebugLlmResponseFinishedHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = taskMap.get(taskId);
    if (!rec) return;
    
    // Extract nodeId for key resolution
    const nodeId =
      agentContext?.agentChain?.agent?.id ||
      (message as any).nodeId ||
      "unknown";

    // Match generation using streamId (preferred) or fallback to sequence
    const streamId = (message as any).streamId;
    const lastSeq = rec.genSeq.get(nodeId) || 1;
    const key = streamId || `${nodeId}:${lastSeq}`;

    const gen = rec.gens.get(key);

    // Update generation with output, usage, and latency
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
    } catch { }
    
    // End generation and cleanup
    gen?.end?.();
    rec.gens.delete(key);
    rec.genStartAt.delete(key);
  };

  /**
   * Handles tool execution start.
   * Creates a tool observation with dynamic parent inference.
   * 
   * This handler:
   * 1. Uses inferParentSpan to find the correct parent (usually agent)
   * 2. Creates a tool observation with input parameters
   * 3. Stores span in registry and legacy map
   * 4. Pushes onto execution stack (tools can contain nested LLM calls)
   * 5. Injects spanId into AgentContext
   */
  const defaultDebugToolCallStartHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = ensureRoot(taskId);
    if (!rec?.workflow) return;
    
    // Extract nodeId for context resolution
    const nodeId =
      agentContext?.agentChain?.agent?.id ||
      (message as any).nodeId ||
      "unknown";

    // Infer parent span dynamically (usually agent, but could be nested tool)
    const parent = inferParentSpan(rec, nodeId, agentContext);

    // Create tool observation under inferred parent
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
      // Store in legacy map (backward compatibility)
      rec.tools.set(toolCallId, tool);

      // Store in unified span pool
      const spanId = `tool_${toolCallId}`;
      rec.allSpans.set(spanId, tool);
      
      // Push onto execution stack (tools can contain nested LLM calls)
      pushStack(rec, nodeId, spanId);

      // Inject into AgentContext for precise parent inference
      if (agentContext) {
        agentContext.variables.set('_langfuse_current_span_id', spanId);
      }
    }
  };

  /**
   * Handles tool execution completion.
   * Updates tool span with results and restores parent context.
   * 
   * This handler:
   * 1. Updates tool span with execution results and duration
   * 2. Pops the tool span from execution stack
   * 3. Restores previous parent spanId in AgentContext
   * 4. Cleans up span references
   */
  const defaultDebugToolCallFinishedHandler: EventHandler = (taskId, message, agentContext) => {
    const rec = taskMap.get(taskId);
    if (!rec) return;
    
    const toolCallId = (message as any).toolId;
    const tool = toolCallId ? rec.tools.get(toolCallId) : undefined;
    
    // Update tool span with execution results
    try {
      tool?.update?.({
        output: (message as any).toolResult,
        metadata: { duration: (message as any).duration },
        level: (message as any).toolResult?.isError ? "ERROR" : "DEFAULT",
      });
    } catch { }
    tool?.end?.();

    // Pop from execution stack and restore parent context
    if (toolCallId) {
      const nodeId = agentContext?.agentChain?.agent?.id || (message as any).nodeId || "unknown";
      const prevSpanId = popStack(rec, nodeId);

      if (agentContext) {
        if (prevSpanId) {
          // Restore previous parent span (usually agent)
          agentContext.variables.set('_langfuse_current_span_id', prevSpanId);
        } else {
          // No parent, clear context (shouldn't happen for tools)
          agentContext.variables.delete('_langfuse_current_span_id');
        }
      }

      // Cleanup span references
      rec.tools.delete(toolCallId);
      const spanId = `tool_${toolCallId}`;
      rec.allSpans.delete(spanId);
    }
  };

  /**
   * Handles agent process events (streaming).
   * Only records if `recordStreaming` option is enabled.
   * Currently a no-op placeholder for future enhancement.
   */
  const defaultDebugAgentProcessHandler: EventHandler = (taskId, message, agentContext) => {
    if (!opts?.recordStreaming) return;
    const rec = taskMap.get(taskId);
    if (!rec) return;
    // Future: Could create event observations for agent loop progress
  };

  /**
   * Handles LLM response start events (streaming).
   * Only records if `recordStreaming` option is enabled.
   * Currently a no-op placeholder for future enhancement.
   */
  const defaultDebugLlmResponseStartHandler: EventHandler = (taskId, message, agentContext) => {
    if (!opts?.recordStreaming) return;
    const rec = taskMap.get(taskId);
    if (!rec) return;
    // Future: Could record initial response timestamp
  };

  /**
   * Handles LLM response streaming chunks.
   * Only records if `recordStreaming` option is enabled.
   * Currently a no-op placeholder for future enhancement.
   */
  const defaultDebugLlmResponseProcessHandler: EventHandler = (taskId, message, agentContext) => {
    if (!opts?.recordStreaming) return;
    const rec = taskMap.get(taskId);
    if (!rec) return;
    // Future: Could create event observations for streaming deltas
  };

  /**
   * Handles tool execution streaming output.
   * Only records if `recordStreaming` option is enabled.
   * Currently a no-op placeholder for future enhancement.
   */
  const defaultDebugToolCallProcessHandler: EventHandler = (taskId, message, agentContext) => {
    if (!opts?.recordStreaming) return;
    const rec = taskMap.get(taskId);
    if (!rec) return;
    // Future: Could create event observations for tool progress
  };

  // ========== Event Handler Mapping ==========

  /**
   * Registry of default event handlers.
   * Maps each DebugEventType to its corresponding handler function.
   * 
   * ⭐ RECOMMENDED ENTRY POINT FOR UNDERSTANDING THE CALLBACK FLOW ⭐
   * 
   * All debug events flow through `onMessage()` which dispatches to
   * these handlers based on event type. Custom handlers can intercept
   * and optionally bypass these defaults.
   */
  const defaultEventHandlers: Record<DebugEventType, EventHandler> = {
    // Task-level events
    'debug_task_start': defaultDebugTaskStartHandler,
    'debug_task_finished': defaultDebugTaskFinishedHandler,
    // Planning events
    'debug_plan_start': defaultDebugPlanStartHandler,
    'debug_plan_process': defaultDebugPlanProcessHandler,
    'debug_plan_finished': defaultDebugPlanFinishedHandler,
    // Workflow execution events
    'debug_workflow_start': defaultDebugWorkflowStartHandler,
    'debug_workflow_finished': defaultDebugWorkflowFinishedHandler,
    // Agent-level events
    'debug_agent_start': defaultDebugAgentStartHandler,
    'debug_agent_process': defaultDebugAgentProcessHandler,
    'debug_agent_finished': defaultDebugAgentFinishedHandler,
    // LLM interaction events
    'debug_llm_request_start': defaultDebugLlmRequestStartHandler,
    'debug_llm_response_start': defaultDebugLlmResponseStartHandler,
    'debug_llm_response_process': defaultDebugLlmResponseProcessHandler,
    'debug_llm_response_finished': defaultDebugLlmResponseFinishedHandler,
    // Tool-call events
    'debug_tool_call_start': defaultDebugToolCallStartHandler,
    'debug_tool_call_process': defaultDebugToolCallProcessHandler,
    'debug_tool_call_finished': defaultDebugToolCallFinishedHandler,
  };

  /**
   * Bypass permission registry.
   * Defines which event types allow custom handlers to skip default processing.
   * 
   * Design rationale:
   * - **Structural events (false)**: Task, workflow, agent, tool lifecycle events
   *   are critical for maintaining proper trace hierarchy. Their default handlers
   *   MUST execute to ensure span creation/cleanup happens correctly.
   * 
   * - **Leaf events (true)**: LLM streaming events are leaf observations that
   *   don't affect hierarchy. Users can safely replace these with custom logic
   *   (e.g., custom token counting, alternate streaming sinks).
   * 
   * Security note: Even if a custom handler sets `bypassDefault: true`, the
   * bypass only takes effect if this registry permits it for that event type.
   */
  const couldbeBypass: Record<string, boolean> = {
    // Task-level events - MUST NOT bypass (trace root creation/cleanup)
    'debug_task_start': false,
    'debug_task_finished': false,
    
    // Planning events - MUST NOT bypass (planner span lifecycle)
    'debug_plan_start': false,
    'debug_plan_process': false,
    'debug_plan_finished': false,
    
    // Workflow execution events - MUST NOT bypass (workflow span lifecycle)
    'debug_workflow_start': false,
    'debug_workflow_finished': false,
    
    // Agent-level events - MUST NOT bypass (agent span lifecycle + stack management)
    'debug_agent_start': false,
    'debug_agent_process': false,
    'debug_agent_finished': false,
    
    // LLM interaction events - CAN bypass (leaf observations, no hierarchy impact)
    'debug_llm_request_start': true,
    'debug_llm_response_start': true,
    'debug_llm_response_process': true,
    'debug_llm_response_finished': true,
    
    // Tool-call events - MUST NOT bypass (tool span lifecycle + stack management)
    'debug_tool_call_start': false,
    'debug_tool_call_process': false,
    'debug_tool_call_finished': false,
  };

  /**
   * Main event dispatcher.
   * Receives all debug events and routes them to appropriate handlers.
   * 
   * Execution flow:
   * 1. Validate event (must have taskId and type)
   * 2. Lookup default handler for event type
   * 3. Execute custom handler (if provided) - ALWAYS runs
   * 4. Check bypass conditions:
   *    - Custom handler has `bypassDefault: true` AND
   *    - Event type permits bypass (`couldbeBypass[type] === true`)
   * 5. Execute default handler (unless bypassed)
   * 
   * This design ensures:
   * - Custom handlers always execute (for augmentation/logging)
   * - Critical trace structure is maintained (bypass protection)
   * - Users can fully customize leaf events (LLM streaming)
   * 
   * @param message - Debug event message from Eko core
   * @param agentContext - Current agent execution context (optional)
   */
  async function onMessage(
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ): Promise<void> {
    // Early return if tracing is disabled
    if (!enabled) return;
    
    // Extract event metadata
    const { taskId, type } = message as any;
    if (!taskId || !type) return;

    // Lookup default handler
    const defaultHandler = defaultEventHandlers[type as DebugEventType];
    if (!defaultHandler) return;

    let spanContext: LangfuseSpanContext | undefined;
    let rec = taskMap.get(taskId);
    if (!rec && type !== 'debug_task_start') {
      const ensured = ensureRoot(taskId);
      if (ensured) {
        rec = ensured;
      }
    }
    if (rec) {
      spanContext = createSpanContextAccessor(rec, message, agentContext);
    }

    // Execute custom handler (if exists) - ALWAYS runs
    const customHandler = customEventHandler?.[type as DebugEventType];
    if (customHandler?.handle) {
      await customHandler.handle(message, agentContext, spanContext);
    }

    // Check bypass conditions (both must be true)
    const shouldBypassDefault = 
      customHandler?.bypassDefault === true &&  // Custom wants to bypass
      couldbeBypass[type as string] === true;   // Event type allows bypass

    // Execute default handler (unless bypassed)
    if (!shouldBypassDefault) {
      defaultHandler(taskId, message, agentContext);
    }
  }

  return { onMessage };
}
