import { Logger, ILogObj } from 'tslog';
import { join } from 'path';
import { tmpdir } from 'os';

export class EkoLogger {
  private logger: Logger<ILogObj>;
  private logFilePath: string;

  constructor() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}
      ${String(now.getMonth() + 1).padStart(2, '0')}
      ${String(now.getDate()).padStart(2, '0')}
      ${String(now.getHours()).padStart(2, '0')}
      ${String(now.getMinutes()).padStart(2, '0')}
      ${String(now.getSeconds()).padStart(2, '0')}`;

    const logFileName = `eko-${timestamp}.log`;
    this.logFilePath = join(tmpdir(), logFileName);
    this.logger = new Logger({ name: "EkoLog" });

    // log file path
    this.logger.info(`log file path at: ${this.logFilePath}`);
  }

  // truncate content if it exceeds 2048 characters
  private truncateContent(content: any): string {
    const contentString = JSON.stringify(content);
    const maxLength = 2048;
    if (contentString.length > maxLength) {
      return contentString.substring(0, maxLength) + '...';
    } else {
      return content;
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', ...args: any[]): void {
    const truncatedArgs = args.map(arg => {
      if (typeof arg == 'object') {
        return this.truncateContent(arg);
      } else if (typeof arg === 'string') {
        return this.truncateContent(arg);
      } else {
        return arg;
      }
    })
    this.logger[level](...truncatedArgs);
  }

  public info(...args: any[]): void {
    this.log('info', ...args);
  }

  public warn(...args: any[]): void {
    this.log('warn', ...args);
  }

  public error(...args: any[]): void {
    this.log('error', ...args);
  }

  public debug(...args: any[]): void {
    this.log('debug', ...args);
  }

}

export const log = new EkoLogger();