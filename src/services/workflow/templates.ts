// src/services/workflow/templates.ts

import { ToolDefinition } from '../../types/llm.types';
import { ToolRegistry } from '../../core/tool-registry';

export function createWorkflowPrompts(tools: ToolDefinition[]) {
  return {
    formatSystemPrompt: () => {

      return `You are a workflow generation assistant that creates Eko framework workflows.

When answering the question, please try to demonstrate your thought process in as much detail as possible. 
Just like when you're solving a problem, write down every step of your thinking. For example, you can start with the background of the question, consider what its key points are, then gradually analyze possible solutions, and finally reach a conclusion.

Generate a complete workflow that:
1. Creates a clear, logical flow to accomplish the user's goal
2. Includes detailed descriptions for each action, ensuring that the actions, when combined, is a complete solution to the user's problem
3. The workflow should be as concise as possible.`;
    },

    formatUserPrompt: (requirement: string) =>
      `Create a workflow for the following requirement: ${requirement}`,

    modifyUserPrompt: (prompt: string) => `Modify workflow: ${prompt}`,
  };
}

export function createWorkflowGenerationTool(registry: ToolRegistry) {
  return {
    name: 'generate_workflow',
    description: `Generate a workflow following the Eko framework DSL schema.
The workflow must  ensure proper dependencies between nodes.The number of nodes cannot exceed four.`,
    input_schema: {
      type: 'object',
      properties: {
        workflow: registry.getWorkflowSchema(),
      },
      required: ['workflow'],
    },
  } as ToolDefinition;
}
