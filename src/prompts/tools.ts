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
  },
  human_input_text: {
    description: 'When you are unsure about the details of your next action or need the user to perform a local action, call me and ask the user for details in the "question" field. The user will provide you with a text as an answer.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
      },
      required: ['question'],
    },
  },
  human_input_single_choice: {
    description: 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE choice as an answer.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
        choices: {
          type: 'array',
          description: 'All of the choices.',
          items: {
            type: 'object',
            properties: {
              choice: {
                type: 'string',
              }
            }
          }
        }
      },
      required: ['question', 'choices'],
    },
  },
  human_input_multiple_choice: {
    description: 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE or MORE choice as an answer.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
        choices: {
          type: 'array',
          description: 'All of the choices.',
          items: {
            type: 'object',
            properties: {
              choice: {
                type: 'string',
              }
            }
          }
        }
      },
      required: ['question', 'choices'],
    },
  },
  human_operate: {
    description: `Use this tool when you are unable to continue a task that requires user assistance.
Usage scenarios include:
1. Authentication (such as logging in, entering a verification code, etc.)
2. External system operations (such as uploading files, selecting a file save location, scanning documents, taking photos, paying, authorization, etc.)
When calling this tool to transfer control to the user, please explain in detail:
1. Why user intervention is required
2. What operations the user needs to perform`,
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'The reason why you need to transfer control.',
        },
      },
      required: ['reason'],
    },
  },
}
