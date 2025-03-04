import { Tool, ExecutionContext, InputSchema, Properties } from '../../src/types/action.types';
import { WorkflowGenerator } from '../../src/services/workflow/generator';
import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import { WorkflowParser } from '../../src/services/parser/workflow-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import { ToolRegistry } from '@/index';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required for integration tests');
}

// Only run these tests if explicitly enabled
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

// Addition tool
class AddTool implements Tool<any, any> {
  name = 'add';
  description = 'Add two numbers together.';
  input_schema = {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: 'First number',
      } as const,
      b: {
        type: 'number',
        description: 'Second number',
      } as const,
    } as unknown as Properties,
    required: ['a', 'b'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { result: a + b };
  }
}

// Multiplication tool
class MultiplyTool implements Tool<any, any> {
  name = 'multiply';
  description = 'Multiply two numbers together.';
  input_schema = {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: 'First number',
      } as const,
      b: {
        type: 'number',
        description: 'Second number',
      } as const,
    } as unknown as Properties,
    required: ['a', 'b'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { result: a * b };
  }
}

// Echo tool to display results
class EchoTool implements Tool<any, any> {
  name = 'echo';
  description = 'Display or print a message or value.';
  input_schema = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message or value to display',
      } as const,
    } as unknown as Properties,
    required: ['message'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { message } = params as { message: string };
    console.log('Echo:', message);
    return { displayed: message };
  }
}

describeIntegration('Minimal Workflow Integration with Generation', () => {
  let llmProvider: ClaudeProvider;
  let context: ExecutionContext;
  let tools: Tool<any, any>[];

  let toolRegistry: ToolRegistry;
  let generator: WorkflowGenerator;

    // Helper function to save workflow DSL to file
    async function saveWorkflowToFile(dsl: string, filename: string) {
      const testOutputDir = path.join(__dirname, '../fixtures/generated');
      await fs.mkdir(testOutputDir, { recursive: true });
      await fs.writeFile(path.join(testOutputDir, filename), dsl, 'utf-8');
    }

  beforeAll(() => {
    llmProvider = new ClaudeProvider(ANTHROPIC_API_KEY);
    tools = [new AddTool(), new MultiplyTool(), new EchoTool()];
    toolRegistry = new ToolRegistry();
    tools.forEach((tool) => toolRegistry.registerTool(tool));
    generator = new WorkflowGenerator(llmProvider, toolRegistry);
  });

  beforeEach(() => {});

  it('should calculate 23 * 45 + 67 using tool chain', async () => {
    const prompt =
      'Calculate 23 * 45 + 67 using the provided calculation tools, and display the result';

    // Generate workflow
    const workflow = await generator.generateWorkflow(prompt);

    // Convert to DSL for validation and inspection
    const dsl = WorkflowParser.serialize(workflow);

    // Save DSL for human inspection
    await saveWorkflowToFile(dsl, 'calculator.json');

    // Execute workflow
    const workflowResult = await workflow.execute();

    // Log final output
    const workflowResultJson = JSON.stringify(workflowResult, null, 2);
    console.log('Workflow result:', workflowResultJson);

    // Find substring (1102) in the result string
    expect(workflowResultJson).toContain('1102');
  }, 60000);
});
