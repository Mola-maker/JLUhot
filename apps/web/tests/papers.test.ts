// The papers page renders from the module's api route: day-grouped rows, a cursor link to the next
// page, and no row when there is nothing. Run after `npm run build -w @aihot/web`.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
let origin: string;

// Two Beijing days relative to today, so the "今天" header is stable wherever the test runs.
const day = (beijingOffsetHours: number) => new Date(Date.now() + beijingOffsetHours * 3600_000).toISOString();
const at = day(0);
const older = day(-30);
const cursor = `${older}:older-1`;
const entry = (id: string, discoveredAt: string, selected = true) => ({
  id, title: `测试论文 ${id}`, originalTitle: null, summary: "这是论文的摘要。", sourceName: "Nature",
  url: `https://example.org/${id}`, publishedAt: discoveredAt, discoveredAt, score: 80, selected,
});

const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
  if (url.pathname === "/api/module/papers/list") {
    if (url.searchParams.get("cursor")) {
      return res.end(JSON.stringify({ generatedAt: at, entries: [entry("older-1", older, false)], nextCursor: null }));
    }
    return res.end(JSON.stringify({ generatedAt: at, entries: [entry("first-1", at)], nextCursor: cursor }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  web = await startWebServer(api);
  origin = web.origin;
});
after(() => web.stop());

test("the papers page groups by day and links the detail page and the original", async () => {
  const res = await fetch(`${origin}/papers`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes("论文速览"), "the page header");
  assert.ok(body.includes("测试论文 first-1"), "the paper's title");
  assert.ok(body.includes("/items/first-1"), "the detail link");
  assert.ok(body.includes("https://example.org/first-1"), "the original link");
  assert.ok(body.includes("今天"), "the day header");
  assert.ok(body.includes("Nature"), "the source name");
});

test("the phone bar returns to 我的 like the other tools opened from it", async () => {
  const body = await (await fetch(`${origin}/papers`)).text();
  // The rendered back button navigates to /more when opened directly (no page behind it).
  assert.match(body, /min-w-11/, "the bar carries a back button");
  assert.ok(body.includes("/more"), "back leads to 我的");
});

test("the cursor link continues the list, and the continued page says so to search engines", async () => {
  const res = await fetch(`${origin}/papers`);
  assert.ok((await res.text()).includes(`/papers?cursor=${encodeURIComponent(cursor)}`), "the next-page link");
  const next = await fetch(`${origin}/papers?cursor=${encodeURIComponent(cursor)}`);
  assert.equal(next.status, 200);
  const body = await next.text();
  assert.ok(body.includes("测试论文 older-1"), "the older page's paper");
  assert.match(body, /noindex/, "cursor pages stay out of search engines");
});

test("an empty list shows its empty state", async () => {
  const empty = createServer((req, res) => {
    const url = new URL(req.url!, "http://api.local");
    if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
    if (url.pathname === "/api/module/papers/list") return res.end(JSON.stringify({ generatedAt: at, entries: [], nextCursor: null }));
    res.statusCode = 404;
    res.end(JSON.stringify({ code: "not_found" }));
  });
  const other = await startWebServer(empty);
  try {
    const res = await fetch(`${other.origin}/papers`);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("还没有论文"), "the empty state");
  } finally {
    await other.stop();
  }
});
