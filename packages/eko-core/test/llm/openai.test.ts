import dotenv from "dotenv";
import { createOpenAI } from "@ai-sdk/openai";
import { defaultMessageProviderOptions } from "../../src/agent/agent-llm";
import { LanguageModelV2, LanguageModelV2StreamPart } from "@ai-sdk/provider";

dotenv.config();

const baseURL = process.env.OPENAI_BASE_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY environment variable is required for integration tests"
  );
}

export async function testOpenaiPrompt() {
  const client: LanguageModelV2 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-5-mini");

  let result = await client.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    maxOutputTokens: 1024,
    temperature: 0.7,
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.content, result.usage);
}

export async function testOpenaiStream() {
  const client: LanguageModelV2 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-5-mini");

  let result = await client.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    maxOutputTokens: 1024,
    temperature: 0.7,
    providerOptions: defaultMessageProviderOptions(),
  });

  console.log(JSON.stringify(result, null, 2));
  let stream = result.stream;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("===> done", value);
        break;
      }
      let chunk = value as LanguageModelV2StreamPart;
      console.log("chunk: ", chunk);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function testToolsPrompt() {
  const client: LanguageModelV2 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-5-mini");

  let result = await client.doGenerate({
    tools: [
      {
        type: "function",
        name: "get_current_country",
        description: "user current country",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        type: "function",
        name: "web_search",
        description: "google search tool",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "search for keywords",
            },
            country: {
              type: "string",
            },
            maxResults: {
              type: "number",
              description: "Maximum search results, default 5",
            },
          },
          required: ["query"],
        },
      },
    ],
    toolChoice: {
      type: "auto",
    },
    prompt: [
      { role: "system", content: "You are a helpful AI assistant" },
      {
        role: "user",
        content: [{ type: "text", text: "Search for recent national affairs" }],
      },
    ],
    maxOutputTokens: 1024,
    temperature: 0.7,
    providerOptions: defaultMessageProviderOptions(),
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.content, result.usage);
}

test.only("testOpenai", async () => {
  await testOpenaiStream();
});
