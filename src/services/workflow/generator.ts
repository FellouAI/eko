import { LLMProvider, LLMParameters, Message } from '../../types/llm.types';
import { Workflow } from '../../types/workflow.types';
import { WorkflowImpl } from '../../models/workflow';
import { ActionImpl } from '../../models/action';
import { ToolRegistry } from '../../core/tool-registry';
import { createWorkflowPrompts, createWorkflowGenerationTool } from './templates';
import { v4 as uuidv4 } from 'uuid';
import { EkoConfig } from '@/types';

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

    const response = await this.llmProvider.generateText(messages, params);

    if (!response.toolCalls.length || !response.toolCalls[0].input.workflow) {
      messages.pop();
      throw new Error('Failed to generate workflow: Invalid response from LLM');
    }

    messages.push(
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: response.toolCalls[0].id,
            name: response.toolCalls[0].name,
            input: response.toolCalls[0].input,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: response.toolCalls[0].id,
            content: 'ok',
          },
        ],
      }
    );

    const workflowData = response.toolCalls[0].input.workflow as any;

    

    // Validate all tools exist
    for (const node of workflowData.nodes) {
      if (!this.toolRegistry.hasTools(node.action.tools)) {
        throw new Error(`Workflow contains undefined tools: ${node.action.tools}`);
      }
    }

    // Generate a new UUID if not provided
    if (!workflowData.id) {
      workflowData.id = uuidv4();
    }

    // debug
    console.log("Debug the workflow...")
    console.log(workflowData);
    console.log("Debug the workflow...Done")    
    
    return this.createWorkflowFromData(workflowData, ekoConfig);
  }

  private createWorkflowFromData(data: any, ekoConfig: EkoConfig): Workflow {
    const workflow = new WorkflowImpl(
      data.id,
      data.name,
      ekoConfig,
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
        const tools = nodeData.action.tools.map((toolName: string) =>
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
}
