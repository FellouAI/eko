import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CommandExecuteParams {
  command: string;
  cwd?: string;
}

export class CommandExecute implements Tool<CommandExecuteParams, any> {
  name = 'command_execute';
  description = 'Execute a shell command with user confirmation';
  need_vision: boolean = false;
  input_schema: InputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute. Ensure that the command is non-interactive and does not require user input.'
      },
      cwd: {
        type: 'string',
        description: 'Working directory for command execution'
      }
    },
    required: ['command']
  };

  private async getUserConfirmation(command: string): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(`Are you sure you want to execute command: "${command}"? (y/N) `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  async execute(context: ExecutionContext, params: CommandExecuteParams): Promise<any> {
    const confirmed = await this.getUserConfirmation(params.command);
    if (!confirmed) {
      return {
        executed: false,
        reason: 'User cancelled execution'
      };
    }

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: params.cwd
      });
      return {
        executed: true,
        stdout,
        stderr
      };
    } catch (error) {
      const err = error as Error & { code?: number, stderr?: string };
      return {
        executed: false,
        error: err.message,
        code: err.code,
        stderr: err.stderr
      };
    }
  }
}
