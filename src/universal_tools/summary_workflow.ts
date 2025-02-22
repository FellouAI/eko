import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    //description的修改
    this.description = 'Summarize briefly what this workflow has accomplished and store the summary in the result variable.';
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

    //将summary存储到result变量中
    context.variables.set('result',summary);

    await context.callback?.hooks.onSummaryWorkflow?.(summary);
    return {status: "OK"};
  }
}
