import { ChatMessages, WebSearchResult } from "../types/chat.types";

export interface ChatService {
  loadMessages(chatId: string): Promise<ChatMessages>;

  addMessage(chatId: string, messages: ChatMessages): Promise<void>;

  memoryRecall(chatId: string, prompt: string): Promise<string>;

  uploadFile(
    file: File | { base64Data: string; mimeType: string; filename: string },
    chatId: string,
    taskId?: string | undefined
  ): Promise<{
    fileId?: string;
    url: string;
  }>;

  websearch(
    chatId: string,
    query: string,
    site?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]>;
}

export class SimpleChatService implements ChatService {
  loadMessages(chatId: string): Promise<ChatMessages> {
    return Promise.resolve([]);
  }
  addMessage(chatId: string, messages: ChatMessages): Promise<void> {
    return Promise.resolve();
  }
  memoryRecall(chatId: string, prompt: string): Promise<string> {
    return Promise.resolve("");
  }
  uploadFile(
    file: File | { base64Data: string; mimeType: string; filename: string },
    chatId: string,
    taskId?: string | undefined
  ): Promise<{
    fileId?: string;
    url: string;
  }> {
    throw new Error("uploadFile not implemented.");
  }
  websearch(
    chatId: string,
    query: string,
    site?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    throw new Error("websearch not implemented.");
  }
}
