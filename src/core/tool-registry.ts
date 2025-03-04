// src/core/tool-registry.ts

import { Tool } from '../types/action.types';
import { ToolDefinition } from '../types/llm.types';
import { workflowSchema } from '../schemas/workflow.schema';

export class ToolRegistry {
  private tools: Map<string, Tool<any, any>> = new Map();

  registerTool(tool: Tool<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }  

  unregisterTool(toolName: string): boolean {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool with name "${toolName}" does not exist`);
    }
    return this.tools.delete(toolName);
  }  

  getTool(toolName: string): Tool<any, any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool with name ${toolName} not found`);
    }
    return tool;
  }

  hasTools(toolNames: string[]): boolean {
    return toolNames.every(name => this.tools.has(name));
  }

  getAllTools(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    })) as ToolDefinition[];
  }

  getToolEnum(): string[] {
    return Array.from(this.tools.keys());
  }

  // Gets workflow schema with current tools
  getWorkflowSchema(): object {
    const schema = JSON.parse(JSON.stringify(workflowSchema)); // Deep clone

    // Update the tools property in action schema to use current tool enum
    const actionProperties = schema.properties.nodes.items.properties.action.properties;
    actionProperties.tools = {
      type: 'array',
      items: {
        type: 'string',
        enum: this.getToolEnum()
      },
    };

    return schema;
  }
}
