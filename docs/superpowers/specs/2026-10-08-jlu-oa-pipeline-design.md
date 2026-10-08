# 吉大 OA 通知放行：采集与归档设计

日期：2026-10-08
状态：待评审

## 目标

让 `oa.jlu.edu.cn` 电子校务平台 5 个频道的校内通知**全部进入站点并能被浏览、搜索、归档**，时间跨度到三个月。

"全部放行"的含义（已确认）：**宽收窄发**。三个月内的通知都进公开池、有详情页、可搜索；只有发布 ≤48 小时的才算新闻，参与精选、事件归组、热度与日报。更早的按原发布时间归档，不刷屏。

这条路径**不修改框架的任何不变量**。它是框架原生规则的自然结果，见「时间与归档语义」。

三件边界工作（学院源播种、热力图上线、OC 形象接入）一并交付，各自的做法见「本次一并交付的边界工作」，它们不需要单独的 spec。

## 现状：四道闸门

用户报告"能获取但没有通过验证器"。实测是四个独立原因叠加，任一个都足以让通知不公开。

| # | 闸门 | 代码位置 | 现象 |
|---|---|---|---|
| 1 | `missingEvidence` | `packages/backend/src/editorial/analyze.ts:416` | 只有标题的普通文章直接返回，`scores`/`writing`/`structure` 全为 null |
| 2 | 回补条目缺发布时间 | `packages/backend/src/publication/publish.ts:286` | `backfill && published_at IS NULL` 不进公开池 |
| 3 | 参与方式为 `hot_signal` | `packages/backend/src/publication/rules.ts:26,35` | 只作热度证据，`isPoolEligible` 恒 false，且**没有详情页** |
| 4 | 容器无内网路由 | `packages/backend/src/config.ts:105` | 容器到 `10.100.18.18` 无路由；生产拒绝 `ALLOW_PRIVATE_NETWORK_FETCH` |

### 闸门 1 是主因

```ts
// packages/backend/src/editorial/writing.ts:123
export function missingEvidence(a: AnalyzeInputArticle): boolean {
  return !a.bodyText?.trim() && !a.excerpt?.trim() && !String(a.xPost?.text ?? "").trim() && !String(a.xPost?.quoted?.text ?? "").trim();
}
```

```ts
// packages/backend/src/editorial/analyze.ts:416
if (missingEvidence(a) && !original) return { prefilter, scores: null, writing: null, structure: null };
```

`normalizeAnalysis` 随后给出 `relevance = "unknown"`（`analyze.ts:442`）。预筛那一步同样如此：`analyze.ts:251` 把"判 BLOCK 但无材料"改判为 `UNKNOWN`——所以缺材料时**既不会被拦，也不会被放行，只会被搁置**。

这是 `47d50dd`（"wait for article evidence before scoring and writing"）有意为之：不凭标题写文案。所以**修复只能靠补材料，不能靠放宽判定**。

注意预筛提示词说"明确与吉林大学相关的标题可以 PASS"，而代码在预筛之后仍会因缺材料返回——提示词不必改，`industry/prompts/prefilter.md` 已是吉大语境且宽召回。

### 库内实况

```
      id       | total | body_ok | no_pub | backfill | analyzed | rel_unknown | rel_pass
 jlu-oa-notice |    30 |       0 |     23 |       30 |       30 |          30 |        0
```

- 只有 `jlu-oa-notice` 有数据，**其余 4 个频道是 0 条**——采集器 5 个频道全部撞上代理 TLS 超时，只有一次侥幸推成功了 1 页。
- 30 条全部 `relevance='unknown'`，**一条都没进公开池**。
- 站点基线：`/daily/2026-10-09` 200、`/heatmap` 404、`/api/module/heatmap/activity` 404。

### 站点与频道实测

| 频道 | channelId | 30 天 | 90 天 |
|---|---|---|---|
| 吉大OA·校内通知 | 179577 | ~240 | ~750 |
| 吉大OA·校内快讯 | 179578 | ~300 | ~950 |
| 吉大OA·学生天地 | 179581 | ~250 | ~380 |
| 吉大OA·教学信息 | 179579 | ~68 | ~118 |
| 吉大OA·学术动态 | 179580 | ~66 | ~155 |
| **合计** | | **≈900** | **≈2,400** |

数字是**按页跨度外推**的，不是精确计数：逐个频道翻到目标日期，记下每页首末日期，用"页数 × 30 条"除以覆盖天数再乘回窗口长度。精度约 ±30%，因为各频道在暑假（7–8 月）明显稀疏、9 月底到 10 月初明显密集（页面里那段"国庆积压"最直观）。举例：校内通知第 26 页 `oldest=2026-07-07`，校内快讯第 32 页 `oldest=2026-07-09`，都在 ≈90 天处；教学信息整个 8 月一页只覆盖 28 天，9 月一页只覆盖 18 天。

**不要拿这些数字做预算决策**，它的用途只是判断量级与手续：一个月是"一次跑得完"，三个月也是；两者都需要分块推送。

成本：每条走完整分析（预筛 + 2 次评分 + 结构化 + 写作 ≈ 5 次模型调用）。一个月 ≈ 4,500 次调用，三个月 ≈ 12,000 次。**这是本次的主要花费**，远大于新增信源的影响。回补条目按 `PRIORITY.history = -2` 排在实时任务之后（`jobs/content.ts:61,85`），所以入站后还会在后台慢慢跑完，不会立刻全部可用。

## 站点结构（实测）

列表页 `https://oa.jlu.edu.cn/defaultroot/PortalInformation!jldxList.action?1=1&channelId={id}&startPage={n}`

- 每页 30 条，按发布时间倒序；`startPage` 可无限往回翻。
- 编码 UTF-8（页面声明 `charset=utf-8`）。**不要按 GBK 解码**。
- 每条：`<DIV class="li rel">` 内含 `<A class="font14" href="...getInformation.action?id=...">` 标题、`<A class="column">` 部门、`<SPAN class="time">` 时间。
- 时间三种形态：`今天 HH:MM`、`昨天 HH:MM`（较新条目为主）、`YYYY-MM-DD`（较旧条目，**无时刻**）。另有 `[置顶]` 条目日期很旧。**实测只见到这三种**，不为其它的相对时间写法写兜底。
- **列表条目没有摘要**，`missingEvidence` 因此必然为真。

详情页 `https://oa.jlu.edu.cn/defaultroot/PortalInformation!getInformation.action?id={id}&channelId={channelId}`

```html
<div class="content">
  <div class="content_t">鸽子楼之声名家讲坛（202640期）</div>
  <div class="content_time">2026年10月08日 08:34&nbsp;&nbsp;<span>地球科学学院</span></div>
  <div class="content_font">…正文 HTML…</div>
  <p><strong>相关图片：</strong></p>
  <div class="immmges">…</div>
  <div class="news_aboutFile">…附件表…</div>
</div>
```

- 精确发布时间格式：`YYYY年MM月DD日 HH:MM`；同容器 `<span>` 是部门。
- 正文边界就是 `div.content_font`，**不需要裁剪页尾导航**。
- 抽样 15 条（5 频道各 3 条）：15/15 有 `div.content` 容器与精确时刻；正文 317–3966 字。
- 少数条目正文只有一张海报图（如"鸽子楼之声名家讲坛"），文字为零——见「薄正文兜底」。

## 设计

### 1. 采集器在宿主机运行，逐条抓详情页

`oa.jlu.edu.cn` 解析到内网 `10.100.18.18`，只有连着校园网/VPN 的 Windows 宿主机有路由。`ALLOW_PRIVATE_NETWORK_FETCH` 在生产被 `config.ts:105` 拒绝启动，且容器本就没有路由，所以**框架永远无法抓 OA**。

结论：采集器必须在宿主机抓，并且**替框架把正文取回来**。这不是绕过安全阀，而是 `docs/sources.md` 为 `external` 信源规定的接入方式（"`external` 也不支持主动试抓，按下方推送接口接入"）。

`deploy/oa-collector.py` 重写要点（现有文件在 `deploy/`，与 `Caddyfile` 同处）：

1. **绕开系统代理**。`urllib.request.getproxies()` 会读到 Windows 注册表里 Clash 风格的 `127.0.0.1:7897`，把所有请求（包括校园内网）送进一个到不了 `10.x` 的代理，表现为 `_ssl.c:1015: The handshake operation timed out`。必须用
   ```python
   opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
   ```
   现有脚本没有这一步，5 个频道全因此失败。
2. **解析相对时间**。`今天 HH:MM` / `昨天 HH:MM` 相对**本轮运行日期**换算；已是绝对日期的直接用。输出带偏移的 ISO，如 `2026-10-08T15:13:00+08:00`。现有脚本只接受 `YYYY-MM-DD`，这是 30 条里 23 条没有发布时间的直接原因。
3. **逐条抓详情页**，取：
   - 精确发布时间（覆盖列表的日期粒度）→ `publishedAt`
   - `div.content_time span` → 部门
   - `div.content_font` 内文 → `bodyText` / `bodyHtml`
   - `div.immmges` 与正文内 `<img>` → `media`，形如 `[{ kind: "image", url, alt }]`（`MediaItem`，`content/materials.ts`）
   - `div.news_aboutFile` 附件名 → 并入正文文字（附件也是通知内容）
4. **`--days` 窗口**。日常增量用 `--days 3`（约 90 条）；一次性回补用 `--days 90`。窗口决定翻到第几页。
5. **按 50 分块推送**。`MAX_ITEMS = 50`（`ingest/items.ts:9`），超过会被拒。现有脚本 `items[:50]` 是**静默截断**，必须改成循环分块。
6. **限流排期**。生效限流是 **10 请求/分钟**（`docker-compose.yml:19` 的 `INGEST_RATE_LIMIT: ${INGEST_RATE_LIMIT:-10}`，`.env` 里那行是注释的）。900 条 = 18 个请求，三个月 = 48 个请求，都要按 ≤10/分钟排，否则吃 `429`。采集侧对 OA 服务器也保持 0.3–0.5 秒间隔。
7. **单个频道失败不影响其他**（现有脚本已有此结构，保留）。

耗时估计：详情抓取是主导项。一个月 ≈900 条 ≈20 分钟；三个月 ≈2,400 条 ≈55 分钟。都是一次性。

### 1.1 采集器必须自己定时

五个 OA 源是 `external`，框架**不会主动去抓**（`docs/sources.md:209`：`external` 不支持主动试抓），`interval_minutes: 60` 对它们不生效。所以日常增量只能由宿主机上的计划任务驱动：Windows 任务计划程序每天跑一次 `python deploy/oa-collector.py --days 3`。

不装这个计划任务，回补完成后站点就会停在那一批数据上——这是本次交付的一部分，不是后续可选项。

### 2. 薄正文兜底

正文只有图片的通知（如海报类讲座），`div.content_font` 文字为零，`missingEvidence` 仍为真。这类条目按页面自己的字段合成一条**诚实**的 `excerpt`：

```
{标题}｜{部门}｜{发布时间}｜正文为图片/附件
```

这不是编造材料，是把页面已有的字段拼起来，并且如实说明正文形态。图片本身进 `media`。

### 3. 扩展 ingest 契约

`packages/backend/src/ingest/items.ts` 的 `ItemIn`（第 19–25 行）现在只有 `title / url / publishedAt / author / raw`。**`upsertMaterial` 早已支持** `excerpt / bodyHtml / bodyText / bodyStatus / media`（`content/materials.ts:32-45`），只是推送接口没有透出（`items.ts:53-64` 的调用没有传）。加上这几个字段并透传即可。

要点：

- **传了 `bodyText` 就自动 `body_status='ok'`**（`materials.ts:188`：`m.bodyStatus ?? (m.bodyText ? "ok" : "pending")`）。这同时让框架不再尝试抓正文——`content/extract.ts:123` 遇到 `body_status === 'ok'` 直接 `return "skipped"`。**不需要任何 SSRF 例外**。
- 修订路径同样安全：`body_status = CASE WHEN bodyText IS NULL THEN body_status ELSE coalesce(bodyStatus, 'ok') END`（`materials.ts:251`）。
- 沿用既有的身份规则、时间规则与去重，不改动它们。
- 仍遵守 `MAX_ITEMS = 50` 与限流。

### 4. 时间与归档语义：宽收窄发自框架原生规则得来

采集器**不**给条目打 `backfill` 标记，交给统一的 `decideTimeline`（`materials.ts:80`）：

- 发布时间 ≤48 小时前 → `backfill=false` → 当今天的新闻，进精选/事件/热度/日报。
- 发布时间 >48 小时前 → `backfill=true`、`backfill_reason='stale-on-discovery'`、`timeline_at = published_at` → 按原发布时间归档。

而 `publish.ts:286`：

```ts
const eligible = isPoolEligible({...}) && (!article.backfill || article.published_at !== null || !!options.releasedAt);
```

**只要 `published_at` 有值，回补条目就进公开池**——可浏览、可搜索、有自己的详情页；同时 `isHistorical()` 为真，所以不立事件、不加热度、不进精选。这正是"宽收窄发"。

前提是发布时间必须解析出来（闸门 2）。这正是采集器第 2、3 步要解决的。

### 5. 已入库 30 条自愈，不需要手写 SQL

`upsertMaterial` 的既有行路径（`materials.ts:221,226`）：

```ts
const time = existing!.published_at ? null : await fillPublicationTime(db, existing!.id, m.publishedAt);
...
if (!time && existing!.content_hash === next) return unchanged;
```

- 那 23 条 `published_at IS NULL` 的行，`backfill_reason` 正是 `unknown-publication-time`，于是 `fillPublicationTime` 里的 `explicit` 被置空（`materials.ts:104`），**补一次日期就会写入 `published_at` 并强制产生修订**。
- 那 7 条已有日期的，正文后到会改变 `contentHash`（`sha256(title + bodyText + excerpt)`）→ 新修订。

`reviseMaterial` 会把 `processing_state` 重置为 `'new'`、清零重试计数并 `groupingReset()`，`ingestItems` 随后 `queueProcessing`。所以**重推一遍窗口即自愈**：日期补齐、正文入库、重新分析、`relevance='pass'`、进公开池。

### 6. 修 `jlu-oa-notice` 的参与方式

库内 `jlu-oa-notice` 是 `participation_mode='hot_signal'`、`interval_minutes=30`、tags `官方,通知`；而 `industry/sources.json` 五个 OA 源一律是 `editorial`、60 分钟、tags 含 `OA推送`。这是手工改动留下的漂移。

`hot_signal` 下 `isPoolEligible` 恒为 false（`rules.ts:26`），`hasItemPage` 也为 false（`rules.ts:35`）——**连详情页都不会有**。必须改成 `editorial`。

**`scripts/seed.ts` 修不了它**：seed 是幂等的（`ON CONFLICT ... DO NOTHING`，"admin 改过的不覆盖"），只会补缺失的源。

改法：**在后台信源页把 `jlu-oa-notice` 的参与方式改成"编辑"（editorial），间隔 60 分钟**，与其余四个 OA 源一致。`docs/sources.md:256` 记的正是这条路径（"到后台把它的参与方式改成 `editorial` 才会出现在站上"）。不走一次性 SQL——手工改库会再次造成配置与库的漂移，而这正是本次要修的病根。

### 7. 正文不进公开页

`rules.ts:48`：`source.site_fulltext && bodyStatus === "ok" && hasBody ? "full" : "summary"`。

五个 OA 源 `site_fulltext=false`（`industry/sources.json`），所以**正文只喂给模型，公开页仍只显示摘要与原文链接**——符合 `AGENTS.md` 的"信源默认只展示摘要和原文链接"。存正文不改变对外展示。是否打开 OA 全文是另一个决定，本设计不动它。

## 本次一并交付的边界工作

以下三项是 bounded 改动，不需要单独的 spec 与实现计划，随本次一起做完。

### 学院源播种（40 个）

`industry/sources.json` 里 40 个 `jlu-college-*`（`web_list`、T1_5、editorial、360 分钟）只存在于配置文件，**从未入库**：库内 27 个源中只有 5 个 OA + 3 个 `jlu-news*`/`jlu-lectures`。

已预检：67 个源的 config 全部通过 `assertSupportedConfig`，`node --env-file=.env scripts/seed.ts` 不会抛错。

代价：新信源首次导入会各自回补（`industry/sources.json` 的 `_aihot.initialBackfillLimit`），是额外模型花费。

**范围已确认：40 个学院源这次一起放**（使用者 2026-10-08 决定）。站点信源从 27 个变成 67 个，学院动态与 OA 通知共同构成站点的内容面。

已知的站点特性（来自探测记录，已编进各自的信源配置，此处仅作交付后的核对清单）：软件学院用专题报道栏目；考古学院用 `xydt.htm`；经济学院用 `gzdt/xyxw.htm`；艺术学院首条是 2024-12 置顶旧闻；行政学院日期是 `YY.MM.DD`；文学院与新闻传播学院合署。植物科学、动物科学两院与 4 个非学院单位不在本次范围内。

### 热力图上线

`modules/heatmap/` 已完整写好并接线：`module.ts` 声明页面与 `apiPaths`，`site/modules/{index,server,web}.ts` 三处都已注册，`IconChart` 存在（`apps/web/app/components/icons.tsx:22`），`node_modules/@aihot/heatmap` 已链接，`publication/activity.ts` 从 `scope.ts` 的 `listedCondition` 读取（符合"所有公开出口从 `publication/` 这一个读取层读"）。

`/heatmap` 与 `/api/module/heatmap/activity` 现在都是 404，只是因为容器镜像早于这些未跟踪文件。要做的是重建镜像、跑通从未执行过的 `modules/heatmap/tests/activity.test.ts` 与 `apps/web/tests/heatmap.test.ts`。

### OC 形象接入关于页

`apps/web/public/art/character-states/{idle,hover,pressed,processing,success}.webp` 目前全站零引用。

接入点：`apps/web/app/routes/about.tsx` 的 maker 块——`MakerFace`（第 113–117 行）现在是 48px 圆头像，且只在 `contact?.makerAvatar` 有值时才渲染。改为 OC 形象：`idle` 常驻，`hover` / `pressed` 响应指针状态。

**`processing` 与 `success` 在关于页没有自然位置，不硬塞**，留在仓库待有真实用途。艺术字体（Yozai）已在 `app.css` 全局接好，无需改动。

## 不做什么

- 不放宽 `missingEvidence`，不修改 `analyze.ts` 的判定，不降低 `industry/selection.ts` 的门槛（`T1:60 / T1_5:65 / T2:76`）。通知进公开池靠补材料，不靠放松标准。
- 不修改框架不变量，不打开 `ALLOW_PRIVATE_NETWORK_FETCH`，不请求 SSRF 例外。
- 不改 `industry/prompts/prefilter.md`（已是吉大语境）。
- 不改 `site/site.ts` 的 `site_fulltext` 语义，不打开 OA 全文展示。
- 不给采集器加本地已抓缓存。日常增量窗口只有约 90 条（约 2 分钟），一次性回补约 55 分钟，不值得引入一份需要维护的本地状态。
- 不动 19 个 `rss-*` 源。它们是预筛提示词明确保留的"AIhot 板块"，不是遗留问题。

## 验证

按 `AGENTS.md`：

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000
```

本次特有的验证：

1. **单元测试**：为 `ingest/items.ts` 的新字段写测试——推送带 `bodyText` 的条目后，`body_status='ok'`、`body_text` 已存、不再尝试抓取；带 `excerpt` 的条目 `missingEvidence` 为 false。
2. **时间规则**：覆盖 `今天` / `昨天` / 绝对日期三种形态的解析；覆盖 >48 小时触发 `stale-on-discovery` 且 `timeline_at = published_at`。
3. **端到端（本机假的 OA 响应）**：按 `AGENTS.md`，测试只连本地假服务，不访问外部。用一个固定 HTML 夹具跑采集器解析，断言条目数、发布时间、正文与部门。
4. **回补后查库**：`jlu-oa-notice` 的 `published_at` 不再有 NULL，`relevance='pass'` 的数量 > 0，五个频道都有数据。
5. **公开面**：`/heatmap` 与 `/api/module/heatmap/activity` 返回 200；抽查一条三个月前的 OA 通知，其详情页可访问、按原发布时间归档、不出现在当天日报里。
6. **限流**：确认采集器推送节奏 ≤10 请求/分钟，全程无 429。
7. **学院源播种后查库**：信源数从 27 变 67，40 个学院源各自抓到条目；逐源看首批条目的发布时间是否解析出来（行政学院是 `YY.MM.DD`，最可能出问题的一个）。
8. **`/heatmap` 与关于页**：热力图页面有真实数据（不是空网格）；关于页 maker 块的 OC 形象三种状态切换正常，图片缺失时不留破图。

## 风险

| 风险 | 处理 |
|---|---|
| OA 列表或详情页改版 | 解析失败按频道隔离并显式报错，不静默 0 条。现有脚本已有 "列表页没有解析到条目（页面结构变了？）" 的先例，保留并扩展到详情页 |
| 回补期间吃 429 | 推送按 ≤10/分钟排期；`Retry-After: 60` 时退避重试 |
| 三个月回补的模型花费 | 先跑一个月（≈900 条）验证全链路，再放长到三个月。重推幂等，已验证的条目不会重复分析 |
| 那 30 条旧数据自愈失败 | 重推后查库校验；若某条仍 `unknown`，逐条排查其详情页是否取到正文 |
| 宿主机不在校园网时采集静默停摆 | 拉不到列表时以非 0 退出并打印原因，让任务计划的失败状态可见；不写半截数据 |
| 学院源站点日期写法各异，个别解析不出 | 播种后逐源核对首批条目；对解析不出日期的源单独看它的配置（`YYYY.MM.DD`、`YY.MM.DD` 这类），有证据再改，不预先写兜底 |
| `hot_signal` 漂移再次发生 | `industry/sources.json` 是权威；修好库内那一行后两者一致 |
