import dotenv from "dotenv";
import SimpleChatAgent from "./chat";
import { TraceSystem } from "@eko-ai/eko-debugger";
import { FileAgent } from "@eko-ai/eko-nodejs";
import { Eko, Agent, Log, LLMs } from "@eko-ai/eko";

dotenv.config();

// 注释掉原有配置
// const openaiBaseURL = process.env.OPENAI_BASE_URL;
// const openaiApiKey = process.env.OPENAI_API_KEY;
// const claudeBaseURL = process.env.ANTHROPIC_BASE_URL;
// const claudeApiKey = process.env.ANTHROPIC_API_KEY;

// OpenRouter 配置
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
const openrouterBaseURL = process.env.OPENROUTER_BASE_URL;

const llms: LLMs = {
  default: {
    provider: "openai-compatible",
    model: "z-ai/glm-4.5",
    apiKey: openrouterApiKey || "",
    config: {
      baseURL: openrouterBaseURL,
    },
  },
  // 注释掉其他配置，只使用 OpenRouter
  // openai: {
  //   provider: "openai",
  //   model: "gpt-5-mini",
  //   apiKey: openaiApiKey || "",
  //   config: {
  //     baseURL: openaiBaseURL,
  //   },
  // },
};

// 由 TraceSystem/TraceCollector 进行结构化打印，无需自定义 callback，也不再进行离线分析

async function run() {
  Log.setLevel(1);

  console.log("🎯 Eko 可观测性完整演示");
  console.log("=".repeat(50));

  // 创建代理列表，包括更多代理来展示复杂工作流
  const agents: Agent[] = [
    new SimpleChatAgent(),
    new FileAgent(),
    // new BrowserAgent(), // 可以根据需要启用
  ];

  // 直接使用默认回调，由 TraceCollector 拦截并打印
  const eko = new Eko({ llms, agents });

  // 启用调试器系统
  const tracer = new TraceSystem({
    enabled: true,
    // realtime: { port: 9487 } // 可选：启用WebSocket实时监控
  });

  await tracer.start();
  tracer.enable(eko);

  console.log("\n📊 调试器已启用，开始执行任务...\n");

  // 执行一个稍微复杂的任务来展示完整流程
  const task =
    "请先通过Chat Agent向我打招呼，然后并行帮我创建三个包含问候语和当前时间的简单文本文件，文件名为 greeting1，greeting2，greeting3，并行执行，最后告诉我文件创建完成。";

  const startTime = Date.now();
  const result = await eko.run(task);
  const endTime = Date.now();

  console.log(`\n🏁 任务执行完成，总耗时: ${endTime - startTime}ms`);
  console.log(`📄 最终结果: ${result.result}`);

  // 等待一小段时间确保所有事件都被处理
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 演示简单查询功能（不依赖分析器）
  console.log("\n🔍 演示查询功能:");
  const events = await tracer.getEvents(result.taskId);
  const agentEvents = events.filter(
    (e) => e.type === "agent_start" || e.type === "agent_finished"
  );
  const llmRequests = events.filter((e) => e.type === "llm_request_start");
  const llmResponses = events.filter((e) => e.type === "llm_response_finished");
  const totalTokens = llmResponses.reduce(
    (sum, e) => sum + ((e.data as any)?.usage?.totalTokens || 0),
    0
  );
  console.log(`   代理相关事件: ${agentEvents.length}个`);
  console.log(`   LLM统计: ${llmRequests.length}次请求, ${totalTokens} tokens`);

  // 关闭调试器
  await tracer.stop();
  console.log("\n✅ 调试器已关闭");
}

run().catch((e) => {
  console.log(e);
});
