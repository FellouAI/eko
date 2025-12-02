import dotenv from "dotenv";
import FileAgent from "./file-agent";
import { BrowserAgent } from "@eko-ai/eko-nodejs";
import { Eko, Agent, Log, LLMs, AgentStreamMessage } from "@eko-ai/eko";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL;

const llms: LLMs = {
  default: {
    provider: "openai-compatible",
    model: openaiModel as string,
    apiKey: openaiApiKey as string,
    config: {
      baseURL: openaiBaseURL,
    },
  },
};

const callback = {
  onMessage: async (message: AgentStreamMessage) => {
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

async function run() {
  Log.setLevel(1);
  const agents: Agent[] = [new BrowserAgent(), new FileAgent()];
  const eko = new Eko({ llms, agents, callback });
  const result = await eko.run(
    "Search for the latest news about Musk, summarize and save to the desktop as Musk.md"
  );
  console.log("result: ", result.result);
}

run().catch((e) => {
  console.log(e);
});
