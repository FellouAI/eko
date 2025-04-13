import { Message } from '../types/llm.types';
import { ExecutionContext } from '../types/action.types';
import { logger } from '@/common/log';

interface ImageData {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface LogOptions {
  maxHistoryLength?: number; // Maximum number of messages to keep in history
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeTimestamp?: boolean;
  debugImagePath?: string; // Directory path to save debug images (Node.js only)
  imageSaver?: (imageData: ImageData, filename: string) => Promise<string>; // Custom image saver function
}

/**
 * Manages logging for action execution, providing a cleaner view of the execution
 * flow while maintaining important context and history.
 */
export class ExecutionLogger {
  private history: Message[] = [];
  private readonly maxHistoryLength: number;
  private readonly logLevel: string;
  private readonly includeTimestamp: boolean;
  private readonly debugImagePath?: string;
  private readonly imageSaver?: (imageData: ImageData, filename: string) => Promise<string>;
  private readonly isNode: boolean;

  constructor(options: LogOptions = {}) {
    this.maxHistoryLength = options.maxHistoryLength || 10;
    this.logLevel = options.logLevel || 'info';
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.debugImagePath = options.debugImagePath;
    this.imageSaver = options.imageSaver;

    // Check if running in Node.js environment
    this.isNode =
      typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  }

  /**
   * Logs a message with execution context
   */
  log(level: string, message: string, context?: ExecutionContext) {
    if (this.shouldLog(level)) {
      const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
      const contextSummary = this.summarizeContext(context);
      logger.debug(`${timestamp} [${level.toUpperCase()}] ${message}${contextSummary}`);
    }
  }

  /**
   * Updates conversation history while maintaining size limit
   */
  updateHistory(messages: Message[]) {
    // Keep system messages and last N messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const recentMessages = nonSystemMessages.slice(-this.maxHistoryLength);
    this.history = [...systemMessages, ...recentMessages];
  }

  /**
   * Gets current conversation history
   */
  getHistory(): Message[] {
    return this.history;
  }

  /**
   * Summarizes the execution context for logging
   */
  private summarizeContext(context?: ExecutionContext): string {
    if (!context) return '';

    const summary = {
      variables: Object.fromEntries(context.variables),
      tools: context.tools ? Array.from(context.tools.keys()) : [],
    };

    return `\nContext: ${JSON.stringify(summary, null, 2)}`;
  }

  /**
   * Checks if message should be logged based on log level
   */
  private shouldLog(level: string): boolean {
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    } as Record<string, number>;

    return levels[level] <= levels[this.logLevel];
  }

  /**
   * Logs the start of an action execution
   */
  logActionStart(actionName: string, input: unknown, context?: ExecutionContext) {
    this.log('info', `Starting action: ${actionName}`, context);
    this.log('info', `Input: ${JSON.stringify(input, null, 2)}`);
  }

  /**
   * Logs the completion of an action execution
   */
  logActionComplete(actionName: string, result: unknown, context?: ExecutionContext) {
    this.log('info', `Completed action: ${actionName}`, context);
    this.log('info', `Result: ${JSON.stringify(result, null, 2)}`);
  }

  /**
   * Logs a tool execution
   */
  logToolExecution(toolName: string, input: unknown, context?: ExecutionContext) {
    this.log('info', `Executing tool: ${toolName}`);
    this.log('info', `Tool input: ${JSON.stringify(input, null, 2)}`);
  }

  /**
   * Logs an error that occurred during execution
   */
  logError(error: Error, context?: ExecutionContext) {
    logger.error(error);
    try {
      this.log('error', `Error occurred: ${error.message}`, context);
      if (error.stack) {
        this.log('debug', `Stack trace: ${error.stack}`);
      }
    } catch (error) {
      logger.error("An error occurs when trying to log another error:");
      logger.error(error);
    }
  }

  private extractFromDataUrl(dataUrl: string): { extension: string; base64Data: string } {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }
    return {
      extension: matches[1],
      base64Data: matches[2],
    };
  }

  private async saveDebugImage(imageData: string | ImageData, toolName: string): Promise<string> {
    try {
      let extension: string;
      let base64Data: string;

      // Handle both data URL strings and ImageData objects
      if (typeof imageData === 'string' && imageData.startsWith('data:')) {
        const extracted = this.extractFromDataUrl(imageData);
        extension = extracted.extension;
        base64Data = extracted.base64Data;
      } else if (typeof imageData === 'object' && 'type' in imageData) {
        extension = imageData.media_type.split('/')[1] || 'png';
        base64Data = imageData.data;
      } else {
        return '[image]';
      }

      // If custom image saver is provided, use it
      if (this.imageSaver) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${toolName}_${timestamp}.${extension}`;
        return await this.imageSaver(
          { type: 'base64', media_type: `image/${extension}`, data: base64Data },
          filename
        );
      }

      // If in Node.js environment and debugImagePath is set
      if (this.isNode && this.debugImagePath) {
        // Dynamically import Node.js modules only when needed
        const { promises: fs } = await import('fs');
        const { join } = await import('path');

        await fs.mkdir(this.debugImagePath, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${toolName}_${timestamp}.${extension}`;
        const filepath = join(this.debugImagePath, filename);

        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filepath, buffer);

        return `[image saved to: ${filepath}]`;
      }

      // Default case - just return placeholder
      return '[image]';
    } catch (error) {
      logger.warn('Failed to save debug image:', error);
      return '[image]';
    }
  }

  private async formatToolResult(result: any): Promise<string> {
    // Handle null/undefined
    if (result == null) {
      return 'null';
    }

    // Handle direct image result
    if (result.image) {
      const imagePlaceholder = await this.saveDebugImage(result.image, 'tool');
      const modifiedResult = { ...result, image: imagePlaceholder };
      return JSON.stringify(modifiedResult);
    }

    // Handle nested images in result object
    if (typeof result === 'object') {
      const formatted = { ...result };
      for (const [key, value] of Object.entries(formatted)) {
        if (value && typeof value === 'string' && value.startsWith('data:image/')) {
          formatted[key] = await this.saveDebugImage(value, key);
        } else if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          value.type === 'base64'
        ) {
          formatted[key] = await this.saveDebugImage(value as ImageData, key);
        }
      }
      return JSON.stringify(formatted);
    }

    // Handle primitive values
    return String(result);
  }

  async logToolResult(
    toolName: string,
    result: unknown,
    context?: ExecutionContext
  ): Promise<void> {
    if (this.shouldLog('info')) {
      const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
      const contextSummary = this.summarizeContext(context);
      const formattedResult = await this.formatToolResult(result);

      logger.debug(
        `${timestamp} [INFO] Tool executed: ${toolName}\n` +
          `${timestamp} [INFO] Tool result: ${formattedResult}${contextSummary}`
      );
    }
  }
}
