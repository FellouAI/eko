import * as tools from './tools';
import { Tool } from '../types';
import { logger } from '../log';

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
