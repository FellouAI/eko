import { Logger, ILogObj } from 'tslog';
import { join } from 'path';
import { tmpdir } from 'os';

export class EkoLogger {
  private logger: Logger<ILogObj>;
  private logFilePath: string;

  constructor() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

    const logFileName = `Eko-${timestamp}.log`;
    this.logFilePath = join(tmpdir(), logFileName);

    this.logger = new Logger({
      name: "EkoLog",
      overwrite: {
        mask: (...args: any[]): unknown[] => {
          return args.map((arg) => {
            return this.toReadableString(arg);
          });
        },
      },
    });

    // log file path
    this.logger.info(`log file path at: ${this.logFilePath}`);
  }

  // truncate content if it exceeds 2048 characters
  private toReadableString(content: any): string {
    const contentString = JSON.stringify(content);
    const maxLength = 2048;
    if (contentString.length > maxLength) {
      return contentString.substring(0, maxLength) + '...';
    } else {
      return contentString;
    }
  }

  public getLogger(): Logger<ILogObj> {
    return this.logger;
  }
}

export const logger = new EkoLogger().getLogger();
