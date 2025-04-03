import { CancelWorkflowInput } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { TOOL_PROMPTS } from '@/prompts';

export class CancelWorkflow implements Tool<CancelWorkflowInput, void> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'cancel_workflow';
    this.description = TOOL_PROMPTS.cancel_workflow.description;
    this.input_schema = TOOL_PROMPTS.cancel_workflow.input_schema;
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
