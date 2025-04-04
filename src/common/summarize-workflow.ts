import { LLMParameters, LLMProvider, Message, WorkflowSummary, Workflow, NodeOutput } from "@/types";

export async function summarizeWorkflow(
  llmProvider: LLMProvider,
  workflow: Workflow,
  contextVariables: Map<string, unknown>,
  nodeOutputs: NodeOutput[],
): Promise<WorkflowSummary> {
  const messages: Message[] = [
    {
      role: 'system',
      content: 'The user has completed a workflow. You need to invoke the `summarize_workflow` function using the information provided by the user to execute the summary task.',
    },
    {
      role: 'user',
      content: `## Workflow

- name: ${workflow.name}
- description: ${workflow.description}
- node:

${JSON.stringify(workflow.getRawWorkflowJson())}

## Context

${JSON.stringify(contextVariables)}

## Node Output

${JSON.stringify(nodeOutputs)}
      `,
    },
  ];
  console.log(messages);
  const params: LLMParameters = {
    temperature: 0.7,
    maxTokens: 8192,
    tools: [{
      name: "summarize_workflow",
      description: 'Based on the completion of the task assigned by the user, generate the following:\n1. Start by expressing the task status, informing the user whether the task was successfully completed.\n2. Then, briefly and clearly describe the specific outcome of the task.',
      input_schema: {
        type: 'object',
        properties: {
          isSuccessful: {
            type: 'boolean',
            description: '`true` if the workflow ultimately executes successfully, and `false` when the workflow ultimately fails, regardless of whether there are errors during the workflow.'
          },
          summary: {
            type: 'string',
            description: 'Your summary in one paragraph with fluent and natural language, including task status and outcome of the task.',
          },
          payload: {
            type: 'string',
            description: 'If the workflow has to give a output like a report or a draft, use the `payload`. If the workflow do not have any output (like click a link), leave it blank.'
          }
        },
        required: ['isSuccessful', 'summary'],
      },
    }],
    toolChoice: { type: 'tool', name: 'summarize_workflow' },
  };
  console.log(params);
  const response = await llmProvider.generateText(messages, params);
  console.log(response);
  return {
    isSuccessful: response.toolCalls[0].input.isSuccessful as boolean,
    summary: response.toolCalls[0].input.summary as string,
    payload: response.toolCalls[0].input.payload as string | undefined,
  };
}
