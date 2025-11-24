import { BaseCapability } from "./base";
import { AgentContext } from "../core/context";
import { Tool, ToolResult } from "../types";

/**
 * Shell capability abstract class
 * 
 * Provides shell command execution tools (create_session, shell_exec, close_session).
 * Subclasses must implement the abstract shell operation methods.
 */
export abstract class ShellCapability extends BaseCapability {
  name = "Shell";

  constructor() {
    super();
    this._tools = this.buildTools();
  }

  /**
   * Abstract methods to be implemented by concrete shell capability implementations
   */
  protected abstract create_session(
    agentContext: AgentContext,
    exec_dir: string
  ): Promise<{
    session_id: string;
  }>;

  protected abstract shell_exec(
    agentContext: AgentContext,
    session_id: string,
    command: string
  ): Promise<string>;

  protected abstract close_session(
    agentContext: AgentContext,
    session_id: string
  ): Promise<void>;

  /**
   * Helper method to format tool result
   */
  protected async callInnerTool(fun: () => Promise<any>): Promise<ToolResult> {
    let result = await fun();
    return {
      content: [
        {
          type: "text",
          text: result
            ? typeof result == "string"
              ? result
              : JSON.stringify(result)
            : "Successful",
        },
      ],
    };
  }

  /**
   * Build tools for shell operations
   */
  private buildTools(): Tool[] {
    return [
      {
        name: "create_session",
        description: "Create a new shell session",
        parameters: {
          type: "object",
          properties: {
            exec_dir: {
              type: "string",
              description:
                "Working directory for command execution (absolute path)",
            },
          },
          required: ["exec_dir"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.create_session(agentContext, args.exec_dir as string)
          );
        },
      },
      {
        name: "shell_exec",
        description: "Execute commands in a specified shell session",
        parameters: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "shell session id",
            },
            command: {
              type: "string",
              description: "Shell command to execute",
            },
          },
          required: ["session_id", "command"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.shell_exec(
              agentContext,
              args.session_id as string,
              args.command as string
            )
          );
        },
      },
      {
        name: "close_session",
        description: "Close shell session",
        parameters: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "shell session id",
            },
          },
          required: ["session_id"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.close_session(agentContext, args.session_id as string)
          );
        },
      },
    ];
  }

  /**
   * Get capability guide for system prompt
   */
  getGuide(): string {
    return `Shell command execution capability, execute commands in a bash shell environment.

* CAPABILITIES:
  - Create shell sessions: Use \`create_session\` to establish a new shell session with a specific working directory.
  - Execute commands: Use \`shell_exec\` to run commands within an established session.
  - Close sessions: Use \`close_session\` to terminate a shell session when done.

* OPERATIONAL RULES:
  - You must first call \`create_session\` to create a new session before executing commands.
  - Each session maintains its own working directory and environment state.
  - Execute delete commands with extreme caution, and never perform dangerous operations like \`rm -rf /\`.
  - Avoid commands that may produce very large amounts of output.
  - Use session_id to target specific sessions when executing commands.`;
  }
}

