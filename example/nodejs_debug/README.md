# Eko 可观测性演示

这个示例展示了如何使用 Eko 框架的完整可观测性功能，包括新的回调策略和调试器模块。

## 功能特性

### 🔍 完整的执行追踪
- **任务级别事件**: 任务开始、完成状态跟踪
- **规划阶段事件**: 工作流规划过程的详细监控
- **代理执行事件**: 每个代理的启动、处理、完成状态
- **LLM交互事件**: 语言模型请求和响应的完整追踪
- **工具调用事件**: 工具执行的参数、结果和性能监控

### 📊 结构化打印与基础查询
- **结构化打印**: TraceCollector 对 `debug_*` 事件进行统一、清晰的控制台输出
- **基础查询**: 通过 `tracer.getEvents` 获取并简单过滤事件

### 🎯 查询和过滤
- 按事件类型过滤
- 按代理名称过滤
- 按时间范围查询
- 聚合统计查询

## 新的消息类型（debug_*）

### 任务级别事件
```typescript
// 任务开始
{
  type: "debug_task_start",
  taskPrompt: string,
  contextParams?: Record<string, any>
}

// 任务完成
{
  type: "debug_task_finished", 
  success: boolean,
  result?: string,
  error?: any,
  stopReason?: string
}
```

### 规划阶段事件
```typescript
// 规划开始
{
  type: "debug_plan_start",
  taskPrompt: string,
  plannerPrompt: {
    systemPrompt: string,
    userPrompt: string
  },
  availableAgents: Array<AgentInfo>
}

// 规划过程
{
  type: "debug_plan_process",
  streamDone: boolean,
  partialWorkflow?: Workflow,
  thinkingText?: string
}

// 规划完成
{
  type: "debug_plan_finished",
  workflow: Workflow,
  planRequest: LLMRequest,
  planResult: string
}
```

### 代理级别事件
```typescript
// 代理启动
{
  type: "debug_agent_start",
  agentNode: WorkflowAgent,
  agentInfo: {
    name: string,
    description: string,
    tools: string[],
    llms?: string[]
  },
  requirements: string
}

// 代理处理中
{
  type: "debug_agent_process",
  loopNum: number,
  maxReactNum: number,
  currentMessages: any
}

// 代理完成
{
  type: "debug_agent_finished",
  agentNode: WorkflowAgent,
  result: string,
  error?: any,
  executionStats: {
    loopCount: number,
    toolCallCount: number,
    duration: number
  }
}
```

### LLM交互事件
```typescript
// LLM请求开始
{
  type: "debug_llm_request_start",
  request: LLMRequest,
  modelName?: string,
  context: {
    messageCount: number,
    toolCount: number,
    hasSystemPrompt: boolean
  }
}

// LLM响应完成
{
  type: "debug_llm_response_finished",
  streamId: string,
  response: Array<any>,
  usage?: {
    promptTokens: number,
    completionTokens: number,
    totalTokens: number
  }
}
```

### 工具调用事件
```typescript
// 工具调用开始
{
  type: "debug_tool_call_start",
  toolName: string,
  toolId: string,
  params: Record<string, any>
}

// 工具调用完成
{
  type: "debug_tool_call_finished",
  toolName: string,
  toolId: string,
  params: Record<string, any>,
  toolResult: ToolResult,
  duration: number
}
```

## 使用方法

### 1. 基本设置

```typescript
import { TraceSystem } from "@eko-ai/eko-debugger";
import { Eko } from "@eko-ai/eko";

// 创建调试器系统
const tracer = new TraceSystem({ 
  enabled: true,
  // realtime: { port: 9487 } // 可选：启用WebSocket实时监控
});

// 启动调试器
await tracer.start();

// 启用对Eko实例的监控
tracer.enable(eko);
```

### 2. 必须定义callback

```typescript
const yourCallback = {
  onMessage: async (message: StreamCallbackMessage) => {
    // ... Do your stuff ...
    // or just do nothing
    // But you must define the callback
  }
};

const eko = new Eko({ llms, agents, callback: yourCallback });
```

### 3. 基础查询

```typescript
// 查询特定事件
const events = await tracer.getEvents(taskId);
const agentEvents = events.filter(e => e.type === 'debug_agent_start' || e.type === 'debug_agent_finished');
const llmRequests = events.filter(e => e.type === 'debug_llm_request_start');
const llmResponses = events.filter(e => e.type === 'debug_llm_response_finished');
const totalTokens = llmResponses.reduce((sum, e) => sum + (((e.data as any)?.usage?.totalTokens) || 0), 0);
console.log(`代理相关事件: ${agentEvents.length}个`);
console.log(`LLM统计: ${llmRequests.length}次请求, ${totalTokens} tokens`);
```

## 运行示例

### 安装依赖
```bash
cd example/nodejs_debug
npm install
```

### 配置环境变量
创建 `.env` 文件：
```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### 运行演示
```bash
npm run dev
```

## 输出示例

运行示例后，你将看到：

1. **实时事件流**: 彩色的、结构化的事件日志
2. **查询演示**: 展示如何过滤和查询特定数据


这个示例展示了Eko框架的完整可观测性能力，帮助开发者更好地理解和优化AI工作流的执行过程。
