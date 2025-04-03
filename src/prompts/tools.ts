import { InputSchema } from "@/types";

interface ToolPromptItem {
  description: string;
  input_schema: InputSchema;
}

export const TOOL_PROMPTS: Record<string, ToolPromptItem> = {
  cancel_workflow: {
    description:
      'Cancel the workflow when encountering critical errors that cannot be resolved through user interaction or retry. This should only be used when the workflow is in an unrecoverable state. ',
    input_schema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why the workflow should be cancelled.',
          },
        },
        required: ['reason'],
    },
  },  
}
