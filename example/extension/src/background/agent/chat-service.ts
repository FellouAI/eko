import { ChatService, uuidv4 } from "@eko-ai/eko";
import { EkoMessage, WebSearchResult } from "@eko-ai/eko/types";

export class SimpleChatService implements ChatService {
  loadMessages(chatId: string): Promise<EkoMessage[]> {
    return Promise.resolve([]);
  }

  addMessage(chatId: string, messages: EkoMessage[]): Promise<void> {
    return Promise.resolve();
  }

  memoryRecall(chatId: string, prompt: string): Promise<string> {
    return Promise.resolve("");
  }

  async uploadFile(
    file: { base64Data: string; mimeType: string; filename?: string },
    chatId: string,
    taskId?: string | undefined
  ): Promise<{
    fileId: string;
    url: string;
  }> {
    return Promise.resolve({
      fileId: uuidv4(),
      url: file.base64Data.startsWith('data:')
        ? file.base64Data
        : `data:${file.mimeType};base64,${file.base64Data}`,
    });
  }

  websearch(
    chatId: string,
    query: string,
    site?: string,
    language?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    return Promise.resolve([]);
  }
}
