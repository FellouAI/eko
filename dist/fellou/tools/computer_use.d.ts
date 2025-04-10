import { ComputerUseParam, ComputerUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Computer Use for fellou
 */
export declare class ComputerUse implements Tool<ComputerUseParam, ComputerUseResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * computer
     *
     * @param {*} params { action: 'mouse_move', coordinate: [100, 200] }
     * @returns { success: true, coordinate?: [], image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' } }
     */
    execute(context: ExecutionContext, params: ComputerUseParam): Promise<ComputerUseResult>;
}
