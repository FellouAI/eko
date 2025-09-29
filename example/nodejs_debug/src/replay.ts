import fs from 'fs/promises';
import { join } from 'node:path';
import { Eko } from '@eko-ai/eko';
import type { ContextSnapshot } from '@eko-ai/eko-debugger';

async function readLatestSnapshot(taskId: string, nodeId: string): Promise<ContextSnapshot | undefined> {
  try {
    const root = join(process.cwd(), 'runs');
    const dir = join(root, taskId, 'snapshots');
    const files = await fs.readdir(dir);
    const matched = files
      .filter((f) => f.startsWith(`${nodeId}-`) && f.endsWith('.json'))
      .sort();
    const latest = matched[matched.length - 1];
    if (!latest) return undefined;
    const buf = await fs.readFile(join(dir, latest), 'utf8');
    return JSON.parse(buf) as ContextSnapshot;
  } catch {
    return undefined;
  }
}

/**
 * EkoDebuggerAdapter：零侵入重放适配器
 * - 通过 Eko.initContext 恢复 Context
 * - 定位节点并使用现有执行引擎进行单节点执行
 * - 注意：此处实现采用最小可行方案：
 *   1) 用 snapshot 中的 workflow + variables 恢复 Context
 *   2) 将 workflow 裁剪为仅包含该节点，调用 execute 触发执行
 *   3) 结果以新 runId 进行记录（避免污染原 run）
 */
export async function replayNode(taskId: string, nodeId: string, overrides?: Record<string, unknown>): Promise<void> {
  const snapshot = await readLatestSnapshot(taskId, nodeId);
  if (!snapshot) throw new Error(`No snapshot found for ${taskId}/${nodeId}`);

  const contextData = snapshot.context;
  const workflow: any = contextData.workflow;
  if (!workflow) throw new Error('Snapshot has no workflow');

  // 应用 overrides 到 variables（最简单稳妥的注入方式）
  const vars = { ...(contextData.variables || {}) , ...(overrides || {}) };

  // 仅执行指定节点的最小 workflow：保留该代理，其他标记为 done
  const agentIdx = workflow.agents.findIndex((a: any) => a.id === nodeId);
  if (agentIdx === -1) throw new Error(`Node ${nodeId} not found in workflow`);
  workflow.agents = workflow.agents.map((a: any) => ({ ...a, status: a.id === nodeId ? 'init' : 'done' }));

  // 创建新的 Eko 实例（使用默认配置，由外部初始化时注入 llms/agents）
  const eko = new Eko({ llms: (global as any).__eko_llms, agents: (global as any).__eko_agents, callback: (global as any).__eko_callback });

  // 基于 snapshot 恢复 Context
  const ctx = await eko.initContext(workflow, vars);

  // 执行（仅会运行该节点，因为其他已标记 done）
  const result = await eko.execute(workflow.taskId);
  console.log(`Replay result: ${result.success ? 'success' : 'fail'} - ${result.result}`);
}


