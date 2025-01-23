import { WorkflowGenerator } from '../services/workflow/generator';
import { ClaudeProvider } from '../services/llm/claude-provider';
import { OpenaiProvider } from '../services/llm/openai-provider';
import {
  LLMConfig,
  EkoInvokeParam,
  LLMProvider,
  Tool,
  Workflow,
  ClaudeConfig,
  OpenaiConfig,
  WorkflowCallback,
  NodeOutput,
  ExecutionContext,
  EkoConfig,
} from '../types';
import { ToolRegistry } from './tool-registry';

/**
 * Eko core
 */
export class Eko {
  public static tools: Map<string, Tool<any, any>> = new Map();

  private llmProvider: LLMProvider;
  private toolRegistry = new ToolRegistry();
  private workflowGeneratorMap = new Map<Workflow, WorkflowGenerator>();
  private ekoConfig: EkoConfig;

  constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig) {
    console.log("ekoConfig: " + ekoConfig);
    this.ekoConfig = ekoConfig ? ekoConfig : {
      alwaysOpenNewWindow: false,
    };
    if (typeof llmConfig == 'string') {
      this.llmProvider = new ClaudeProvider(llmConfig);
    } else if ('llm' in llmConfig) {
      if (llmConfig.llm == 'claude') {
        let claudeConfig = llmConfig as ClaudeConfig;
        this.llmProvider = new ClaudeProvider(
          claudeConfig.apiKey,
          claudeConfig.modelName,
          claudeConfig.options
        );
      } else if (llmConfig.llm == 'openai') {
        let openaiConfig = llmConfig as OpenaiConfig;
        this.llmProvider = new OpenaiProvider(
          openaiConfig.apiKey,
          openaiConfig.modelName,
          openaiConfig.options
        );
      } else {
        throw new Error('Unknown parameter: llm > ' + llmConfig['llm']);
      }
    } else {
      this.llmProvider = llmConfig as LLMProvider;
    }
    Eko.tools.forEach((tool) => this.toolRegistry.registerTool(tool));
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
    const workflow = await generator.generateWorkflow(prompt);
    this.workflowGeneratorMap.set(workflow, generator);
    return workflow;
  }

  public async execute(workflow: Workflow, callback?: WorkflowCallback): Promise<NodeOutput[]> {
    return await workflow.execute(callback);
  }

  public async modify(workflow: Workflow, prompt: string): Promise<Workflow> {
    const generator = this.workflowGeneratorMap.get(workflow) as WorkflowGenerator;
    workflow = await generator.modifyWorkflow(prompt);
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
