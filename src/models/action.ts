// src/models/action.ts

import { Action, Tool, ExecutionContext, InputSchema, Property, PatchItem } from '../types/action.types';
import { NodeInput, NodeOutput } from '../types/workflow.types';
import {
  LLMProvider,
  Message,
  LLMParameters,
  LLMStreamHandler,
  ToolDefinition,
  LLMResponse,
  ToolCall,
} from '../types/llm.types';
import { ExecutionLogger } from '@/utils/execution-logger';
import { WriteContextTool } from '@/common/tools/write_context';
import { logger } from '@/common/log';
import { ContextComporessor, NoComporess, SimpleQAComporess } from '@/common/context-compressor';
import { sleep } from '@/utils/sleep';

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
        isSuccessful: {
          type: 'boolean',
          description: '`true` if the workflow ultimately executes successfully, and `false` when the workflow ultimately fails, regardless of whether there are errors during the workflow.'
        },
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
      required: ['isSuccessful', 'use_tool_result', 'value'],
    } as InputSchema,

    async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
      context.variables.set(`__action_${actionName}_output`, params);
      console.debug('debug the output...', params);
      context.variables.set("__isSuccessful__", (params as any).isSuccessful as boolean);
      return { success: true };
    },
  };
}

export class ActionImpl implements Action {
  private readonly maxRounds: number = 25; // Default max rounds
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

    let params_copy: LLMParameters = JSON.parse(JSON.stringify(params));
    params_copy.tools = params_copy.tools?.map(this.wrapToolInputSchema);

    let retry_counter = 3;
    while (!context.signal?.aborted) {
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
          if (content && content.trim()) {
            assistantTextMessage += content;
          }
        },
        onToolUse: async (toolCall) => {
          logger.info("toolCall start", JSON.stringify({
            assistant: assistantTextMessage,
            toolCall: {
              name: toolCall.name,
              input: toolCall.input,
            },
          }))
          hasToolUse = true;

          const tool = toolMap.get(toolCall.name);
          if (!tool) {
            toolUseMessage = {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: toolCall.id,
                  name: toolCall.name,
                  input: toolCall.input,
                },
              ],
            };
            toolResultMessage = {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolCall.id,
                  content: `Error: \`${toolCall.name}\` tool not found.`,
                },
              ],
            };
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

              // unwrap the toolCall
              let unwrapped = this.unwrapToolCall(toolCall);
              let input = unwrapped.toolCall.input;
              logger.info("LLM Response:", unwrapped);
              if (unwrapped.thinking) {
                context.callback?.hooks.onLlmMessage?.(unwrapped.thinking);
              } else {
                logger.warn("LLM returns without `userSidePrompt`");
              }
              if (unwrapped.userSidePrompt) {
                context.callback?.hooks.onLlmMessageUserSidePrompt?.(unwrapped.userSidePrompt, toolCall.name);
              } else {
                logger.warn("LLM returns without `userSidePrompt`");
              }

              // Execute the tool
              let result = await tool.execute(context, input);
              // afterToolUse
              let existingTabs: chrome.tabs.Tab[] = await context.ekoConfig.chromeProxy.tabs.query({});
              logger.debug("all tabs:", existingTabs);          
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
              const truncate = (x: any) => {
                const s = JSON.stringify(x);
                const maxLength = 1000;
                if (s.length < maxLength) {
                  return x;
                } else {
                  return s.slice(0, maxLength) + "...(truncated)";
                }
              };
              logger.info("toolCall done", JSON.stringify({
                toolCall: {
                  name: tool.name,
                  result: truncate(result),
                },
              }));
              // Store tool results except for the return_output tool
              if (tool.name !== 'return_output') {
                this.toolResults.set(toolCall.id, resultContentText);
              }
            } catch (err) {
              logger.error('An error occurred when calling tool:');
              logger.error(err);
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
            }
          })();
        },
        onComplete: (llmResponse) => {
          response = llmResponse;
        },
        onError: (error) => {
          logger.error('Stream Error:', error);
          logger.debug('Last message array sent to LLM:', JSON.stringify(messages, null, 2));
          throw error;
        },
      };

      this.handleHistoryImageMessages(messages);

      // Wait for stream to complete
      if (!this.llmProvider) {
        throw new Error('LLM provider not set');
      }
      try {
        let compressedMessages;
        try {
          const comporessor: ContextComporessor = new SimpleQAComporess();
          logger.debug("uncompressed messages:", messages);
          compressedMessages = comporessor.comporess(messages);
        } catch(e) {
          logger.error("an error occurs when comporess context, use NoComporess");
          logger.error(e);
          const comporessor: ContextComporessor = new NoComporess();
          compressedMessages = comporessor.comporess(messages);
        }
        logger.debug("compressed messages:", compressedMessages);
        await sleep(5000);
        try {
          await this.llmProvider.generateStream(compressedMessages, params_copy, handler);
        } catch(e) {
          logger.warn("LLM API raise an error, try to use NoComporess");
          const comporessor: ContextComporessor = new NoComporess();
          compressedMessages = comporessor.comporess(messages);
          logger.debug("compressed messages:", compressedMessages);
          await sleep(5000);
          await this.llmProvider.generateStream(compressedMessages, params_copy, handler);
        }
      } catch (e) {
        logger.warn(`an error occurs when LLM generate response, retry(n=${retry_counter})...`, e);
        await sleep(3000);
        retry_counter -= 1;
        if (retry_counter > 0) {
          continue;
        } else {
          logger.error("too many errors when calling LLM API in executing");
          throw e;
        }
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
      logger.debug(`Removed ${initialImageCount - finalImageCount} images from history`);
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
    logger.debug(`Executing action started: ${this.name}`);
    // Create return tool with output schema
    const returnTool = createReturnTool(this.name, output.description, outputSchema);

    // Create tool map combining context tools, action tools, and return tool
    const toolMap = new Map<string, Tool<any, any>>();
    this.tools.forEach((tool) => toolMap.set(tool.name, tool));
    context.tools?.forEach((tool) => toolMap.set(tool.name, tool));
    toolMap.set(returnTool.name, returnTool);

    // get already existing tabs as task background
    let existingTabs: chrome.tabs.Tab[] = await context.ekoConfig.chromeProxy.tabs.query({});
    logger.debug("all tabs:", existingTabs);
    existingTabs = existingTabs.filter((tab) => tab.title && tab.url);
    logger.debug("existingTabs:", existingTabs);

    // get patchs for task
    let patchs: PatchItem[] = [];
    if (context.ekoConfig.patchServerUrl) {
      patchs = await this.getPatchs(this.name, context.ekoConfig.patchServerUrl);
    }
    logger.debug("patchs:", patchs);

    // Prepare initial messages
    const messages: Message[] = [
      { role: 'system', content: this.formatSystemPrompt() },
      {
        role: 'user',
        content: this.formatUserPrompt(this.name, this.description, this.tabs, existingTabs, patchs),
      },
    ];

    logger.info("action start", {
      action: {
        name: this.name,
        input,
      },
    });

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
      logger.info(`Starting round ${roundCount} of ${this.maxRounds}`);

      const { response, hasToolUse, roundMessages } = await this.executeSingleRound(
        messages,
        params,
        toolMap,
        context
      );

      lastResponse = response;

      // Add round messages to conversation history
      messages.push(...roundMessages);
      
      // Check termination conditions
      if (!hasToolUse && response) {
        // LLM sent a message without using tools - request explicit return
        logger.info(`Assistant: ${response.textContent}`);
        logger.warn('LLM sent a message without using tools; requesting explicit return');
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
        logger.warn('Max rounds reached, requesting explicit return');
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
      logger.warn('outputParams is `undefined`, action return `{}`');
      return { nodeOutput: {}, reacts: messages };
    }
    context.variables.delete(outputKey);

    // Get output value, first checking for use_tool_result
    const outputValue = outputParams.use_tool_result
      ? Array.from(this.toolResults.values()).pop()
      : outputParams?.value;

    if (outputValue === undefined) {
      logger.warn('Action completed without returning a value');
      return { nodeOutput: {}, reacts: messages };
    }

    return { nodeOutput: outputValue, reacts: messages };
  }

  private formatSystemPrompt(): string {
    const now = new Date();
    const formattedTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    logger.debug('Now is ' + formattedTime);
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

## NAVIGATION:
- If no suitable elements exist, use other functions to complete the task
- If stuck, try alternative approaches - like going back to a previous page, new search, new tab etc.
- Handle popups/cookies by accepting or closing them
- Use scroll to find elements you are looking for
- If you want to research something, open a new tab instead of using the current tab

## HUMAN OPERATE:
- When you need to log in or enter a verification code:
1. First check if the user is logged in

Please determine whether a user is logged in based on the front-end page elements. The analysis can be conducted from the following aspects:
User Information Display Area: After logging in, the page will display user information such as avatar, username, and personal center links; if not logged in, it will show a login/register button.
Navigation Bar or Menu Changes: After logging in, the navigation bar will include exclusive menu items like "My Orders" and "My Favorites"; if not logged in, it will show a login/register entry.

2. If logged in, continue to perform the task normally
3. If not logged in or encountering a verification code interface, immediately use the 'human_operate' tool to transfer the operation rights to the user
4. On the login/verification code interface, do not use any automatic input tools (such as 'input_text') to fill in the password or verification code
5. Wait for the user to complete the login/verification code operation, and then check the login status again
- As a backup method, when encountering other errors that cannot be handled automatically, use the 'human_operate' tool to transfer the operation rights to the user

## TASK COMPLETION:
- Use the 'return_output' action as the last action ONLY when you are 100% certain the ultimate task is complete
- Before using 'return_output', you MUST:
  1. Double-check if you have fulfilled ALL requirements from the user's task description
  2. Verify that you have collected ALL necessary information
  3. Ensure you have handled ALL specified cases (e.g., "for each", "for all", "x times")
  4. Confirm that your output contains ALL requested information
  5. Check if there are any missing details or incomplete steps
  6. Verify that all retry attempts have been exhausted if there were any issues
- If you have to do something repeatedly (e.g., "for each", "for all", "x times"):
  * Keep a detailed count in your text response of completed items vs total required
  * Only proceed to 'return_output' after handling ALL items
  * Double-check your count matches the exact requirement
  * If any item fails, retry that specific item before moving on
- Never hallucinate or assume task completion without verification
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
    existingTabs: chrome.tabs.Tab[],
    patchItems: PatchItem[],
  ): string {
    let prompt = `${name} -- The steps you can follow are ${description}`;

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
    if (patchItems.length > 0) {
      prompt +=
        '\n\You can refer to the following cases and tips:\n' +
        patchItems.map((item) => `<task>${item.task}</task><tips>${item.patch}</tips>`).join('\n');
    }
    return prompt;
  }

  private async getPatchs(task: string, patchServerUrl: string): Promise<PatchItem[]> {
    const form = {
      task,
      top_k: 3,
    };

    try {
      const response = await fetch(`${patchServerUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: {
        entry: {
          id: number;
          task: string;
          patch: string;
        };
        score: number;
      }[] = await response.json();
      return data.map((entryWithScore) => entryWithScore.entry);
    } catch (error) {
      logger.error('Failed to fetch patches:', error);
      return [];
    }
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

  private wrapToolInputSchema(definition: ToolDefinition): ToolDefinition {
    (definition.input_schema as InputSchema) = {
      type: "object",
      properties: {
        observation: {
          "type": "string",
          "description": 'Your observation of the previous steps. Should start with "In the previous step, I\'ve ...".',
        },
        thinking: {
          "type": "string",
          "description": 'Your thinking draft.',
        },
        userSidePrompt: {
          "type": "string",
          "description": 'The user-side prompt, showing what you are doing. e.g. "Openning x.com." or "Writing the post."',
        },
        toolCall: (definition.input_schema as Property),
      },
      required: [
        // comment for backup
        "observation",
        "thinking",
        "userSidePrompt",
        "toolCall",
      ],
    };
    return definition;
  }

  private unwrapToolCall(toolCall: ToolCall) {
    const result = {
      observation: toolCall.input.observation as string | undefined,
      thinking: toolCall.input.thinking as string | undefined,
      userSidePrompt: toolCall.input.userSidePrompt as string | undefined,
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input.toolCall,
      } as ToolCall,
    }
    if (!toolCall.input.toolCall) {
      logger.error("LLM returned a broken function call:", toolCall);
    }
    return result;
  }
}
