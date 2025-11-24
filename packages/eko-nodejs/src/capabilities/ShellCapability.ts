import { spawn, ChildProcess } from "child_process";
import { AgentContext, ShellCapability as BaseShellCapability } from "@eko-ai/eko";

/**
 * Shell capability implementation for Node.js environment
 * 
 * Uses Node.js child_process to execute shell commands in sessions.
 */
export class ShellCapability extends BaseShellCapability {
  private sessions: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new shell session
   */
  protected async create_session(
    agentContext: AgentContext,
    exec_dir: string
  ): Promise<{ session_id: string }> {
    const session_id = `shell_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const shell = spawn("/bin/bash", [], {
      cwd: exec_dir,
      env: process.env,
    });

    this.sessions.set(session_id, shell);

    return { session_id };
  }

  /**
   * Execute a command in a shell session
   */
  protected async shell_exec(
    agentContext: AgentContext,
    session_id: string,
    command: string
  ): Promise<string> {
    const shell = this.sessions.get(session_id);
    
    if (!shell) {
      throw new Error(`Shell session not found: ${session_id}`);
    }

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""));
        }
      }, 30000); // 30 second timeout

      const stdoutHandler = (data: Buffer) => {
        stdout += data.toString();
      };

      const stderrHandler = (data: Buffer) => {
        stderr += data.toString();
      };

      const errorHandler = (error: Error) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };

      shell.stdout?.once("data", stdoutHandler);
      shell.stderr?.once("data", stderrHandler);
      shell.once("error", errorHandler);

      // Write command to stdin
      shell.stdin?.write(command + "\n");
      shell.stdin?.write("echo '<<<COMMAND_COMPLETE>>>'\n");

      // Wait for command completion marker
      const checkComplete = (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        
        if (output.includes("<<<COMMAND_COMPLETE>>>")) {
          clearTimeout(timeout);
          shell.stdout?.removeListener("data", checkComplete);
          shell.stderr?.removeListener("data", stderrHandler);
          shell.removeListener("error", errorHandler);
          
          if (!resolved) {
            resolved = true;
            // Remove the completion marker from output
            const cleanOutput = stdout.replace(/<<<COMMAND_COMPLETE>>>\s*/, "");
            resolve(cleanOutput + (stderr ? `\nSTDERR:\n${stderr}` : ""));
          }
        }
      };

      shell.stdout?.on("data", checkComplete);
    });
  }

  /**
   * Close a shell session
   */
  protected async close_session(
    agentContext: AgentContext,
    session_id: string
  ): Promise<void> {
    const shell = this.sessions.get(session_id);
    
    if (shell) {
      shell.kill();
      this.sessions.delete(session_id);
    }
  }
}

