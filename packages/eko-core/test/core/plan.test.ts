import {
  Eko,
  Agent,
  Log,
  LLMs,
  uuidv4,
  StreamCallbackMessage,
} from "../../src/index";
import dotenv from "dotenv";
import {
  SimpleFileAgent,
  SimpleBrowserAgent,
  SimpleComputerAgent,
} from "./agents";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;

const llms: LLMs = {
  default: {
    provider: "openai",
    model: "anthropic/claude-sonnet-4",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
    fetch: (url, options) => {
      const body = JSON.parse(options?.body as string);
      console.log("====> body", JSON.stringify(body, null, 2));
      return fetch(url, {
        ...options,
        body: JSON.stringify(body),
      });
    },
  },
};

async function testPlaner() {
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
  const agents: Agent[] = [
    new SimpleBrowserAgent(),
    new SimpleComputerAgent(),
    new SimpleFileAgent(),
  ];
  const eko = new Eko({ llms, agents, callback });
  const workflow = await eko.generate(
    'Browser searches for information about Xie Yang, summarizes it, and writes it into a desktop file, then sends it to the WeChat "Information Sharing" group.',
    uuidv4()
  );

  console.log("=========> workflow", JSON.stringify(workflow, null, 2));
}

test.only("test", async () => {
  await testPlaner();
});
