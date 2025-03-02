import { Message } from '../../types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, getWindowId, doesTabExists } from '../utils';
import { screenshot } from './browser';

export class RequestLogin implements Tool<any, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'request_login';
    this.description =
      'Login to this website, assist with identity verification when manual intervention is needed, guide users through the login process, and wait for their confirmation of successful login.';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  async execute(context: ExecutionContext, params: any): Promise<any> {
    if (!params.force && await this.isLoginIn(context)) {
      return true;
    }
    let tabId = await getTabId(context);
    let task_id = 'login_required_' + tabId;
    const request_user_help = async () => {
      await context.ekoConfig.chromeProxy.tabs.sendMessage(tabId, {
        type: 'request_user_help',
        task_id,
        failure_type: 'login_required',
        failure_message: 'Access page require user authentication.',
      });
    };
    const login_interval = setInterval(async () => {
      try {
        request_user_help();
      } catch (e) {
        clearInterval(login_interval);
      }
    }, 2000);
    try {
      return await this.awaitLogin(context.ekoConfig.chromeProxy, tabId, task_id);
    } finally {
      clearInterval(login_interval);
    }
  }

  async awaitLogin(chromeProxy: any, tabId: number, task_id: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkTabClosedInterval = setInterval(async () => {
        const tabExists = await doesTabExists(chromeProxy, tabId);
        if (!tabExists) {
          clearInterval(checkTabClosedInterval);
          resolve(false);
          chromeProxy.runtime.onMessage.removeListener(listener);
        }
      }, 1000);
      const listener = (message: any) => {
        if (message.type === 'issue_resolved' && message.task_id === task_id) {
          resolve(true);
          clearInterval(checkTabClosedInterval);
        }
      };
      chromeProxy.runtime.onMessage.addListener(listener);
    });
  }

  async isLoginIn(context: ExecutionContext): Promise<boolean> {
    let windowId = await getWindowId(context);
    let screenshot_result = await screenshot(context.ekoConfig.chromeProxy, windowId, true);
    let messages: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: screenshot_result.image,
          },
          {
            type: 'text',
            text: 'Check if the current website is logged in. If not logged in, output `NOT_LOGIN`. If logged in, output `LOGGED_IN`. Output directly without explanation.',
          },
        ],
      },
    ];
    let response = await context.llmProvider.generateText(messages, { maxTokens: 256 });
    let text = response.textContent;
    if (!text) {
      text = JSON.stringify(response.content);
    }
    return text.indexOf('LOGGED_IN') > -1;
  }
}
