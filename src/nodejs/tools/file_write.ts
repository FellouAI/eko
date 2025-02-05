import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { writeFile, appendFile, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

export interface FileWriteParams {
  path: string;
  content: string;
  append?: boolean;
  encoding?: BufferEncoding;
}

export class FileWrite implements Tool<FileWriteParams, any> {
  name = 'file_write';
  description = 'Write content to a file with user confirmation';
  need_vision: boolean = false;
  input_schema: InputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to write the file'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      },
      append: {
        type: 'boolean',
        description: 'Whether to append to existing file (default: false)'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        enum: ['utf8', 'ascii', 'utf16le', 'base64', 'binary']
      }
    },
    required: ['path', 'content']
  };

  private async checkFileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async getUserConfirmation(path: string, exists: boolean, append: boolean): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const action = exists
      ? (append ? 'append to' : 'overwrite')
      : 'create';

    return new Promise(resolve => {
      rl.question(`Are you sure you want to ${action} file at "${path}"? (y/N) `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  async execute(context: ExecutionContext, params: FileWriteParams): Promise<any> {
    try {
      const fullPath = resolve(params.path);
      const exists = await this.checkFileExists(fullPath);
      const append = params.append || false;

      const confirmed = await this.getUserConfirmation(fullPath, exists, append);
      if (!confirmed) {
        return {
          success: false,
          reason: 'User cancelled operation'
        };
      }

      if (append) {
        await appendFile(fullPath, params.content, {
          encoding: params.encoding || 'utf8'
        });
      } else {
        await writeFile(fullPath, params.content, {
          encoding: params.encoding || 'utf8'
        });
      }

      return {
        success: true,
        path: fullPath,
        action: append ? 'append' : 'write'
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      return {
        success: false,
        error: err.message,
        code: err.code
      };
    }
  }
}
