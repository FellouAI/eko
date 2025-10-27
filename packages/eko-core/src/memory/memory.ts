import { LanguageModelV2Message } from "@ai-sdk/provider";
import { toFile, uuidv4, getMimeType, sub } from "../common/utils";
import { EkoMessage, LanguageModelV2Prompt } from "../types";
import { defaultMessageProviderOptions } from "../agent/llm";

export interface MemoryConfig {
  maxMessages?: number;
  maxTokens?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  compressionMaxLength?: number;
}

export class EkoMemory {
  protected systemPrompt: string;
  protected messages: EkoMessage[];
  private maxMessages: number;
  private maxTokens: number;
  private enableCompression: boolean;
  private compressionThreshold: number;
  private compressionMaxLength: number;

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

  public genMessageId(): string {
    return uuidv4();
  }

  public async import(data: {
    messages: EkoMessage[];
    config?: MemoryConfig;
  }): Promise<void> {
    this.messages = [...data.messages];
    if (data.config) {
      await this.updateConfig(data.config);
    } else {
      await this.manageCapacity();
    }
  }

  public async addMessages(messages: EkoMessage[]): Promise<void> {
    this.messages.push(...messages);
    await this.manageCapacity();
  }

  public getMessages(): EkoMessage[] {
    return this.messages;
  }

  public getMessageById(id: string): EkoMessage | undefined {
    return this.messages.find((message) => message.id === id);
  }

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

  protected calcTokens(content: string): number {
    // Simple estimation: Each Chinese character is 1 token, other characters are counted as 1 token for every 4.
    const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherCharCount = content.length - chineseCharCount;
    return chineseCharCount + Math.ceil(otherCharCount / 4);
  }

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

  protected async dynamicSystemPrompt(messages: EkoMessage[]): Promise<void> {
    // RAG dynamic system prompt
  }

  protected async manageCapacity(): Promise<void> {
    if (this.messages[this.messages.length - 1].role == "user") {
      await this.dynamicSystemPrompt(this.messages);
    }
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
          message.content = message.content.map((part) => {
            if (
              part.type == "text" &&
              part.text.length > this.compressionMaxLength
            ) {
              return {
                type: "text",
                text: sub(part.text, this.compressionMaxLength, true),
              };
            }
            return part;
          });
        }
        if (message.role == "tool") {
          message.content = message.content.map((part) => {
            if (
              typeof part.result === "string" &&
              part.result.length > this.compressionMaxLength
            ) {
              return {
                ...part,
                result: sub(part.result, this.compressionMaxLength, true),
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
      this.messages.shift();
    }
    this.fixDiscontinuousMessages();
  }

  public fixDiscontinuousMessages() {
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
            .filter((part) => part.type == "tool-call")
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

  public getSystemPrompt(): string {
    return this.systemPrompt;
  }

  public getFirstUserMessage(): EkoMessage | undefined {
    return this.messages.filter((message) => message.role === "user")[0];
  }

  public getLastUserMessage(): EkoMessage | undefined {
    const userMessages = this.messages.filter(
      (message) => message.role === "user"
    );
    return userMessages[userMessages.length - 1];
  }

  public hasMessage(id: string): boolean {
    return this.messages.some((message) => message.id === id);
  }

  public clear(): void {
    this.messages = [];
  }

  public buildMessages(): LanguageModelV2Prompt {
    const llmMessages: LanguageModelV2Message[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (message.role == "user") {
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
