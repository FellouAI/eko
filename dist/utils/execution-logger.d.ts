import { Message } from '../types/llm.types';
import { ExecutionContext } from '../types/action.types';
interface ImageData {
    type: 'base64';
    media_type: string;
    data: string;
}
export interface LogOptions {
    maxHistoryLength?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    includeTimestamp?: boolean;
    debugImagePath?: string;
    imageSaver?: (imageData: ImageData, filename: string) => Promise<string>;
}
/**
 * Manages logging for action execution, providing a cleaner view of the execution
 * flow while maintaining important context and history.
 */
export declare class ExecutionLogger {
    private history;
    private readonly maxHistoryLength;
    private readonly logLevel;
    private readonly includeTimestamp;
    private readonly debugImagePath?;
    private readonly imageSaver?;
    private readonly isNode;
    constructor(options?: LogOptions);
    /**
     * Logs a message with execution context
     */
    log(level: string, message: string, context?: ExecutionContext): void;
    /**
     * Updates conversation history while maintaining size limit
     */
    updateHistory(messages: Message[]): void;
    /**
     * Gets current conversation history
     */
    getHistory(): Message[];
    /**
     * Summarizes the execution context for logging
     */
    private summarizeContext;
    /**
     * Checks if message should be logged based on log level
     */
    private shouldLog;
    /**
     * Logs the start of an action execution
     */
    logActionStart(actionName: string, input: unknown, context?: ExecutionContext): void;
    /**
     * Logs the completion of an action execution
     */
    logActionComplete(actionName: string, result: unknown, context?: ExecutionContext): void;
    /**
     * Logs a tool execution
     */
    logToolExecution(toolName: string, input: unknown, context?: ExecutionContext): void;
    /**
     * Logs an error that occurred during execution
     */
    logError(error: Error, context?: ExecutionContext): void;
    private extractFromDataUrl;
    private saveDebugImage;
    private formatToolResult;
    logToolResult(toolName: string, result: unknown, context?: ExecutionContext): Promise<void>;
}
export {};
