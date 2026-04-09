import Exa from 'exa-js';
import { ChatService, uuidv4 } from '@eko-ai/eko';
import { EkoMessage, WebSearchResult } from '@eko-ai/eko/types';

/**
 * ChatService implementation powered by Exa (https://exa.ai) for web search.
 *
 * Exa is an AI-native search engine that returns clean, structured results
 * optimised for agent pipelines. Set the EXA_API_KEY environment variable
 * before constructing this service.
 *
 * Usage:
 *   import { ExaChatService } from './exa-chat-service';
 *   global.chatService = new ExaChatService();
 */
export class ExaChatService implements ChatService {
  private readonly exa: Exa;

  public constructor(apiKey?: string) {
    const key = apiKey ?? process.env.EXA_API_KEY;
    if (!key) {
      throw new Error(
        'EXA_API_KEY is required. Get one at https://dashboard.exa.ai/api-keys'
      );
    }
    this.exa = new Exa(key);
    // Integration header for Exa usage tracking
    const headers = (this.exa as any).headers;
    if (headers && typeof headers.set === 'function') {
      headers.set('x-exa-integration', 'eko');
    }
  }

  // -- ChatService: message persistence (no-op, override if needed) ----------

  public loadMessages(_chatId: string): Promise<EkoMessage[]> {
    return Promise.resolve([]);
  }

  public addMessage(_chatId: string, _messages: EkoMessage[]): Promise<void> {
    return Promise.resolve();
  }

  public memoryRecall(_chatId: string, _prompt: string): Promise<string> {
    return Promise.resolve('');
  }

  public async uploadFile(
    file: { base64Data: string; mimeType: string; filename?: string },
    _chatId: string,
    _taskId?: string | undefined
  ): Promise<{ fileId: string; url: string }> {
    return {
      fileId: uuidv4(),
      url: file.base64Data.startsWith('data:')
        ? file.base64Data
        : `data:${file.mimeType};base64,${file.base64Data}`,
    };
  }

  // -- ChatService: web search via Exa --------------------------------------

  public async websearch(
    _chatId: string,
    query: string,
    site?: string,
    _language?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    const numResults = Math.min(maxResults ?? 10, 50);

    const response = await this.exa.search(query, {
      type: 'auto',
      numResults,
      contents: {
        highlights: true,
        text: true,
      },
      ...(site ? { includeDomains: [site] } : {}),
    });

    return response.results.map((result) => ({
      title: result.title ?? '',
      url: result.url,
      snippet:
        result.highlights?.join(' ') ??
        (result.text ? result.text.slice(0, 300) : ''),
      content: result.text ?? undefined,
    }));
  }
}
