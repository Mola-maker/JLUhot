// The papers module reads only listed publications of `_aihot.paper` sources (publication/papers.ts):
// a withdrawn report leaves the list at once, other sources' reports never enter, and the route
// answers the first page with its next cursor.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadPapers } from "@aihot/backend/publication/papers";
import { buildApp } from "../../../apps/api/src/app.ts";
import serverModule from "../server.ts";
import { tag } from "../../../tests/setup.ts";

const T = tag();
const PAPERS = `test-papers-src-${T}`;
const NEWS = `test-papers-news-${T}`;
const BODY = `PAPER-${T} `.repeat(40);

installModules([serverModule]);
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at, config)
            VALUES (${PAPERS}, 'Test journal', 'rss', 'T1', 'editorial', '2100-01-01', ${sql.json({ _aihot: { paper: true } })})`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${NEWS}, 'Test news', 'rss', 'T1', 'editorial', '2100-01-01')`;
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
/** A listed article, published a minute ago; source selects which source it belongs to. */
async function article(source = PAPERS): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: source, url: `https://example.com/${T}-${n}`, title: `Paper ${n}`, bodyText: BODY, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'papers', ${`论文标题${n}-${T}`}, ${`摘要-${n}-${T}`}, 80, true)`;
  // Grouping completed (the fast path's outcome); without it the report waits for selection.
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${articleId}`;
  await publishArticle(articleId);
  return articleId;
}

test("the list carries only the paper sources' listed reports, newest first", async () => {
  const a = await article();
  await article(NEWS);
  const b = await article();
  const { entries, nextCursor } = await loadPapers(null);
  assert.deepEqual(entries.map((e) => e.id), [b, a], "the news source's report stays out");
  assert.equal(nextCursor, null, "two entries are the end");
  const [first] = entries;
  assert.equal(first!.sourceName, "Test journal");
  assert.ok(first!.summary);
  assert.equal(first!.selected, true);

  // Unselected papers show too: the page lists what the journals published, not only the selected.
  await sql`UPDATE publications SET selected = false, visible_after = NULL WHERE article_id = ${b}`;
  const unselected = await loadPapers(null);
  assert.ok(unselected.entries.some((e) => e.id === b), "an unselected paper stays listed");
  // A withdrawn report leaves at once.
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${b}`;
  const withdrawn = await loadPapers(null);
  assert.ok(!withdrawn.entries.some((e) => e.id === b), "the withdrawn paper leaves the list");
});

test("pagination walks by cursor and repeats no entry", async () => {
  // 45 papers a minute apart: more than one page (40), after the first test's rows.
  const made: string[] = [];
  for (let i = 0; i < 45; i++) {
    const id = await article();
    await sql`UPDATE publications SET discovered_at = discovered_at + make_interval(mins => ${i + 1}) WHERE article_id = ${id}`;
    made.push(id);
  }
  const newestFirst = [...made].reverse();
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await loadPapers(cursor);
    pages.push(page.entries.map((e) => e.id));
    if (!page.nextCursor) break;
    assert.ok(pages.length < 10, "pagination ends");
    cursor = page.nextCursor;
  }
  assert.equal(pages.length, 2, "40 + the earlier rows paginate");
  assert.deepEqual(pages.flat().filter((id) => made.includes(id)), newestFirst, "the 45 walk newest first");
  assert.equal(new Set(pages.flat()).size, pages.flat().length, "no entry repeats");
});

test("the route answers the first page with its cursor", async () => {
  const res = await app.inject({ method: "GET", url: "/api/module/papers/list" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["cache-control"]), /^public, max-age=60/);
  const body = res.json() as { generatedAt: string; entries: unknown[]; nextCursor: string | null };
  assert.ok(body.generatedAt);
  assert.ok(Array.isArray(body.entries));
});
