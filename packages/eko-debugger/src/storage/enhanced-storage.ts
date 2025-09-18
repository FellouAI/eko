import { MonitorEvent, MonitorStorage, MonitorSessionMeta } from '../types/index.js';

/**
 * 增强的存储接口，支持分析查询
 */
export interface EnhancedMonitorStorage extends MonitorStorage {
  // 基础查询
  getEvents(sessionId: string, options?: EventQueryOptions): Promise<MonitorEvent[]>;
  getEventsByType(sessionId: string, eventType: string): Promise<MonitorEvent[]>;
  getEventsByTimeRange(sessionId: string, startTime: Date, endTime: Date): Promise<MonitorEvent[]>;
  
  // 搜索和过滤
  searchSessions(query: SessionSearchQuery): Promise<MonitorSessionMeta[]>;
  
  // 聚合查询
  getAggregateStats(sessionIds: string[]): Promise<AggregateStats>;
}

export interface EventQueryOptions {
  eventTypes?: string[];
  agentNames?: string[];
  categories?: string[];
  levels?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export interface SessionSearchQuery {
  taskPromptContains?: string;
  agentNames?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  success?: boolean;
  minDuration?: number;
  maxDuration?: number;
}

export interface AggregateStats {
  totalSessions: number;
  totalDuration: number;
  averageDuration: number;
  successRate: number;
  mostUsedAgents: Array<{ name: string; count: number }>;
  mostUsedTools: Array<{ name: string; count: number }>;
  llmUsage: {
    totalRequests: number;
    totalTokens: number;
    averageResponseTime: number;
  };
}

/**
 * 增强的内存存储实现
 */
export class EnhancedInMemoryStorage implements EnhancedMonitorStorage {
  private sessions = new Map<string, MonitorSessionMeta>();
  private events = new Map<string, MonitorEvent[]>();

  // 基础存储方法
  async ensureSession(sessionId: string, init: () => MonitorSessionMeta): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, init());
      this.events.set(sessionId, []);
    }
  }

  async appendEvent(event: MonitorEvent): Promise<void> {
    const sessionEvents = this.events.get(event.sessionId) || [];
    sessionEvents.push(event);
    this.events.set(event.sessionId, sessionEvents);

    // 更新会话元数据
    const session = this.sessions.get(event.sessionId);
    if (session) {
      // 更新结束时间
      if (!session.endTime || event.timestamp > session.endTime) {
        session.endTime = event.timestamp;
      }

      // 更新当前阶段
      if (event.type.startsWith('plan_')) {
        session.metadata = { ...session.metadata, currentPhase: 'planning' };
      } else if (event.type.startsWith('workflow_')) {
        session.metadata = { ...session.metadata, currentPhase: 'workflow' };
      } else if (event.type.startsWith('agent_')) {
        session.metadata = { ...session.metadata, currentPhase: 'agent' };
      } else if (event.type === 'task_finished') {
        session.metadata = { ...session.metadata, currentPhase: 'complete' };
      }
    }
  }

  async getSession(sessionId: string): Promise<MonitorSessionMeta | undefined> {
    return this.sessions.get(sessionId);
  }

  // 增强查询方法
  async getEvents(sessionId: string, options?: EventQueryOptions): Promise<MonitorEvent[]> {
    let events = this.events.get(sessionId) || [];

    if (options) {
      // 按事件类型过滤
      if (options.eventTypes) {
        events = events.filter(e => options.eventTypes!.includes(e.type));
      }

      // 按代理名称过滤
      if (options.agentNames) {
        events = events.filter(e => options.agentNames!.includes((e.data as any).agentName as string));
      }

      // 按分类过滤
      if (options.categories) {
        events = events.filter(e => options.categories!.includes(e.category || ''));
      }

      // 按级别过滤
      if (options.levels) {
        events = events.filter(e => options.levels!.includes(e.level || 'info'));
      }

      // 按时间范围过滤
      if (options.startTime) {
        events = events.filter(e => e.timestamp >= options.startTime!);
      }
      if (options.endTime) {
        events = events.filter(e => e.timestamp <= options.endTime!);
      }

      // 分页
      if (options.offset) {
        events = events.slice(options.offset);
      }
      if (options.limit) {
        events = events.slice(0, options.limit);
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getEventsByType(sessionId: string, eventType: string): Promise<MonitorEvent[]> {
    return this.getEvents(sessionId, { eventTypes: [eventType] });
  }

  async getEventsByTimeRange(sessionId: string, startTime: Date, endTime: Date): Promise<MonitorEvent[]> {
    return this.getEvents(sessionId, { startTime, endTime });
  }

  // 移除 analyzer 相关 API，保留纯事件存取与简单查询

  async searchSessions(query: SessionSearchQuery): Promise<MonitorSessionMeta[]> {
    let sessions = Array.from(this.sessions.values());

    // 按任务提示过滤
    if (query.taskPromptContains) {
      sessions = sessions.filter(s => 
        (s.metadata?.taskPrompt as string)?.toLowerCase().includes(query.taskPromptContains!.toLowerCase())
      );
    }

    // 按时间范围过滤
    if (query.dateRange) {
      sessions = sessions.filter(s => 
        s.startTime >= query.dateRange!.start && 
        (s.endTime || new Date()) <= query.dateRange!.end
      );
    }

    // 按成功状态过滤
    if (query.success !== undefined) {
      sessions = sessions.filter(s => {
        // 这里需要查看任务完成事件来确定成功状态
        const events = this.events.get(s.id) || [];
        const finishEvent = events.find(e => e.type === 'task_finished');
        return finishEvent ? (finishEvent.data as any)?.success === query.success : false;
      });
    }

    // 按持续时间过滤
    if (query.minDuration || query.maxDuration) {
      sessions = sessions.filter(s => {
        const duration = s.endTime ? s.endTime.getTime() - s.startTime.getTime() : 0;
        return (!query.minDuration || duration >= query.minDuration) &&
               (!query.maxDuration || duration <= query.maxDuration);
      });
    }

    return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  async getAggregateStats(sessionIds: string[]): Promise<AggregateStats> {
    const allEvents: MonitorEvent[] = [];
    const sessions: MonitorSessionMeta[] = [];

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      const events = this.events.get(sessionId) || [];
      
      if (session) {
        sessions.push(session);
        allEvents.push(...events);
      }
    }

    // 计算聚合统计
    const totalDuration = sessions.reduce((sum, s) => {
      const duration = s.endTime ? s.endTime.getTime() - s.startTime.getTime() : 0;
      return sum + duration;
    }, 0);

    const successCount = sessions.filter(s => {
      const events = this.events.get(s.id) || [];
      const finishEvent = events.find(e => e.type === 'task_finished');
      return finishEvent && (finishEvent.data as any)?.success;
    }).length;

    // 统计代理使用
    const agentUsage = new Map<string, number>();
    allEvents.filter(e => e.type === 'agent_start').forEach(e => {
      const agentName = (e.data as any).agentName as string;
      agentUsage.set(agentName, (agentUsage.get(agentName) || 0) + 1);
    });

    // 统计工具使用
    const toolUsage = new Map<string, number>();
    allEvents.filter(e => e.type === 'tool_call_start').forEach(e => {
      const toolName = (e.data as any)?.toolName as string;
      if (toolName) {
        toolUsage.set(toolName, (toolUsage.get(toolName) || 0) + 1);
      }
    });

    // LLM使用统计
    const llmRequests = allEvents.filter(e => e.type === 'llm_request_start');
    const llmResponses = allEvents.filter(e => e.type === 'llm_response_finished');
    const totalTokens = llmResponses.reduce((sum, e) => sum + ((e.data as any)?.usage?.totalTokens || 0), 0);
    const totalResponseTime = llmResponses.reduce((sum, e) => {
      const startEvent = allEvents.find(start => 
        start.type === 'llm_request_start' && 
        (start.data as any).agentName === (e.data as any).agentName
      );
      return sum + (startEvent ? e.timestamp.getTime() - startEvent.timestamp.getTime() : 0);
    }, 0);

    return {
      totalSessions: sessions.length,
      totalDuration,
      averageDuration: sessions.length > 0 ? totalDuration / sessions.length : 0,
      successRate: sessions.length > 0 ? successCount / sessions.length : 0,
      mostUsedAgents: Array.from(agentUsage.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      mostUsedTools: Array.from(toolUsage.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      llmUsage: {
        totalRequests: llmRequests.length,
        totalTokens,
        averageResponseTime: llmResponses.length > 0 ? totalResponseTime / llmResponses.length : 0,
      },
    };
  }
}
