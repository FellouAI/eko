import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { TaskPrompt } from '../../types/tools.types';
/**
 * Element click
 */
export declare class ElementClick implements Tool<TaskPrompt, any> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: TaskPrompt): Promise<any>;
}
