import { WorkflowImpl } from '../../src/models/workflow';
import { WorkflowNode, Action, Tool, ExecutionContext, EkoConfig } from '../../src/types';

describe('WorkflowImpl', () => {
  let workflow: WorkflowImpl;

  beforeEach(() => {
    workflow = new WorkflowImpl(
      'test-id',
      'Test Workflow',
      { workingWindowId: undefined } as EkoConfig,
    );
  });

  const createMockNode = (id: string, dependencies: string[] = []): WorkflowNode => ({
    id,
    name: `Node ${id}`,
    input: { items: [] },
    output: { name: "mock_output", description: "mock output", value: null },
    dependencies,
    action: {
      type: 'script',
      name: 'test',
      description: 'test',
      tools: [],
      execute: async () => ({ result: `Executed ${id}` }),
    }
  });

  describe('node management', () => {
    test('should add node successfully', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.getNode('node1')).toBe(node);
    });

    test('should throw when adding duplicate node', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      expect(() => workflow.addNode(node)).toThrow();
    });

    test('should remove node successfully', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      workflow.removeNode('node1');
      expect(workflow.nodes).toHaveLength(0);
    });

    test('should throw when removing non-existent node', () => {
      expect(() => workflow.removeNode('nonexistent')).toThrow();
    });

    test('should throw when removing node with dependents', () => {
      const node1 = createMockNode('node1');
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      expect(() => workflow.removeNode('node1')).toThrow();
    });
  });

  describe('DAG validation', () => {
    test('should detect simple cycle', () => {
      const node1 = createMockNode('node1', ['node2']);
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      expect(workflow.validateDAG()).toBe(false);
    });

    test('should validate acyclic graph', () => {
      const node1 = createMockNode('node1');
      const node2 = createMockNode('node2', ['node1']);
      const node3 = createMockNode('node3', ['node1', 'node2']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      workflow.addNode(node3);
      expect(workflow.validateDAG()).toBe(true);
    });
  });

  describe('execution', () => {
    test('should execute nodes in correct order', async () => {
      const executed: string[] = [];

      const createExecutableNode = (id: string, dependencies: string[] = []): WorkflowNode => ({
        ...createMockNode(id, dependencies),
        action: {
          type: 'script',
          name: 'test',
          description: 'test',
          tools: [],
          execute: async () => {
            executed.push(id);
            return { result: `Executed ${id}` };
          }
        }
      });

      const node1 = createExecutableNode('node1');
      const node2 = createExecutableNode('node2', ['node1']);
      const node3 = createExecutableNode('node3', ['node1', 'node2']);

      workflow.addNode(node1);
      workflow.addNode(node2);
      workflow.addNode(node3);

      await workflow.execute();

      expect(executed).toEqual(['node1', 'node2', 'node3']);
    });

    test('should throw on cyclic dependencies during execution', async () => {
      const node1 = createMockNode('node1', ['node2']);
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);

      await expect(workflow.execute()).rejects.toThrow();
    });
  });
});
