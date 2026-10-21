// A ranking feed's snapshot time reaches every reader-facing exit as its own labelled claim, and no exit
// presents it as the entry's publication time. An entry that carries its own publication time keeps
// that time and shows no snapshot.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { exportMarkdown, loadItemDetail } from "@aihot/backend/publication/detail";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `snapshot-pub-${T}`;
const discovered = new Date(Date.now() - 60_000);
const snapshot = new Date("2026-09-30T12:00:00.000Z");
const published = new Date(Date.now() - 5 * 3600_000);
const ids = { snapshot: `${T}-snapshot`, dated: `${T}-dated` };
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'GitHub Trending · 日榜（榜单快照）', 'rss', 'T2')`;
  for (const [kind, id] of Object.entries(ids)) {
    const at = kind === "dated" ? published : null;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at, source_updated_at, backfill, backfill_reason)
      VALUES (${id}, ${SOURCE}, ${id}, ${`https://github.com/example/${id}`}, ${`${T} ${kind}`}, ${discovered}, ${discovered}, ${at}, ${snapshot}, ${kind !== "dated"}, ${kind === "dated" ? null : "current-snapshot"})`;
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, title_zh, summary_zh, score, selected)
      VALUES (${id}, 1, 'rule', 'pass', ${`${T} ${kind}`}, 'fixture summary', 70, false)`;
    await publishArticle(id);
  }
});
after(async () => { await app.close(); await stopBoss(); await closeDb(); });

const get = async (url: string) => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, url);
  return res.body;
};

test("the detail and its Markdown name the snapshot time, and never as the publication time", async () => {
  const detail = await loadItemDetail(ids.snapshot);
  assert.equal(detail.kind, "found");
  if (detail.kind !== "found") return;
  assert.equal(detail.item.publishedAt, null);
  assert.equal(detail.item.snapshotAt, snapshot.toISOString());
  const markdown = (await exportMarkdown(ids.snapshot))!.body;
  assert.ok(markdown.includes(`- 榜单快照：${snapshot.toISOString()}`));
  assert.ok(markdown.includes(`- 收录时间：${discovered.toISOString()}`));
  assert.ok(!markdown.includes("发布时间"));

  const dated = await loadItemDetail(ids.dated);
  assert.equal(dated.kind, "found");
  if (dated.kind !== "found") return;
  assert.equal(dated.item.publishedAt, published.toISOString());
  assert.equal(dated.item.snapshotAt, null, "an entry with its own publication time shows no snapshot");
  assert.ok(!(await exportMarkdown(ids.dated))!.body.includes("榜单快照"));
});

test("the article page and the feed carry the snapshot time without giving it a publication date", async () => {
  const page = JSON.parse(await get(`/api/site/items/${ids.snapshot}`));
  assert.equal(page.publishedAt, null);
  assert.equal(page.snapshotAt, snapshot.toISOString());
  const [stored] = await sql`SELECT eligible, summary, title FROM publications WHERE article_id=${ids.snapshot}`;
  assert.equal(stored!.eligible, true, `a current snapshot enters the public pool (${JSON.stringify(stored)})`);
  const feed = await get("/feed/all.xml");
  assert.ok(feed.includes(ids.snapshot), `the snapshot item is in the feed:\n${feed.slice(0, 400)}`);
  const entry = feed.split("<item>").find((block) => block.includes(`>${ids.snapshot}</guid>`));
  assert.ok(entry && !entry.includes("<pubDate>"), "the snapshot time is not a pubDate");
});
