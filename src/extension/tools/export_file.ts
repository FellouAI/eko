import { ExportFileParam } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, open_new_tab, sleep } from '../utils';
import { exportFile } from './html_script';

/**
 * Export file
 */
export class ExportFile implements Tool<ExportFileParam, unknown> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'export_file';
    this.description = 'Content exported as a file, support text format';
    this.input_schema = {
      type: 'object',
      properties: {
        fileType: {
          type: 'string',
          description: 'File format type',
          enum: ['txt', 'csv', 'md', 'html', 'js', 'xml', 'json', 'yml', 'sql'],
        },
        content: {
          type: 'string',
          description: 'Export file content',
        },
        filename: {
          type: 'string',
          description: 'File name',
        },
      },
      required: ['fileType', 'content'],
    };
  }

  /**
   * export
   *
   * @param {*} params { fileType: 'csv', content: 'field1,field2\ndata1,data2' }
   * @returns > { success: true }
   */
  async execute(context: ExecutionContext, params: ExportFileParam): Promise<unknown> {
    if (typeof params !== 'object' || params === null || !('content' in params)) {
      throw new Error('Invalid parameters. Expected an object with a "content" property.');
    }
    await context.callback?.hooks?.onExportFile?.(params);
    let type = 'text/plain';
    switch (params.fileType) {
      case 'csv':
        type = 'text/csv';
        break;
      case 'md':
        type = 'text/markdown';
        break;
      case 'html':
        type = 'text/html';
        break;
      case 'js':
        type = 'application/javascript';
        break;
      case 'xml':
        type = 'text/xml';
        break;
      case 'json':
        type = 'application/json';
        break;
    }
    let filename: string;
    if (!params.filename) {
      filename = new Date().getTime() + '.' + params.fileType;
    } else if (!(params.filename + '').endsWith(params.fileType)) {
      filename = params.filename + '.' + params.fileType;
    } else {
      filename = params.filename;
    }
    try {
      let tabId = await getTabId(context);
      await context.ekoConfig.chromeProxy.scripting.executeScript({
        target: { tabId: tabId as number },
        func: exportFile,
        args: [filename, type, params.content],
      });
    } catch (e) {
      let tab;
      const url = 'https://www.google.com';
      if (context.ekoConfig.workingWindowId) {
        tab = await open_new_tab(context.ekoConfig.chromeProxy, url, false, context.ekoConfig.workingWindowId);
      } else {
        tab = await open_new_tab(context.ekoConfig.chromeProxy, url, true);
      }
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      let tabId = tab.id as number;
      await context.ekoConfig.chromeProxy.scripting.executeScript({
        target: { tabId: tabId as number },
        func: exportFile,
        args: [filename, type, params.content],
      });
      await sleep(5000);
      await context.ekoConfig.chromeProxy.tabs.remove(tabId);
    }
    return { success: true };
  }
}