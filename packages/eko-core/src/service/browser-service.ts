import { PageTab, PageContent } from "../types";

export default interface BrowserService {
  loadTabs(chatId: string, tabIds?: string[] | undefined): Promise<PageTab[]>;

  extractPageContents(chatId: string, tabIds: string[]): Promise<PageContent[]>;
}

export type { BrowserService };
