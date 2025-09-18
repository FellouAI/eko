import dotenv from "dotenv";
import { BrowserAgent, FileAgent } from "@eko-ai/eko-nodejs";
import { Eko, Agent, Log, LLMs, StreamCallbackMessage } from "@eko-ai/eko";

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

const callback = {
  onMessage: async (message: StreamCallbackMessage) => {
    if (message.type == "workflow" && !message.streamDone) {
      return;
    }
    if (message.type == "text" && !message.streamDone) {
      return;
    }
    if (message.type == "tool_streaming") {
      return;
    }
    console.log("----- callback message -----");
    console.log("message: ", JSON.stringify(message, null, 2));
  },
};

async function run() {
  Log.setLevel(1);
  const agents: Agent[] = [new BrowserAgent(), new FileAgent()];
  const eko = new Eko({ llms, agents, callback });
  const result = await eko.run(
    "Just say hello and print a smile face for me."
  );
  console.log("result: ", result.result);
}

run().catch((e) => {
  console.log(e);
});
