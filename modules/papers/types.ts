// What /api/module/papers/list answers (server.ts) and the page draws (web/papers.tsx).
// Declared here so the web bundle never imports the backend; publication/papers.ts holds the same
// shape (the server assigns its result into this type).

export interface PaperEntry {
  /** The article id (its detail page is /items/<id>). */
  id: string;
  title: string;
  originalTitle: string | null;
  summary: string | null;
  sourceName: string;
  url: string;
  publishedAt: string | null;
  discoveredAt: string;
  score: number | null;
  selected: boolean;
}

export interface PapersPage {
  generatedAt: string;
  entries: PaperEntry[];
  /** The cursor of the next page ("<discoveredAt>:<id>"), or null at the end. */
  nextCursor: string | null;
}
