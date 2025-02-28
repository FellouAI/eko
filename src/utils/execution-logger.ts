import { Logger } from 'tslog';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LogOptions {
  level: string;
  filePath?: string;
}

export class ExecutionLogger {
  private logger: Logger<any>;
  private logFilePath: string;

  constructor() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate())
      .padStart(2, '0')}${String(now.getHours())
        .padStart(2, '0')}${String(now.getMinutes())
          .padStart(2, '0')}${String(now.getSeconds())
            .padStart(2, '0')}`;

    const logFileName = `eko-${timestamp}.log`;
    this.logFilePath = path.join(os.tmpdir(), logFileName);
    this.logger = new Logger({ name: "ExecutionLogger", });

    // 打印日志文件路径
    this.logger.info(`Log file Path at: ${this.logFilePath}`);
  }

  //辅助函数：检查context是否超过2kb
  private truncateContext(content: any): any {
    const contentString = JSON.stringify(content);
    const maxLength = 2048;
    if (contentString.length > maxLength) {
      return contentString.substring(0, maxLength) + '...';
    }
    return content;
  }

}