import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { TaskPrompt, ElementRect } from '../../types/tools.types';
/**
 * Find Element Position
 */
export declare class FindElementPosition implements Tool<TaskPrompt, ElementRect | null> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: TaskPrompt): Promise<ElementRect | null>;
}
