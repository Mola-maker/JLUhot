// The heatmap page renders from the module's api route. Run after `npm run build -w @aihot/web`.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
let origin: string;

const days = Array.from({ length: 35 }, (_, i) => {
  const d = new Date(Date.now() - (34 - i) * 86_400_000 + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
});

const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
  if (url.pathname === "/api/module/heatmap/activity") {
    return res.end(JSON.stringify({
      generatedAt: new Date().toISOString(),
      now: { day: days[34], hour: 3 },
      grid: { days, cells: [{ day: days[34], hour: 3, count: 7 }], max: 7, total: 7 },
      hot: [{ rank: 1, title: "测试热点事件", heat: 42, trend: "up", trendPct: 12.5, storyPublicId: "story-1" }],
      hotComputedAt: new Date().toISOString(),
    }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  web = await startWebServer(api);
  origin = web.origin;
});
after(() => web.stop());

test("the heatmap page renders the grid and the hot ranking", async () => {
  const res = await fetch(`${origin}/heatmap`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes("热度热力图"), "the page title");
  assert.ok(body.includes("35 天"), "the window in days");
  assert.ok(body.includes("测试热点事件"), "the hot ranking");
  assert.ok(body.includes("/story/story-1"), "the event link");
  assert.ok(body.includes("发布节奏"), "the heatmap section");
});

test("the module's api path is proxied to the api", async () => {
  const res = await fetch(`${origin}/api/module/heatmap/activity`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { grid: { days: string[] } };
  assert.equal(body.grid.days.length, 35);
});
