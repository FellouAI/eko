import Anthropic, { ClientOptions } from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMParameters,
  LLMResponse,
  Message,
  LLMStreamHandler,
  ToolCall,
} from '../../types/llm.types';

interface PartialToolUse {
  id: string;
  name: string;
  accumulatedJson: string;
}

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel = 'claude-3-5-sonnet-20241022';

  constructor(options: Anthropic, defaultModel?: string);
  constructor(options: ClientOptions, defaultModel?: string);
  constructor(apiKey: string, defaultModel?: string | null, options?: ClientOptions);

  constructor(
    param: string | ClientOptions | Anthropic,
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
      logger.warn(`
        ⚠️ Security Warning:
        DO NOT use API Keys in browser/frontend code!
        This will expose your credentials and may lead to unauthorized usage.
        
        Best Practices: Configure backend API proxy request through baseURL and request headers.

        Please refer to the link: https://eko.fellou.ai/docs/getting-started/configuration#web-environment
      `);
    }
    if (typeof param == 'string') {
      this.client = new Anthropic({
        apiKey: param,
        dangerouslyAllowBrowser: true,
        ...options,
      });
    } else if ((param as Anthropic).messages && (param as Anthropic).completions) {
      this.client = param as Anthropic;
    } else {
      let options = param as ClientOptions;
      options.dangerouslyAllowBrowser = true;
      this.client = new Anthropic(options);
    }
  }

  private processResponse(response: Anthropic.Message): LLMResponse {
    const toolCalls = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      })) as ToolCall[];

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return {
      textContent: textContent || null,
      content: response.content,
      toolCalls,
      stop_reason: response.stop_reason,
    };
  }

  async generateText(messages: Message[], params: LLMParameters): Promise<LLMResponse> {
    let system = messages
      .filter((s) => s.role == 'system')
      .map((s) => {
        if (typeof s.content == 'string') {
          return s.content;
        } else {
          return (s.content[0] as any).text as string;
        }
      })[0];
    const toolChoice = params.toolChoice as Anthropic.ToolChoice
    if (toolChoice) {
      toolChoice.disable_parallel_tool_use = true
    }
    const response = await this.client.messages.create({
      system,
      model: params.model || this.defaultModel,
      max_tokens: params.maxTokens || 1024,
      temperature: params.temperature,
      messages: messages.filter((s) => s.role != 'system') as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
      tool_choice: toolChoice,
    });

    return this.processResponse(response);
  }

  async generateStream(
    messages: Message[],
    params: LLMParameters,
    handler: LLMStreamHandler
  ): Promise<void> {
    let system = messages
      .filter((s) => s.role == 'system')
      .map((s) => {
        if (typeof s.content == 'string') {
          return s.content;
        } else {
          return (s.content[0] as any).text as string;
        }
      })[0];
    const toolChoice = params.toolChoice as Anthropic.ToolChoice
    if (toolChoice) {
      toolChoice.disable_parallel_tool_use = true
    }
    const stream = await this.client.messages.stream({
      system,
      model: params.model || this.defaultModel,
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature,
      messages: messages.filter((s) => s.role != 'system') as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
      tool_choice: toolChoice,
    });

    handler.onStart?.();

    let currentToolUse: PartialToolUse | null = null;

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'text') {
              handler.onContent?.('');
            } else if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                accumulatedJson: '',
              };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              handler.onContent?.(event.delta.text);
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.accumulatedJson += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentToolUse) {
              const toolCall: ToolCall = {
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: JSON.parse(currentToolUse.accumulatedJson || '{}'),
              };
              handler.onToolUse?.(toolCall);
              currentToolUse = null;
            }
            break;
        }
      }

      const message = await stream.finalMessage();
      handler.onComplete?.(this.processResponse(message));
    } catch (error) {
      handler.onError?.(error as Error);
    }
  }
}
