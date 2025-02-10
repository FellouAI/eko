import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    this.description = 'Summarize what this workflow has done from start to finish using an ordered list .';
    this.input_schema = {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Your summary in markdown format.',
        },
      },
      required: ['summary'],
    };
  }

  async execute(context: ExecutionContext, params: SummaryWorkflowInput): Promise<any> {
    if (typeof params !== 'object' || params === null || !params.summary) {
      throw new Error('Invalid parameters. Expected an object with a "summary" property.');
    }
    const summary = params.summary;
    console.log("summary: " + summary);
    await context.callback?.hooks.onSummaryWorkflow?.(summary);
    return {status: "OK"};
  }
}
