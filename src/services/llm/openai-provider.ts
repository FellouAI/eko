import OpenAI, { ClientOptions } from 'openai';
import {
  LLMProvider,
  LLMParameters,
  LLMResponse,
  Message,
  LLMStreamHandler,
  ToolCall,
} from '../../types/llm.types';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat';
import {
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';

interface PartialToolUse {
  id: string;
  name: string;
  accumulatedJson: string;
}

export class OpenaiProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel = 'gpt-4o';

  constructor(client: OpenAI, defaultModel?: string);
  constructor(options: ClientOptions, defaultModel?: string);
  constructor(apiKey: string, defaultModel?: string | null, options?: ClientOptions);

  constructor(
    param: string | ClientOptions | OpenAI,
    defaultModel?: string | null,
    options?: ClientOptions
  ) {
    if (defaultModel) {
      this.defaultModel = defaultModel;
    }
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      (typeof param == 'string' || param.apiKey)
    ) {
      console.warn(`
        ⚠️ Security Warning:
        DO NOT use API Keys in browser/frontend code!
        This will expose your credentials and may lead to unauthorized usage.
        
        Best Practices: Configure backend API proxy request through baseURL and request headers.

        Please refer to the link: https://eko.fellou.ai/docs/getting-started/configuration#web-environment
      `);
    }
    if (typeof param == 'string') {
      this.client = new OpenAI({
        apiKey: param,
        dangerouslyAllowBrowser: true,
        ...options,
      });
    } else if ((param as OpenAI).chat && (param as OpenAI).chat.completions) {
      this.client = param as OpenAI;
    } else {
      let options = param as ClientOptions;
      options.dangerouslyAllowBrowser = true;
      this.client = new OpenAI(options);
    }
  }

  private buildParams(
    messages: Message[],
    params: LLMParameters,
    stream: boolean
  ): ChatCompletionCreateParamsBase {
    let tools: Array<ChatCompletionTool> | undefined = undefined;
    if (params.tools && params.tools.length > 0) {
      tools = [];
      for (let i = 0; i < params.tools.length; i++) {
        let tool = params.tools[i];
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        });
      }
    }
    let tool_choice: ChatCompletionToolChoiceOption | undefined = undefined;
    if (params.toolChoice) {
      if (params.toolChoice.type == 'auto') {
        tool_choice = 'auto';
      } else if (params.toolChoice.type == 'tool') {
        if (params.toolChoice.name) {
          tool_choice = {
            type: 'function',
            function: { name: params.toolChoice.name as string },
          };
        } else {
          tool_choice = 'required';
        }
      }
    }
    let _messages: Array<ChatCompletionMessageParam> = [];
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      if (message.role == 'assistant' && typeof message.content !== 'string') {
        let _content = undefined;
        let _tool_calls = undefined;
        for (let j = 0; j < message.content.length; j++) {
          let content = message.content[j] as any;
          if (content.type == 'text') {
            if (!_content) {
              _content = [];
            }
            _content.push(content);
          } else if (content.type == 'tool_use') {
            if (!_tool_calls) {
              _tool_calls = [];
            }
            _tool_calls.push({
              id: content.id,
              type: 'function',
              function: {
                name: content.name,
                arguments:
                  typeof content.input == 'string' ? content.input : JSON.stringify(content.input),
              },
            });
          }
        }
        _messages.push({
          role: 'assistant',
          content: _content,
          tool_calls: _tool_calls as any,
        });
      } else if (message.role == 'user' && typeof message.content !== 'string') {
        for (let j = 0; j < message.content.length; j++) {
          let content = message.content[j] as any;
          if (content.type == 'text') {
            _messages.push({
              role: 'user',
              content: content.text,
            });
          } else if (content.type == 'image') {
            _messages.push({
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${content.source.media_type};base64,${content.source.data}`,
                  },
                },
              ],
            });
          } else if (content.type == 'tool_result') {
            let _content = [];
            if (content.content == 'string') {
              _content.push({ type: 'text', text: content.content });
            } else {
              for (let k = 0; k < content.content.length; k++) {
                let item = content.content[k];
                if (item.type == 'text') {
                  _content.push({ ...item });
                } else if (item.type == 'image') {
                  _content.push({
                    type: 'image_url',
                    image_url: {
                      url: `data:${item.source.media_type};base64,${item.source.data}`,
                    },
                  });
                }
              }
            }
            let hasImage = _content.filter((s) => s.type == 'image_url').length > 0;
            if (hasImage) {
              // OpenAI does not support images returned by the tool.
              _messages.push({
                role: 'tool',
                content: 'ok',
                tool_call_id: content.tool_call_id || content.tool_use_id,
              });
              _messages.push({
                role: 'user',
                content: _content,
              });
            } else {
              _messages.push({
                role: 'tool',
                content: _content,
                tool_call_id: content.tool_call_id || content.tool_use_id,
              });
            }
          }
        }
      } else {
        _messages.push(message as any);
      }
    }
    return {
      stream: stream,
      model: params.model || this.defaultModel,
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature,
      messages: _messages,
      tools: tools,
      tool_choice: tool_choice,
    };
  }

  async generateText(messages: Message[], params: LLMParameters): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create(
      this.buildParams(messages, params, false) as ChatCompletionCreateParamsNonStreaming
    );
    let textContent: string | null = null;
    let toolCalls: ToolCall[] = [];
    let stop_reason: string | null = null;
    for (let i = 0; i < response.choices.length; i++) {
      let choice = response.choices[i];
      let message = choice.message;
      if (message.content) {
        if (textContent == null) {
          textContent = '';
        }
        textContent += message.content;
      }
      if (message.tool_calls) {
        for (let j = 0; j < message.tool_calls.length; j++) {
          let tool_call = message.tool_calls[j];
          toolCalls.push({
            id: tool_call.id,
            name: tool_call.function.name,
            input: JSON.parse(tool_call.function.arguments),
          });
        }
      }
      if (choice.finish_reason) {
        stop_reason = choice.finish_reason;
      }
    }

    let content: unknown[] = [];
    if (textContent) {
      content.push({
        type: 'text',
        text: textContent,
      });
    }
    if (toolCalls && toolCalls.length > 0) {
      for (let i = 0; i < toolCalls.length; i++) {
        let toolCall = toolCalls[i];
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });
      }
    }
    return {
      textContent,
      content,
      toolCalls,
      stop_reason,
    };
  }

  async generateStream(
    messages: Message[],
    params: LLMParameters,
    handler: LLMStreamHandler
  ): Promise<void> {
    const stream = await this.client.chat.completions.create(
      this.buildParams(messages, params, true) as ChatCompletionCreateParamsStreaming
    );
    handler.onStart?.();

    let textContent: string | null = null;
    let toolCalls: ToolCall[] = [];
    let stop_reason: string | null = null;
    let currentToolUse: PartialToolUse | null = null;

    try {
      for await (const chunk of stream) {
        for (let i = 0; i < chunk.choices.length; i++) {
          let choice = chunk.choices[i];
          if (choice.delta) {
            if (choice.delta.content) {
              if (textContent == null) {
                textContent = '';
              }
              textContent += choice.delta.content;
              handler.onContent?.(choice.delta.content);
            } else if (choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
              let tool_calls = choice.delta.tool_calls[0];
              if (!currentToolUse) {
                currentToolUse = {
                  id: tool_calls.id || '',
                  name: tool_calls.function?.name || '',
                  accumulatedJson: tool_calls.function?.arguments || '',
                };
              } else {
                if (tool_calls.id) {
                  currentToolUse.id = tool_calls.id;
                }
                if (tool_calls.function?.name) {
                  currentToolUse.name = tool_calls.function?.name;
                }
                currentToolUse.accumulatedJson += tool_calls.function?.arguments || '';
              }
            }
          }
          if (choice.finish_reason) {
            stop_reason = choice.finish_reason;
            if (currentToolUse) {
              const toolCall: ToolCall = {
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: JSON.parse(currentToolUse.accumulatedJson),
              };
              toolCalls.push(toolCall);
              handler.onToolUse?.(toolCall);
              currentToolUse = null;
            }
          }
        }
      }
      let content: unknown[] = [];
      if (textContent) {
        content.push({
          type: 'text',
          text: textContent,
        });
      }
      if (toolCalls && toolCalls.length > 0) {
        for (let i = 0; i < toolCalls.length; i++) {
          let toolCall = toolCalls[i];
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          });
        }
      }
      handler.onComplete?.({
        textContent: textContent,
        content: content,
        toolCalls: toolCalls,
        stop_reason: stop_reason,
      });
    } catch (error) {
      handler.onError?.(error as Error);
    }
  }
}
