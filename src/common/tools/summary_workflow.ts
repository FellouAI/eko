import { SummaryWorkflowInput } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    this.description = 'Based on the completion of the task assigned by the user, generate the following:\n1. Start by expressing the task status, informing the user whether the task was successfully completed.\n2. Then, briefly and clearly describe the specific outcome of the task.';
    this.input_schema = {
      type: 'object',
      properties: {
        isSuccessful: {
          type: 'boolean',
          description: '`true` if the workflow ultimately executes successfully, and `false` when the workflow ultimately fails, regardless of whether there are errors during the workflow.'
        },
        summary: {
          type: 'string',
          description: 'Your summary in markdown format, include task status and outcome of the task.',
        },
      },
      required: ['summary'],
    };
  }

  async execute(context: ExecutionContext, params: SummaryWorkflowInput): Promise<any> {
    if (typeof params !== 'object' || params === null || !params.summary) {
      throw new Error('Invalid parameters. Expected an object with a "summary" property.');
    }
    console.log("isSuccessful: " + params.isSuccessful);
    console.log("summary: " + params.summary);
    context.variables.set("workflow_is_successful", params.isSuccessful);
    context.variables.set("workflow_summary", params.summary);
    await context.callback?.hooks.onSummaryWorkflow?.(params.summary);
    return {status: "OK"};
  }
}
