import { Logger } from 'tslog';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ExecutionLogger {
  private logger: Logger<any>;
  private logFilePath: string;

  constructor() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    const logFileName = `eko-${timestamp}.log`;
    this.logFilePath = path.join(os.tmpdir(), logFileName);
    this.logger = new Logger({ name: "ExecutionLogger", });

    // log file path
    this.logger.info(`log file path at: ${this.logFilePath}`);
  }

  // Check if context exceeds 2KB
  private toStringAndTruncate(content: any): string {
    const contentString = JSON.stringify(content);
    const maxLength = 2048;
    if (contentString.length > maxLength) {
      return contentString.substring(0, maxLength) + '...';
    } else {
      return content;
    }
  }

  public info(message: string, ...args: any[]): void {
    const truncatedMessage = this.toStringAndTruncate(message);
    this.logger.info(truncatedMessage, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    const truncatedMessage = this.toStringAndTruncate(message);
    this.logger.warn(truncatedMessage, ...args);
  }

  public error(message: string, ...args: any[]): void {
    const truncatedMessage = this.toStringAndTruncate(message);
    this.logger.error(truncatedMessage, ...args);
  }

  public debug(message: string, ...args: any[]): void {
    const truncatedMessage = this.toStringAndTruncate(message);
    this.logger.debug(truncatedMessage, ...args);
  }

}

export const log = new ExecutionLogger();