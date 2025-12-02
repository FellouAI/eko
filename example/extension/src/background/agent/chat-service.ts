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
    language?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    return Promise.resolve([]);
  }
}
