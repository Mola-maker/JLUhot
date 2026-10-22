// Papers for the papers module: the listed publications of the sources the industry catalogue marks
// `_aihot.paper` (a journal, arXiv). The public scope is scope.ts's listedCondition, like every
// other public exit; a withdrawn or not yet released report never shows. Pages run newest first by
// discovery, keyed by the article id.
import { sql, type Db } from "../db.ts";
import { listedCondition } from "./scope.ts";

export const PAPERS_PAGE_SIZE = 40;

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

/** The columns a paper listing selects (what a paper card draws; no event fields, papers stand alone). */
const PAPER_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, p.score, p.selected, p.url,
  p.published_at, p.discovered_at, s.name AS source_name`;

interface PaperRow {
  id: string;
  title: string;
  original_title: string | null;
  summary: string | null;
  score: number | null;
  selected: boolean;
  url: string;
  published_at: Date | null;
  discovered_at: Date;
  source_name: string;
}

const toEntry = (r: PaperRow): PaperEntry => ({
  id: r.id,
  title: r.title,
  originalTitle: r.original_title,
  summary: r.summary,
  sourceName: r.source_name,
  url: r.url,
  publishedAt: r.published_at?.toISOString() ?? null,
  discoveredAt: r.discovered_at.toISOString(),
  score: r.score === null ? null : Math.round(Number(r.score)),
  selected: r.selected,
});

/**
 * The listed papers, newest first. `cursor` is "<discoveredAt ISO>:<articleId>" from the previous
 * page (the id never holds a colon); entries are keyed by both, so a paper discovered twice is
 * listed once.
 */
export async function loadPapers(cursor: string | null, now: Date = new Date(), db: Db = sql): Promise<{ entries: PaperEntry[]; nextCursor: string | null }> {
  const split = cursor?.lastIndexOf(":") ?? -1;
  const at = split > 0 ? cursor!.slice(0, split) : null;
  const id = split > 0 ? cursor!.slice(split + 1) : "";
  const after = at && Number.isFinite(Date.parse(at)) ? new Date(at) : null;
  const rows = await db<PaperRow[]>`
    SELECT ${PAPER_COLUMNS}
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE ${listedCondition(now)}
      AND s.config->'_aihot'->>'paper' = 'true'
      AND (${after}::timestamptz IS NULL OR (p.discovered_at, p.article_id) < (${after}::timestamptz, ${id}))
    ORDER BY p.discovered_at DESC, p.article_id DESC
    LIMIT ${PAPERS_PAGE_SIZE + 1}`;
  const entries = rows.slice(0, PAPERS_PAGE_SIZE).map(toEntry);
  const last = entries.at(-1);
  return { entries, nextCursor: rows.length > PAPERS_PAGE_SIZE && last ? `${last.discoveredAt}:${last.id}` : null };
}
