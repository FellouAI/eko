import { LLMProvider, LLMParameters, Message } from '../../types/llm.types';
import { Workflow } from '../../types/workflow.types';
import { WorkflowImpl } from '../../models/workflow';
import { ActionImpl } from '../../models/action';
import { ToolRegistry } from '../../core/tool-registry';
import { createWorkflowPrompts, createWorkflowGenerationTool } from './templates';
import { v4 as uuidv4 } from 'uuid';
import { EkoConfig } from '@/types';
import { logger } from '@/common/log';

export class WorkflowGenerator {
  message_history: Message[] = [];

  constructor(
    private llmProvider: LLMProvider,
    private toolRegistry: ToolRegistry
  ) {}

  async generateWorkflow(prompt: string, ekoConfig: EkoConfig): Promise<Workflow> {
    return this.doGenerateWorkflow(prompt, false, ekoConfig);
  }

  async generateWorkflowFromJson(json: any, ekoConfig: EkoConfig): Promise<Workflow> {
    return this.createWorkflowFromData(json, ekoConfig);
  }

  async modifyWorkflow(prompt: string, ekoConfig: EkoConfig): Promise<Workflow> {
    return this.doGenerateWorkflow(prompt, true, ekoConfig);
  }

  private async doGenerateWorkflow(prompt: string, modify: boolean, ekoConfig: EkoConfig): Promise<Workflow> {
    // Create prompts with current set of tools
    logger.debug("doGenerateWorkflow...");
    let retry_counter = 3;
    const prompts = createWorkflowPrompts(this.toolRegistry.getToolDefinitions());

    let messages: Message[] = [];
    if (modify) {
      messages = this.message_history;
      messages.push({
        role: 'user',
        content: prompts.modifyUserPrompt(prompt),
      });
    } else {
      messages = this.message_history = [
        {
          role: 'system',
          content: prompts.formatSystemPrompt(),
        },
        {
          role: 'user',
          content: prompts.formatUserPrompt(prompt),
        },
      ];
    }

    const params: LLMParameters = {
      temperature: 0.7,
      maxTokens: 8192,
      tools: [createWorkflowGenerationTool(this.toolRegistry)],
      toolChoice: { type: 'tool', name: 'generate_workflow' },
    };

    while(retry_counter > 0) {
      try {
        console.time('Workflow Generation Time'); // 开始计时
        const response = await this.llmProvider.generateText(messages, params);
        console.timeEnd('Workflow Generation Time'); // 结束计时并输出时间差
        logger.debug("generateText() done!");
    
        if (!response.toolCalls.length || !response.toolCalls[0].input.workflow) {
          messages.pop();
          throw new Error('Failed to generate workflow: Invalid response from LLM');
        }
    
        let workflowData = response.toolCalls[0].input.workflow as any;
    
        // debug
        if (typeof workflowData == "string") {
          logger.warn("workflowData is string, try to transform it into object...");
          logger.debug("workflowData string:", workflowData);
          workflowData = JSON.parse(workflowData);
        }
        logger.debug("Debug the workflow...", { ...workflowData});
    
    
        // Generate a new UUID if not provided
        if (!workflowData.id) {
          workflowData.id = uuidv4();
        }

        return this.createFastWorkflowFromData(workflowData, ekoConfig);
      } catch(e) {
        logger.warn("an error occured when generating workflow:", e);
        logger.info(`retry...${retry_counter}`);
        retry_counter -= 1;
      }
    }
    logger.error("cannot generate workflow with retry");
    throw Error("many errors occured when generating workflow");
  }

  private createWorkflowFromData(data: any, ekoConfig: EkoConfig): Workflow {
    const workflow = new WorkflowImpl(
      data.id,
      data.name,
      ekoConfig,
      data,
      data.description || '',
      [],
      new Map(Object.entries(data.variables || {})),
      this.llmProvider,
      {
        logLevel: 'info',
        includeTimestamp: true,
      }
    );

    // Add nodes to workflow
    if (Array.isArray(data.nodes)) {
      data.nodes.forEach((nodeData: any) => {
        const tools = nodeData.action.tools.filter((toolName: string) => {
          let hasTool = this.toolRegistry.hasTools([toolName]);
          if (!hasTool) {
            logger.warn(`The [${toolName}] tool does not exist.`);
          }
          return hasTool;
        }).map((toolName: string) =>
          this.toolRegistry.getTool(toolName)
        );

        const action = ActionImpl.createPromptAction(
          nodeData.action.name,
          nodeData.action.description,
          tools,
          this.llmProvider,
          { maxTokens: 8192 }
        );

        const node = {
          id: nodeData.id,
          name: nodeData.name || nodeData.id,
          input: nodeData.input || { type: 'any', schema: {}, value: undefined },
          output: nodeData.output || { type: 'any', schema: {}, value: undefined },
          action: action,
          dependencies: nodeData.dependencies || [],
        };
        workflow.addNode(node);
      });
    }

    return workflow;
  }

  private createFastWorkflowFromData(data: any, ekoConfig: EkoConfig): Workflow {
    const workflow = new WorkflowImpl(
      data.id,
      data.name,
      ekoConfig,
      data,
      data.description || '',
      [],
      new Map(Object.entries(data.variables || {})),
      this.llmProvider,
      {
        logLevel: 'info',
        includeTimestamp: true,
      }
    );

    // Add nodes to workflow
    if (Array.isArray(data.nodes)) {
      data.nodes.forEach((nodeData: any) => {

        const action = ActionImpl.createPromptAction(
          nodeData.action.name,
          nodeData.action.description,
          [this.toolRegistry.getTool('browser_use')],
          this.llmProvider,
          { maxTokens: 8192 }
        );

        const node = {
          id: nodeData.id,
          name: nodeData.name || nodeData.id,
          input: nodeData.input || { type: 'any', schema: {}, value: undefined },
          output: nodeData.output || { type: 'any', schema: {}, value: undefined },
          action: action,
          dependencies: nodeData.dependencies || [],
        };
        workflow.addNode(node);
      });
    }

    return workflow;
  }
}
