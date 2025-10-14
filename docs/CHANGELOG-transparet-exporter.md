# TransparentBrowserExporter 更新说明

## 版本信息

**更新日期**: 2025-10-14  
**变更类型**: 功能增强 + 兼容性改进

## 更新摘要

为了兼容新的 Python span 转发服务 (`/api/span-forward/ingest`)，对 `TransparentBrowserExporter` 进行了以下增强，同时保持向后兼容性。

## 主要变更

### 1. 新增 `autoFlush` 选项

**用途**: 在每次导出批次后自动触发服务器端 Langfuse flush

```typescript
// 之前
new TransparentBrowserExporter({
  endpoint: 'http://localhost:8001/api/span-forward/ingest',
  useSendBeacon: true,
});

// 现在（可选）
new TransparentBrowserExporter({
  endpoint: 'http://localhost:8001/api/span-forward/ingest',
  useSendBeacon: true,
  autoFlush: true, // 新增：每次导出后强制 flush
});
```

**效果**:
- `autoFlush: false` (默认): 发送到 `/api/span-forward/ingest`
- `autoFlush: true`: 发送到 `/api/span-forward/ingest?flush=true`

**建议使用场景**:
- ✅ 开发环境：实时查看 trace 数据
- ✅ 测试环境：确保测试后数据立即可见
- ❌ 生产环境：避免额外的网络开销（Langfuse 会自动批量处理）

### 2. 增强响应处理

**之前**: 只检查 HTTP 成功/失败

```typescript
.then(() => {
  resultCallback({ code: ExportResultCode.SUCCESS });
})
```

**现在**: 解析服务器返回的详细信息

```typescript
.then((response) => {
  const result = response.data; // { accepted: 10, rejected: 0, errors: [] }
  if (result && result.rejected > 0) {
    console.warn(
      `[TransparentExporter] Some spans rejected: accepted=${result.accepted}, rejected=${result.rejected}`,
      result.errors
    );
    resultCallback({ 
      code: result.accepted > 0 
        ? ExportResultCode.SUCCESS  // 部分成功
        : ExportResultCode.FAILED    // 全部失败
    });
  } else {
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
})
```

**好处**:
- ✅ 更清晰的错误信息（在控制台显示被拒绝的 span 详情）
- ✅ 部分成功策略（有些 span 成功就算成功）
- ✅ 便于调试和监控

### 3. 注释更新

更新了端点路径的注释：

```typescript
// 之前
endpoint: string; // 你的后端 /otel-ingest

// 现在
endpoint: string; // 你的后端 /api/span-forward/ingest
```

## 向后兼容性

### ✅ 完全兼容

所有现有代码无需修改即可继续工作：

```typescript
// 这段代码仍然有效
const exporter = new TransparentBrowserExporter({
  endpoint: 'http://localhost:8001/api/span-forward/ingest',
  useSendBeacon: true,
  batchBytesLimit: 800_000,
});
```

**原因**:
- `autoFlush` 默认为 `false`
- 响应处理向后兼容（旧服务器没有 `accepted/rejected` 字段时仍正常工作）
- 所有现有选项保持不变

### 迁移建议

如果你要从旧的 Node.js 服务迁移到新的 Python 服务：

1. **更新端点路径**（配置变更，非代码变更）:
   ```typescript
   // 旧端点
   endpoint: 'http://localhost:8001/otel-ingest'
   
   // 新端点
   endpoint: 'http://localhost:8001/api/span-forward/ingest'
   ```

2. **可选：添加开发环境 autoFlush**:
   ```typescript
   const isDev = process.env.NODE_ENV === 'development';
   
   initTracing({
     endpoint: '...',
     autoFlush: isDev, // 仅在开发环境启用
   });
   ```

3. **验证响应处理**:
   - 在控制台查看是否有 `[TransparentExporter]` 警告
   - 确认 rejected spans 的错误信息

## 数据格式

**无变化** - exporter 发送的数据格式与新服务器完全兼容：

```json
// 发送格式（数组）
[
  {
    "traceId": "...",
    "spanId": "...",
    "name": "operation-name",
    "kind": 0,
    "startTime": [1234567890, 123456789],
    "endTime": [1234567890, 223456789],
    "duration": [0, 100000000],
    "status": { "code": 0 },
    "attributes": {},
    "links": [],
    "events": [],
    "resource": { "attributes": {} },
    "instrumentationScope": { "name": "tracer-name" }
  }
]

// 服务器响应格式
{
  "accepted": 1,
  "rejected": 0,
  "errors": []
}
```

## 性能影响

### autoFlush 的影响

| 场景 | 延迟 | 网络请求 | Langfuse 负载 |
|------|------|----------|--------------|
| `autoFlush: false` | 低 | 正常 | 批量处理（高效） |
| `autoFlush: true` | 稍高 | 每次+1 flush | 每批次立即处理 |

**推荐配置**:
```typescript
// 生产环境
{ autoFlush: false } // 默认，性能最优

// 开发环境
{ autoFlush: true, scheduledDelayMillis: 2000 } // 快速反馈
```

### 响应处理的影响

**可忽略** - 只是解析 JSON 响应，没有额外的网络开销。

## 测试验证

### 单元测试

```typescript
describe('TransparentBrowserExporter', () => {
  it('should send autoFlush parameter when enabled', async () => {
    const exporter = new TransparentBrowserExporter({
      endpoint: 'http://test/ingest',
      autoFlush: true,
    });
    
    // 验证发送到 http://test/ingest?flush=true
  });
  
  it('should handle partial failures gracefully', async () => {
    // 模拟响应: { accepted: 8, rejected: 2, errors: [...] }
    // 验证返回 ExportResultCode.SUCCESS
  });
});
```

### 集成测试

```typescript
// 启动测试服务器
const server = await startSpanForwardService();

// 测试 autoFlush
const { provider, shutdown } = initTracing({
  endpoint: 'http://localhost:8001/api/span-forward/ingest',
  autoFlush: true,
});

// 创建 span
const tracer = provider.getTracer('test');
const span = tracer.startSpan('test-operation');
span.end();

// 等待导出
await new Promise(resolve => setTimeout(resolve, 6000));

// 验证 Langfuse 已收到数据
await shutdown();
```

## 故障排查

### 问题: autoFlush 不生效

**症状**: 设置 `autoFlush: true` 但数据不是实时出现在 Langfuse

**检查**:
1. 确认服务器支持 `?flush=true` 参数（新版本）
2. 查看网络请求是否包含 `flush=true`
3. 检查服务器日志: `[SpanForwardService] Force flushing`

### 问题: 控制台出现 "Some spans rejected" 警告

**症状**: 
```
[TransparentExporter] Some spans rejected: accepted=8, rejected=2
```

**处理**:
1. 这是正常的部分失败提示
2. 查看 `errors` 数组了解被拒绝的原因
3. 常见原因:
   - Span 数据格式错误
   - 服务器处理异常
   - Langfuse 配置问题

### 问题: Payload too large

**症状**:
```
[TransparentExporter] Payload too large, dropping batch
```

**解决**:
```typescript
initTracing({
  endpoint: '...',
  batchBytesLimit: 1_000_000, // 增加到 1MB
  maxExportBatchSize: 100,    // 同时减小批次数量
});
```

## 相关文件

- `packages/eko-core/src/trace/transparet-exporter.ts` - Exporter 实现
- `packages/eko-core/src/trace/init-tracing.ts` - 初始化函数
- `docs/span-forward-integration.md` - 集成指南
- `docs/trace-system.md` - Trace 系统文档

## 后续计划

- [ ] 添加 exporter 的单元测试
- [ ] 支持自定义重试策略
- [ ] 添加更详细的性能指标
- [ ] 考虑支持 gzip 压缩（减小 payload 大小）

## 问题反馈

如果遇到问题，请提供：
- 使用的配置选项
- 控制台错误/警告信息
- 服务器日志（如果可访问）
- 网络请求详情（从浏览器开发者工具）
