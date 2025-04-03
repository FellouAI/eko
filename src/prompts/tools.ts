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
  document_agent: {
    description: 'A document agent that can help you write document or long text, e.g. research report, email draft, summary.',
    input_schema: {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "description": "The type of document to be created (e.g., 'report', 'presentation', 'article')."
        },
        "title": {
          "type": "string",
          "description": "The title of the document."
        },
        "background": {
          "type": "string",
          "description": "The background information or target for the document."
        },
        "keypoints": {
          "type": "string",
          "description": "A summary of the key points or main ideas to be included in the document."
        },
        "style": {
          "type": "string",
          "description": "The desired style or tone of the document (e.g., 'formal', 'casual', 'academic')."
        },
      },
      "required": ["type", "title", "background", "keypoints"],
    },
  }
}
