// src/models/action.ts

import { Action, Tool, ExecutionContext, InputSchema } from '../types/action.types';
import { NodeInput, NodeOutput } from '../types/workflow.types';
import {
  LLMProvider,
  Message,
  LLMParameters,
  LLMStreamHandler,
  ToolDefinition,
  LLMResponse,
} from '../types/llm.types';
import { ExecutionLogger } from '@/utils/execution-logger';
import { WriteContextTool } from '@/common/tools/write_context';

function createReturnTool(
  actionName: string,
  outputDescription: string,
  outputSchema?: unknown
): Tool<any, any> {
  return {
    name: 'return_output',
    description: `Return the final output of this action. Use this to return a value matching the required output schema (if specified) and the following description:
      ${outputDescription}

      You can either set 'use_tool_result=true' to return the result of a previous tool call, or explicitly specify 'value' with 'use_tool_result=false' to return a value according to your own understanding. Whenever possible, reuse tool results to avoid redundancy.
      `,
    input_schema: {
      type: 'object',
      properties: {
        use_tool_result: {
          type: ['boolean'],
          description: `Whether to use the latest tool result as output. When set to true, the 'value' parameter is ignored.`,
        },
        value: outputSchema || {
          // Default to accepting any JSON value
          type: ['string', 'number', 'boolean', 'object', 'null'],
          description:
            'The output value. Only provide a value if the previous tool result is not suitable for the output description. Otherwise, leave this as null.',
        },
      } as unknown,
      required: ['use_tool_result', 'value'],
    } as InputSchema,

    async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
      context.variables.set(`__action_${actionName}_output`, params);
      console.info('debug the output...');
      console.log(params);
      console.info('debug the output...done');
      return { success: true };
    },
  };
}

export class ActionImpl implements Action {
  private readonly maxRounds: number = 100; // Default max rounds
  private writeContextTool: WriteContextTool;
  private toolResults: Map<string, any> = new Map();
  private logger: ExecutionLogger = new ExecutionLogger();
  public tabs: chrome.tabs.Tab[] = [];

  constructor(
    public type: 'prompt', // Only support prompt type
    public name: string,
    public description: string,
    public tools: Tool<any, any>[],
    public llmProvider: LLMProvider | undefined,
    private llmConfig?: LLMParameters,
    config?: { maxRounds?: number }
  ) {
    this.writeContextTool = new WriteContextTool();
    this.tools = [...tools, this.writeContextTool];
    if (config?.maxRounds) {
      this.maxRounds = config.maxRounds;
    }
  }

  private async executeSingleRound(
    messages: Message[],
    params: LLMParameters,
    toolMap: Map<string, Tool<any, any>>,
    context: ExecutionContext
  ): Promise<{
    response: LLMResponse | null;
    hasToolUse: boolean;
    roundMessages: Message[];
  }> {
    let response: LLMResponse | null = null;
    let hasToolUse = false;
    let roundMessages: Message[] = [];

    while (!context.signal?.aborted) {
      this.logger = context.logger;
      roundMessages = [];
      hasToolUse = false;
      response = null;

      // Buffer to collect into roundMessages
      let assistantTextMessage = '';
      let toolUseMessage: Message | null = null;
      let toolResultMessage: Message | null = null;

      // Track tool execution promise
      let toolExecutionPromise: Promise<void> | null = null;

      // Listen for abort signal
      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          context.__abort = true;
        });
      }

      const handler: LLMStreamHandler = {
        onContent: (content) => {
          if (content.trim()) {
            assistantTextMessage += content;
          }
        },
        onToolUse: async (toolCall) => {
          this.logger.log('info', `Assistant: ${assistantTextMessage}`);
          this.logger.logToolExecution(toolCall.name, toolCall.input, context);
          hasToolUse = true;

          const tool = toolMap.get(toolCall.name);
          if (!tool) {
            throw new Error(`Tool not found: ${toolCall.name}`);
          }

          toolUseMessage = {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: toolCall.id,
                name: tool.name,
                input: toolCall.input,
              },
            ],
          };

          // Store the promise of tool execution
          toolExecutionPromise = (async () => {
            try {
              // beforeToolUse
              context.__skip = false;
              if (context.callback && context.callback.hooks.beforeToolUse) {
                let modified_input = await context.callback.hooks.beforeToolUse(
                  tool,
                  context,
                  toolCall.input
                );
                if (modified_input) {
                  toolCall.input = modified_input;
                }
              }
              if (context.__skip || context.__abort || context.signal?.aborted) {
                toolResultMessage = {
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: toolCall.id,
                      content: 'skip',
                    },
                  ],
                };
                return;
              }
              // Execute the tool
              let result = await tool.execute(context, toolCall.input);
              // afterToolUse
              if (context.callback && context.callback.hooks.afterToolUse) {
                let modified_result = await context.callback.hooks.afterToolUse(
                  tool,
                  context,
                  result
                );
                if (modified_result) {
                  result = modified_result;
                }
              }

              const result_has_image: boolean = result && result.image;
              const resultContent = result_has_image
                ? {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: result.text
                      ? [
                          { type: 'image', source: result.image },
                          { type: 'text', text: result.text },
                        ]
                      : [{ type: 'image', source: result.image }],
                  }
                : {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                  };
              const resultContentText = result_has_image
                ? result.text
                  ? result.text + ' [Image]'
                  : '[Image]'
                : JSON.stringify(result);
              const resultMessage: Message = {
                role: 'user',
                content: [resultContent],
              };
              toolResultMessage = resultMessage;
              this.logger.logToolResult(tool.name, result, context);
              // Store tool results except for the return_output tool
              if (tool.name !== 'return_output') {
                this.toolResults.set(toolCall.id, resultContentText);
              }
            } catch (err) {
              console.log('An error occurred when calling tool:');
              console.log(err);
              const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
              const errorResult: Message = {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: [{ type: 'text', text: `Error: ${errorMessage}` }],
                    is_error: true,
                  },
                ],
              };
              toolResultMessage = errorResult;
              this.logger.logError(err as Error, context);
            }
          })();
        },
        onComplete: (llmResponse) => {
          response = llmResponse;
        },
        onError: (error) => {
          // console.error('Stream Error:', error);
          // console.log('Last message array sent to LLM:', JSON.stringify(messages, null, 2));
          throw error;
        },
      };

      this.handleHistoryImageMessages(messages);

      // Wait for stream to complete
      if (!this.llmProvider) {
        throw new Error('LLM provider not set');
      }
      try {
        await this.llmProvider.generateStream(messages, params, handler);
      } catch (e) {
        console.warn("an error occurs when LLM generate response");
        console.warn(e);
        continue;
      }

      // Wait for tool execution to complete if it was started
      if (toolExecutionPromise) {
        await toolExecutionPromise;
      }

      if (context.__abort) {
        throw new Error('Abort');
      }

      // Add messages in the correct order after everything is complete
      if (assistantTextMessage) {
        roundMessages.push({ role: 'assistant', content: assistantTextMessage });
      }
      if (toolUseMessage) {
        roundMessages.push(toolUseMessage);
      }
      if (toolResultMessage) {
        roundMessages.push(toolResultMessage);
      }
      break;
    }
    return { response, hasToolUse, roundMessages };
  }

  private handleHistoryImageMessages(messages: Message[]) {
    // Remove all images from historical tool results except the most recent user message
    const initialImageCount = this.countImages(messages);

    let foundFirstUser = false;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        if (!foundFirstUser) {
          foundFirstUser = true;
          continue;
        }

        if (Array.isArray(message.content)) {
          // Directly modify the message content array
          message.content = message.content.map((item: any) => {
            if (item.type === 'tool_result' && Array.isArray(item.content)) {
              // Create a new content array without images
              if (item.content.length > 0) {
                item.content = item.content.filter((c: any) => c.type !== 'image');
                // If all content was images and got filtered out, replace with ok message
                if (item.content.length === 0) {
                  item.content = [{ type: 'text', text: 'ok' }];
                }
              }
            }
            return item;
          });
        }
      }
    }

    const finalImageCount = this.countImages(messages);
    if (initialImageCount !== finalImageCount) {
      this.logger.log('info', `Removed ${initialImageCount - finalImageCount} images from history`);
    }
  }

  private countImages(messages: Message[]): number {
    let count = 0;
    messages.forEach((msg) => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach((item: any) => {
          if (item.type === 'tool_result' && Array.isArray(item.content)) {
            count += item.content.filter((c: any) => c.type === 'image').length;
          }
        });
      }
    });
    return count;
  }

  async execute(
    input: NodeInput,
    output: NodeOutput,
    context: ExecutionContext,
    outputSchema?: unknown
  ): Promise<{ nodeOutput: unknown; reacts: Message[] }> {
    this.logger = context.logger;
    console.log(`Executing action started: ${this.name}`);
    // Create return tool with output schema
    const returnTool = createReturnTool(this.name, output.description, outputSchema);

    // Create tool map combining context tools, action tools, and return tool
    const toolMap = new Map<string, Tool<any, any>>();
    this.tools.forEach((tool) => toolMap.set(tool.name, tool));
    context.tools?.forEach((tool) => toolMap.set(tool.name, tool));
    toolMap.set(returnTool.name, returnTool);

    // get already existing tabs as task background
    const currentWindow = await context.ekoConfig.chromeProxy.windows.getCurrent();
    const existingTabs: chrome.tabs.Tab[] = await context.ekoConfig.chromeProxy.tabs.query({
      windowId: currentWindow.id,
    });

    // Prepare initial messages
    const messages: Message[] = [
      { role: 'system', content: this.formatSystemPrompt() },
      {
        role: 'user',
        content: this.formatUserPrompt(this.name, this.description, this.tabs, existingTabs),
      },
    ];

    this.logger.logActionStart(this.name, input, context);

    // Configure tool parameters
    const params: LLMParameters = {
      ...this.llmConfig,
      tools: Array.from(toolMap.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      })) as ToolDefinition[],
    };

    let roundCount = 0;
    let lastResponse: LLMResponse | null = null;

    while (roundCount < this.maxRounds) {
      // Check for abort signal
      if (context.signal?.aborted) {
        throw new Error('Workflow cancelled');
      }

      roundCount++;
      this.logger.log('info', `Starting round ${roundCount} of ${this.maxRounds}`, context);

      const { response, hasToolUse, roundMessages } = await this.executeSingleRound(
        messages,
        params,
        toolMap,
        context
      );

      if (response?.textContent) {
        context.callback?.hooks?.onLlmMessage?.(response.textContent);
      }

      lastResponse = response;

      // Add round messages to conversation history
      messages.push(...roundMessages);
      this.logger.log(
        'debug',
        `Round ${roundCount} messages: ${JSON.stringify(roundMessages)}`,
        context
      );

      // Check termination conditions
      if (!hasToolUse && response) {
        // LLM sent a message without using tools - request explicit return
        this.logger.log('info', `Assistant: ${response.textContent}`);
        this.logger.log(
          'warn',
          'LLM sent a message without using tools; requesting explicit return'
        );
        const returnOnlyParams = {
          ...params,
          tools: [
            {
              name: returnTool.name,
              description: returnTool.description,
              input_schema: returnTool.input_schema,
            },
          ],
        } as LLMParameters;

        messages.push({
          role: 'user',
          content:
            'Please process the above information and return a final result using the return_output tool.',
        });

        const { roundMessages: finalRoundMessages } = await this.executeSingleRound(
          messages,
          returnOnlyParams,
          new Map([[returnTool.name, returnTool]]),
          context
        );
        messages.push(...finalRoundMessages);
        break;
      }

      if (response?.toolCalls.some((call) => call.name === 'return_output')) {
        break;
      }

      // If this is the last round, force an explicit return
      if (roundCount === this.maxRounds) {
        this.logger.log('warn', 'Max rounds reached, requesting explicit return');
        const returnOnlyParams = {
          ...params,
          tools: [
            {
              name: returnTool.name,
              description: returnTool.description,
              input_schema: returnTool.input_schema,
            },
          ],
        } as LLMParameters;

        messages.push({
          role: 'user',
          content:
            'Maximum number of steps reached. Please return the best result possible with the return_output tool.',
        });

        const { roundMessages: finalRoundMessages } = await this.executeSingleRound(
          messages,
          returnOnlyParams,
          new Map([[returnTool.name, returnTool]]),
          context
        );
        messages.push(...finalRoundMessages);
      }
    }

    // Get and clean up output value
    const outputKey = `__action_${this.name}_output`;
    const outputParams = context.variables.get(outputKey) as any;
    if (!outputParams) {
      console.warn('outputParams is `undefined`, action return `{}`');
      return { nodeOutput: {}, reacts: messages };
    }
    context.variables.delete(outputKey);

    // Get output value, first checking for use_tool_result
    const outputValue = outputParams.use_tool_result
      ? Array.from(this.toolResults.values()).pop()
      : outputParams?.value;

    if (outputValue === undefined) {
      console.warn('Action completed without returning a value');
      return { nodeOutput: {}, reacts: messages };
    }

    return { nodeOutput: outputValue, reacts: messages };
  }

  private formatSystemPrompt(): string {
    const now = new Date();
    const formattedTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    console.log('Now is ' + formattedTime);
    return `You are an AI agent designed to automate browser tasks. Your goal is to accomplish the ultimate task following the rules. Now is ${formattedTime}.

## GENERIC:
- Your tool calling must be always JSON with the specified format.
- You should have a screenshot after every action to make sure the tools executed successfully.
- User's requirement maybe not prefect, but user will not give you any further information, you should explore by yourself and follow the common sense
- If you encountered a problem (e.g. be required to login), try to bypass it or explore other ways and links
- Before you return output, reflect on whether the output provided *is what users need* and *whether it is too concise*
- If you find the what user want, click the URL and show it on the current page.

## TIME:
- The current time is ${formattedTime}.
- If the user has specified a particular time requirement, please complete the task according to the user's specified time frame.
- If the user has given a vague time requirement, such as “recent one year,” then please determine the time range based on the current time first, and then complete the task.

## NAVIGATION & ERROR HANDLING:
- If no suitable elements exist, use other functions to complete the task
- If stuck, try alternative approaches - like going back to a previous page, new search, new tab etc.
- Handle popups/cookies by accepting or closing them
- Use scroll to find elements you are looking for
- If you want to research something, open a new tab instead of using the current tab
- If captcha pops up, try to solve it - else try a different approach

## TASK COMPLETION:
- Use the 'return_output' action as the last action as soon as the ultimate task is complete
- Dont use 'return_output' before you are done with everything the user asked you
- If you have to do something repeatedly for example the task says for "each", or "for all", or "x times", count in your text response (not tool calling!) how many times you have done it and how many remain. Don't stop until you have completed like the task asked you. Only call done after the last step.
- Don't hallucinate actions
- Make sure you include everything you found out for the ultimate task in the done text parameter. Do not just say you are done, but include the requested information of the task. 

## VISUAL CONTEXT:
- When an image is provided, use it to understand the page layout
- Bounding boxes with labels on their top right corner correspond to element indexes
- Do not repeatedly call the screenshot tool without any operating action

## Form filling:
- If you fill an input field and your action sequence is interrupted, most often something changed e.g. suggestions popped up under the field.

## Long tasks:
- Keep track of the status and subresults in the memory. 

## Extraction:
- If your task is to find information - call extract_content on the specific pages to get and store the information.

## Human tools:
- Once you called human tools (e.g. \`human_operate\`), and it returns success, check the page content and verify the result.

## THE MOST IMPORTANT RULE
- DO NOT REFUSE TO PERFORM THE MISSION
- DO NOT REFUSE TO PERFORM THE MISSION
- DO NOT REFUSE TO PERFORM THE MISSION
`;
  }

  private formatUserPrompt(
    name: string,
    description: string,
    mentionedTabs: chrome.tabs.Tab[],
    existingTabs: chrome.tabs.Tab[]
  ): string {
    let prompt = `${name} -- ${description}`;
    prompt = `Your ultimate task is: """${prompt}""". If you achieved your ultimate task, stop everything and use the done action in the next step to complete the task. If not, continue as usual.`;
    if (existingTabs.length > 0) {
      prompt +=
        '\n\nYou should complete the task with the following tabs:\n' +
        existingTabs.map((tab) => `- TabID=${tab.id}: ${tab.title} (${tab.url})`).join('\n');
    }
    if (mentionedTabs.length > 0) {
      prompt +=
        '\n\nYou should consider the following tabs firstly:\n' +
        mentionedTabs.map((tab) => `- TabID=${tab.id}: ${tab.title} (${tab.url})`).join('\n');
    }
    return prompt;
  }

  // Static factory method
  static createPromptAction(
    name: string,
    description: string,
    tools: Tool<any, any>[],
    llmProvider: LLMProvider | undefined,
    llmConfig?: LLMParameters
  ): Action {
    return new ActionImpl('prompt', name, description, tools, llmProvider, llmConfig);
  }
}
