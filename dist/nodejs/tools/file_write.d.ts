import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export interface FileWriteParams {
    path: string;
    content: string;
    append?: boolean;
    encoding?: BufferEncoding;
}
export declare class FileWrite implements Tool<FileWriteParams, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    private checkFileExists;
    private getUserConfirmation;
    execute(context: ExecutionContext, params: FileWriteParams): Promise<any>;
}
