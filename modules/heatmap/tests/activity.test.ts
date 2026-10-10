// The heatmap reads only listed publications (publication/activity.ts): a withdrawn report leaves its
// hour at once, and the module's route answers the grid with the hot ranking.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { addDays, beijingAt, beijingDate } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadActivityGrid } from "@aihot/backend/publication/activity";
import { buildApp } from "../../../apps/api/src/app.ts";
import serverModule from "../server.ts";
import { tag } from "../../../tests/setup.ts";

const T = tag();
const SOURCE = `test-heatmap-${T}`;
const BODY = `FULLTEXT-${T} `.repeat(40);

installModules([serverModule]);
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Test heatmap', 'rss', 'T1', 'editorial', true, true, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
/** A listed article, published a minute ago. */
async function article(): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}-${n}`, title: `Test ${n}`, bodyText: BODY, bodyHtml: `<p>${BODY}</p>`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'notices', ${`标题${n}-${T}`}, ${`SUMMARY-${n}-${T}`}, '理由', 90, true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

const NOW = new Date();
const DAY = addDays(beijingDate(NOW), -2);
/** Beijing 03:xx two days ago, inside the 35-day window. */
const AT = beijingAt(DAY, "03:30");

function cellCount(grid: Awaited<ReturnType<typeof loadActivityGrid>>, day: string, hour: number): number {
  return grid.cells.find((c) => c.day === day && c.hour === hour)?.count ?? 0;
}

test("the grid counts listed publications per Beijing hour and drops a withdrawn one at once", async () => {
  const [a, b] = [await article(), await article()];
  await sql`UPDATE publications SET timeline_at = ${AT} WHERE article_id IN ${sql([a, b])}`;

  const grid = await loadActivityGrid(NOW);
  assert.equal(grid.days.length, 35);
  assert.equal(grid.days[grid.days.length - 1], beijingDate(NOW));
  assert.equal(cellCount(grid, DAY, 3), 2, "both reports count in their Beijing hour");
  assert.equal(grid.total, 2);
  assert.equal(grid.max, 2);

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${a}`;
  const after = await loadActivityGrid(NOW);
  assert.equal(cellCount(after, DAY, 3), 1, "the withdrawn report leaves its hour");
  assert.equal(after.total, 1);
});

test("the activity route answers the grid and the hot ranking", async () => {
  const res = await app.inject({ method: "GET", url: "/api/module/heatmap/activity" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["cache-control"]), /^public, max-age=60/);
  const body = res.json() as {
    generatedAt: string;
    now: { day: string; hour: number };
    grid: { days: string[]; cells: Array<{ day: string; hour: number; count: number }> };
    hot: unknown[];
  };
  assert.equal(body.grid.days.length, 35);
  assert.equal(body.now.day, beijingDate(body.generatedAt));
  assert.ok(body.now.hour >= 0 && body.now.hour <= 23);
  assert.ok(Array.isArray(body.hot));
  assert.ok(body.grid.cells.some((c) => c.day === DAY && c.hour === 3), "the route's grid holds the test reports' hour");
});
