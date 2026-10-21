// A ranking feed dates its snapshot, not its entries. The first import of such a feed is the current
// list, so it enters the ordinary article flow (not the historical archive a first import usually is),
// while its publication time stays unknown: the channel time is kept only as the snapshot time. A later
// run refreshes that snapshot time without a new revision or re-analysis. A source that does not declare
// the channel time to be a snapshot keeps the ordinary unknown-date rule.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";

const T = tag();
const snapshot = new Date("2026-09-30T12:00:00.000Z");
const later = new Date("2026-10-01T12:00:00.000Z");
let channelDate = snapshot;
const server = http.createServer((req, res) => {
  // Each source reads its own feed, so the entries' identities never collide between sources.
  const feed = (req.url ?? "/").replaceAll("/", "");
  res.writeHead(200, { "content-type": "application/rss+xml" });
  res.end(`<rss version="2.0"><channel><title>Trending</title><pubDate>${channelDate.toUTCString()}</pubDate>`
    + `<item><title>Repo one ${feed}</title><link>https://github.com/example/${feed}-one</link><description>A trending repository.</description></item>`
    + `<item><title>Repo two ${feed}</title><link>https://github.com/example/${feed}-two</link><description>Another trending repository.</description></item>`
    + `</channel></rss>`);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await stopBoss(); await closeDb(); });

async function source(name: string, channelSnapshotDate: boolean) {
  const id = `snapshot-${T}-${name}`;
  await sql`INSERT INTO sources (id,name,kind,config,tier,participation_mode,cursor,next_fetch_at)
    VALUES (${id},'榜单快照测试','rss',${sql.json({ feedUrl: base + "/" + id, ...(channelSnapshotDate ? { channelSnapshotDate: true } : {}), _aihot: { initialBackfillLimit: 15 } } as never)},'T2','editorial',NULL,'2100-01-01')`;
  return id;
}
const stored = (id: string) => sql`SELECT url, published_at, source_updated_at, backfill, backfill_reason, revision, content_hash FROM articles WHERE source_id=${id} ORDER BY url`;

test("the first import of a snapshot feed is current news with an unknown publication time", async () => {
  const id = await source("current", true);
  const first = await collectSource(id);
  assert.deepEqual([first.status, first.found, first.created, first.revised], ["ok", 2, 2, 0]);
  const rows = await stored(id);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.published_at, null, "the snapshot time is not a publication time");
    assert.equal(new Date(row.source_updated_at).toISOString(), snapshot.toISOString(), "the channel time is stored as the snapshot");
    assert.equal(row.backfill, false, "a current snapshot is not an archive");
    assert.equal(row.backfill_reason, "current-snapshot", "the reason records why the publication time stays unknown");
  }
  const before = rows.map(row => row.content_hash);
  channelDate = later;
  const second = await collectSource(id);
  assert.deepEqual([second.status, second.created, second.revised], ["ok", 0, 0], "a refreshed snapshot is not a new revision");
  const refreshed = await stored(id);
  assert.deepEqual(refreshed.map(row => row.content_hash), before, "the content is untouched");
  assert.deepEqual(refreshed.map(row => row.revision), [1, 1]);
  for (const row of refreshed) assert.equal(new Date(row.source_updated_at).toISOString(), later.toISOString(), "the newer snapshot replaces the old one");
  assert.equal(await sql`SELECT count(*)::int AS n FROM pgboss.job j JOIN articles a ON a.id=j.data->>'articleId' WHERE a.source_id=${id}`.then(r => r[0]!.n), 2,
    "a snapshot refresh queues no re-analysis");
});

test("without the snapshot declaration an undated first import stays an archive", async () => {
  const id = await source("plain", false);
  assert.equal((await collectSource(id)).created, 2);
  const rows = await stored(id);
  assert.ok(rows.every(row => row.published_at === null && row.source_updated_at === null && row.backfill && row.backfill_reason === "first-import"));
});
