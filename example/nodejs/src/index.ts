import dotenv from "dotenv";
import FileAgent from "./file-agent";
import LocalCookiesBrowserAgent from "./browser";
import { BrowserAgent } from "@eko-ai/eko-nodejs";
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
  const url = "https://github.com";
  browser.testOpenUrl(url);
}

async function run() {
  Log.setLevel(1);
  // Use local browser cookie login state, will read local Chrome's cookie and localStorage information
  // If a password dialog pops up, please enter your computer password and click "Always Allow"
  const agents: Agent[] = [
    // new BrowserAgent(),
    new LocalCookiesBrowserAgent(),
    new FileAgent(),
  ];
  const eko = new Eko({ llms, agents, callback });
  const result = await eko.run(
    `Open GitHub, search for the FellouAI/eko repository, click star,
    and summarize the eko introduction information, then save it to the fellou-eko.md file on the desktop`
  );
  console.log("Task result: \n", result.result);
}

run().catch((e) => {
  console.log(e);
});
