import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export interface FileReadParams {
    path: string;
    encoding?: BufferEncoding;
}
export declare class FileRead implements Tool<FileReadParams, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    execute(context: ExecutionContext, params: FileReadParams): Promise<any>;
}
