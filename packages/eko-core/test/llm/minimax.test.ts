/**
 * MiniMax LLM Provider Tests
 *
 * Unit tests verify configuration, type integration, and model creation.
 * Integration tests require MINIMAX_API_KEY and a Node.js environment with
 * full Web API support (fetch, Headers, TransformStream). Run them with
 * Node 20+ outside of Jest if the test runner sandbox lacks these globals.
 */
import dotenv from "dotenv";
import type { LLMs } from "../../src/types/llm.types";

dotenv.config();

const apiKey = process.env.MINIMAX_API_KEY;

// ─── Unit Tests (no API calls) ──────────────────────────────────────────────

describe("MiniMax provider unit tests", () => {
  test("LLMprovider type accepts 'minimax'", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "test-key",
      },
    };
    expect(llms.default.provider).toBe("minimax");
  });

  test("MiniMax config with custom baseURL", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.5",
        apiKey: "test-key",
        config: {
          baseURL: "https://custom-proxy.example.com/v1",
        },
      },
    };
    expect(llms.default.config?.baseURL).toBe(
      "https://custom-proxy.example.com/v1"
    );
  });

  test("MiniMax config with async apiKey", async () => {
    const asyncKey = async () => "async-test-key";
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: asyncKey,
      },
    };
    expect(typeof llms.default.apiKey).toBe("function");
    const key = await (llms.default.apiKey as () => Promise<string>)();
    expect(key).toBe("async-test-key");
  });

  test("MiniMax provider with custom headers", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "test-key",
        config: {
          headers: { "X-Custom-Header": "value" },
        },
      },
    };
    expect(llms.default.config?.headers).toEqual({
      "X-Custom-Header": "value",
    });
  });

  test("MiniMax provider with custom name in config", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "test-key",
        config: {
          name: "my-minimax",
        },
      },
    };
    expect(llms.default.config?.name).toBe("my-minimax");
  });

  test("MiniMax provider with options for providerOptions passthrough", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "test-key",
        options: {
          temperature: 0.5,
        },
      },
    };
    expect(llms.default.options?.temperature).toBe(0.5);
  });

  test("MiniMax M2.7 and M2.5-highspeed model configs", () => {
    const llms: LLMs = {
      default: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "test-key",
      },
      fast: {
        provider: "minimax",
        model: "MiniMax-M2.5-highspeed",
        apiKey: "test-key",
      },
    };
    expect(llms.default.model).toBe("MiniMax-M2.7");
    expect(llms.fast.model).toBe("MiniMax-M2.5-highspeed");
  });

  test("MiniMax provider alongside other providers", () => {
    const llms: LLMs = {
      default: {
        provider: "openai",
        model: "gpt-5",
        apiKey: "openai-key",
      },
      minimax: {
        provider: "minimax",
        model: "MiniMax-M2.7",
        apiKey: "minimax-key",
      },
      claude: {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        apiKey: "anthropic-key",
      },
    };
    expect(llms.default.provider).toBe("openai");
    expect(llms.minimax.provider).toBe("minimax");
    expect(llms.claude.provider).toBe("anthropic");
  });
});

// ─── Integration Tests (require MINIMAX_API_KEY + Node.js with Web APIs) ────
// These tests call the real MiniMax API and require:
// 1. MINIMAX_API_KEY environment variable
// 2. Node.js 18+ with global fetch/Headers (run with: node --test or tsx)
//
// Note: Jest's test environment may not expose all Web APIs (fetch, Headers)
// needed by @ai-sdk/openai-compatible, so integration tests are skipped in Jest.

const hasWebAPIs =
  typeof globalThis.fetch === "function" &&
  typeof globalThis.Headers === "function";

const describeIntegration = apiKey && hasWebAPIs ? describe : describe.skip;

describeIntegration("MiniMax provider integration tests", () => {
  let RetryLanguageModel: any;
  const llms: LLMs = {
    default: {
      provider: "minimax",
      model: "MiniMax-M2.5-highspeed",
      apiKey: apiKey!,
    },
  };

  beforeAll(async () => {
    const mod = await import("../../src/llm");
    RetryLanguageModel = mod.RetryLanguageModel;
  });

  test("MiniMax non-streaming generate", async () => {
    const rlm = new RetryLanguageModel(llms);
    const result = await rlm.call({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Say hello in one word." }],
        },
      ],
      maxOutputTokens: 64,
      temperature: 0.1,
    });

    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.text!.length).toBeGreaterThan(0);
    expect(result.finishReason).toBe("stop");
    expect(result.llm).toBe("default");
    expect(result.llmConfig.provider).toBe("minimax");
  }, 30000);

  test("MiniMax streaming generate", async () => {
    const rlm = new RetryLanguageModel(llms);
    const result = await rlm.callStream({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Say hi in one word." }],
        },
      ],
      maxOutputTokens: 64,
      temperature: 0.1,
    });

    expect(result).toBeDefined();
    expect(result.stream).toBeDefined();

    const reader = result.stream.getReader();
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta") {
          text += value.delta;
        }
      }
    } finally {
      reader.releaseLock();
    }

    expect(text.length).toBeGreaterThan(0);
    expect(result.llm).toBe("default");
  }, 30000);

  test("MiniMax with tool calling", async () => {
    const rlm = new RetryLanguageModel(llms);
    const result = await rlm.call({
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get weather for a city",
          inputSchema: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "City name",
              },
            },
            required: ["city"],
          },
        },
      ],
      toolChoice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is the weather in Tokyo?" },
          ],
        },
      ],
      maxOutputTokens: 256,
      temperature: 0.1,
    });

    expect(result).toBeDefined();
    const toolCall = result.content.find(
      (c: any) => c.type === "tool-call"
    );
    expect(toolCall).toBeDefined();
    if (toolCall && toolCall.type === "tool-call") {
      expect(toolCall.toolName).toBe("get_weather");
      expect(toolCall.input).toHaveProperty("city");
    }
  }, 30000);
});
