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
  ExecutionContext,
  WorkflowResult
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
  public prompt: string = "";
  public tabs: chrome.tabs.Tab[] = [];
  public workflow?: Workflow = undefined;

  constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig) {
    console.info("using Eko@" + process.env.COMMIT_HASH);
    console.warn("this version is POC, should not used for production");
    this.llmProvider = LLMProviderFactory.buildLLMProvider(llmConfig);
    this.ekoConfig = this.buildEkoConfig(ekoConfig);
    this.registerTools();
  }

  private buildEkoConfig(ekoConfig: Partial<EkoConfig> | undefined): EkoConfig {
    if (!ekoConfig) {
      console.warn("`ekoConfig` is missing when construct `Eko` instance");
    }
    const defaultEkoConfig: EkoConfig = {
      workingWindowId: undefined,
      chromeProxy: typeof chrome === 'undefined' ? undefined : chrome,
      callback: undefined,
    };
    return {
      ...defaultEkoConfig,
      ...ekoConfig,
    };
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

  public async generate(prompt: string, tabs: chrome.tabs.Tab[] = [], param?: EkoInvokeParam): Promise<Workflow> {
    this.prompt = prompt;
    this.tabs = tabs;
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
    console.log("the workflow returned by generate");
    console.log(workflow);
    this.workflow = workflow;
    return workflow;
  }

  public async execute(workflow: Workflow): Promise<WorkflowResult> {
    let prompt = this.prompt;
    const json = {
      "id": "workflow_id",
      "name": prompt,
      "description": prompt,
      "nodes": [
        {
          "id": "sub_task_id",
          "type": "action",
          "action": {
            "type": "prompt",
            "name": prompt,
            "description": prompt,
            "tools": [
              "browser_use",
              "cancel_workflow",
              "document_agent",
              "export_file",
              "extract_content",
              "open_url",
              "tab_management",
              "web_search",
              "human_input_text",
              "human_input_single_choice",
              "human_input_multiple_choice",
              "human_operate",
            ],
          },
          "dependencies": []
        },
      ],
    };
    console.log("debug the workflow...");
    console.log(json);
    console.log("debug the workflow...done");
    
    console.log("debug the LLMProvider...");
    console.log(this.llmProvider);
    console.log("debug the LLMProvider...done");
    
    const generator = new WorkflowGenerator(this.llmProvider, this.toolRegistry);  
    workflow = await generator.generateWorkflowFromJson(json, this.ekoConfig);
    this.workflow = workflow;

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

    const result = await workflow.execute(this.ekoConfig.callback);
    console.log(result);
    return result;
  }

  public async cancel(): Promise<void> {
    if (this.workflow) {
      return await this.workflow.cancel();
    } else {
      throw Error("`Eko` instance do not have a `workflow` member");
    }
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
