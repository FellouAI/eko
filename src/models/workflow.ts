import { ExecutionLogger, LogOptions } from "@/utils/execution-logger";
import { Workflow, WorkflowNode, NodeInput, ExecutionContext, LLMProvider, WorkflowCallback } from "../types";
import { EkoConfig, WorkflowResult } from "../types/eko.types";

export class WorkflowImpl implements Workflow {
  abort?: boolean;
  private logger?: ExecutionLogger;
  abortControllers: Map<string, AbortController> = new Map<string, AbortController>();

  constructor(
    public id: string,
    public name: string,
    private ekoConfig: EkoConfig,
    public description?: string,
    public nodes: WorkflowNode[] = [],
    public variables: Map<string, unknown> = new Map(),
    public llmProvider?: LLMProvider,
    loggerOptions?: LogOptions
  ) {
    if (loggerOptions) {
      this.logger = new ExecutionLogger(loggerOptions);
    }
  }

  setLogger(logger: ExecutionLogger) {
    this.logger = logger;
  }

  async cancel(): Promise<void> {
    this.abort = true;
    for (const controller of this.abortControllers.values()) {
      controller.abort("Workflow cancelled");
    }
  }

  async execute(callback?: WorkflowCallback): Promise<WorkflowResult> {
    if (!this.validateDAG()) {
      throw new Error("Invalid workflow: Contains circular dependencies");
    }
    this.abort = false;

    callback && await callback.hooks.beforeWorkflow?.(this);

    const executed = new Set<string>();
    const executing = new Set<string>();

    const executeNode = async (nodeId: string): Promise<void> => {
      if (this.abort) {
        throw new Error("Abort");
      }
      if (executed.has(nodeId)) {
        return;
      }

      if (executing.has(nodeId)) {
        throw new Error(`Circular dependency detected at node: ${nodeId}`);
      }

      const node = this.getNode(nodeId);
      const abortController = new AbortController();
      this.abortControllers.set(nodeId, abortController);

      // Execute the node's action
      const context: ExecutionContext = {
        __skip: false,
        __abort: false,
        workflow: this,
        variables: this.variables,
        llmProvider: this.llmProvider as LLMProvider,
        ekoConfig: this.ekoConfig,
        tools: new Map(node.action.tools.map(tool => [tool.name, tool])),
        callback,
        logger: this.logger,
        next: () => context.__skip = true,
        abortAll: () => {
          this.abort = context.__abort = true;
          // Abort all running tasks
          for (const controller of this.abortControllers.values()) {
            controller.abort("Workflow cancelled");
          }
        },
        signal: abortController.signal
      };

      executing.add(nodeId);
      // Execute dependencies first
      for (const depId of node.dependencies) {
        await executeNode(depId);
      }

      // Prepare input by gathering outputs from dependencies
      const input: NodeInput = { items: [] };
      for (const depId of node.dependencies) {
        const depNode = this.getNode(depId);
        input.items.push(depNode.output);
      }
      node.input = input;

      // Run pre-execution hooks and execute action
      callback && await callback.hooks.beforeSubtask?.(node, context);

      if (context.__abort) {
        throw new Error("Abort");
      } else if (context.__skip) {
        return;
      }

      node.output.value = await node.action.execute(node.input, node.output, context);

      executing.delete(nodeId);
      executed.add(nodeId);

      callback && await callback.hooks.afterSubtask?.(node, context, node.output?.value);
    };

    // Execute all terminal nodes (nodes with no dependents)
    const terminalNodes = this.nodes.filter(node =>
      !this.nodes.some(n => n.dependencies.includes(node.id))
    );

    await Promise.all(terminalNodes.map(node => executeNode(node.id)));

    callback && await callback.hooks.afterWorkflow?.(this, this.variables);

    let node_outputs = terminalNodes.map(node => node.output);
    
    // Special context variables
    console.log("debug special context variables...");
    const workflowIsSuccessful = this.variables.get("workflow_is_successful");
    console.log(workflowIsSuccessful);
    const workflowSummary = this.variables.get("workflow_summary");
    console.log(workflowSummary);
    const workflowTranscript = this.variables.get("workflow_transcript");
    console.log(workflowTranscript);

    return {
      isSuccessful: workflowIsSuccessful as boolean,
      summary: workflowSummary as string,
      payload: workflowTranscript as string,
    };
  }

  addNode(node: WorkflowNode): void {
    if (this.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }
    this.nodes.push(node);
  }

  removeNode(nodeId: string): void {
    const index = this.nodes.findIndex(n => n.id === nodeId);
    if (index === -1) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    // Check if any nodes depend on this one
    const dependentNodes = this.nodes.filter(n =>
      n.dependencies.includes(nodeId)
    );
    if (dependentNodes.length > 0) {
      throw new Error(
        `Cannot remove node ${nodeId}: Nodes ${dependentNodes.map(n => n.id).join(", ")} depend on it`
      );
    }

    this.nodes.splice(index, 1);
  }

  getNode(nodeId: string): WorkflowNode {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node with id ${nodeId} not found`);
    }
    return node;
  }

  validateDAG(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.getNode(nodeId);
      for (const depId of node.dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    return !this.nodes.some(node => hasCycle(node.id));
  }
}
