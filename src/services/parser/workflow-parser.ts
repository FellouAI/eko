import { Workflow, WorkflowNode, NodeInput, NodeOutput } from '../../types/workflow.types';
import { ValidationResult, ValidationError } from '../../types/parser.types';
import { WorkflowImpl } from '../../models/workflow';
import { ActionImpl } from '../../models/action';
import { EkoConfig } from '@/types';

export class WorkflowParser {
  /**
   * Parse JSON string into runtime Workflow object
   * @throws {Error} if JSON is invalid or schema validation fails
   */
  static parse(json: string, ekoConfig: EkoConfig): Workflow {
    let parsed: any;

    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }

    const validationResult = this.validate(parsed);
    if (!validationResult.valid) {
      throw new Error(
        `Invalid workflow: ${validationResult.errors.map((e) => e.message).join(', ')}`
      );
    }

    return this.toRuntime(parsed, ekoConfig);
  }

  /**
   * Convert runtime Workflow object to JSON string
   */
  static serialize(workflow: Workflow): string {
    const json = this.fromRuntime(workflow);
    return JSON.stringify(json, null, 2);
  }

  /**
   * Validate workflow JSON structure against schema
   */
  static validate(json: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    // Basic structure validation
    if (!json || typeof json !== 'object') {
      errors.push({
        type: 'schema',
        message: 'Workflow must be an object',
      });
      return { valid: false, errors };
    }

    const workflow = json as Record<string, any>;

    // Required fields validation
    const requiredFields = ['id', 'name', 'nodes'];
    for (const field of requiredFields) {
      if (!(field in workflow)) {
        errors.push({
          type: 'schema',
          message: `Missing required field: ${field}`,
          path: `/${field}`,
        });
      }
    }

    // Nodes validation
    if (!Array.isArray(workflow.nodes)) {
      errors.push({
        type: 'type',
        message: 'Nodes must be an array',
        path: '/nodes',
      });
    } else {
      const nodeIds = new Set<string>();

      // Validate each node
      workflow.nodes.forEach((node: any, index: number) => {
        if (!node.id) {
          errors.push({
            type: 'schema',
            message: `Node at index ${index} missing id`,
            path: `/nodes/${index}/id`,
          });
        } else {
          if (nodeIds.has(node.id)) {
            errors.push({
              type: 'reference',
              message: `Duplicate node id: ${node.id}`,
              path: `/nodes/${index}/id`,
            });
          }
          nodeIds.add(node.id);
        }

        // Validate dependencies
        if (node.dependencies) {
          if (!Array.isArray(node.dependencies)) {
            errors.push({
              type: 'type',
              message: `Dependencies must be an array for node ${node.id}`,
              path: `/nodes/${index}/dependencies`,
            });
          } else {
            node.dependencies.forEach((depId: any) => {
              if (typeof depId !== 'string') {
                errors.push({
                  type: 'type',
                  message: `Dependency id must be a string in node ${node.id}`,
                  path: `/nodes/${index}/dependencies`,
                });
              }
            });
          }
        }

        // Validate action
        if (!node.action) {
          errors.push({
            type: 'schema',
            message: `Node ${node.id} missing action`,
            path: `/nodes/${index}/action`,
          });
        } else {
          if (!['prompt', 'script', 'hybrid'].includes(node.action.type)) {
            errors.push({
              type: 'type',
              message: `Invalid action type for node ${node.id}`,
              path: `/nodes/${index}/action/type`,
            });
          }
        }
      });

      // Validate dependency references
      workflow.nodes.forEach((node: any) => {
        if (node.dependencies) {
          node.dependencies.forEach((depId: string) => {
            if (!nodeIds.has(depId)) {
              errors.push({
                type: 'reference',
                message: `Node ${node.id} references non-existent dependency: ${depId}`,
                path: `/nodes/${workflow.nodes.findIndex((n: any) => n.id === node.id)}/dependencies`,
              });
            }
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static toRuntime(json: any, ekoConfig: EkoConfig): Workflow {
    const variables = new Map(Object.entries(json.variables || {}));
    const workflow = new WorkflowImpl(
      json.id,
      json.name,
      ekoConfig,
      json.description,
      [],
      variables,
      undefined,
      {
        logLevel: 'info',
        includeTimestamp: true,
      }
    );

    // Convert nodes
    json.nodes.forEach((nodeJson: any) => {
      const action = ActionImpl.createPromptAction(
        nodeJson.action.name,
        nodeJson.action.description,
        // Pass tool names as strings, they'll be resolved at execution time
        nodeJson.action.tools || [],
        undefined, // LLM provider will be injected at execution time
        { maxTokens: 1000 }
      );

      const node: WorkflowNode = {
        id: nodeJson.id,
        name: nodeJson.name || nodeJson.id,
        description: nodeJson.description,
        dependencies: nodeJson.dependencies || [],
        input: { items: [] },
        output: nodeJson.output || {
          name: `${nodeJson.name || nodeJson.id}_output`,
          description: `Output of node ${nodeJson.name || nodeJson.id}`,
          value: null,
        },
        action: action,
      };

      workflow.addNode(node);
    });

    return workflow;
  }

  /**
   * Convert runtime Workflow object to JSON structure
   */
  private static fromRuntime(workflow: Workflow): unknown {
    return {
      version: '1.0',
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        description: node.description,
        dependencies: node.dependencies,
        output: node.output,
        action: {
          type: node.action.type,
          name: node.action.name,
          description: node.action.description,
          tools: node.action.tools
            .map((tool) => (typeof tool === 'string' ? tool : tool.name))
            .filter((tool) => tool !== 'write_context'),
        },
      })),
      variables: Object.fromEntries(workflow.variables),
    };
  }
}
