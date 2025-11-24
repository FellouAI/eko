import { uuidv4 } from "../common/utils";
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
    fileId: string;
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
  async uploadFile(
    file: File | { base64Data: string; mimeType: string; filename: string },
    chatId: string,
    taskId?: string | undefined
  ): Promise<{
    fileId: string;
    url: string;
  }> {
    const fileId = uuidv4();
    if (file instanceof File) {
      const mimeType = file.type || "application/octet-stream";

      if (typeof FileReader !== "undefined") {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              fileId: fileId,
              url: reader.result as string,
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // @ts-ignore
      if (typeof Buffer !== "undefined") {
        const arrayBuffer = await file.arrayBuffer();
        // @ts-ignore
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        return Promise.resolve({
          fileId: fileId,
          url: `data:${mimeType};base64,${base64}`,
        });
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(arrayBuffer))
        );
        return Promise.resolve({
          fileId: fileId,
          url: `data:${mimeType};base64,${base64}`,
        });
      }
    } else {
      return Promise.resolve({
        fileId: fileId,
        url: `data:${file.mimeType};base64,${file.base64Data}`,
      });
    }
  }
  websearch(
    chatId: string,
    query: string,
    site?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    return Promise.resolve([]);
  }
}
