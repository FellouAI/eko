import { Tool, ExecutionContext, InputSchema, Properties } from '../../src/types/action.types';
import { WorkflowImpl } from '../../src/models/workflow';
import { ActionImpl } from '../../src/models/action';
import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import dotenv from 'dotenv';

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
        description: 'First number'
      } as const,
      b: {
        type: 'number',
        description: 'Second number'
      } as const
    } as unknown as Properties,
    required: ['a', 'b']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
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
        description: 'First number'
      } as const,
      b: {
        type: 'number',
        description: 'Second number'
      } as const
    } as unknown as Properties,
    required: ['a', 'b']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
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
        description: 'Message or value to display'
      } as const
    } as unknown as Properties,
    required: ['message']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { message } = params as { message: string };
    console.log('Echo:', message);
    return { displayed: message };
  }
}

describeIntegration('Minimal Workflow Integration', () => {
  let llmProvider: ClaudeProvider;
  let context: ExecutionContext;
  let tools: Tool<any, any>[];

  beforeAll(() => {
    llmProvider = new ClaudeProvider(ANTHROPIC_API_KEY);
    tools = [new AddTool(), new MultiplyTool(), new EchoTool()];
  });

  beforeEach(() => {
  });

  it('should calculate 23 * 45 + 67 using tool chain', async () => {
    // Create calculation action
    const calculateAction = ActionImpl.createPromptAction(
      'calculate expression 23 * 45 + 67',
      'calculate expression 23 * 45 + 67',
      tools,
      llmProvider,
      { maxTokens: 1000 }
    );

    // Create display action
    const displayAction = ActionImpl.createPromptAction(
      'display result',
      'display result',
      tools,
      llmProvider,
      { maxTokens: 1000 }
    );

    // Create workflow
    const workflow = new WorkflowImpl(
      'calc-and-display',
      'Calculate and Display Workflow',
      { workingWindowId: undefined },
    );

    workflow.llmProvider = llmProvider;

    // Add calculation node
    const calculateNode = {
      id: 'calculate',
      name: 'Calculate Expression',
      dependencies: [],
      input: {
        type: 'object',
        schema: {},
        value: null
      },
      output: {
        type: 'object',
        schema: {},
        value: null
      },
      action: calculateAction
    };
    workflow.addNode(calculateNode);

    // Add display node
    workflow.addNode({
      id: 'display',
      name: 'Display Result',
      dependencies: ['calculate'],
      input: {
        type: 'object',
        schema: {},
        value: null
      },
      output: {
        type: 'object',
        schema: {},
        value: null
      },
      action: displayAction
    });

    // Execute workflow
    await workflow.execute();

    // Log all context variables
    console.log('Context variables:', Object.fromEntries(workflow.variables));

    // Find numerical result in context variables
    const numberResults = Array.from(workflow.variables.entries())
      .filter(([_, value]) => typeof value === 'number');

    expect(numberResults.length).toBeGreaterThan(0);

    // Find the final calculation result (1102)
    const finalResult = numberResults.find(([_, value]) => value === 1102);
    expect(finalResult).toBeDefined();
    console.log('Found result:', finalResult);
  }, 60000);
});
