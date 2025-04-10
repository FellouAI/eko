import { WebSearchParam, WebSearchResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
/**
 * Web Search
 */
export declare class WebSearch implements Tool<WebSearchParam, WebSearchResult[]> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    /**
     * search
     *
     * @param {*} params { url: 'https://www.google.com', query: 'ai agent', maxResults: 5 }
     * @returns > [{ title, url, content }]
     */
    execute(context: ExecutionContext, params: WebSearchParam): Promise<WebSearchResult[]>;
}
