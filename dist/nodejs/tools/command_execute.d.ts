import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export interface CommandExecuteParams {
    command: string;
    cwd?: string;
}
export declare class CommandExecute implements Tool<CommandExecuteParams, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    private getUserConfirmation;
    execute(context: ExecutionContext, params: CommandExecuteParams): Promise<any>;
}
