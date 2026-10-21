// Failures: a domestic name resolved by an intercepted local DNS (fake-IP TUN) is blocked before it
// ever leaves, so a Chinese public host must resolve through the configured proxy; a host exception
// leaks to unrelated domains or redirect targets; choosing a direct route bypasses the guard.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { DEPLOYMENT } from "@aihot/site";
import { config } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

const deployment = DEPLOYMENT as unknown as { directFetchHosts?: string[] };
const previousHosts = deployment.directFetchHosts;
const previousProxy = config.egressProxyUrl;
const previousPrivate = config.allowPrivateNetworkFetch;
const previousDispatcher = getGlobalDispatcher();
const mock = new MockAgent(); mock.disableNetConnect(); setGlobalDispatcher(mock);
let proxyHits = 0;
const proxy = createServer();
proxy.on("connect", (_req, socket) => {
  proxyHits++;
  socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
});
await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
config.egressProxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;
deployment.directFetchHosts = ["domestic.invalid", "localhost"];
after(async () => {
  deployment.directFetchHosts = previousHosts;
  config.egressProxyUrl = previousProxy;
  config.allowPrivateNetworkFetch = previousPrivate;
  setGlobalDispatcher(previousDispatcher);
  await mock.close();
  await new Promise<void>(resolve => proxy.close(() => resolve()));
});

test("a Chinese public host uses the configured proxy", async () => {
  const before = proxyHits;
  await assert.rejects(guardedFetch("https://news.jlu.edu.cn/feed", { timeoutMs: 1000 }));
  assert.ok(proxyHits > before);
});

test("a redirect recalculates routing for its destination instead of inheriting the exception", async () => {
  mock.get("https://domestic.invalid").intercept({ path: "/move" }).reply(302, "", { headers: { location: "https://abroad.invalid/feed" } });
  const before = proxyHits;
  await assert.rejects(guardedFetch("https://domestic.invalid/move", { timeoutMs: 1000 }));
  assert.ok(proxyHits > before);
  assert.equal(mock.pendingInterceptors().some(i => i.path === "/move"), false, "the direct first hop was read");
});

test("the host list matches exact hostnames and explicit direct callers still work", async () => {
  const before = proxyHits;
  await assert.rejects(guardedFetch("https://domestic.invalid.evil.invalid/feed", { timeoutMs: 1000 }));
  assert.ok(proxyHits > before);
  mock.get("https://paid.invalid").intercept({ path: "/api" }).reply(200, "api");
  assert.equal((await guardedFetch("https://paid.invalid/api", { route: "direct" })).text(), "api");
});

test("direct host exceptions never grant permission to fetch a private address", async () => {
  config.allowPrivateNetworkFetch = false;
  try { await assert.rejects(guardedFetch("http://localhost/metadata"), /Blocked/); }
  finally { config.allowPrivateNetworkFetch = true; }
});
