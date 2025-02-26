import { Tool, InputSchema, ExecutionContext } from "@/types";

export class WriteContextTool implements Tool<any, any> {
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

