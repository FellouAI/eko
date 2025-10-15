import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import Log from "../common/log";
import config from "../config";
import { createOpenAI } from "@ai-sdk/openai";
import { call_timeout, uuidv4 } from "../common/utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  LLMs,
  LLMRequest,
  StreamResult,
  GenerateResult,
} from "../types/llm.types";
import Context, { AgentContext } from "../core/context";
import { defaultLLMProviderOptions } from "../agent/llm";
import { createCallbackHelper } from "../common/callback-helper";
import { toJSONSchema } from "zod/v4";

/**
 * Retry Language Model manager
 *
 * Core LLM management for Eko:
 * 1) Multi-provider support (OpenAI, Anthropic, Google, etc.)
 * 2) Automatic failover and retries
 * 3) Unified streaming and non-streaming interfaces
 * 4) Timeout control and resource management
 * 5) Configurable model selection strategy
 *
 * Key characteristics:
 * - Try multiple models by priority
 * - Smart retries: auto-retry on network errors, fail fast otherwise
 * - Streaming optimization with timeouts
 * - Resource safety: release streams to avoid leaks
 */
export class RetryLanguageModel {
  /** LLM configuration map: key=model name, value=config */
  private llms: LLMs;

  /** Model names ordered by priority */
  private names: string[];

  /** Timeout for first streaming chunk (ms) */
  private stream_first_timeout: number;

  /** Timeout per streaming token (ms) */
  private stream_token_timeout: number;
  private context?: Context;
  private agentContext?: AgentContext;

  /**
   * Constructor
   *
   * @param llms LLM config map
   * @param names Optional model names (priority order)
   * @param stream_first_timeout First-chunk timeout (ms)
   * @param stream_token_timeout Per-token timeout (ms)
   */
  constructor(
    llms: LLMs,
    names?: string[],
    stream_first_timeout?: number,
    stream_token_timeout?: number,
    context?: Context | AgentContext,
  ) {
    this.llms = llms;
    this.names = names || [];
    context && this.setContext(context);
    this.stream_first_timeout = stream_first_timeout || 30_000;
    this.stream_token_timeout = stream_token_timeout || 180_000;

    // Ensure default model is present
    if (this.names.indexOf("default") == -1) {
      this.names.push("default");
    }
  }

  setContext(context?: Context | AgentContext) {
    if (!context) {
      this.context = undefined;
      this.agentContext = undefined;
      return;
    }
    this.context = context instanceof Context ? context : context.context;
    this.agentContext = context instanceof AgentContext ? context : undefined;
  }

  async call(request: LLMRequest): Promise<GenerateResult> {
    // DEBUG: Log call entry point
    // console.warn('[RetryLanguageModel.call] Called with request:', {
    //   hasCallbackContext: !!request?.callbackContext,
    //   hasCallback: !!request?.callbackContext?.callback,
    //   messagesCount: request?.messages?.length,
    //   taskId: request?.callbackContext?.taskId,
    //   streamId: request?.callbackContext?.streamId
    // });
    
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
    }, request);
  }

  async doGenerate(
    options: LanguageModelV2CallOptions,
    request?: LLMRequest
  ): Promise<GenerateResult> {
    // Setup callback helper if request context is provided
    const callbackCtx = request?.callbackContext;
    let cbHelper;
    let requestId: string | undefined;
    
    // DEBUG: Log callbackContext details
    // console.warn('[RetryLanguageModel.doGenerate] callbackContext:', {
    //   hasCallbackContext: !!callbackCtx,
    //   hasCallback: !!callbackCtx?.callback,
    //   taskId: callbackCtx?.taskId,
    //   agentName: callbackCtx?.agentName,
    //   nodeId: callbackCtx?.nodeId,
    //   streamId: callbackCtx?.streamId
    // });
    
    if (callbackCtx?.callback) {
      cbHelper = createCallbackHelper(
        callbackCtx.callback,
        callbackCtx.taskId,
        callbackCtx.agentName,
        callbackCtx.nodeId
      );
      requestId = callbackCtx?.streamId || uuidv4();
      // DEBUG: Log cbHelper creation
      // console.warn('[RetryLanguageModel.doGenerate] cbHelper created, will call llmRequestStart');
    } else {
      // DEBUG: Log missing callback
      // console.warn('[RetryLanguageModel.doGenerate] NO cbHelper - callback not available');
    }

    const maxTokens = options.maxOutputTokens;
    const providerOptions = options.providerOptions;
    const names = [...this.names, ...this.names];
    let lastError;
    
    // Trigger llmRequestStart callback before attempting any model
    if (cbHelper && request) {
      await cbHelper.llmRequestStart(
        request,
        undefined, // model name will be known after successful call
        {
          messageCount: request.messages.length,
          toolCount: request.tools?.length || 0,
          hasSystemPrompt: request.messages.some(m => m.role === 'system'),
        },
        this?.agentContext,
        requestId,  // 传递 streamId/requestId
        request.callbackContext?.name  // 传递自定义名称
      );
    }

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
        _options = await llmConfig.handler(_options, this.context, this.agentContext);
      }
      try {
        // Trigger llmResponseStart callback
        if (cbHelper && requestId) {
          await cbHelper.llmResponseStart(requestId, this?.agentContext);
        }

        let result = (await llm.doGenerate(_options)) as GenerateResult;
        if (Log.isEnableDebug()) {
          Log.debug(
            `LLM nonstream body, name: ${name} => `,
            result.request?.body
          );
        }
        result.llm = name;
        result.llmConfig = llmConfig;
        const textContent = result.content.find((c) => c.type === "text");
        result.text = textContent && 'text' in textContent ? textContent.text : undefined;

        // Trigger llmResponseFinished callback
        if (cbHelper && requestId) {
          await cbHelper.llmResponseFinished(requestId, result.content, {
            promptTokens: result.usage?.inputTokens || 0,
            completionTokens: result.usage?.outputTokens || 0,
            totalTokens: result.usage?.totalTokens || 
              (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
          }, this?.agentContext);
        }

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
    }, request);
  }

  async doStream(
    options: LanguageModelV2CallOptions,
    request?: LLMRequest
  ): Promise<StreamResult> {
    // Setup callback helper if request context is provided
    const callbackCtx = request?.callbackContext;
    let cbHelper;
    let streamId: string | undefined;
    
    // DEBUG: Log callbackContext details
    // console.warn('[RetryLanguageModel.doStream] callbackContext:', {
    //   hasCallbackContext: !!callbackCtx,
    //   hasCallback: !!callbackCtx?.callback,
    //   taskId: callbackCtx?.taskId,
    //   agentName: callbackCtx?.agentName,
    //   nodeId: callbackCtx?.nodeId,
    //   streamId: callbackCtx?.streamId
    // });
    
    if (callbackCtx?.callback) {
      cbHelper = createCallbackHelper(
        callbackCtx.callback,
        callbackCtx.taskId,
        callbackCtx.agentName,
        callbackCtx.nodeId
      );
      streamId = callbackCtx?.streamId || uuidv4();
      // DEBUG: Log cbHelper creation
      // console.warn('[RetryLanguageModel.doStream] cbHelper created, will call llmRequestStart');
    } else {
      // DEBUG: Log missing callback
      // console.warn('[RetryLanguageModel.doStream] NO cbHelper - callback not available');
    }

    const maxTokens = options.maxOutputTokens;
    const providerOptions = options.providerOptions;
    const names = [...this.names, ...this.names];
    let lastError;

    // Trigger llmRequestStart callback before attempting any model
    if (cbHelper && request) {
      await cbHelper.llmRequestStart(
        request,
        undefined, // model name will be known after successful call
        {
          messageCount: request.messages.length,
          toolCount: request.tools?.length || 0,
          hasSystemPrompt: request.messages.some(m => m.role === 'system'),
        },
        this?.agentContext,
        streamId,  // 传递 streamId
        request.callbackContext?.name  // 传递自定义名称
      );
    }

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
        _options = await llmConfig.handler(_options, this.context, this.agentContext);
      }
      try {
        const controller = new AbortController();
        const signal = _options.abortSignal
          ? (AbortSignal as any).any([_options.abortSignal, controller.signal])
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
        
        // Wrap stream with callback if needed
        if (cbHelper && streamId) {
          result.stream = this.callbackStreamWrapper(result.stream, cbHelper, streamId);
        }
        
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

  /**
   * Wrap stream to trigger callback events
   */
  private callbackStreamWrapper(
    stream: ReadableStream<LanguageModelV2StreamPart>,
    cbHelper: any,
    streamId: string
  ): ReadableStream<LanguageModelV2StreamPart> {
    const reader = stream.getReader();
    let hasStarted = false;
    let collectedResponse: any[] = [];
    let usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    return new ReadableStream<LanguageModelV2StreamPart>({
      start: async (controller) => {
        // Trigger llmResponseStart on first chunk
        await cbHelper.llmResponseStart(streamId, this?.agentContext);
        hasStarted = true;
      },
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // Trigger llmResponseFinished
            await cbHelper.llmResponseFinished(streamId, collectedResponse, usage, this?.agentContext);
            controller.close();
            return;
          }

          // Collect response parts for final callback
          if (value.type === 'text-delta' && (value as any).delta) {
            const existingText = collectedResponse.find(p => p.type === 'text');
            if (existingText) {
              existingText.text += (value as any).delta;
            } else {
              collectedResponse.push({ type: 'text', text: (value as any).delta });
            }
          } else if (value.type === 'tool-call') {
            collectedResponse.push(value);
          } else if (value.type === 'finish') {
            const chunk = value as any;
            usage = {
              promptTokens: chunk.usage?.inputTokens || 0,
              completionTokens: chunk.usage?.outputTokens || 0,
              totalTokens: chunk.usage?.totalTokens || (chunk.usage?.inputTokens || 0) + (chunk.usage?.outputTokens || 0),
            };
          }

          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
          throw error;
        }
      },
      cancel: async (reason) => {
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
