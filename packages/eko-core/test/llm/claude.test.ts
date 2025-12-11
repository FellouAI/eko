import dotenv from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { defaultMessageProviderOptions } from "../../src/agent/agent-llm";
import { LanguageModelV2, LanguageModelV2StreamPart } from "@ai-sdk/provider";

dotenv.config();

const baseURL = process.env.ANTHROPIC_BASE_URL;
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY environment variable is required for integration tests"
  );
}

export async function testClaudePrompt() {
  const client: LanguageModelV2 = createAnthropic({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("claude-sonnet-4-5-20250929");

  let result = await client.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    maxOutputTokens: 1024,
    temperature: 0.7,
    providerOptions: defaultMessageProviderOptions(),
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.content, result.usage);
}

export async function testClaudeStream() {
  const client: LanguageModelV2 = createAnthropic({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("claude-sonnet-4-5-20250929");

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
  const client: LanguageModelV2 = createAnthropic({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("claude-sonnet-4-5-20250929");

  const result = await client.doStream({
    tools: [
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
      { role: "user", content: [{ type: "text", text: "Search for recent national affairs" }] },
    ],
    maxOutputTokens: 1024,
    temperature: 0.7,
    providerOptions: defaultMessageProviderOptions(),
  });

  const reader = result.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("===> done", value);
        break;
      }
      let chunk = value as LanguageModelV2StreamPart;
      console.log("chunk: ", JSON.stringify(chunk, null, 2));
    }
  } finally {
    reader.releaseLock();
  }
}

test.only("testClaude", async () => {
  await testToolsPrompt();
});
