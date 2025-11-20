# 运行指南

## 快速开始

### 1. 安装依赖

```bash
cd /Users/lildino/Project/eko/example/custom_agent
pnpm install
```

如果还没有安装 pnpm：
```bash
npm install -g pnpm
```

### 2. 启动应用

```bash
pnpm start
```

应用会在 `http://localhost:3000` 自动打开。

### 3. 配置密钥和 Token（通过浏览器控制台）

应用启动后，打开浏览器开发者工具（F12 或 Cmd+Option+I），在控制台中执行以下命令设置配置：

```javascript
// 设置 OpenRouter API Key
localStorage.setItem("openrouter_api_key", "your-actual-api-key");

// 设置 MCP Token（如果需要认证）
localStorage.setItem("id_token", "your-mcp-token");

// 设置 MCP 服务器地址（可选，默认: http://localhost:8000）
localStorage.setItem("mcp_base_url", "http://localhost:8000");
```

**注意**：配置完成后，刷新页面使配置生效。

## 详细步骤

### 前置要求

1. **Node.js** (推荐 v18+)
2. **pnpm** 包管理器
3. **MCP 服务器** 正在运行（默认: http://localhost:8000）
4. **OpenRouter API Key** 或其他 LLM 提供商的 API key

### 完整配置检查清单

- [ ] 已安装依赖 (`pnpm install`)
- [ ] 应用已启动 (`pnpm start`)
- [ ] 已在浏览器控制台设置 `openrouter_api_key`
- [ ] 已在浏览器控制台设置 `id_token`（如果需要 MCP 认证）
- [ ] 已在浏览器控制台设置 `mcp_base_url`（可选，默认: http://localhost:8000）
- [ ] MCP 服务器正在运行
- [ ] 已刷新页面使配置生效

### 运行命令

```bash
# 开发模式（推荐）
pnpm start

# 或者构建后运行
pnpm run build
pnpm start
```

### 访问应用

应用启动后会自动打开浏览器，访问地址：
- 本地开发: `http://localhost:3000`

### 查看日志

打开浏览器开发者工具（F12 或 Cmd+Option+I）查看：
- Agent 工作流执行过程
- MCP 工具调用日志
- 错误信息

## 故障排除

### 1. 端口被占用

如果 3000 端口被占用，React 会提示使用其他端口（如 3001）。

### 2. MCP 连接失败

检查：
- MCP 服务器是否正在运行
- `localStorage.getItem("mcp_base_url")` 是否正确（可在控制台检查）
- `localStorage.getItem("id_token")` 是否正确（如果需要认证）
- 浏览器控制台是否有 CORS 错误

### 3. API Key 错误

检查：
- `localStorage.getItem("openrouter_api_key")` 是否正确（可在控制台检查）
- 是否已刷新页面使配置生效
- OpenRouter 账户是否有足够的额度

### 4. 依赖安装失败

尝试：
```bash
rm -rf node_modules
pnpm install
```

### 5. 工具加载失败

确保：
- MCP 服务器已启动
- Agent 配置中的 `tool_ids` 正确（在 `src/agents/OutReachAgent.ts` 中）
- MCP 服务器可以访问 `/api/v2/mcp/custom-tools` 端点

## 开发模式 vs 生产模式

### 开发模式 (`pnpm start`)
- 热重载
- 详细的错误信息
- 开发工具支持

### 生产模式 (`pnpm run build`)
- 优化的构建
- 压缩的代码
- 需要静态服务器来运行 `build` 目录

## 下一步

应用启动后，Agent 会自动开始工作：
1. BrowserAgent 会浏览页面并提取 profile 信息
2. OutReachAgent 会分析并发送邮件

查看浏览器控制台了解详细执行过程。

