import { LLMProviderFactory } from '../services/llm/provider-factory';
import { WorkflowGenerator } from '../services/workflow/generator';
import {
  LLMConfig,
  EkoConfig,
  EkoInvokeParam,
  LLMProvider,
  Tool,
  Workflow,
  WorkflowCallback,
  NodeOutput,
  ExecutionContext,
} from '../types';
import { ToolRegistry } from './tool-registry';

/**
 * Eko core
 */
export class Eko {
  public static tools: Map<string, Tool<any, any>> = new Map();

  private llmProvider: LLMProvider;
  private ekoConfig: EkoConfig;
  private toolRegistry = new ToolRegistry();
  private workflowGeneratorMap = new Map<Workflow, WorkflowGenerator>();

  constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig) {
    this.llmProvider = LLMProviderFactory.buildLLMProvider(llmConfig);
    
    if (ekoConfig) {
      this.ekoConfig = ekoConfig;
    } else {
      console.warn("`ekoConfig` is missing when construct `Eko` instance, default to `{}`");
      this.ekoConfig = {};
    }
    
    this.registerTools();
  }

  private registerTools() {
    let tools = Array.from(Eko.tools.entries()).map(([_key, tool]) => tool);

    // filter human tools by callbacks
    const callback = this.ekoConfig.callback;
    if (callback) {
      const hooks = callback.hooks;

      // these tools could not work without corresponding hook
      const tool2isHookExists: { [key: string]: boolean } = {
        "human_input_text": Boolean(hooks.onHumanInputText),
        "human_input_single_choice": Boolean(hooks.onHumanInputSingleChoice),
        "human_input_multiple_choice": Boolean(hooks.onHumanInputMultipleChoice),
        "human_operate": Boolean(hooks.onHumanOperate),
      };
      tools = tools.filter(tool => {
        if (tool.name in tool2isHookExists) {
          let isHookExists = tool2isHookExists[tool.name]
          return isHookExists;
        } else {
          return true;
        }
      });
    } else {
      console.warn("`ekoConfig.callback` is missing when construct `Eko` instance.")
    }
    
    tools.forEach(tool => this.toolRegistry.registerTool(tool));
  }

  public async generate(prompt: string, param?: EkoInvokeParam): Promise<Workflow> {
    let toolRegistry = this.toolRegistry;
    if (param && param.tools && param.tools.length > 0) {
      toolRegistry = new ToolRegistry();
      for (let i = 0; i < param.tools.length; i++) {
        let tool = param.tools[i];
        if (typeof tool == 'string') {
          toolRegistry.registerTool(this.getTool(tool));
        } else {
          toolRegistry.registerTool(tool);
        }
      }
    }
    const generator = new WorkflowGenerator(this.llmProvider, toolRegistry);
    const workflow = await generator.generateWorkflow(prompt, this.ekoConfig);
    this.workflowGeneratorMap.set(workflow, generator);
    return workflow;
  }

  public async execute(workflow: Workflow): Promise<NodeOutput[]> {
    // Inject LLM provider at workflow level
    workflow.llmProvider = this.llmProvider;

    // Process each node's action
    for (const node of workflow.nodes) {
      if (node.action.type === 'prompt') {
        // Inject LLM provider
        node.action.llmProvider = this.llmProvider;

        // Resolve tools
        node.action.tools = node.action.tools.map(tool => {
          if (typeof tool === 'string') {
            return this.toolRegistry.getTool(tool);
          }
          return tool;
        });
      }
    }

    return await workflow.execute(this.ekoConfig.callback);
  }

  public async cancel(workflow: Workflow): Promise<void> {
    return await workflow.cancel();
  }


  public async modify(workflow: Workflow, prompt: string): Promise<Workflow> {
    const generator = this.workflowGeneratorMap.get(workflow) as WorkflowGenerator;
    workflow = await generator.modifyWorkflow(prompt, this.ekoConfig);
    this.workflowGeneratorMap.set(workflow, generator);
    return workflow;
  }

  private getTool(toolName: string) {
    let tool: Tool<any, any>;
    if (this.toolRegistry.hasTools([toolName])) {
      tool = this.toolRegistry.getTool(toolName);
    } else if (Eko.tools.has(toolName)) {
      tool = Eko.tools.get(toolName) as Tool<any, any>;
    } else {
      throw new Error(`Tool with name ${toolName} not found`);
    }
    return tool;
  }

  public async callTool(toolName: string, input: object, callback?: WorkflowCallback): Promise<any>;
  public async callTool(
    tool: Tool<any, any>,
    input: object,
    callback?: WorkflowCallback
  ): Promise<any>;

  public async callTool(
    tool: Tool<any, any> | string,
    input: object,
    callback?: WorkflowCallback
  ): Promise<any> {
    if (typeof tool === 'string') {
      tool = this.getTool(tool);
    }
    let context: ExecutionContext = {
      llmProvider: this.llmProvider,
      ekoConfig: this.ekoConfig,
      variables: new Map<string, unknown>(),
      tools: new Map<string, Tool<any, any>>(),
      callback,
    };
    let result = await tool.execute(context, input);
    if (tool.destroy) {
      tool.destroy(context);
    }
    return result;
  }

  public registerTool(tool: Tool<any, any>): void {
    this.toolRegistry.registerTool(tool);
  }

  public unregisterTool(toolName: string): void {
    this.toolRegistry.unregisterTool(toolName);
  }
}

export default Eko;
