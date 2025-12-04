import dotenv from "dotenv";
import FileAgent from "./file-agent";
import LocalCookiesBrowserAgent from "./browser";
import { Eko, Log, LLMs, Agent, AgentStreamMessage } from "@eko-ai/eko";

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

function testBrowserLoginStatus() {
  const browser = new LocalCookiesBrowserAgent();
  const testUrl = "https://github.com";
  browser.openUrl(testUrl);
}

async function run() {
  Log.setLevel(1);
  const agents: Agent[] = [new LocalCookiesBrowserAgent(), new FileAgent()];
  const eko = new Eko({ llms, agents, callback });
  const result = await eko.run(
    "Open GitHub, search for the FellouAI/eko repository, click star, and summarize the eko introduction information, then save it to the FellouAI.md file on the desktop"
  );
  console.log("result: ", result.result);
}

run().catch((e) => {
  console.log(e);
});
