export interface WebSearchResult {
  title?: string;
  snippet: string;
  url?: string;
}

export interface IWebSearchAdapter {
  search(query: string, maxResults?: number): Promise<WebSearchResult[]>;
}
