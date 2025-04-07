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
- is successful?: ${contextVariables.get("__isSuccessful__")}
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
          summary: {
            type: 'string',
            description: 'Your summary in one paragraph with fluent and natural language, including task status and outcome of the task.',
          },
          isDocumentGenerationTask: {
            type: 'boolean',
            description: `Please determine the task type based on the following description:
- 'true' if this task is Information Collection and Document Generation Tasks: Tasks that require collecting information and generating a document (such as a report, draft, summary, etc.).
- 'false' if this task is Interaction and Operation Tasks: Tasks that only require interaction with the environment to complete a specific operation, without the need to generate a long document.
`
          },
          document: {
            type: 'string',
            description: `If 'isDocumentGenerationTask' is 'true', write the human-readable document here. Else, leave it 'null'.`
          }
        },
        required: ['isSuccessful', 'summary', 'isDocumentGenerationTask'],
      },
    }],
    toolChoice: { type: 'tool', name: 'summarize_workflow' },
  };
  console.log(params);
  const response = await llmProvider.generateText(messages, params);
  console.log(response);
  return {
    isSuccessful: contextVariables.get("__isSuccessful__") as boolean,
    summary: response.toolCalls[0].input.summary as string,
    payload: response.toolCalls[0].input.document as string | undefined,
  };
}
