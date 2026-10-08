// External collection reports (POST /api/ingest/items). Same identity rules and timeline
// rule as every other entrance: old or future-dated items and explicit backfill never count as
// today's news and are never pushed. Unknown sources are created isolated, awaiting an operator.
// A report may carry the copy it already fetched (excerpt, bodyText): a source whose pages the
// framework cannot reach itself (a campus intranet, a login wall) still needs evidence to be
// judged, and a confirmed body also stops extract.ts from trying to fetch it again.
import { sql } from "../db.ts";
import { upsertMaterial } from "../content/materials.ts";
import { queueProcessing } from "../jobs/content.ts";
import { normalizeUrl } from "../lib/url.ts";

export const MAX_ITEMS = 50;

export class IngestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ItemIn {
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  author?: unknown;
  excerpt?: unknown;
  bodyText?: unknown;
  raw?: { _aihot?: { backfill?: boolean; baseline?: boolean } } & Record<string, unknown>;
}

/** The ceiling the prompt builder also uses (editorial/writing.ts MAX_BODY_CHARS): one report cannot flood a row. */
const MAX_PUSHED_TEXT = 60_000;

/** A pushed copy field: a non-empty trimmed string, or null. */
function copyField(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

export async function ingestItems(body: { sourceId?: unknown; sourceName?: unknown; items?: unknown }): Promise<{ ok: true; created: number }> {
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const items = Array.isArray(body.items) ? (body.items as ItemIn[]) : [];
  if (!sourceId || !items.length) throw new IngestError(400, "sourceId and items[] required");
  if (items.length > MAX_ITEMS) throw new IngestError(413, `items[] exceeds max ${MAX_ITEMS} per request`);

  const [source] = await sql<{ id: string; participation_mode: string; enabled: boolean }[]>`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
    VALUES (${sourceId.slice(0, 120)}, ${typeof body.sourceName === "string" && body.sourceName.trim() ? body.sourceName.trim().slice(0, 200) : sourceId.slice(0, 120)},
            'external', '{}'::jsonb, 'T2', 'isolated', 1440, true, 'ok', ${["ingest:auto-created"]})
    ON CONFLICT (id) DO UPDATE SET last_ok_at = now() WHERE sources.enabled
    RETURNING id, participation_mode, enabled`;
  if (!source) throw new IngestError(409, "source paused");

  const seen = new Set<string>();
  let created = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const rawUrl = typeof it.url === "string" ? it.url.trim() : "";
    if (!title || !rawUrl) continue;
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const published = typeof it.publishedAt === "string" ? new Date(it.publishedAt) : null;
    const flags = it.raw?._aihot ?? {};
    const res = await upsertMaterial({
      sourceId: source!.id,
      // Normalize only for deduplication. Ownership needs the reported origin (including www and
      // scheme), and upsertMaterial already applies the common normalized identity rule.
      url: rawUrl,
      title,
      author: typeof it.author === "string" ? it.author.slice(0, 200) : null,
      excerpt: copyField(it.excerpt, 2_000),
      bodyText: copyField(it.bodyText, MAX_PUSHED_TEXT),
      publishedAt: published && Number.isFinite(published.getTime()) ? published : null,
      raw: it.raw ?? null,
      via: "ingest",
      backfill: flags.backfill ? "reported-backfill" : flags.baseline ? "reported-baseline" : null,
    });
    if (res.created) created += 1;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
  }
  await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${source!.id}`;
  await sql`INSERT INTO ingest_events (client, kind, status, summary) VALUES ('ingest-items', 'items', 'ok', ${sql.json({ sourceId: source!.id, received: items.length, created })})`;
  return { ok: true, created };
}
