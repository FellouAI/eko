import {
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2CallOptions,
} from "@ai-sdk/provider";
import Log from "../common/log";
import config from "../config";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { call_timeout } from "../common/utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  LLMs,
  LLMRequest,
  StreamResult,
  GenerateResult,
} from "../types/llm.types";
import { defaultLLMProviderOptions } from "../agent/agent-llm";
import TaskContext, { AgentContext } from "../agent/agent-context";

export class RetryLanguageModel {
  private llms: LLMs;
  private names: string[];
  private stream_first_timeout: number;
  private stream_token_timeout: number;
  private context?: TaskContext;
  private agentContext?: AgentContext;

  constructor(
    llms: LLMs,
    names?: string[],
    stream_first_timeout?: number,
    stream_token_timeout?: number,
    context?: TaskContext | AgentContext
  ) {
    this.llms = llms;
    this.names = names || [];
    context && this.setContext(context);
    this.stream_first_timeout = stream_first_timeout || 30_000;
    this.stream_token_timeout = stream_token_timeout || 180_000;
    if (this.names.indexOf("default") == -1) {
      this.names.push("default");
    }
  }

  setContext(context?: TaskContext | AgentContext) {
    if (!context) {
      this.context = undefined;
      this.agentContext = undefined;
      return;
    }
    this.context = context instanceof TaskContext ? context : context.context;
    this.agentContext = context instanceof AgentContext ? context : undefined;
  }

  async call(request: LLMRequest): Promise<GenerateResult> {
    return await this.doGenerate({
      prompt: request.messages,
      tools: request.tools,
      toolChoice: request.toolChoice,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
      providerOptions: request.providerOptions,
    });
  }

  async doGenerate(
    options: LanguageModelV2CallOptions
  ): Promise<GenerateResult> {
    const maxOutputTokens = options.maxOutputTokens;
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
      if (!maxOutputTokens) {
        options.maxOutputTokens =
          llmConfig.config?.maxOutputTokens || config.maxOutputTokens;
      }
      if (!providerOptions) {
        options.providerOptions = defaultLLMProviderOptions();
        if (llmConfig.options && Object.keys(llmConfig.options).length > 0) {
          options.providerOptions[llm.provider] = llmConfig.options;
        }
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(
          _options,
          this.context,
          this.agentContext
        );
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
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
      providerOptions: request.providerOptions,
    });
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<StreamResult> {
    const maxOutputTokens = options.maxOutputTokens;
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
      if (!maxOutputTokens) {
        options.maxOutputTokens =
          llmConfig.config?.maxOutputTokens || config.maxOutputTokens;
      }
      if (!providerOptions) {
        options.providerOptions = defaultLLMProviderOptions();
        if (llmConfig.options && Object.keys(llmConfig.options).length > 0) {
          options.providerOptions[llm.provider] = llmConfig.options;
        }
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(
          _options,
          this.context,
          this.agentContext
        );
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
    } else if (llm.provider == "bedrock") {
      apiKey = apiKey.trim();
      let keyInfos;
      if (apiKey.startsWith("{") && apiKey.endsWith("}")) {
        keyInfos = JSON.parse(apiKey);
      } else {
        keyInfos = {
          apiKey: apiKey,
        };
      }
      return createAmazonBedrock({
        baseURL: baseURL,
        apiKey: keyInfos.apiKey,
        accessKeyId: keyInfos.accessKeyId,
        secretAccessKey: keyInfos.secretAccessKey,
        region: keyInfos.region || llm.config?.region || "us-west-1",
        sessionToken: keyInfos.sessionToken || llm.config?.sessionToken,
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "azure") {
      return createAzure({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
        resourceName: llm.config?.resourceName,
        apiVersion: llm.config?.apiVersion,
        useDeploymentBasedUrls: llm.config?.useDeploymentBasedUrls,
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
    } else if (llm.provider == "modelscope") {
      return createOpenAICompatible({
        name: llm.config?.name || llm.model.split("/")[0],
        apiKey: apiKey,
        baseURL: baseURL || "https://api-inference.modelscope.cn/v1",
        fetch: llm.fetch,
        headers: llm.config?.headers,
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
