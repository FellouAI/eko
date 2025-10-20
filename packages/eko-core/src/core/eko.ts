/**
 * Eko core engine
 *
 * Implements the core execution engine: workflow generation, execution, and
 * lifecycle management. Eko is an LLM-based intelligent agent orchestration
 * framework for complex task automation.
 *
 * Key concepts:
 * - Agent: entity that executes tasks with tools and capabilities
 * - Workflow: task execution plan composed of multiple agents with deps
 * - Context: execution-time environment incl. variables and config
 * - Chain: execution history and intermediate results
 *
 * Components:
 * - Eko: main engine for generation, execution, and management
 * - Planner: workflow planner
 * - Context: task context manager
 * - Agent: agent base class
 * - Chain: chain manager
 */

import config from "../config";
import Context from "./context";
import { Agent } from "../agent";
import { Planner } from "./plan";
import Log from "../common/log";
import Chain, { AgentChain } from "./chain";
import { buildAgentTree } from "../common/tree";
import { mergeAgents, uuidv4 } from "../common/utils";
import { createCallbackHelper } from "../common/callback-helper";
import {
  EkoConfig,
  EkoResult,
  Workflow,
  NormalAgentNode,
  WorkflowAgent,
} from "../types/core.types";
import { composeCallbacks } from "../common/compose-callbacks";
import { createLangfuseCallback } from "../trace/langfuse-integration";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { initTracing } from "../trace/init-tracing";
import { checkTaskReplan, replanWorkflow } from "./replan";

/**
 * Eko main engine class
 *
 * Manages the full task-execution lifecycle. Each instance maintains a task
 * map to manage multiple tasks concurrently.
 *
 * Responsibilities:
 * 1) generate: build workflow from user input
 * 2) execute: run a generated workflow
 * 3) modify: update an existing workflow
 * 4) task management: pause, resume, abort
 * 5) context management
 */
export class Eko {
  /** Eko configuration (LLMs, agents, callbacks, etc.) */
  protected config: EkoConfig;

  /** Task map: key=taskId, value=context */
  protected taskMap: Map<string, Context>;
  
  /** Tracing initialization flag (lazy init) */
  private tracingInitialized = false;

  /**
   * Constructor
   * @param config Eko configuration object
   */
  constructor(config: EkoConfig) {
    this.config = config;
    this.taskMap = new Map();
  }
  
  /**
   * Lazy initialize tracing system (called before first task)
   * @private
   */
  private ensureTracingInitialized(): void {
    if (this.tracingInitialized || !this.config.enable_langfuse) {
      return;
    }

    // Initialize tracing
    const { provider } = initTracing({
      endpoint: this.config.langfuse_options?.endpoint || "https://localhost:8001/api/span-forward/ingest",
      serviceName: this.config.langfuse_options?.serviceName || "eko-service",
      serviceVersion: this.config.langfuse_options?.serviceVersion || "1.0.0",
      useSendBeacon: true,
      batchBytesLimit: 800_000,
      autoFlush: this.config.langfuse_options?.autoFlush === true,
    });

    // Set global tracer provider
    setLangfuseTracerProvider(provider);
    
    // Compose langfuse callback into existing callback chain
    // Note: The external traceId from contextParams.traceId will be used as sessionId
    // in Langfuse (see langfuse-integration.ts ensureRoot function)
    this.config.callback = composeCallbacks(
      this.config.callback,
      createLangfuseCallback({
        enabled: this.config.enable_langfuse,
        recordStreaming: this.config.langfuse_options?.recordStreaming === true,
        eventHandler: this.config.langfuse_options?.eventHandler,
      })
    );
    
    this.tracingInitialized = true;
  }

  /**
   * Generate workflow from a task prompt
   *
   * @param taskPrompt User task description
   * @param taskId Optional task id (UUID generated if absent)
   * @param contextParams Extra context params
   * @returns Workflow
   * @throws On failure, cleans up and rethrows
   */
  public async generate(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<Workflow> {
    // Lazy initialize tracing system (only once)
    // Note: contextParams.traceId will be used as Langfuse sessionId automatically
    this.ensureTracingInitialized();
    
    // Fetch agents from config and copy to avoid mutating original
    const agents = [...(this.config.agents || [])];

    // Create chain to record execution history and intermediates
    const chain: Chain = new Chain(taskPrompt);

    // Create task context with id, config, agents, chain
    const context = new Context(taskId, this.config, agents, chain);

    // Apply provided context params
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }

    try {
      // Store context in task map
      this.taskMap.set(taskId, context);

      // If A2A client configured, merge external agents
      if (this.config.a2aClient) {
        const a2aList = await this.config.a2aClient.listAgents(taskPrompt);
        context.agents = mergeAgents(context.agents, a2aList);
      }

      // Use planner to generate workflow from prompt
      const planner = new Planner(context);

      // NEW CALLBACK: send task start info
      const taskStartCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      await taskStartCbHelper.taskStart(taskPrompt, contextParams, context as any);

      context.workflow = await planner.plan(taskPrompt);

      // Return workflow
      return context.workflow;
    } catch (e) {
      // NEW CALLBACK: send task error info
      const taskErrorCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      // Cleanup and rethrow on error
      this.deleteTask(taskId);
      // NEW CALLBACK: send task error info
      await taskErrorCbHelper.taskFinished(
        false,
        `Task Failed at generate state\nError: ${
          e instanceof Error ? e.message : String(e)
        }`,
        e,
        "error",
        context as any
      );
      throw e;
    }
  }

  /**
   * Modify an existing task's workflow
   *
   * @param taskId Task ID
   * @param modifyTaskPrompt New prompt
   * @returns Updated workflow
   */
  public async modify(
    taskId: string,
    modifyTaskPrompt: string
  ): Promise<Workflow> {
    // Get existing task context
    const context = this.taskMap.get(taskId);

    // If context missing, create new task
    if (!context) {
      return await this.generate(modifyTaskPrompt, taskId);
    }

    // If A2A configured, refresh and merge external agents
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
      context.agents = mergeAgents(context.agents, a2aList);
    }

    // Replan based on existing execution history
    const planner = new Planner(context);
    context.workflow = await planner.replan(modifyTaskPrompt);

    return context.workflow;
  }

  /**
   * Execute a task
   *
   * @param taskId Task ID
   * @returns EkoResult with success, reason, and result
   */
  public async execute(taskId: string): Promise<EkoResult> {
    // Get task context
    const context = this.getTask(taskId);

    // Ensure task exists
    if (!context) {
      throw new Error("The task does not exist");
    }

    // CALLBACK: create callback helper

    // Resume if paused
    if (context.pause) {
      context.setPause(false);
    }
    if (context.controller.signal.aborted) {
      context.reset();
    }
    context.conversation = [];

    try {
      // Execute workflow
      const result = await this.doRunWorkflow(context);

      const taskEndCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );

      // Send task finished event
      await taskEndCbHelper.taskFinished(
        result.success,
        result.result,
        result.error,
        result.stopReason,
        context as any
      );

      return result;
    } catch (e: any) {
      // Log execution error
      Log.error("execute error", e);

      const taskErrorCbHelper = createCallbackHelper(
        this.config.callback,
        taskId,
        "Task"
      );
      // Send task failure event
      await taskErrorCbHelper.taskFinished(
        false,
        e ? e.name + ": " + e.message : "Error",
        e,
        e?.name == "AbortError" ? "abort" : "error",
        context as any
      );

      // Return error result
      return {
        taskId,
        success: false,
        stopReason: e?.name == "AbortError" ? "abort" : "error",
        result: e ? e.name + ": " + e.message : "Error",
        error: e,
      };
    }
  }

  /**
   * Run a task (generate + execute)
   */
  public async run(
    taskPrompt: string,
    taskId: string = uuidv4(),
    contextParams?: Record<string, any>
  ): Promise<EkoResult> {

    // First generate workflow
    await this.generate(taskPrompt, taskId, contextParams);

    // Then execute workflow
    return await this.execute(taskId);
  }

  /**
   * Initialize context from an existing workflow
   */
  public async initContext(
    workflow: Workflow,
    contextParams?: Record<string, any>
  ): Promise<Context> {
    // Fetch configured agents
    const agents = this.config.agents || [];

    // Create chain with workflow prompt or name
    const chain: Chain = new Chain(workflow.taskPrompt || workflow.name);

    // Create context
    const context = new Context(workflow.taskId, this.config, agents, chain);

    // Merge external agents from A2A if configured
    if (this.config.a2aClient) {
      const a2aList = await this.config.a2aClient.listAgents(
        workflow.taskPrompt || workflow.name
      );
      context.agents = mergeAgents(context.agents, a2aList);
    }

    // Apply extra context params
    if (contextParams) {
      Object.keys(contextParams).forEach((key) =>
        context.variables.set(key, contextParams[key])
      );
    }

    // Bind workflow to context
    context.workflow = workflow;

    // Register context to task map
    this.taskMap.set(workflow.taskId, context);

    return context;
  }

  /**
   * Execute workflow (private)
   *
   * @param context Context with workflow and environment
   * @returns Result
   * @private
   */
  private async doRunWorkflow(context: Context): Promise<EkoResult> {
    // Fetch agents and workflow
    const agents = context.agents as Agent[];
    const workflow = context.workflow as Workflow;

    // Validate workflow
    if (!workflow || workflow.agents.length == 0) {
      throw new Error("Workflow error");
    }

    // Create callback helper
    const workflowExecutorCbHelper = createCallbackHelper(
      this.config.callback,
      context.taskId,
      "WorkflowExecutor"
    );

    // Build agent name -> instance map
    const agentNameMap = agents.reduce((map, item) => {
      map[item.Name] = item;
      return map;
    }, {} as { [key: string]: Agent });

    // Build agent tree with dependencies handled
    let agentTree = buildAgentTree(workflow.agents);

    // CALLBACK: workflow start
    await workflowExecutorCbHelper.workflowStart(workflow, agentTree);

    // Accumulate all agent results
    const results: string[] = [];

    // Main execution loop: traverse agent tree
    while (true) {
      // Check abort
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

        // Create agent chain
        const agentChain = new AgentChain(agentNode);

        // Push chain into context
        context.chain.push(agentChain);

        // Run agent and obtain result
        agentTree.result = await this.runAgent(
          context,
          agent,
          agentTree,
          agentChain
        );

        // Push result
        results.push(agentTree.result);
      } else if (agentTree.type === "parallel" && agentTree.agents.every((agent) => agent.agent.status === "init")) {
        // Parallel-agents branch

        const parallelAgents = agentTree.agents;

        // Single-agent runner
        const doRunAgent = async (
          agentNode: NormalAgentNode,
          index: number
        ) => {
          // Lookup agent instance
          const agent = agentNameMap[agentNode.agent.name];
          if (!agent) {
            throw new Error("Unknown Agent: " + agentNode.agent.name);
          }
          lastAgent = agent;
          const agentChain = new AgentChain(agentNode.agent);
          context.chain.push(agentChain);

          // Execute agent
          const result = await this.runAgent(
            context,
            agent,
            agentNode,
            agentChain
          );

          return { result: result, agentChain, index };
        };

        // Store parallel results
        let agent_results: string[] = [];

        // Get parallel execution config
        let agentParallel = context.variables.get("agentParallel");
        if (agentParallel === undefined) {
          agentParallel = config.agentParallel;
        }

        if (agentParallel) {
          // Parallel execution

          // Execute in parallel
          const parallelResults = await Promise.all(
            parallelAgents.map((agent, index) => doRunAgent(agent, index))
          );

          // Sort by index to preserve order
          parallelResults.sort((a, b) => a.index - b.index);

          // Push chains into context
          parallelResults.forEach(({ agentChain }) => {
            context.chain.push(agentChain);
          });

          // Extract results
          agent_results = parallelResults.map(({ result }) => result);
        } else {
          // Serial execution

          // Run each agent in sequence
          for (let i = 0; i < parallelAgents.length; i++) {
            const { result, agentChain } = await doRunAgent(
              parallelAgents[i],
              i
            );
            context.chain.push(agentChain);
            agent_results.push(result);
          }
        }

        // Merge parallel results
        results.push(agent_results.join("\n\n"));
      }

      // Clear conversation for next agent
      context.conversation.splice(0, context.conversation.length);
      if (
        config.expertMode &&
        !workflow.modified &&
        agentTree.nextAgent &&
        lastAgent?.AgentContext &&
        (await checkTaskReplan(lastAgent.AgentContext))
      ) {
        // replan
        await replanWorkflow(lastAgent.AgentContext);
      }
      if (workflow.modified) {
        // Reset flag
        workflow.modified = false;

        // Rebuild execution tree with remaining init agents
        agentTree = buildAgentTree(
          workflow.agents.filter((agent) => agent.status == "init")
        );

        // Continue loop
        continue;
      }

      // Check if there's next agent
      if (!agentTree.nextAgent) {
        break;
      }

      // Move to next
      agentTree = agentTree.nextAgent;
    }

    // Send workflow finished
    const finalResult = results[results.length - 1] || "";
    await workflowExecutorCbHelper.workflowFinished(results, finalResult, context as any);

    // Return success
    return {
      success: true,
      stopReason: "done",
      taskId: context.taskId,
      result: finalResult,
    };
  }

  /**
   * Run a single agent
   *
   * @protected
   */
  protected async runAgent(
    context: Context,
    agent: Agent,
    agentNode: NormalAgentNode,
    agentChain: AgentChain
  ): Promise<string> {
    const startTime = Date.now();
    let toolCallCount = 0;

    // Create agent-specific callback helper
    const runAgentNodeCbHelper = createCallbackHelper(
      this.config.callback,
      context.taskId,
      agentNode.agent.name,
      agentNode.agent.id
    );

    try {
      // Set agent status
      agentNode.agent.status = "running";

      // Send new agent start event
      await runAgentNodeCbHelper.agentNodeStart(
        agentNode,
        (agentNode.agent as WorkflowAgent).task || "",
        context as any
      );
      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage({
          taskId: context.taskId,
          agentName: agentNode.agent.name,
          nodeId: agentNode.agent.id,
          type: "agent_start",
          agentNode: agentNode.agent,
          requirements: (agentNode.agent as any).requirement || "",
        } as any));

      // Execute and get result
      agentNode.result = await agent.run(context, agentChain);

      // Set status to done
      agentNode.agent.status = "done";

      // Compute stats
      const duration = Date.now() - startTime;
      // Get tool-call count from chain
      toolCallCount = agentChain.tools.length;

      // Send new agent finished event
      await runAgentNodeCbHelper.agentNodeFinished(
        agentNode, 
        agentNode.result, {
          loopCount: 0, // TODO: get from agent when available
          toolCallCount,
          duration,
      }, undefined, context as any);
      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            result: agentNode.result,
          },
          agent.AgentContext
        ));

      // Return result
      return agentNode.result;
    } catch (e) {
      // Set status to error
      agentNode.agent.status = "error";

      // Compute stats
      const duration = Date.now() - startTime;
      toolCallCount = agentChain.tools.length;

      const runAgentErrorCbHelper = runAgentNodeCbHelper.createChildHelper(agentNode.agent.name);

      // Send new agent failed event
      await runAgentErrorCbHelper.agentNodeFinished(
        agentNode,
        "",
        {
          loopCount: 0,
          toolCallCount,
          duration,
        },
        `runAgent error: ${e instanceof Error ? e.message : String(e)}`,
        context as any
      );

      // OLD VERSION CALLBACK
      this.config.callback &&
        (await this.config.callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentNode.agent.name,
            nodeId: agentNode.agent.id,
            type: "agent_result",
            agentNode: agentNode.agent,
            error: e,
          },
          agent.AgentContext
        ));

      // Rethrow
      throw e;
    }
  }

  /**
   * Get task context by id
   */
  public getTask(taskId: string): Context | undefined {
    return this.taskMap.get(taskId);
  }

  /**
   * Get all task ids
   */
  public getAllTaskId(): string[] {
    return [...this.taskMap.keys()];
  }

  /**
   * Delete a task
   */
  public deleteTask(taskId: string): boolean {
    // Abort task first
    this.abortTask(taskId);

    // Get context
    const context = this.taskMap.get(taskId);
    if (context) {
      // Clear variables
      context.variables.clear();
    }

    // Remove from task map
    return this.taskMap.delete(taskId);
  }

  /**
   * Abort a task
   */
  public abortTask(taskId: string, reason?: string): boolean {
    // Get task context
    let context = this.taskMap.get(taskId);
    if (context) {
      // Clear pause
      context.setPause(false);

      // Notify agent status
      this.onTaskStatus(context, "abort", reason);

      // Abort controller
      context.controller.abort(reason);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Pause or resume a task
   */
  public pauseTask(
    taskId: string,
    pause: boolean,
    abortCurrentStep?: boolean,
    reason?: string
  ): boolean {
    // Get task context
    const context = this.taskMap.get(taskId);
    if (context) {
      // Notify agent status change
      this.onTaskStatus(context, pause ? "pause" : "resume-pause", reason);

      // Set pause
      context.setPause(pause, abortCurrentStep);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Append a chat message to a task
   */
  public chatTask(taskId: string, userPrompt: string): string[] | undefined {
    // Get task context
    const context = this.taskMap.get(taskId);
    if (context) {
      // Append to conversation
      context.conversation.push(userPrompt);
      return context.conversation;
    }
  }

  /**
   * Add an agent to configuration
   */
  public addAgent(agent: Agent): void {
    // Ensure agents array exists
    this.config.agents = this.config.agents || [];

    // Add agent into config
    this.config.agents.push(agent);
  }

  /**
   * Notify current agent about task status change
   * @private
   */
  private async onTaskStatus(
    context: Context,
    status: string,
    reason?: string
  ) {
    // Get current executing agent
    const [agent] = context.currentAgent() || [];
    if (agent) {
      // Get onTaskStatus method
      const onTaskStatus = (agent as any)["onTaskStatus"];
      if (onTaskStatus) {
        // Call it
        await onTaskStatus.call(agent, status, reason);
      }
    }
  }
}
