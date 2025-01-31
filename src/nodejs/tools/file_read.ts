import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export interface FileReadParams {
  path: string;
  encoding?: BufferEncoding;
}

export class FileRead implements Tool<FileReadParams, any> {
  name = 'file_read';
  description = 'Read content from a file';
  need_vision: boolean = false;
  input_schema: InputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        enum: ['utf8', 'ascii', 'utf16le', 'base64', 'binary']
      }
    },
    required: ['path']
  };

  async execute(context: ExecutionContext, params: FileReadParams): Promise<any> {
    try {
      const fullPath = resolve(params.path);
      const content = await readFile(fullPath, {
        encoding: params.encoding || 'utf8'
      });

      return {
        success: true,
        path: fullPath,
        content
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
