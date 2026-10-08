// A paused external source must not accept new reports or look healthy after a rejected push.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { extractArticleBody } from "@aihot/backend/content/extract";
import { loadAnalyzeInput } from "@aihot/backend/editorial/input";
import { missingEvidence } from "@aihot/backend/editorial/writing";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { tag } from "./setup.ts";

after(async () => {
  await stopBoss();
  await closeDb();
});

test("a paused external source rejects pushed items without recording a successful fetch", async () => {
  const sourceId = `test-paused-ingest-${tag()}`;
  const lastOkAt = new Date("2026-09-01T00:00:00Z");
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health, last_ok_at)
    VALUES (${sourceId}, 'Paused external source', 'external', '{}'::jsonb, 'T2', 'editorial', false, 'paused', ${lastOkAt})`;

  await assert.rejects(
    ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }),
    (error: unknown) => error instanceof IngestError && error.status === 409,
  );

  const [source] = await sql<{ last_ok_at: Date }[]>`SELECT last_ok_at FROM sources WHERE id = ${sourceId}`;
  const [articles] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(source!.last_ok_at.toISOString(), lastOkAt.toISOString());
  assert.equal(articles!.count, 0);

  await sql`UPDATE sources SET enabled = true WHERE id = ${sourceId}`;
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }), { ok: true, created: 1 });
});

test("a pushed body is stored as confirmed and needs no fetch", async () => {
  const sourceId = `test-ingest-body-${tag()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${sourceId}, 'OA push', 'external', '{}'::jsonb, 'T1', 'editorial', true, 'ok')`;
  const url = `https://example.org/${sourceId}/notice`;

  const result = await ingestItems({
    sourceId,
    items: [{
      title: "关于做好2026年国庆节期间实验室安全工作的通知",
      url,
      author: "实验室与设备管理处",
      publishedAt: "2026-10-08T15:13:00+08:00",
      bodyText: "校内各相关单位：请于9月30日前完成自查，并将结果报实验室与设备管理处。",
      excerpt: "该通知要求各单位在9月30日前完成实验室安全自查。",
    }],
  });
  assert.equal(result.created, 1);

  const [row] = await sql<{ id: string; body_status: string; body_text: string | null; excerpt: string | null; author: string | null; published_at: Date | null }[]>`
    SELECT id, body_status, body_text, excerpt, author, published_at FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(row!.body_status, "ok", "a pushed body is confirmed, not pending");
  assert.match(row!.body_text!, /9月30日前完成自查/);
  assert.equal(row!.excerpt, "该通知要求各单位在9月30日前完成实验室安全自查。");
  assert.equal(row!.author, "实验室与设备管理处");
  assert.equal(row!.published_at!.toISOString(), "2026-10-08T07:13:00.000Z");

  // The framework must not try to fetch a body it was handed: example.org is not reachable here.
  assert.equal(await extractArticleBody(row!.id), "skipped");

  // And the copy is enough evidence to judge: this is the missingEvidence gate that parked OA before.
  const article = await loadAnalyzeInput(row!.id);
  assert.equal(missingEvidence(article!), false);
});

test("an item pushed without a body keeps waiting for one", async () => {
  const sourceId = `test-ingest-nobody-${tag()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${sourceId}, 'Title only', 'external', '{}'::jsonb, 'T2', 'editorial', true, 'ok')`;

  await ingestItems({ sourceId, items: [{ title: "只有标题的通知", url: `https://example.org/${sourceId}/a` }] });
  const [row] = await sql<{ id: string; body_status: string }[]>`SELECT id, body_status FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(row!.body_status, "pending");
  assert.equal(missingEvidence((await loadAnalyzeInput(row!.id))!), true);
});

test("re-reporting the same window after a backfill does not duplicate or re-analyse", async () => {
  const sourceId = `test-ingest-repush-${tag()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${sourceId}, 'OA repush', 'external', '{}'::jsonb, 'T1', 'editorial', true, 'ok')`;
  const url = `https://example.org/${sourceId}/b`;
  // A first report without a time: the row is archived with an unknown-publication-time reason.
  await ingestItems({ sourceId, items: [{ title: "补时间的通知", url, bodyText: "正文。" }] });
  const [before] = await sql<{ id: string; revision: number; published_at: Date | null }[]>`
    SELECT id, revision, published_at FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(before!.published_at, null);

  // The collector's re-push supplies the exact time: the row is healed in place, not duplicated.
  await ingestItems({ sourceId, items: [{ title: "补时间的通知", url, bodyText: "正文。", publishedAt: "2026-07-20T09:10:00+08:00" }] });
  const rows = await sql<{ id: string; revision: number; published_at: Date | null; timeline_at: Date; backfill_reason: string | null }[]>`
    SELECT id, revision, published_at, timeline_at, backfill_reason FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(rows.length, 1, "the same url is one article");
  assert.equal(rows[0]!.published_at!.toISOString(), "2026-07-20T01:10:00.000Z");
  assert.equal(rows[0]!.backfill_reason, "stale-on-discovery");
  // 三个月前的通知按它自己的时间归档：热度、事件聚合和日报都看不见它（宽收窄发）。
  assert.equal(rows[0]!.timeline_at.toISOString(), rows[0]!.published_at!.toISOString());
  assert.ok(rows[0]!.revision > before!.revision, "the healed row is revised so it is analysed again");

  // Re-pushing the identical window changes nothing.
  await ingestItems({ sourceId, items: [{ title: "补时间的通知", url, bodyText: "正文。", publishedAt: "2026-07-20T09:10:00+08:00" }] });
  const [again] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(again!.revision, rows[0]!.revision);
});
