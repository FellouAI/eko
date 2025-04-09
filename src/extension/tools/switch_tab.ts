import {
  ExecutionContext,
  InputSchema,
  SwitchTabParam,
  TabInfo,
  TabManagementResult,
  Tool,
} from '@/types';


export class SwitchTab implements Tool<SwitchTabParam, TabManagementResult> {
  description: string;
  input_schema: InputSchema;
  name: string;

  constructor() {
    this.name = 'switch_tab';
    this.description = 'Switch to the specified tab using tabId';
    this.input_schema = {
      type: 'object',
      properties: {
        tabId: {
          type: 'integer',
          description: 'The tabId to switch to',
        },
      },
      required: ['tabId'],
    };

  }

  async execute(context: ExecutionContext, params: SwitchTabParam): Promise<TabManagementResult> {
    if (params === null || !params.tabId) {
      throw new Error('Invalid parameters. Expected an object with a "tabId" property.');
    }
    let result: TabManagementResult;
    let tabId = parseInt(String(params.tabId));
    let tab = await context.ekoConfig.chromeProxy.tabs.update(tabId, { active: true });
    context.variables.set('tabId', tab.id);
    context.variables.set('windowId', tab.windowId);
    let tabInfo: TabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
    result = tabInfo;
    return result;
  }

}
