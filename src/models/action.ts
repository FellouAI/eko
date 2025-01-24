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

/**
 * Special tool that allows LLM to write values to context
 */
class WriteContextTool implements Tool<any, any> {
  name = 'write_context';
  description =
    'Write a value to the global workflow context. Use this to store important intermediate results, but only when a piece of information is essential for future reference but missing from the final output specification of the current action.';
  input_schema = {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key to store the value under',
      },
      value: {
        type: 'string',
        description: 'The value to store (must be JSON stringified if object/array)',
      },
    },
    required: ['key', 'value'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { key, value } = params as { key: string; value: string };
    try {
      // Try to parse the value as JSON
      const parsedValue = JSON.parse(value);
      context.variables.set(key, parsedValue);
    } catch {
      // If parsing fails, store as string
      context.variables.set(key, value);
    }
    return { success: true, key, value };
  }
}

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
      return { success: true };
    },
  };
}

export class ActionImpl implements Action {
  private readonly maxRounds: number = 10; // Default max rounds
  private writeContextTool: WriteContextTool;
  private toolResults: Map<string, any> = new Map();
  private logger: ExecutionLogger = new ExecutionLogger();

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
    this.logger = context.logger;
    const roundMessages: Message[] = [];
    let hasToolUse = false;
    let response: LLMResponse | null = null;

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
            const resultContent =
              result.image
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
            const resultContentText =
              result.image
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
        console.error('Stream Error:', error);
        console.log('Last message array sent to LLM:', JSON.stringify(messages, null, 2));
      },
    };

    this.handleHistoryImageMessages(messages);

    // Wait for stream to complete
    if (!this.llmProvider) {
      throw new Error('LLM provider not set');
    }
    await this.llmProvider.generateStream(messages, params, handler);

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
      this.logger.log("info", `Removed ${initialImageCount - finalImageCount} images from history`);
    }
  }

  private countImages(messages: Message[]): number {
    let count = 0;
    messages.forEach(msg => {
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
  ): Promise<unknown> {
    this.logger = context.logger;
    console.log(`Executing action started: ${this.name}`);
    // Create return tool with output schema
    const returnTool = createReturnTool(this.name, output.description, outputSchema);

    // Create tool map combining context tools, action tools, and return tool
    const toolMap = new Map<string, Tool<any, any>>();
    this.tools.forEach((tool) => toolMap.set(tool.name, tool));
    context.tools?.forEach((tool) => toolMap.set(tool.name, tool));
    toolMap.set(returnTool.name, returnTool);

    // Prepare initial messages
    const messages: Message[] = [
      { role: 'system', content: this.formatSystemPrompt() },
      { role: 'user', content: this.formatUserPrompt(context, input) },
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
        this.logger.log('warn', 'LLM sent a message without using tools; requesting explicit return');
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
    context.variables.delete(outputKey);

    // Get output value, first checking for use_tool_result
    const outputValue = outputParams.use_tool_result
      ? Array.from(this.toolResults.values()).pop()
      : outputParams?.value;

    if (outputValue === undefined) {
      console.warn('Action completed without returning a value');
      return {};
    }

    return outputValue;
  }

  private formatSystemPrompt(): string {
    return `You are a subtask executor. You need to complete the subtask specified by the user, which is a consisting part of the overall task. Help the user by calling the tools provided.

    Remember to:
    1. Use tools when needed to accomplish the task
    2. Think step by step about what needs to be done
    3. Return the output of the subtask using the 'return_output' tool when you are done; prefer using the 'tool_use_id' parameter to refer to the output of a tool call over providing a long text as the value
    4. Use the context to store important information for later reference, but use it sparingly: most of the time, the output of the subtask should be sufficient for the next steps
    `;
  }

  private formatUserPrompt(context: ExecutionContext, input: unknown): string {
    const workflowDescription = context.workflow?.description || null;
    const actionDescription = `${this.name} -- ${this.description}`;
    const inputDescription = JSON.stringify(input, null, 2) || null;
    const contextVariables = Array.from(context.variables.entries())
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    return `You are executing a subtask in the workflow. The workflow description is as follows:
    ${workflowDescription}

    The subtask description is as follows:
    ${actionDescription}

    The input to the subtask is as follows:
    ${inputDescription}

    There are some variables stored in the context that you can use for reference:
    ${contextVariables}
    `;
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
