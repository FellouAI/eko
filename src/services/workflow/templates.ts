// src/services/workflow/templates.ts

import { ToolDefinition } from '../../types/llm.types';
import { ToolRegistry } from '../../core/tool-registry';

export function createWorkflowPrompts(tools: ToolDefinition[]) {
  return {
    formatSystemPrompt: () => {
      const toolDescriptions = tools
        .map(
          (tool) => `
Tool: ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.input_schema, null, 2)}
        `
        )
        .join('\n');

      return `You are a workflow generation assistant that creates Eko framework workflows.
The following tools are available:

${toolDescriptions}

Generate a complete workflow that:
1. Only uses the tools listed above
2. Properly sequences tool usage based on dependencies
3. Ensures each action has appropriate input/output schemas, and that the "tools" field in each action is populated with the sufficient subset of all available tools needed to complete the action
4. Creates a clear, logical flow to accomplish the user's goal
5. Includes detailed descriptions for each action, ensuring that the actions, when combined, is a complete solution to the user's problem
6. Do not use 'summary_workflow' tool`;
    },

    formatUserPrompt: (requirement: string) =>
      `Create a workflow for the following requirement: ${requirement}`,

    modifyUserPrompt: (prompt: string) =>
      `Modify workflow: ${prompt}`,
  };
}

export function createWorkflowGenerationTool(registry: ToolRegistry) {
  return {
    name: 'generate_workflow',
    description: `Generate a workflow following the Eko framework DSL schema.
The workflow must only use the available tools and ensure proper dependencies between nodes.`,
    input_schema: {
      type: 'object',
      properties: {
        workflow: registry.getWorkflowSchema(),
      },
      required: ['workflow'],
    },
  } as ToolDefinition;
}
