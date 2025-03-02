import { LLMParameters, Message } from '../../types/llm.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { executeScript, getTabId, getWindowId } from '../utils';
import { extractOperableElements, clickOperableElement } from './html_script';
import { left_click, screenshot } from './browser';
import { TaskPrompt } from '../../types/tools.types';
import { logger } from '../../log';

/**
 * Element click
 */
export class ElementClick implements Tool<TaskPrompt, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'element_click';
    this.description = 'Click the element through task prompts';
    this.input_schema = {
      type: 'object',
      properties: {
        task_prompt: {
          type: 'string',
          description: 'Task prompt, eg: click search button',
        },
      },
      required: ['task_prompt'],
    };
  }

  async execute(context: ExecutionContext, params: TaskPrompt): Promise<any> {
    if (typeof params !== 'object' || params === null || !params.task_prompt) {
      throw new Error('Invalid parameters. Expected an object with a "task_prompt" property.');
    }
    let result;
    let task_prompt = params.task_prompt;
    try {
      result = await executeWithHtmlElement(context, task_prompt);
    } catch (e) {
      logger.error(e);
      result = false;
    }
    if (!result) {
      result = await executeWithBrowserUse(context, task_prompt);
    }
    return result;
  }
}

async function executeWithHtmlElement(
  context: ExecutionContext,
  task_prompt: string
): Promise<boolean> {
  let tabId = await getTabId(context);
  let pseudoHtml = await executeScript(tabId, extractOperableElements, []);
  let messages: Message[] = [
    {
      role: 'user',
      content: `# Task
Determine the operation intent based on user input, find the element ID that the user needs to operate on in the webpage HTML, and if the element does not exist, do nothing.
Output JSON format, no explanation required.

# User input
${task_prompt}

# Output example (when the element exists)
{"elementId": "1", "operationType": "click"}

# Output example (when the element does not exist)
{"elementId": null, "operationType": "unknown"}

# HTML
${pseudoHtml}
`,
    },
  ];
  let llm_params: LLMParameters = { maxTokens: 1024 };
  let response = await context.llmProvider.generateText(messages, llm_params);
  let content = typeof response.content == 'string' ? response.content : (response.content as any[])[0].text;
  let json = content.substring(content.indexOf('{'), content.indexOf('}') + 1);
  let elementId = JSON.parse(json).elementId;
  if (elementId) {
    return await executeScript(tabId, clickOperableElement, [elementId]);
  }
  return false;
}

async function executeWithBrowserUse(
  context: ExecutionContext,
  task_prompt: string
): Promise<boolean> {
  let tabId = await getTabId(context);
  let windowId = await getWindowId(context);
  let screenshot_result = await screenshot(windowId, false);
  let messages: Message[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: screenshot_result.image,
        },
        {
          type: 'text',
          text: 'click: ' + task_prompt,
        },
      ],
    },
  ];
  let llm_params: LLMParameters = {
    maxTokens: 1024,
    toolChoice: {
      type: 'tool',
      name: 'left_click',
    },
    tools: [
      {
        name: 'left_click',
        description: 'click element',
        input_schema: {
          type: 'object',
          properties: {
            coordinate: {
              type: 'array',
              description:
                '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates.',
            },
          },
          required: ['coordinate'],
        },
      },
    ],
  };
  let response = await context.llmProvider.generateText(messages, llm_params);
  let input = response.toolCalls[0].input;
  let coordinate = input.coordinate as [number, number];
  let click_result = await left_click(tabId, coordinate);
  return click_result;
}
