import {
  Log,
  LLMs,
  Agent,
  uuidv4,
  ChatAgent,
  StreamCallbackMessage,
} from "../../src/index";
import dotenv from "dotenv";
import {
  SimpleFileAgent,
  SimpleBrowserAgent,
  SimpleComputerAgent,
} from "./agents";
import { ChatStreamMessage } from "../../src/types";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;

const llms: LLMs = {
  default: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
};

async function run() {
  Log.setLevel(0);
  const chatCallback = {
    onMessage: async (message: ChatStreamMessage) => {
      if (message.type == "text" && !message.streamDone) {
        return;
      }
      if (message.type == "tool_streaming") {
        return;
      }
      console.log("chat message: ", JSON.stringify(message, null, 2));
    },
  };
  const taskCallback = {
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
      console.log("eko message: ", JSON.stringify(message, null, 2));
    },
  };
  const agents: Agent[] = [
    new SimpleBrowserAgent(),
    new SimpleComputerAgent(),
    new SimpleFileAgent(),
  ];
  const chatAgent = new ChatAgent({ llms, agents });
  const result1 = await chatAgent.chat({
    messageId: "msg-" + uuidv4(),
    user: [{ type: "text", text: "Hello" }],
    callback: {
      chatCallback,
      taskCallback,
    },
  });
  console.log("=================>\nresult1: ", result1);
  const result2 = await chatAgent.chat({
    messageId: "msg-" + uuidv4(),
    user: [{ type: "text", text: "Search for information about Musk" }],
    callback: {
      chatCallback,
      taskCallback,
    },
  });
  console.log("=================>\nresult2: ", result2);
}

test.only("dialogue", async () => {
  await run();
});
