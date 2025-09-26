import dotenv from "dotenv";
import SimpleChatAgent from "./chat";
import { TraceSystem } from "@eko-ai/eko-debugger";
// import { replayNode } from "./replay";
import { FileAgent } from "@eko-ai/eko-nodejs";
import { Eko, Agent, Log, LLMs } from "@eko-ai/eko";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

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

console.log(
  `LANGFUSE_PUBLIC_KEY: ${process.env.LANGFUSE_PUBLIC_KEY}, 
  LANGFUSE_SECRET_KEY: ${process.env.LANGFUSE_SECRET_KEY}, 
  LANGFUSE_BASE_URL: ${process.env.LANGFUSE_BASE_URL}`
);

const sdk = new NodeSDK({
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
      environment: "develop_test",
      mask: ({ data }) => {
        // Mask sensitive data
        return data.replace(/api_key=\w+/g, "api_key=***");
      },
    }),
  ],
});

sdk.start();

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

  // 启用 Langfuse 集成（组合到现有回调链，不影响调试器）
  const eko = new Eko({ llms, agents, enable_langfuse: true });

  // 暴露给重放（最小实现：通过 global 注入运行时依赖）
  // (global as any).__eko_llms = llms;
  // (global as any).__eko_agents = agents;
  // (global as any).__eko_callback = (eko as any).config?.callback;

  // 启用调试器系统
  const tracer = new TraceSystem({
    enabled: true,
  });

  await tracer.start();
  tracer.enable(eko);

  console.log("\n📊 调试器已启用，开始执行任务...\n");

  // 执行一个稍微复杂的任务来展示完整流程
  const task =
    "请先通过Chat Agent创建一个叫做greeting1的variable，内容为Hello, World!，然后通过File Agent创建一个叫做greeting1.txt的文件，内容为greeting1的variable";

  const startTime = Date.now();
  // 通过 contextParams 注入 toolCallId 作为 sessionId（若不传则回退为 taskId）
  const result = await eko.run(task, undefined, {
    toolCallId: `sess_${Date.now()}`,
  });
  const endTime = Date.now();

  console.log(`\n🏁 任务执行完成，总耗时: ${endTime - startTime}ms`);
  console.log(`📄 最终结果: ${result.result}`);

  // 等待一小段时间确保所有事件都被处理
  await new Promise((resolve) => setTimeout(resolve, 5000));


  // 演示单节点重放（挑选第一个节点）
  // const firstNodeId = await getFirstNodeId(result.taskId);
  // if (firstNodeId) {
  //   console.log(`\n🕰️ 尝试重放节点: ${firstNodeId}`);
  //   await replayNode(result.taskId, firstNodeId);
  // }

  // 关闭调试器
  await tracer.stop();
  console.log("\n✅ 调试器已关闭");
}

run().catch((e) => {
  console.log(e);
});
