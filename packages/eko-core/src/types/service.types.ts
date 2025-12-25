export type WebSearchResult = {
  title: string;
  url: string;
  logo?: string;
  snippet: string;
  content?: string;
  imageList?: string[];
};

export type PageTab = {
  tabId: string;
  windowId?: string;
  title: string;
  url: string;
  active: boolean;
  status?: "unloaded" | "loading" | "complete";
  favicon?: string;
  lastAccessed?: string | undefined;
  extra?: Record<string, any> | undefined;
};

export type PageContent = {
  tabId: string;
  url: string;
  title: string;
  content: string;
};
