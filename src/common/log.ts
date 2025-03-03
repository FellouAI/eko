import log from 'loglevel';

export class EkoLogger {
  private logger: log.Logger;

  constructor() {
    this.logger = log.getLogger('EkoLogger');
    this.logger.setLevel(log.levels.TRACE);

    const originalFactory = this.logger.methodFactory;
    
    this.logger.methodFactory = (methodName, logLevel, loggerName) => {
      const rawMethod = originalFactory(methodName, logLevel, loggerName);
      return (...args: any[]) => {
        const truncatedArgs = args.map(arg => this.toReadableString(arg));
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

  public getLogger(): log.Logger {
    return this.logger;
  }
}

export const logger = new EkoLogger().getLogger();
