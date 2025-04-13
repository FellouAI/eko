import * as tools from './tools';
import { Tool } from '../types';
import { logger } from '@/common/log';

export async function pub(chromeProxy: any, tabId: number, event: string, params: any): Promise<any> {
  return await chromeProxy.tabs.sendMessage(tabId as number, {
    type: 'eko:message',
    event,
    params,
  });
}

export async function getLLMConfig(chromeProxy: any, name: string = 'llmConfig'): Promise<{
  llm?: string;
  apiKey?: string;
  modelName?: string;
  options?: {[key:string]:any};
} | undefined> {
  let result = await chromeProxy.storage.sync.get([name]);
  return result[name];
}

export function loadTools(): Map<string, Tool<any, any>> {
  let toolsMap = new Map<string, Tool<any, any>>();
  for (const key in tools) {
    let tool = (tools as any)[key];
    if (typeof tool === 'function' && tool.prototype && 'execute' in tool.prototype) {
      try {
        let instance = new tool();
        toolsMap.set(instance.name || key, instance);
      } catch (e) {
        logger.error(`Failed to instantiate ${key}:`, e);
      }
    }
  }
  return toolsMap;
}
