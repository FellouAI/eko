// In-memory conversation buffer handling message storage, pruning, compression,
// and transformation into provider-specific prompt formats. Acts as the agent's
// long-lived short-term memory with configurable retention policies.
import { LanguageModelV2Message } from "@ai-sdk/provider";
import { toFile, uuidv4, getMimeType } from "../common/utils";
import { EkoMessage, LanguageModelV2Prompt } from "../types";
import { defaultMessageProviderOptions } from "../agent/llm";

/**
 * Configuration interface for controlling EkoMemory capacity and compression behavior
 * 
 * Provides runtime tuning parameters that control how the memory buffer manages
 * conversation history size, token limits, and automatic compression. All properties
 * are optional and fall back to conservative defaults if omitted.
 * 
 * @interface MemoryConfig
 */
export interface MemoryConfig {
  maxMessages?: number;
  maxTokens?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  compressionMaxLength?: number;
}

/**
 * In-memory conversation buffer with automatic capacity management and compression
 * 
 * Manages a mutable array of conversation messages (user, assistant, tool) with
 * intelligent pruning, compression, and transformation capabilities. The class handles:
 * - Token estimation and enforcement of token limits
 * - Message count limits with automatic oldest-first trimming
 * - Optional text compression for verbose assistant/tool responses
 * - Conversation continuity validation (ensuring proper role sequences)
 * - Transformation to provider-specific prompt formats
 * 
 * The class is intentionally stateful to allow multiple agents to maintain independent
 * conversation histories. Each instance tracks its own system prompt, message buffer,
 * and capacity configuration.
 * 
 * @class EkoMemory
 */
export class EkoMemory {
  // The initial system prompt that is always injected as the first message.
  protected systemPrompt: string;
  // Ordered list of user/assistant/tool turns in chronological order.
  protected messages: EkoMessage[];
  // Capacity controls; all values can be adjusted at runtime through updateConfig.
  private maxMessages: number;
  private maxTokens: number;
  private enableCompression: boolean;
  private compressionThreshold: number;
  private compressionMaxLength: number;

  /**
   * Creates a new memory instance with specified system prompt and optional seed messages
   * 
   * Initializes the conversation buffer with a system prompt that will be prepended to
   * every prompt build. Optionally seeds the buffer with existing messages and applies
   * custom capacity configuration.
   * 
   * Default configuration values:
   * - maxMessages: 15
   * - maxTokens: 16000
   * - enableCompression: false
   * - compressionThreshold: 10
   * - compressionMaxLength: 4000
   * 
   * @param systemPrompt - System-level instruction prepended to every prompt build
   * @param messages - Initial conversation transcript to seed the memory with (defaults to empty array)
   * @param config - Optional capacity overrides applied during construction
   * 
   * @example
   * ```typescript
   * const memory = new EkoMemory(
   *   "You are a helpful assistant",
   *   [],
   *   { maxMessages: 20, enableCompression: true }
   * );
   * ```
   */
  constructor(
    systemPrompt: string,
    messages: EkoMessage[] = [],
    config: MemoryConfig = {}
  ) {
    this.messages = messages;
    this.systemPrompt = systemPrompt;
    this.maxMessages = config.maxMessages ?? 15;
    this.maxTokens = config.maxTokens ?? 16000;
    this.enableCompression = config.enableCompression ?? false;
    this.compressionThreshold = config.compressionThreshold ?? 10;
    this.compressionMaxLength = config.compressionMaxLength ?? 4000;
  }

  /**
   * Generates a unique message identifier using UUID v4
   * 
   * Exposed publicly so external callers can generate message IDs that match the
   * format used by internal helpers. This ensures consistency when manually constructing
   * messages before adding them to the buffer.
   * 
   * @returns UUID v4 string suitable for use as a message ID
   * 
   * @example
   * ```typescript
   * const msgId = memory.genMessageId();
   * // Returns something like "550e8400-e29b-41d4-a716-446655440000"
   * ```
   */
  public genMessageId(): string {
    return uuidv4();
  }

  /**
   * Replaces the entire message history with imported data
   * 
   * Performs a complete reset of the conversation buffer, replacing all existing messages
   * with the provided data. Creates a shallow copy of the imported messages to prevent
   * external mutations from affecting this instance. Optionally updates capacity configuration
   * and enforces limits after import.
   * 
   * If config is provided, updateConfig is called (which triggers manageCapacity).
   * Otherwise, manageCapacity is called directly to enforce current limits.
   * 
   * @param data - Import payload containing messages array and optional config overrides
   * @param data.messages - Array of messages to replace the current history with
   * @param data.config - Optional new capacity configuration to apply after import
   * @returns Promise that resolves when import and capacity management complete
   * 
   * @example
   * ```typescript
   * await memory.import({
   *   messages: savedMessages,
   *   config: { maxMessages: 25 }
   * });
   * ```
   */
  public async import(data: {
    messages: EkoMessage[];
    config?: MemoryConfig;
  }): Promise<void> {
    // Reset current history with a shallow copy to keep external arrays mutable
    // without affecting this instance.
    this.messages = [...data.messages];
    if (data.config) {
      await this.updateConfig(data.config);
    } else {
      await this.manageCapacity();
    }
  }

  /**
   * Appends new conversation turns to the buffer and enforces capacity constraints
   * 
   * Adds one or more messages to the end of the conversation history in chronological order,
   * then automatically triggers capacity management to ensure the buffer stays within configured
   * limits (token count, message count, compression thresholds).
   * 
   * The function is async because capacity management may involve dynamic system prompt updates
   * or compression operations.
   * 
   * @param messages - Array of new messages to append to the conversation history
   * @returns Promise that resolves when messages are added and capacity is managed
   * 
   * @example
   * ```typescript
   * await memory.addMessages([
   *   { role: 'user', content: 'Hello', id: memory.genMessageId(), timestamp: Date.now() }
   * ]);
   * ```
   */
  public async addMessages(messages: EkoMessage[]): Promise<void> {
    // Messages are appended in chronological order; trimming happens afterwards.
    this.messages.push(...messages);
    await this.manageCapacity();
  }

  /**
   * Returns the current conversation history
   * 
   * Provides direct access to the internal messages array. Note that the returned
   * array is a reference to the internal state, not a copy, so external modifications
   * will affect the memory buffer.
   * 
   * @returns Array of all messages currently stored in the buffer
   */
  public getMessages(): EkoMessage[] {
    return this.messages;
  }

  /**
   * Retrieves a specific message by its unique identifier
   * 
   * Performs a linear search through the message buffer to find the message with
   * the matching ID. Returns undefined if no message with that ID exists.
   * 
   * @param id - Unique message identifier to search for
   * @returns The matching message if found, undefined otherwise
   * 
   * @example
   * ```typescript
   * const msg = memory.getMessageById('550e8400-e29b-41d4-a716-446655440000');
   * if (msg) {
   *   console.log(msg.content);
   * }
   * ```
   */
  public getMessageById(id: string): EkoMessage | undefined {
    return this.messages.find((message) => message.id === id);
  }

  /**
   * Removes a message by ID and optionally cleans up subsequent assistant/tool responses
   * 
   * Deletes the specified message from the buffer. If removeToNextUserMessages is true (default),
   * also removes all following assistant and tool messages until the next user message is
   * encountered. This prevents orphaned responses that have no associated user request.
   * 
   * Returns an array of all removed message IDs for auditing purposes. Returns undefined if
   * the specified ID was not found.
   * 
   * @param id - Unique identifier of the message to remove
   * @param removeToNextUserMessages - If true, removes the cascade of assistant/tool responses (default: true)
   * @returns Array of removed message IDs if any were removed, undefined if ID not found
   * 
   * @example
   * ```typescript
   * const removedIds = memory.removeMessageById('msg-123', true);
   * // removedIds might be ['msg-123', 'msg-124', 'msg-125']
   * ```
   */
  public removeMessageById(
    id: string,
    removeToNextUserMessages: boolean = true
  ): string[] | undefined {
    const removedIds: string[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (message.id === id) {
        removedIds.push(id);
        if (removeToNextUserMessages) {
          // Remove assistant/tool chain that belongs to the deleted user turn
          // until we hit the next user utterance. Prevents orphaned replies.
          for (let j = i + 1; j < this.messages.length; j++) {
            const nextMessage = this.messages[j];
            if (nextMessage.role == "user") {
              break;
            }
            removedIds.push(nextMessage.id);
          }
        }
        this.messages.splice(i, removedIds.length);
        break;
      }
    }
    return removedIds.length > 0 ? removedIds : undefined;
  }

  /**
   * Estimates the total token count for the current conversation
   * 
   * Calculates an approximate token count by analyzing the system prompt (if requested)
   * and all message content. The estimation uses a simple heuristic: Chinese characters
   * count as 1 token each, while other characters count as 0.25 tokens each (4 chars = 1 token).
   * 
   * Message content is converted to string format before counting (objects are JSON-serialized).
   * This provides a reasonable approximation for capacity management without requiring expensive
   * tokenizer calls.
   * 
   * @param calcSystemPrompt - Whether to include system prompt tokens in the estimate (default: true)
   * @returns Estimated total token count for the conversation
   * 
   * @example
   * ```typescript
   * const tokens = memory.getEstimatedTokens(true);
   * console.log(`Estimated tokens: ${tokens}`);
   * ```
   */
  public getEstimatedTokens(calcSystemPrompt: boolean = true): number {
    let tokens = 0;
    if (calcSystemPrompt) {
      tokens += this.calcTokens(this.systemPrompt);
    }
    return this.messages.reduce((total, message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);
      return total + this.calcTokens(content);
    }, tokens);
  }

  /**
   * Calculates estimated token count for a text string using simple heuristics
   * 
   * Uses a character-based estimation approach optimized for mixed Chinese/English content:
   * - Chinese characters (U+4E00 to U+9FFF): 1 token each
   * - Other characters: 4 characters = 1 token (rounded up)
   * 
   * This provides a fast approximation without requiring a full tokenizer. The heuristic
   * tends to slightly overestimate for English text and is reasonably accurate for Chinese.
   * 
   * @param content - Text string to estimate token count for
   * @returns Estimated token count using the heuristic formula
   * @protected
   */
  protected calcTokens(content: string): number {
    // Simple estimation: Each Chinese character is 1 token, other characters are counted as 1 token for every 4.
    const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherCharCount = content.length - chineseCharCount;
    return chineseCharCount + Math.ceil(otherCharCount / 4);
  }

  /**
   * Updates memory capacity configuration and applies new limits
   * 
   * Accepts partial configuration updates, allowing you to modify only specific settings
   * without affecting others. After updating the configuration, automatically triggers
   * capacity management to enforce the new limits on the existing message buffer.
   * 
   * Supported configuration updates:
   * - maxMessages: Maximum number of messages to retain
   * - maxTokens: Maximum estimated token count
   * - enableCompression: Whether to compress verbose messages
   * - compressionThreshold: Minimum message count before compression activates
   * - compressionMaxLength: Maximum character length for compressed content
   * 
   * @param config - Partial configuration object with properties to update
   * @returns Promise that resolves when configuration is updated and capacity is managed
   * 
   * @example
   * ```typescript
   * await memory.updateConfig({ 
   *   maxMessages: 30, 
   *   enableCompression: true 
   * });
   * ```
   */
  public async updateConfig(config: Partial<MemoryConfig>): Promise<void> {
    if (config.maxMessages !== undefined) {
      this.maxMessages = config.maxMessages;
    }
    if (config.maxTokens !== undefined) {
      this.maxTokens = config.maxTokens;
    }
    if (config.enableCompression !== undefined) {
      this.enableCompression = config.enableCompression;
    }
    if (config.compressionThreshold !== undefined) {
      this.compressionThreshold = config.compressionThreshold;
    }
    if (config.compressionMaxLength !== undefined) {
      this.compressionMaxLength = config.compressionMaxLength;
    }
    await this.manageCapacity();
  }

  /**
   * Hook for dynamically updating the system prompt based on conversation context
   * 
   * This protected method is called during capacity management when the latest message
   * is from the user. It provides an extension point for implementing dynamic system
   * prompt generation, such as incorporating RAG (Retrieval-Augmented Generation) results
   * or context-aware instructions.
   * 
   * The default implementation is empty. Subclasses can override this method to inject
   * custom logic for deriving system prompts from the current conversation state.
   * 
   * @param messages - Current conversation history to analyze
   * @returns Promise that resolves when system prompt updates complete
   * @protected
   */
  protected async dynamicSystemPrompt(messages: EkoMessage[]): Promise<void> {
    // RAG dynamic system prompt
  }

  /**
   * Enforces all capacity constraints including tokens, message count, and compression
   * 
   * Core capacity management method that runs automatically after messages are added or
   * configuration is updated. Performs the following steps in order:
   * 
   * 1. Dynamic system prompt update (if last message is from user)
   * 2. Message count trimming - removes oldest messages if count exceeds maxMessages
   * 3. Optional compression - truncates verbose assistant/tool responses if enabled
   * 4. Token-based trimming - removes oldest messages until token estimate fits maxTokens
   * 5. Continuity fixing - ensures conversation starts with user and has valid role sequences
   * 
   * The compression step only activates when enableCompression is true and message count
   * exceeds compressionThreshold. Compression truncates text content to compressionMaxLength
   * while preserving the beginning of each message for context.
   * 
   * @returns Promise that resolves when all capacity management steps complete
   * @protected
   */
  protected async manageCapacity(): Promise<void> {
    // Update the system prompt dynamically when the latest message comes from the
    // user, making it possible to derive context-aware instructions (e.g. RAG).
    if (this.messages[this.messages.length - 1].role == "user") {
      await this.dynamicSystemPrompt(this.messages);
    }
    // Trim by message count first, removing the oldest turns.
    if (this.messages.length > this.maxMessages) {
      const excess = this.messages.length - this.maxMessages;
      this.messages.splice(0, excess);
    }
    if (
      this.enableCompression &&
      this.messages.length > this.compressionThreshold
    ) {
      // compress messages
      for (let i = 0; i < this.messages.length; i++) {
        const message = this.messages[i];
        if (message.role == "assistant") {
          // Shorten verbose assistant responses while preserving the opening.
          message.content = message.content.map((part) => {
            if (
              part.type == "text" &&
              part.text.length > this.compressionMaxLength
            ) {
              return {
                type: "text",
                text: part.text.slice(0, this.compressionMaxLength) + "...",
              };
            }
            return part;
          });
        }
        if (message.role == "tool") {
          // Tool outputs are truncated by raw string payload; JSON results remain
          // untouched to avoid producing invalid structured data.
          message.content = message.content.map((part) => {
            if (
              typeof part.result === "string" &&
              part.result.length > this.compressionMaxLength
            ) {
              return {
                ...part,
                result: part.result.slice(0, this.compressionMaxLength) + "...",
              };
            }
            return part;
          });
        }
      }
    }
    while (
      this.getEstimatedTokens(true) > this.maxTokens &&
      this.messages.length > 0
    ) {
      // Fallback trimming: drop the oldest turn until the estimate fits.
      this.messages.shift();
    }
    this.fixDiscontinuousMessages();
  }

  /**
   * Validates and repairs conversation continuity to ensure proper role sequencing
   * 
   * Performs multiple validation and repair operations to ensure the conversation follows
   * valid structure:
   * 
   * 1. Ensures first message is from user - removes leading assistant/tool messages
   * 2. Removes duplicate consecutive user messages with identical content
   * 3. Adds missing tool result messages when assistant calls tools but no results follow
   * 
   * The third repair handles cases where message trimming removed tool results but left
   * the tool-calling assistant message. This would cause errors as the LLM expects tool
   * results after tool calls. The method inserts synthetic "Error: No result" responses
   * to maintain valid conversation structure.
   * 
   * @returns void - Function modifies the messages array directly
   * 
   * @example
   * ```typescript
   * memory.fixDiscontinuousMessages();
   * // Conversation now starts with user and has valid role sequences
   * ```
   */
  public fixDiscontinuousMessages() {
    // Ensure the first chronological message is from the user; stray assistant
    // or tool turns without a preceding user message can break the dialogue.
    if (this.messages.length > 0 && this.messages[0].role != "user") {
      for (let i = 0; i < this.messages.length; i++) {
        const message = this.messages[i];
        if (message.role == "user") {
          this.messages.splice(0, i);
          break;
        }
      }
    }
    const removeIds: string[] = [];
    let lastMessage: EkoMessage | null = null;
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (
        message.role == "user" &&
        lastMessage &&
        lastMessage.role == "user" &&
        message.content == lastMessage.content
      ) {
        // remove duplicate user messages
        removeIds.push(message.id);
      }
      if (
        lastMessage &&
        lastMessage.role == "assistant" &&
        lastMessage.content.filter((part) => part.type == "tool-call").length >
          0 &&
        message.role != "tool"
      ) {
        // add tool result message
        this.messages.push({
          role: "tool",
          id: this.genMessageId(),
          timestamp: message.timestamp + 1,
          content: lastMessage.content
            .filter((part): part is Extract<typeof part, { type: "tool-call" }> => part.type == "tool-call")
            .map((part) => {
              return {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: "Error: No result",
              };
            }),
        });
      }
      lastMessage = message;
    }
    if (removeIds.length > 0) {
      removeIds.forEach((id) => this.removeMessageById(id));
    }
  }

  /**
   * Returns the current system prompt
   * 
   * @returns System prompt string that will be prepended to prompt builds
   */
  public getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Retrieves the first user message in chronological order
   * 
   * Scans through the message buffer and returns the earliest message with role "user".
   * Returns undefined if no user messages exist in the buffer.
   * 
   * The implementation filters for user messages and takes the first match, which preserves
   * chronological order and avoids scanning the entire array twice.
   * 
   * @returns First user message if found, undefined if no user messages exist
   * 
   * @example
   * ```typescript
   * const firstMsg = memory.getFirstUserMessage();
   * if (firstMsg) {
   *   console.log('Conversation started with:', firstMsg.content);
   * }
   * ```
   */
  public getFirstUserMessage(): EkoMessage | undefined {
    // First match preserves chronological order and avoids scanning twice.
    return this.messages.filter((message) => message.role === "user")[0];
  }

  /**
   * Retrieves the most recent user message in the conversation
   * 
   * Scans through the message buffer and returns the latest message with role "user".
   * Returns undefined if no user messages exist in the buffer.
   * 
   * @returns Last user message if found, undefined if no user messages exist
   * 
   * @example
   * ```typescript
   * const lastMsg = memory.getLastUserMessage();
   * if (lastMsg) {
   *   console.log('Latest user input:', lastMsg.content);
   * }
   * ```
   */
  public getLastUserMessage(): EkoMessage | undefined {
    const userMessages = this.messages.filter(
      (message) => message.role === "user"
    );
    return userMessages[userMessages.length - 1];
  }

  /**
   * Checks if a message with the specified ID exists in the buffer
   * 
   * Performs a linear search to determine if any message in the buffer has the given ID.
   * More efficient than getMessageById when you only need to check existence.
   * 
   * @param id - Message identifier to check for
   * @returns True if a message with the ID exists, false otherwise
   * 
   * @example
   * ```typescript
   * if (memory.hasMessage('msg-123')) {
   *   console.log('Message found');
   * }
   * ```
   */
  public hasMessage(id: string): boolean {
    return this.messages.some((message) => message.id === id);
  }

  /**
   * Clears all conversation messages while preserving the system prompt and configuration
   * 
   * Resets the message buffer to an empty array, effectively starting a fresh conversation.
   * The system prompt, capacity limits, and other configuration remain unchanged.
   * 
   * @returns void
   * 
   * @example
   * ```typescript
   * memory.clear();
   * // Buffer is now empty but can accept new messages
   * ```
   */
  public clear(): void {
    this.messages = [];
  }

  /**
   * Transforms internal message format to provider-compatible prompt structure
   * 
   * Converts the EkoMessage array into LanguageModelV2Prompt format suitable for LLM providers.
   * Performs the following transformations:
   * 
   * User messages:
   * - String content → single text part
   * - Rich content → array of text/file parts with proper media type detection
   * 
   * Assistant messages:
   * - Maps text, reasoning, and tool-call parts to provider format
   * - Converts tool call args to the expected input structure
   * 
   * Tool messages:
   * - Transforms tool results to tool-result parts
   * - Wraps string results as text output, objects as JSON output
   * 
   * Always prepends a system message with the current system prompt and applies
   * default provider options to user messages.
   * 
   * @returns Complete prompt array ready for LLM provider consumption, starting with system message
   * 
   * @example
   * ```typescript
   * const prompt = memory.buildMessages();
   * // Returns [{ role: 'system', ... }, { role: 'user', ... }, ...]
   * ```
   */
  public buildMessages(): LanguageModelV2Prompt {
    const llmMessages: LanguageModelV2Message[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (message.role == "user") {
        // Convert mixed string / rich-content payloads into the format expected
        // by the underlying language model provider.
        llmMessages.push({
          role: message.role,
          content:
            typeof message.content === "string"
              ? [
                  {
                    type: "text",
                    text: message.content,
                  },
                ]
              : message.content.map((part) => {
                  if (part.type == "text") {
                    return {
                      type: "text",
                      text: part.text,
                    };
                  } else {
                    return {
                      type: "file",
                      data: toFile(part.data),
                      mediaType: part.mimeType || getMimeType(part.data),
                    };
                  }
                }),
          providerOptions: defaultMessageProviderOptions(),
        });
      } else if (message.role == "assistant") {
        llmMessages.push({
          role: message.role,
          content: message.content.map((part) => {
            if (part.type == "text") {
              return {
                type: "text",
                text: part.text,
              };
            } else if (part.type == "reasoning") {
              return {
                type: "reasoning",
                text: part.text,
              };
            } else if (part.type == "tool-call") {
              return {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.args as unknown,
              };
            } else {
              return part;
            }
          }),
        });
      } else if (message.role == "tool") {
        llmMessages.push({
          role: message.role,
          content: message.content.map((part) => {
            return {
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output:
                typeof part.result == "string"
                  ? {
                      type: "text",
                      value: part.result,
                    }
                  : {
                      type: "json",
                      value: part.result as any,
                    },
            };
          }),
        });
      }
    }
    return [
      {
        role: "system",
        content: this.getSystemPrompt(),
        providerOptions: defaultMessageProviderOptions(),
      },
      ...llmMessages,
    ];
  }
}
