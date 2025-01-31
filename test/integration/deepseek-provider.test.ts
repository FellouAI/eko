import { DeepseekProvider } from '@/services/llm/deepseek-provider';
import { OpenaiProvider } from '../../src/services/llm/openai-provider';
import { LLMParameters, LLMStreamHandler, Message } from '../../src/types/llm.types';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = "https://api.deepseek.com";
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required for integration tests');
}

// Only run these tests if explicitly enabled
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

// Default model for all tests
const DEFAULT_MODEL = 'deepseek-chat';

describeIntegration('OpenaiProvider Integration', () => {
  let provider: DeepseekProvider;

  beforeAll(() => {
    provider = new DeepseekProvider(OPENAI_API_KEY, DEFAULT_MODEL, {
      baseURL: OPENAI_BASE_URL,
    });
  });

  describe('generateText', () => {
    const params: LLMParameters = {
      temperature: 0.7,
      maxTokens: 1000,
    };
    const toolParams: LLMParameters = {
      ...params,
      tools: [
        {
          name: 'calculate',
          description: 'Performs a calculation and returns the result',
          input_schema: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'The mathematical expression to calculate',
              },
            },
            required: ['expression'],
          },
        },
      ],
      toolChoice: { type: 'auto' },
    };

    test('should generate simple text response', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'What is 2+2? Please respond with just the number.',
        },
      ];

      const result = await provider.generateText(messages, params);
      expect(result.textContent).toBe('4');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.stop_reason).toBe('stop');
    }, 30000);

    test('should use tools when provided', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'What is 234 * 456?',
        },
      ];

      const result = await provider.generateText(messages, toolParams);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('calculate');
      expect(result.toolCalls[0].input).toHaveProperty('expression');
      expect(result.stop_reason).toBe('tool_calls');
    }, 30000);

    it('should handle multi-turn conversation', async () => {
      const user_message: Message = {
        role: 'user',
        content: 'What is 234 * 456?',
      };
      const messages_1: Message[] = [user_message];
      const result_1 = await provider.generateText(messages_1, toolParams);
      const tool_use_id = result_1.toolCalls[0].id;
      const messages_2: Message[] = [
        user_message,
        {
          role: 'assistant',
          content: result_1.content,
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: tool_use_id,
              content: [{ type: 'text', text: '106704' }],
            },
          ],
        },
      ];

      const result = await provider.generateText(messages_2, toolParams);
      expect(result.textContent).toMatch(/106,?704/);
      expect(result.stop_reason).toBe('stop');
    }, 30000);
  });

  describe('generateStream', () => {
    it('should stream text content', async () => {
      const accumulated: string[] = [];
      let isStarted = false;
      let isCompleted = false;

      const handler: LLMStreamHandler = {
        onStart: () => {
          isStarted = true;
        },
        onContent: (content) => {
          accumulated.push(content);
        },
        onComplete: () => {
          isCompleted = true;
        },
        onError: (error) => {
          throw error;
        },
      };

      const messages: Message[] = [
        {
          role: 'user',
          content: 'Count from 1 to 3, with each number on a new line (\n).',
        },
      ];

      await provider.generateStream(
        messages,
        {
          temperature: 0,
          maxTokens: 100,
        },
        handler
      );

      expect(isStarted).toBe(true);
      expect(isCompleted).toBe(true);
      expect(accumulated.join('')).toMatch(/1\s+2\s+3\s?/);
    }, 30000);

    it('should stream tool use', async () => {
      const toolCalls: any[] = [];
      const handler: LLMStreamHandler = {
        onToolUse: (toolCall) => {
          toolCalls.push(toolCall);
        },
      };

      const messages: Message[] = [
        {
          role: 'user',
          content: 'What is 123 + 456?',
        },
      ];

      await provider.generateStream(
        messages,
        {
          temperature: 0,
          tools: [
            {
              name: 'calculate',
              description: 'Performs a calculation',
              input_schema: {
                type: 'object',
                properties: {
                  expression: { type: 'string' },
                },
                required: ['expression'],
              },
            },
          ],
          toolChoice: { type: 'auto' },
        },
        handler
      );

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('calculate');
      expect(toolCalls[0].input).toHaveProperty('expression');
    }, 30000);
  });
});
