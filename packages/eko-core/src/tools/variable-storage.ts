import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../agent/agent-context";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "variable_storage";

export default class VariableStorageTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `Used for storing, reading, and retrieving variable data, and maintaining input/output variables in task nodes. When the same variable is stored repeatedly, it will overwrite the previous value.`;
    this.parameters = {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "variable storage operation type.",
          enum: ["read_variable", "write_variable", "list_all_variable"],
        },
        name: {
          type: "string",
          description:
            "variable name, required when reading and writing variables, If reading variables, it supports reading multiple variables separated by commas.",
        },
        value: {
          type: "string",
          description: "variable value, required when writing variables",
        },
      },
      required: ["operation"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let operation = args.operation as string;
    let resultText = "";
    switch (operation) {
      case "read_variable": {
        if (!args.name) {
          resultText = "Error: name is required";
        } else {
          let result = {} as any;
          let name = args.name as string;
          let keys = name.split(",");
          for (let i = 0; i < keys.length; i++) {
            let key = keys[i].trim();
            let value = agentContext.context.variables.get(key);
            result[key] = value;
          }
          resultText = JSON.stringify(result);
        }
        break;
      }
      case "write_variable": {
        if (!args.name) {
          resultText = "Error: name is required";
          break;
        }
        if (args.value == undefined) {
          resultText = "Error: value is required";
          break;
        }
        let key = args.name as string;
        agentContext.context.variables.set(key.trim(), args.value);
        resultText = "success";
        break;
      }
      case "list_all_variable": {
        resultText = JSON.stringify([...agentContext.context.variables.keys()]);
        break;
      }
    }
    return {
      content: [
        {
          type: "text",
          text: resultText || "",
        },
      ],
    };
  }
}

export { VariableStorageTool };
