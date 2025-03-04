import log from 'loglevel';

export class EkoLoggerFactory {
  private logger: log.Logger;
  private logStorage: string[] = [];

  constructor() {
    this.logger = log.getLogger('EkoLogger');
    this.logger.setLevel(log.levels.TRACE);

    const originalFactory = this.logger.methodFactory;

    this.logger.methodFactory = (methodName, logLevel, loggerName) => {
      const rawMethod = originalFactory(methodName, logLevel, loggerName);
      return (...args: any[]) => {
        const truncatedArgs = args.map(arg => this.toReadableString(arg));
        this.logStorage.push(`[${methodName.toUpperCase()}] ${truncatedArgs.join(' ')}`);
        rawMethod(...truncatedArgs);
      };
    };

  }
  // truncate content if it exceeds 2048 characters
  private toReadableString(content: any): string {
    const contentString = JSON.stringify(content);
    const maxLength = 2048;
    if (contentString.length > maxLength) {
      return contentString.substring(0, maxLength - 3) + '...';
    } else {
      return contentString;
    }
  }

  public getLoggerInstance(): log.Logger {
    return this.logger;
  }

  public getAllLogs(): string[] {
    return this.logStorage;
  }
}

export const logger = new EkoLoggerFactory().getLoggerInstance();
