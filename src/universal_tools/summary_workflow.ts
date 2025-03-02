import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';
import { logger } from '../log';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    this.description = 'Summarize briefly what this workflow has accomplished.';
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
    logger.debug("Summary: " + summary);

    await context.callback?.hooks.onSummaryWorkflow?.(summary);
    return {status: "OK"};
  }
}
