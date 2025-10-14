# Span Forward Service Integration Guide

## 概述

本文档说明如何将 eko 与新的 Python span 转发服务集成。

## 服务器端点变更

新的 span 转发服务器使用以下端点：

- **Ingest**: `/api/span-forward/ingest` (之前是 `/otel-ingest`)
- **Health**: `/api/span-forward/health`
- **Flush**: `/api/span-forward/flush`

## 客户端配置

### 基础配置

```typescript
import { initTracing } from '@eko-ai/eko-core/trace/init-tracing';

const { provider, shutdown } = initTracing({
  // 更新端点路径
  endpoint: 'http://your-server:8001/api/span-forward/ingest',
  
  // 可选：服务信息
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  
  // 可选：使用 sendBeacon（浏览器环境推荐）
  useSendBeacon: true,
  
  // 可选：每次导出后强制 flush 到 Langfuse
  autoFlush: false, // 默认 false，生产环境通常不需要
});

// 应用关闭时清理
process.on('SIGTERM', async () => {
  await shutdown();
});
```

### 带自动 Flush 的配置

如果你需要实时看到 trace 数据（例如在开发环境），可以启用 `autoFlush`：

```typescript
const { provider, shutdown } = initTracing({
  endpoint: 'http://localhost:8001/api/span-forward/ingest',
  autoFlush: true, // 每次导出批次后立即 flush 到 Langfuse
  
  // 可以调整批次大小和延迟以配合 autoFlush
  maxExportBatchSize: 50, // 较小的批次
  scheduledDelayMillis: 2000, // 更频繁的导出
});
```

**注意**：`autoFlush` 会增加网络开销，建议仅在开发环境使用。

## 响应处理

新服务器返回详细的处理结果：

```json
{
  "accepted": 10,    // 成功处理的 span 数量
  "rejected": 0,     // 失败的 span 数量
  "errors": []       // 错误详情数组
}
```

`TransparentBrowserExporter` 现在会：
- ✅ 解析响应中的 `accepted` 和 `rejected` 字段
- ✅ 在控制台记录部分失败的详细信息
- ✅ 只要有至少一个 span 成功，就返回 SUCCESS 状态

## 特性支持

### 图片数据处理

新服务器会自动为 generation 类型的 span 中的图片数据添加 base64 前缀：

```typescript
// eko 发送的格式（无需修改）
{
  "type": "file",
  "mediaType": "image/jpeg",
  "data": "iVBORw0KGgoAAAA..." // 纯 base64
}

// 服务器自动转换为
{
  "type": "file",
  "mediaType": "image/jpeg",
  "data": "data:image/jpeg;base64,iVBORw0KGgoAAAA..."
}
```

这确保 Langfuse UI 能正确显示图片，无需客户端处理。

### Batch 处理

服务器支持批量接收 spans：

```typescript
// eko 自动批量发送（通过 BatchSpanProcessor）
// 默认配置：
{
  maxQueueSize: 2048,           // 队列最大容量
  scheduledDelayMillis: 5000,   // 每 5 秒导出一次
  exportTimeoutMillis: 30000,   // 导出超时 30 秒
  maxExportBatchSize: 512,      // 单次最多 512 个 spans
}
```

服务器会：
- ✅ 接受数组格式 `[span1, span2, ...]`
- ✅ 也接受对象格式 `{spans: [...]}`（但 eko 使用数组格式）
- ✅ 隔离错误：单个 span 失败不影响其他 spans

## 环境变量配置（服务器端）

确保服务器配置了 Langfuse 凭证：

```bash
# .env
LANGFUSE_BASE_URL=https://your-langfuse-instance.com
LANGFUSE_PUBLIC_KEY=pk_your_project_key
LANGFUSE_SECRET_KEY=sk_your_secret_key
LANGFUSE_TRACING_ENVIRONMENT=production
LANGFUSE_RELEASE=1.0.0
```

## 健康检查

在应用启动时检查服务器健康：

```typescript
import axios from 'axios';

async function checkSpanForwardHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${baseUrl}/api/span-forward/health`);
    const health = response.data;
    
    if (health.status === 'healthy' && health.langfuse_configured) {
      console.log('[Tracing] Span forward service is healthy');
      return true;
    } else {
      console.warn('[Tracing] Span forward service unhealthy:', health.message);
      return false;
    }
  } catch (error) {
    console.error('[Tracing] Health check failed:', error);
    return false;
  }
}

// 使用示例
const baseUrl = 'http://localhost:8001';
const isHealthy = await checkSpanForwardHealth(baseUrl);

if (isHealthy) {
  initTracing({
    endpoint: `${baseUrl}/api/span-forward/ingest`,
    // ... 其他配置
  });
}
```

## 手动 Flush

如果需要在特定时刻强制 flush 数据到 Langfuse：

```typescript
import axios from 'axios';

async function flushSpans(baseUrl: string): Promise<void> {
  try {
    const response = await axios.post(`${baseUrl}/api/span-forward/flush`);
    console.log('[Tracing] Flush result:', response.data);
  } catch (error) {
    console.error('[Tracing] Flush failed:', error);
  }
}

// 例如：在测试结束时
afterAll(async () => {
  await shutdown(); // 关闭 OpenTelemetry provider
  await flushSpans('http://localhost:8001'); // 强制 flush 服务器
});
```

## 浏览器环境特殊考虑

### sendBeacon 支持

在浏览器环境中，`sendBeacon` 用于页面卸载时的可靠上报：

```typescript
// 浏览器环境配置
initTracing({
  endpoint: '/api/span-forward/ingest', // 相对路径
  useSendBeacon: true, // 默认 true，页面关闭时仍能发送
});

// 页面卸载时自动触发
window.addEventListener('beforeunload', () => {
  // BatchSpanProcessor 会自动 flush
  // sendBeacon 确保数据发送成功
});
```

### CORS 配置

确保服务器配置了正确的 CORS：

```python
# Python 服务器（FastAPI）已内置 CORS 支持
# 查看 app/middleware 配置
```

## 迁移清单

从旧的 Node.js `langfuse-ingest-server` 迁移：

- [x] 更新端点路径：`/otel-ingest` → `/api/span-forward/ingest`
- [x] 确认数据格式兼容（数组格式）
- [x] 测试响应处理（新增 `accepted/rejected/errors`）
- [x] 验证图片数据处理正常
- [x] 更新健康检查端点（如果使用）
- [x] 确认 CORS 配置正确
- [x] 测试 sendBeacon 功能（浏览器环境）

## 性能调优

### 批次大小优化

根据你的 span 大小和频率调整：

```typescript
// 高频小 spans
initTracing({
  endpoint: '...',
  maxExportBatchSize: 1000,      // 更大批次
  scheduledDelayMillis: 10000,   // 更长延迟
});

// 低频大 spans（如包含大量图片）
initTracing({
  endpoint: '...',
  maxExportBatchSize: 50,        // 更小批次
  batchBytesLimit: 500_000,      // 更小字节限制
  scheduledDelayMillis: 2000,    // 更短延迟
});
```

### 错误处理策略

服务器采用"最大努力"策略：
- ✅ 单个 span 失败不影响批次中的其他 spans
- ✅ 客户端会收到详细的错误信息
- ✅ OpenTelemetry 的重试机制由 SDK 处理

## 故障排查

### Spans 未出现在 Langfuse

1. 检查健康端点：`GET /api/span-forward/health`
2. 查看服务器日志：`[SpanForwardService]` 前缀
3. 确认 Langfuse 凭证正确配置
4. 尝试手动 flush：`POST /api/span-forward/flush`

### 部分 Spans 被拒绝

查看响应中的 `errors` 数组：

```typescript
// exporter 会自动记录到控制台
// [TransparentExporter] Some spans rejected: accepted=8, rejected=2
// 查看详细错误信息
```

### Payload 过大

调整 `batchBytesLimit`：

```typescript
initTracing({
  endpoint: '...',
  batchBytesLimit: 1_000_000, // 1MB
  maxExportBatchSize: 100,    // 同时减小批次大小
});
```

## 示例代码

完整的示例参见：
- Node.js: `example/nodejs_debug/src/index.ts`
- 浏览器: `example/web/src/App.tsx`
- 扩展: `example/extension/src/background.ts`

## 相关文档

- [Trace System Overview](./trace-system.md)
- [Span Forward Service API](../fellou-agent/docs/span-forward-service.md)
- [OpenTelemetry Best Practices](https://opentelemetry.io/docs/instrumentation/js/exporters/)
