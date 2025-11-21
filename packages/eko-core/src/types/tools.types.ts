import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../agent/agent-context";
import { LanguageModelV2ToolCallPart } from "@ai-sdk/provider";

export type ToolSchema =
  | {
      name: string;
      description?: string;
      parameters: JSONSchema7;
    }
  | {
      name: string;
      description?: string;
      input_schema: JSONSchema7;
    }
  | {
      name: string;
      description?: string;
      inputSchema: JSONSchema7;
    }
  | {
      type: "function";
      function: {
        name: string;
        description?: string;
        parameters: JSONSchema7;
      };
    };

export type ToolResult = {
  content:
    | [
        {
          type: "text";
          text: string;
        }
      ]
    | [
        {
          type: "image";
          data: string;
          mimeType?: string;
        }
      ]
    | [
        {
          type: "text";
          text: string;
        },
        {
          type: "image";
          data: string;
          mimeType?: string;
        }
      ];
  isError?: boolean;
  extInfo?: Record<string, unknown>;
};

export interface ToolExecuter {
  execute: (
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV2ToolCallPart
  ) => Promise<ToolResult>;
}

export interface Tool extends ToolExecuter {
  readonly name: string;
  readonly description?: string;
  readonly parameters: JSONSchema7;
  readonly noPlan?: boolean;
  readonly planDescription?: string;
  readonly supportParallelCalls?: boolean;
}
