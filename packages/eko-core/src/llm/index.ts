import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import Log from "../common/log";
import config from "../config";
import { createOpenAI } from "@ai-sdk/openai";
import { call_timeout } from "../common/utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  GenerateResult,
  LLMRequest,
  LLMs,
  StreamResult,
} from "../types/llm.types";
import { defaultLLMProviderOptions } from "../agent/llm";

/**
 * 重试语言模型管理器
 *
 * RetryLanguageModel 是 Eko 系统中的 LLM 管理核心，负责：
 * 1. 多模型提供商支持（OpenAI、Anthropic、Google等）
 * 2. 自动故障转移和重试机制
 * 3. 流式和非流式响应的统一接口
 * 4. 超时控制和资源管理
 * 5. 配置化模型选择策略
 *
 * 核心特性：
 * - 多模型并行尝试：按优先级尝试不同模型
 * - 智能重试策略：网络错误自动重试，其他错误快速失败
 * - 流式处理优化：支持实时响应和超时控制
 * - 资源管理：自动释放流资源，防止内存泄漏
 */
export class RetryLanguageModel {
  /** LLM配置映射表，key为模型名称，value为配置 */
  private llms: LLMs;

  /** 模型名称列表，按优先级排序 */
  private names: string[];

  /** 流式响应首次数据超时时间（毫秒） */
  private stream_first_timeout: number;

  /** 流式响应单个token超时时间（毫秒） */
  private stream_token_timeout: number;

  /**
   * 构造函数
   *
   * @param llms LLM配置映射表
   * @param names 模型名称列表，可选，默认为空数组
   * @param stream_first_timeout 流式响应首次数据超时时间，默认30秒
   * @param stream_token_timeout 流式响应单个token超时时间，默认180秒
   */
  constructor(
    llms: LLMs,
    names?: string[],
    stream_first_timeout?: number,
    stream_token_timeout?: number
  ) {
    this.llms = llms;
    this.names = names || [];
    this.stream_first_timeout = stream_first_timeout || 30_000;
    this.stream_token_timeout = stream_token_timeout || 180_000;

    // 确保包含默认模型
    if (this.names.indexOf("default") == -1) {
      this.names.push("default");
    }
  }

  async call(request: LLMRequest): Promise<GenerateResult> {
    return await this.doGenerate({
      prompt: request.messages,
      tools: request.tools,
      toolChoice: request.toolChoice,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
    });
  }

  async doGenerate(
    options: LanguageModelV2CallOptions
  ): Promise<GenerateResult> {
    const maxTokens = options.maxOutputTokens;
    const providerOptions = options.providerOptions;
    const names = [...this.names, ...this.names];
    let lastError;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const llmConfig = this.llms[name];
      const llm = await this.getLLM(name);
      if (!llm) {
        continue;
      }
      if (!maxTokens) {
        options.maxOutputTokens =
          llmConfig.config?.maxTokens || config.maxTokens;
      }
      if (!providerOptions) {
        options.providerOptions = defaultLLMProviderOptions();
        options.providerOptions[llm.provider] = llmConfig.options || {};
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(_options);
      }
      try {
        let result = (await llm.doGenerate(_options)) as GenerateResult;
        if (Log.isEnableDebug()) {
          Log.debug(
            `LLM nonstream body, name: ${name} => `,
            result.request?.body
          );
        }
        result.llm = name;
        result.llmConfig = llmConfig;
        result.text = result.content.find((c) => c.type === "text")?.text;
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        lastError = e;
        if (Log.isEnableInfo()) {
          Log.info(`LLM nonstream request, name: ${name} => `, {
            tools: _options.tools,
            messages: _options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(
      lastError ? lastError : new Error("No LLM available")
    );
  }

  async callStream(request: LLMRequest): Promise<StreamResult> {
    return await this.doStream({
      prompt: request.messages,
      tools: request.tools,
      toolChoice: request.toolChoice,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
    });
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<StreamResult> {
    const maxTokens = options.maxOutputTokens;
    const providerOptions = options.providerOptions;
    const names = [...this.names, ...this.names];
    let lastError;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const llmConfig = this.llms[name];
      const llm = await this.getLLM(name);
      if (!llm) {
        continue;
      }
      if (!maxTokens) {
        options.maxOutputTokens =
          llmConfig.config?.maxTokens || config.maxTokens;
      }
      if (!providerOptions) {
        options.providerOptions = defaultLLMProviderOptions();
        options.providerOptions[llm.provider] = llmConfig.options || {};
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(_options);
      }
      try {
        const controller = new AbortController();
        const signal = _options.abortSignal
          ? AbortSignal.any([_options.abortSignal, controller.signal])
          : controller.signal;
        const result = (await call_timeout(
          async () => await llm.doStream({ ..._options, abortSignal: signal }),
          this.stream_first_timeout,
          (e) => {
            controller.abort();
          }
        )) as StreamResult;
        const stream = result.stream;
        const reader = stream.getReader();
        const { done, value } = await call_timeout(
          async () => await reader.read(),
          this.stream_first_timeout,
          (e) => {
            reader.cancel();
            reader.releaseLock();
            controller.abort();
          }
        );
        if (done) {
          Log.warn(`LLM stream done, name: ${name} => `, { done, value });
          reader.releaseLock();
          continue;
        }
        if (Log.isEnableDebug()) {
          Log.debug(`LLM stream body, name: ${name} => `, result.request?.body);
        }
        let chunk = value as LanguageModelV2StreamPart;
        if (chunk.type == "error") {
          Log.error(`LLM stream error, name: ${name}`, chunk);
          reader.releaseLock();
          continue;
        }
        result.llm = name;
        result.llmConfig = llmConfig;
        result.stream = this.streamWrapper([chunk], reader, controller);
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        lastError = e;
        if (Log.isEnableInfo()) {
          Log.info(`LLM stream request, name: ${name} => `, {
            tools: _options.tools,
            messages: _options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(
      lastError ? lastError : new Error("No LLM available")
    );
  }

  private async getLLM(name: string): Promise<LanguageModelV2 | null> {
    const llm = this.llms[name];
    if (!llm) {
      return null;
    }
    let apiKey;
    if (typeof llm.apiKey === "string") {
      apiKey = llm.apiKey;
    } else {
      apiKey = await llm.apiKey();
    }
    let baseURL = undefined;
    if (llm.config?.baseURL) {
      if (typeof llm.config.baseURL === "string") {
        baseURL = llm.config.baseURL;
      } else {
        baseURL = await llm.config.baseURL();
      }
    }
    if (llm.provider == "openai") {
      if (
        !baseURL ||
        baseURL.indexOf("openai.com") > -1 ||
        llm.config?.organization ||
        llm.config?.openai
      ) {
        return createOpenAI({
          apiKey: apiKey,
          baseURL: baseURL,
          fetch: llm.fetch,
          organization: llm.config?.organization,
          project: llm.config?.project,
          headers: llm.config?.headers,
        }).languageModel(llm.model);
      } else {
        return createOpenAICompatible({
          name: llm.model,
          apiKey: apiKey,
          baseURL: baseURL,
          fetch: llm.fetch,
          headers: llm.config?.headers,
        }).languageModel(llm.model);
      }
    } else if (llm.provider == "anthropic") {
      return createAnthropic({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "google") {
      return createGoogleGenerativeAI({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "aws") {
      let keys = apiKey.split("=");
      return createAmazonBedrock({
        accessKeyId: keys[0],
        secretAccessKey: keys[1],
        baseURL: baseURL,
        region: llm.config?.region || "us-west-1",
        fetch: llm.fetch,
        headers: llm.config?.headers,
        sessionToken: llm.config?.sessionToken,
      }).languageModel(llm.model);
    } else if (llm.provider == "openai-compatible") {
      return createOpenAICompatible({
        name: llm.config?.name || llm.model.split("/")[0],
        apiKey: apiKey,
        baseURL: baseURL || "https://openrouter.ai/api/v1",
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "openrouter") {
      return createOpenRouter({
        apiKey: apiKey,
        baseURL: baseURL || "https://openrouter.ai/api/v1",
        fetch: llm.fetch,
        headers: llm.config?.headers,
        compatibility: llm.config?.compatibility,
      }).languageModel(llm.model);
    } else {
      return llm.provider.languageModel(llm.model);
    }
  }

  private streamWrapper(
    parts: LanguageModelV2StreamPart[],
    reader: ReadableStreamDefaultReader<LanguageModelV2StreamPart>,
    abortController: AbortController
  ): ReadableStream<LanguageModelV2StreamPart> {
    let timer: any = null;
    return new ReadableStream<LanguageModelV2StreamPart>({
      start: (controller) => {
        if (parts != null && parts.length > 0) {
          for (let i = 0; i < parts.length; i++) {
            controller.enqueue(parts[i]);
          }
        }
      },
      pull: async (controller) => {
        timer = setTimeout(() => {
          abortController.abort("Streaming request timeout");
        }, this.stream_token_timeout);
        const { done, value } = await reader.read();
        clearTimeout(timer);
        if (done) {
          controller.close();
          reader.releaseLock();
          return;
        }
        controller.enqueue(value);
      },
      cancel: (reason) => {
        timer && clearTimeout(timer);
        reader.cancel(reason);
      },
    });
  }

  public get Llms(): LLMs {
    return this.llms;
  }

  public get Names(): string[] {
    return this.names;
  }
}
