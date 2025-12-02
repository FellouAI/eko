import {
  Eko,
  Log,
  LLMs,
  Agent,
  StreamCallbackMessage,
  SimpleSseMcpClient,
  SimpleHttpMcpClient,
} from "../../src/index";
import { TaskNodeStatusTool } from "../../src/tools";
import dotenv from "dotenv";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const claudeBaseURL = process.env.ANTHROPIC_BASE_URL;
const claudeApiKey = process.env.ANTHROPIC_API_KEY;

const llms: LLMs = {
  default: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    apiKey: claudeApiKey || "",
    config: {
      baseURL: claudeBaseURL,
    },
  },
  openai: {
    provider: "openai",
    model: "gpt-5",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
};

async function runWithSse() {
  Log.setLevel(0);
  let callback = {
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
      console.log("message: ", JSON.stringify(message, null, 2));
    },
  };
  let sseUrl = "http://localhost:8083/sse";
  let mcpClient = new SimpleSseMcpClient(sseUrl);
  let agents: Agent[] = [
    new Agent({
      name: "SmartMall",
      description: "Provide product inquiry, inventory management, and order processing.",
      tools: [],
      // tools: [new TaskNodeStatusTool()],
      mcpClient: mcpClient,
      llms: Object.keys(llms),
    }),
  ];
  let eko = new Eko({ llms, agents, callback });
  let result = await eko.run(
    "I have 3000 RMB, please help me buy a Huawei MateBook X Pro and 1 Bluetooth earphone, 1 mobile power bank."
  );
  console.log("result: ", JSON.stringify(result));
}

async function runWithHttp() {
  Log.setLevel(0);
  let callback = {
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
      console.log("message: ", JSON.stringify(message, null, 2));
    },
  };
  let httpUrl = "http://localhost:3088/mcp";
  let mcpClient = new SimpleHttpMcpClient(httpUrl);
  let agents: Agent[] = [
    new Agent({
      name: "Code",
      description: "Run code snippet.",
      tools: [],
      // tools: [new TaskNodeStatusTool()],
      mcpClient: mcpClient,
      llms: Object.keys(llms),
    }),
  ];
  let eko = new Eko({ llms, agents, callback });
  let result = await eko.run(
    "Execute the following JavaScript code: \n```\nconsole.log('Hello, world!');\n```"
  );
  console.log("result: ", JSON.stringify(result));
}

test.only("eko", async () => {
  // await runWithSse();
  await runWithHttp();
});
