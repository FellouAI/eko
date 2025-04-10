import { ExportFileParam } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Export file
 */
export declare class ExportFile implements Tool<ExportFileParam, unknown> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * export
     *
     * @param {*} params { fileType: 'csv', content: 'field1,field2\ndata1,data2' }
     * @returns > { success: true }
     */
    execute(context: ExecutionContext, params: ExportFileParam): Promise<unknown>;
}
