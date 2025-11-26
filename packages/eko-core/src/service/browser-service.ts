import { PageTab, PageContent } from "../types";

export interface BrowserService {
  loadTabs(chatId: string, tabIds?: string[] | undefined): Promise<PageTab[]>;

  extractPageContents(chatId: string, tabIds: string[]): Promise<PageContent[]>;
}
