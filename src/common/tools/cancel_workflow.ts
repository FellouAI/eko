import { CancelWorkflowInput } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';

export class CancelWorkflow implements Tool<CancelWorkflowInput, void> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'cancel_workflow';
    this.description = 'Cancel the workflow when encountering critical errors that cannot be resolved through user interaction or retry. This should only be used when the workflow is in an unrecoverable state. ';
    this.input_schema = {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why the workflow should be cancelled.',
        },
      },
      required: ['reason'],
    };
  }

  async execute(context: ExecutionContext, params: CancelWorkflowInput): Promise<void> {
    if (typeof params !== 'object' || params === null || !params.reason) {
      throw new Error('Invalid parameters. Expected an object with a "reason" property.');
    }
    const reason = params.reason;
    console.log("The workflow has been cancelled because: " + reason);
    await context.workflow?.cancel();
    return;
  }
}
