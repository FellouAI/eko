import dotenv from "dotenv";
import { ReActRequest } from "../../src/types";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { callLLM, callWithReAct, RetryLanguageModel } from "../../src/llm";
import { defaultMessageProviderOptions } from "../../src/agent/agent-llm";
import { LanguageModelV2, LanguageModelV2CallOptions } from "@ai-sdk/provider";

dotenv.config();

const apiKey = process.env.OPENROUTER_API_KEY as string;
if (!apiKey) {
  throw new Error(
    "OPENROUTER_API_KEY environment variable is required for integration tests"
  );
}

export async function testOpenrouter1() {
  const client: LanguageModelV2 = createOpenRouter({
    apiKey: apiKey,
  }).languageModel("google/gemini-3-pro-preview");

  const request: LanguageModelV2CallOptions = {
    prompt: [
      { role: "system", content: "You are a helpful AI assistant" },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      },
    ],
    temperature: 0.7,
    maxOutputTokens: 1024,
    providerOptions: defaultMessageProviderOptions(),
  };

  const result = await client.doGenerate(request);

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.content, result.usage);
}

export async function testOpenrouter2() {
  const rlm = new RetryLanguageModel(
    {
      default: {
        provider: "openrouter",
        model: "google/gemini-3-pro-preview",
        apiKey: apiKey,
      },
    },
    []
  );
  const request: ReActRequest = {
    messages: [
      { role: "system", content: "You are a helpful AI assistant" },
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
    ],
    temperature: 0.7,
    maxOutputTokens: 1024,
    providerOptions: defaultMessageProviderOptions(),
  };

  const result = await callLLM(rlm, request, async (message) => {
    console.log(JSON.stringify(message, null, 2));
  });

  console.log(JSON.stringify(result, null, 2));
}

export async function testOpenrouter3() {
  const rlm = new RetryLanguageModel(
    {
      default: {
        provider: "openrouter",
        model: "google/gemini-3-pro-preview",
        apiKey: apiKey,
      },
    },
    []
  );
  const request: ReActRequest = {
    messages: [
      { role: "system", content: "You are a helpful AI assistant" },
      {
        role: "user",
        content: [{ type: "text", text: "How is the weather today?" }],
      },
    ],
    toolChoice: {
      type: "auto",
    },
    temperature: 0.7,
    maxOutputTokens: 1024,
    providerOptions: defaultMessageProviderOptions(),
  };

  const result = await callWithReAct(
    rlm,
    request,
    [
      {
        name: "weather_query",
        description:
          "Query the current weather information for the user's city, the tool will automatically locate the user's city.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        execute: async (args, toolCall) => {
          return {
            type: "text",
            value:
              "Today the weather is clear, with a temperature of 20 degrees Celsius.",
          };
        },
      },
    ],
    async (message) => {
      console.log(JSON.stringify(message, null, 2));
    }
  );
  console.log(JSON.stringify(result, null, 2));
}

test.only("testOpenrouter", async () => {
  await testOpenrouter3();
});
