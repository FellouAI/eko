import { TabManagementParam, TabManagementResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Browser tab management
 */
export declare class TabManagement implements Tool<TabManagementParam, TabManagementResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * Tab management
     *
     * @param {*} params { command: `new_tab [url]` | 'tab_all' | 'current_tab' | 'go_back' | 'close_tab' | 'switch_tab [tabId]' | `change_url [url]` }
     * @returns > { result, success: true }
     */
    execute(context: ExecutionContext, params: TabManagementParam): Promise<TabManagementResult>;
    destroy(context: ExecutionContext): void;
}
