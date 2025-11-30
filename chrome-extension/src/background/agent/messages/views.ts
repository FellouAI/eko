import { type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export class MessageMetadata {
  tokens: number;
  message_type: string | null = null;

  constructor(tokens: number, message_type?: string | null) {
    this.tokens = tokens;
    this.message_type = message_type ?? null;
  }
}

export class ManagedMessage {
  message: BaseMessage;
  metadata: MessageMetadata;

  constructor(message: BaseMessage, metadata: MessageMetadata) {
    this.message = message;
    this.metadata = metadata;
  }
}

export class MessageHistory {
  messages: ManagedMessage[] = [];
  totalTokens = 0;

  addMessage(message: BaseMessage, metadata: MessageMetadata, position?: number): void {
    const managedMessage: ManagedMessage = {
      message,
      metadata,
    };

    if (position === undefined) {
      this.messages.push(managedMessage);
    } else {
      this.messages.splice(position, 0, managedMessage);
    }
    this.totalTokens += metadata.tokens;
  }

  removeMessage(index = -1): void {
    if (this.messages.length > 0) {
      const msg = this.messages.splice(index, 1)[0];
      this.totalTokens -= msg.metadata.tokens;
    }
  }

  /**
   * Removes the last message from the history if it is a human message.
   * This is used to remove the state message from the history.
   */
  removeLastStateMessage(): void {
    if (this.messages.length > 2 && this.messages[this.messages.length - 1].message instanceof HumanMessage) {
      const msg = this.messages.pop();
      if (msg) {
        this.totalTokens -= msg.metadata.tokens;
      }
    }
  }

  /**
   * Get all messages
   */
  getMessages(): BaseMessage[] {
    return this.messages.map(m => m.message);
  }

  /**
   * Get total tokens in history
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Remove oldest non-system message
   */
  removeOldestMessage(): void {
    for (let i = 0; i < this.messages.length; i++) {
      if (!(this.messages[i].message instanceof SystemMessage)) {
        const msg = this.messages.splice(i, 1)[0];
        this.totalTokens -= msg.metadata.tokens;
        break;
      }
    }
  }
}
