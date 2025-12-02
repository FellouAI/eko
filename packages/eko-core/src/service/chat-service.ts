import { EkoMessage, WebSearchResult } from "../types";

export default interface ChatService {
  loadMessages(chatId: string): Promise<EkoMessage[]>;

  addMessage(chatId: string, messages: EkoMessage[]): Promise<void>;

  memoryRecall(chatId: string, prompt: string): Promise<string>;

  uploadFile(
    file: File | { base64Data: string; mimeType: string; filename: string },
    chatId: string,
    taskId?: string | undefined // messageId
  ): Promise<{
    fileId: string;
    url: string;
  }>;

  websearch(
    chatId: string,
    query: string,
    site?: string,
    language?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]>;
}

export type { ChatService };
