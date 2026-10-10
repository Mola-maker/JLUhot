# 站点三项边界工作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让四十个学院源真正开始采集、让已经写完的热力图在站点上打开、把站点自己的美术资源入库存好并让 OC 形象出现在关于页。

**Architecture:** 三件事都是接线，不是新建。学院源四十条配置已经在 `industry/sources.json` 里，缺的只是入库与逐源核对；热力图模块（`modules/heatmap/`）连页面、侧边栏入口和测试都写完了，只是**整个目录还没进 git、镜像里也就没有它**；字体已经声明进 `app.css` 并在三处使用，缺的只是把字体文件入库；OC 形象五个状态图在 `apps/web/public/art/character-states/`，仓库里没有任何一处引用它们。

**Tech Stack:** npm workspaces（`apps/*`、`packages/*`、`industry`、`site`、`modules/*`）、React Router 7 + Vite（`apps/web`）、Docker Compose（一个 `aihot-app` 镜像跑 api/worker/web 三个角色）、PostgreSQL 17、`node:test`。

**Spec:** `docs/superpowers/specs/2026-10-08-jlu-oa-pipeline-design.md`（「本次一并交付的边界工作」一节）

## Global Constraints

- 前端只通过 HTTP 读 `apps/api`；数据库、模型调用和密钥只在后端。
- 所有公开出口都从 `packages/backend/src/publication/` 这一个读取层读。热力图的 API 已经这么做了（`modules/heatmap/server.ts` 读 `publication/activity.ts` 与 `publication/hot.ts`）——不要改。
- 读者打开页面不触发模型调用；模型只在 worker 的任务里调用。
- 付费请求都经过回执（`providers/receipts.ts`）和预算熔断，不要绕开。
- 安全阀只有设成 `true` 才打开。本计划涉及 `COLLECT_ENABLED`（学院源要采集，它必须是 `true`）；不动 `MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许时才打开全文。学院源的 `site_fulltext` 用 `industry/sources.json` 里写好的值。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- 不要提交 `.env`、密钥和 `.data/`。
- 不要使用 AIHOT 的名字和 Logo。
- 停用或替换一个功能时，同一个改动删掉它的代码、测试、文档和存下的状态（库表与列、定时任务、settings、环境变量和 `.env.example` 里的项）。**Task 3 会用到这一条**：OC 形象替换掉关于页的 maker 头像，就要一并删掉头像功能的代码与配置项。
- 不要提交 `docker-compose.override.yml`（本地覆盖，这次不动它）、`.omc/`、以及 `*.scratch.*` 临时文件。
- 代码注释语言跟周围一致：`packages/`、`apps/`、`modules/` 下的 TypeScript 注释是**英文**；`docs/`、`deploy/`、`site/` 下的注释与文案是**中文**。
- 提交信息结尾加一行 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## Review Focus

五类最可能咬到使用者的输入或状态，按可能性从高到低。每条的归属任务写在后面。

1. **`COLLECT_ENABLED` 不是 `true`** —— 那时 `registerSourceJobs` 不注册、`sources.schedule` 也不注册（`apps/worker/src/main.ts:26`、`apps/worker/src/schedules.ts:24,52`）。四十个源照样入库、`next_fetch_at` 照样是 `now()`，但**永远不会有人去抓它们**，而且库里看不出异常。→ Task 1 第 1 步。
2. **学院站的时间格式解析不出来** —— 解析不出就是 `published_at IS NULL`，条目照样入库却不会进公开池（`publish.ts:286` 的回补闸门），正是 OA 那边刚修好的同一个毛病，只是换了个来源。→ Task 1 第 4 步的逐源查询（`no_pub` 一列）。
3. **镜像没重建就重启** —— `modules/heatmap/` 是未跟踪目录，镜像里根本没有它；`docker compose restart` 用的是旧镜像，`/heatmap` 会继续 404。→ Task 2 第 4 步（build 而不是 restart）。
4. **OC 状态图取不到或取晚了** —— 两种表现：只在需要时才去取 `hover.webp`（约 90 KB）会有一帧空图；文件在运行期拿不到（改路径、被 `.dockerignore` 或反代吃掉）会留一个带底色和描边的破图。→ Task 3 第 3 步用三个 `<img>` 叠放让三张都在首屏取好，并且每个都挂 `onError` 把整块藏掉。
5. **`site/brand/contact/` 的二维码其实是空的** —— 这一项不是 bug，是现状：该目录下只有 `maker-avatar.webp`，没有 `qr-wechat*` / `qr-feishu*`，所以关于页的二维码卡片按设计不渲染。→ Task 3 拆掉头像后不要顺手"补上"二维码。

---

### Task 1: 播种四十个学院源，逐源核对

四十条 `jlu-college-*` 配置（`kind: web_list`，带 `detail` 段）已经在 `industry/sources.json` 里，不在库里。这一步把它们入库、让 worker 抓到第一批、再逐源核对哪些真的取到了带时间的条目。

**Files:**
- 无代码改动（`industry/sources.json` 已是权威配置）
- 相关：`scripts/seed.ts`（`ON CONFLICT (id) DO NOTHING`，可重复跑）
- 相关：`apps/worker/src/schedules.ts:52`（`sources.schedule` 每分钟一次）

**Interfaces:**
- Consumes: `industry/sources.json` 的四十条 `jlu-college-*`
- Produces: 库里的四十行 `sources`，以及一份"哪些源第一批就正常、哪些需要改配置"的核对结论

- [ ] **Step 1: 确认采集真的开着**

```bash
docker compose exec worker printenv COLLECT_ENABLED
```

必须输出 `true`。若是空的或 `false`：`registerSourceJobs` 与 `sources.schedule` 都不会注册（`apps/worker/src/main.ts:26`、`apps/worker/src/schedules.ts:24`），后面全部白做。改 `.env` 里的 `COLLECT_ENABLED=true`，然后 `docker compose up -d worker` 重建容器（`printenv` 再确认一次）。

- [ ] **Step 2: 播种**

```bash
node --env-file=.env scripts/seed.ts
```

预期输出 `sources: N added, M already there`，其中 `N` 至少 40（可能还包含之前没入的其它源）。`seed.ts` 会先跑 `assertSupportedConfig(s.kind, s.config)` 再插入，所以配置有问题会在这一步直接报错、不会插一半——报错就修 `industry/sources.json` 对应那一条，再跑一次。

- [ ] **Step 3: 确认四十行都在，且会被调度**

```bash
docker compose exec db psql -U aihot -d aihot -c "
SELECT count(*) AS college_sources,
       count(*) FILTER (WHERE enabled) AS enabled,
       count(*) FILTER (WHERE next_fetch_at <= now()) AS due_now
FROM sources WHERE id LIKE 'jlu-college-%';"
```

预期 `college_sources = 40`、`enabled = 40`、`due_now = 40`（`seed.ts` 把 `next_fetch_at` 设成 `now()`，`sources.schedule` 每分钟扫一次）。

- [ ] **Step 4: 等第一批抓完，逐源核对**

调度每分钟一次，四十个源各自抓取要几分钟。等大约五分钟，然后：

```bash
docker compose exec db psql -U aihot -d aihot -c "
SELECT s.id, s.health, s.last_ok_at,
       count(a.id) AS articles,
       count(a.id) FILTER (WHERE a.published_at IS NULL) AS no_pub
FROM sources s LEFT JOIN articles a ON a.source_id = s.id
WHERE s.id LIKE 'jlu-college-%'
GROUP BY s.id, s.health, s.last_ok_at
ORDER BY articles, s.id;"
```

按 `articles` 升序，所以**问题源排在最前面**。三类结果，处理方式不同：

- `articles > 0` 且 `no_pub = 0`：正常。
- `articles > 0` 且 `no_pub` 等于 `articles`（一条时间都没解析出来）：这个源的时间格式现在解析不了。侦察时记下的**最可能出问题的一个是行政学院**——它的列表日期写成 `YY.MM.DD`（两位年），既不是 `YYYY-MM-DD` 也不是中文日期，框架的默认解析多半吃不下来。看 `docker compose logs --tail=200 worker`，再去这个源在 `industry/sources.json` 里的 `config` 段，按 `docs/sources.md` 的 `web_list` 一节加或改 `publishedAtSelector` / `publishedAtRegex`（两者都是 `web_list` 支持的键，见 `packages/backend/src/sources/config-keys.ts:12-15`）。两位年的 `publishedAtRegex` 记得带 `publishedAtUtcOffset`，并确认默认年份不会被当成 19xx。
- `articles = 0`：`health` 会说明原因（`error` / `blocked`）。先看日志，再决定是选择器要改还是这个站本身取不到。

- [ ] **Step 5: 改过的配置怎么生效**

`seed.ts` 是 `ON CONFLICT (id) DO NOTHING` —— **它不会更新已存在那一行的 `config`**。所以第 4 步改完 `industry/sources.json` 之后，再跑一次 `seed.ts` 会显示 `0 added`，库里那一行没有任何变化。

改配置有两条路（选一条）：

1. **后台信源页**（推荐）：管理员登录后找到那个源，改配置保存。后台的 `updateSource` 会走 `assertSupportedConfig` 校验，和 `seed.ts` 同一套规则。
2. **直接改库**：`UPDATE sources SET config = '…'::jsonb WHERE id = '…'`。改完必须和 `industry/sources.json` 里那一条**逐字一致**——OA 那边 `jlu-oa-notice` 的 `participation_mode` 漂移就是这么来的，别再制造第二处。

改完用后台信源页的"试抓"（`POST /api/admin/sources/:id/fetch`，见 `apps/api/src/routes/admin.ts:50`）立刻重抓那一个源，然后重跑第 4 步的查询确认 `no_pub` 掉下来。

- [ ] **Step 6: 记下结论**

第 4 步的结果是要给使用者看的：四十个源里哪几个的时间需要单独配置、哪几个站本身取不到。把结论写进 Task 1 的提交信息或 `docs/sources.md` 的吉大那一节——**不要**为了让它看起来全绿而放宽时间规则。

- [ ] **Step 7: 提交（只在这一步改了配置时）**

若第 4/5 步改了 `industry/sources.json`：

```bash
git add industry/sources.json
git commit -F - <<'EOF'
fix(sources): read the college sites' dates

N of the forty college sources listed a date format the list parser does not
recognise, so their items arrived without a publication time and stayed out
of the pool. The selectors below read the date each site actually prints.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

若一个配置都没改，这一步没有东西可提交——跳过。

---

### Task 2: 热力图上线

模块已经写完并接好线，只是**整个目录还没进 git**，跑着的镜像里也就没有它，所以 `/heatmap` 与 `/api/module/heatmap/activity` 都是 404。这一步把未跟踪的那几个文件入库、重建镜像、确认页面真的打开。

**Files:**
- Add: `modules/heatmap/`（`module.ts`、`server.ts`、`web.tsx`、`web/heatmap.tsx`、`types.ts`、`package.json`、`tests/activity.test.ts`——整个目录当前未跟踪）
- Add: `packages/backend/src/publication/activity.ts`（未跟踪，模块的读取层）
- Add: `apps/web/tests/heatmap.test.ts`（未跟踪）
- 已就位（本步只核对，不改）：`Dockerfile:20` 的 `COPY modules/heatmap/package.json modules/heatmap/`、`package.json` 的 workspaces 含 `modules/*`、`site/modules/{index,server,web}.ts` 三处注册

**Interfaces:**
- Consumes: `packages/backend/src/publication/activity.ts` 的 `loadActivityGrid()`、`publication/hot.ts` 的 `latestHotRanking()`
- Produces: 站点上的 `/heatmap` 页面与 `/api/module/heatmap/activity`；侧边栏"内容"一节里的"热力图"入口（由 `modules/heatmap/web.tsx` 声明，不用手工加）

- [ ] **Step 1: 跑测试，先确认这套东西本身是好的**

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test npm test
```

`npm test` 已经会把 `modules/*/tests/*.test.ts` 一起跑（`modules/heatmap/tests/activity.test.ts` 在其中，它断言撤稿的报道立刻离开它那一格，以及模块路由返回网格与热点榜）。预期全绿。红的话先修好再往下——镜像里的构建会撞同一堵墙。

- [ ] **Step 2: 单独确认 Web 能构建出这个页面**

```bash
npm run build -w @aihot/web
```

预期成功。这一步比 Docker 构建快，且能早一步暴露模块页面里的类型或导入问题（`modules/heatmap/web.tsx` 从 `../../apps/web/app/components/icons` 取 `IconChart`，从 `@aihot/web/modules` 取 `defineWebModule`）。

- [ ] **Step 3: 把未跟踪的文件入库**

```bash
git add modules/heatmap packages/backend/src/publication/activity.ts apps/web/tests/heatmap.test.ts
git status --short modules/heatmap packages/backend/src/publication/activity.ts apps/web/tests/heatmap.test.ts
```

第二个命令应当不再列出任何 `??`。

- [ ] **Step 4: 重建镜像并重启（不是 restart）**

```bash
docker compose build
docker compose up -d
docker compose ps
```

`restart` 会继续用旧镜像，`/heatmap` 会继续 404。Dockerfile 里 `COPY . .` 会把 `modules/heatmap/` 带进去，`RUN npm run build -w @aihot/web` 会把它编译进页面路由（路由表来自 `apps/web/app/routes.ts:10` 读的 `MODULES`）。

- [ ] **Step 5: 确认线上真的打开了**

```bash
curl -s -o /dev/null -w "heatmap page: %{http_code}\n" http://localhost:3000/heatmap
curl -s -o /dev/null -w "heatmap api: %{http_code}\n" http://localhost:3000/api/module/heatmap/activity
curl -s http://localhost:3000/api/module/heatmap/activity | head -c 400
```

预期两个都是 `200`，第三个输出含 `"grid"` 与 `"hot"` 的 JSON。若仍是 404，按顺序查：镜像是不是真的重建了（`docker compose images` 的时间）、`apps/web/app/routes.ts` 是否读到 `MODULES`、构建日志里有没有 `modules/heatmap` 相关的报错。

- [ ] **Step 6: 过一遍公开出口的冒烟**

```bash
node scripts/smoke.ts --base http://localhost:3000
```

预期通过。新增了一个公开页面和一个公开 API，冒烟是它们"从外面看是好的"的证据。

- [ ] **Step 7: 打开页面看一眼**

浏览器打开 `http://localhost:3000/heatmap`：格子（最近 35 个北京日 × 24 小时）与热点榜前 10 都在；侧边栏"内容"一节里有"热力图"；窄屏时它出现在"我的"页的工具列表里（`modules/heatmap/web.tsx` 的 `tools`）。

格子要看得出深浅——库里已经有 27 个源、几十天的文章，**空网格就是问题**（spec 的验证第 8 条要的是"真实数据，不是空格子"）。若确实全空：先查 `publication/activity.ts` 的时间窗口与 `WHERE` 条件是否和 `scope.ts` 的公开条件一致，再查数据是不是都被 `listedCondition` 挡在外面。把查到的情况回报出来，不要就此收工。

- [ ] **Step 8: 提交**

```bash
git commit -F - <<'EOF'
feat(heatmap): ship the activity heatmap module

The module, its read layer and its web test were written but never added to
git, so the image had no page to route: /heatmap answered 404. Its grid reads
the public read layer (publication/activity.ts), so withdrawals leave an hour
at once, like every other exit.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

---

### Task 3: 站点美术资源入库，OC 形象接入关于页

两件事同一次做完：字体的文件入库（`app.css` 已经声明好并用了），以及把关于页 maker 块里的圆头像换成站点自己的 OC 形象。按 AGENTS.md，替换一个功能要一并删掉它的代码和配置项——`makerAvatar` 这条链上只有代码，没有库表、定时任务或环境变量。

**Files:**
- Add: `apps/web/public/fonts/`（`yozai/Yozai-Regular.woff2`、`outfit/Outfit-Light.woff2` 与各自的 `OFL.txt`，当前未跟踪）
- Add: `apps/web/public/art/character-states/`（五个 `.webp`，当前未跟踪）
- Modify: `apps/web/app/routes/about.tsx`（`MakerFace` 与调用点）
- Modify: `packages/backend/src/site/contact.ts`（删 `loadMakerAvatar`）
- Modify: `apps/api/src/routes/site.ts:14,115-119`（删 `loadMakerAvatar` 的使用）
- Modify: `packages/contracts/src/site.ts:363-367`（删 `SiteContact.makerAvatar`）
- Modify: `site/site.ts:150,160`（删 `avatarSourceId`）
- Modify: `docs/deploy.md`（`### 更新` 下加一条）

**Interfaces:**
- Consumes: `apps/web/public/art/character-states/{idle,hover,pressed}.webp`（`processing` / `success` 没有触发场景，本步不用）
- Produces: `MakerFace()` 不再接收 props；`SiteContact` 只剩 `wechatQr` 与 `feishuQr`

- [ ] **Step 1: 把美术资源入库**

```bash
git add apps/web/public/fonts apps/web/public/art
git status --short apps/web/public
```

第二个命令应不再列出 `??`。字体已经在 `apps/web/app/app.css:19-36` 声明（`@font-face` 带 `unicode-range`，Yozai 只覆盖汉字、Outfit 只覆盖拉丁），并在 `--font-display`（第 38 行）后用于报头题记与关于页大标题三处；缺的只是文件本身。不要提交 `site/brand/contact/maker-avatar.webp`——第 5 步会失去读取它的人。

- [ ] **Step 2: 确认骨架屏之类的旧渲染不会撞上**

```bash
git diff --stat apps/web/app/routes/about.tsx
```

`about.tsx` 里 `useState` 已经导入（现在的 `MakerFace` 就在用），不需要加导入。

- [ ] **Step 3: 换掉 `MakerFace`**

`apps/web/app/routes/about.tsx`：把第 113–118 行整段替换成下面这段（含上面那行注释），第 147 行的调用点同时改掉。

```tsx
/** The site's own character before the greeting; it stands still until the pointer arrives. */
const OC_STATES = [
  ["idle", "/art/character-states/idle.webp"],
  ["hover", "/art/character-states/hover.webp"],
  ["pressed", "/art/character-states/pressed.webp"],
] as const;

type OcState = (typeof OC_STATES)[number][0];

function MakerFace() {
  const [state, setState] = useState<OcState>("idle");
  const [broken, setBroken] = useState(false);
  // 图挂了就整个不渲染：一个空的圆底 + ring 比什么都不显示更像坏掉。
  if (broken) return null;
  return (
    <span
      className="relative size-11 shrink-0 xl:size-12"
      onPointerEnter={() => setState("hover")}
      onPointerLeave={() => setState("idle")}
      onPointerDown={() => setState("pressed")}
      onPointerUp={() => setState("hover")}
      onPointerCancel={() => setState("idle")}
    >
      {/* 三张都挂着，只让当前那张可见：单独换 src 的话第一次悬停会空一帧。 */}
      {OC_STATES.map(([name, src]) => (
        <img
          key={name}
          src={src}
          alt=""
          width={48}
          height={48}
          draggable={false}
          onError={() => setBroken(true)}
          className={`absolute inset-0 size-full select-none rounded-full bg-bg-sunk object-cover ring-1 ring-line ${state === name ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </span>
  );
}
```

第 147 行：

```tsx
          <MakerFace />
```

三处细节都是有意为之：

- `alt=""`：形象是装饰，右边那句"嗨，我是 MolaMaker"已经把话说完了。
- 三个 `<img>` 叠放而不换 `src`：换 `src` 时 `hover.webp`（约 90 KB）要现取，第一次悬停会空一帧。三张都在首屏取好就永远不会闪。
- `onError` 只把破图藏掉，不做重试、不做替代图：换成 `MakerFace` 之前的那版头像就有 `failed → null` 这一层（spec 的验证第 8 条要求"图片缺失时不留破图"）。`public/` 里的文件可能被部署脚本、`.dockerignore` 或反代改掉，构建期通过不代表运行期拿得到——这一层保留。
- 这个元素没有点击行为，`hover` / `pressed` 是角色动画，不是"这里能点"的暗示——这是 spec 定的（`idle` 常驻，`hover` / `pressed` 响应指针状态）。

- [ ] **Step 4: 删掉头像那条链**

`packages/backend/src/site/contact.ts`：删掉 `loadMakerAvatar`（第 32–43 行）以及它独占的导入。删完文件头注释的最后一句（"The maker block can show the avatar of an X account the site follows as a source (ABOUT.maker)."）也要去掉，`proxiedImage` 与 `ABOUT` 两个导入随之不再被使用、一并删掉；`existsSync` / `readdirSync` / `path` 还被 `packCode` 用着，保留。

`apps/api/src/routes/site.ts`：第 14 行的导入改成 `import { loadContact } from "@aihot/backend/site/contact";`，第 115–119 行的 handler 改成：

```ts
  app.get("/api/site/contact", siteHandler(async (req, reply) => {
    return sendJsonWithEtag(req, reply, await loadContact(), { etagPrefix: "contact", cacheControl: "public, max-age=300, s-maxage=300" });
  }));
```

`packages/contracts/src/site.ts`：`SiteContact` 只剩两个字段。

```ts
export interface SiteContact {
  wechatQr: string | null;
  feishuQr: string | null;
}
```

`site/site.ts`：第 150 行的注释行（`avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。`）删掉，第 160 行的类型去掉 `avatarSourceId`：

```ts
  } as { name: string; greeting: string[]; wechat?: ContactCard; feishu?: ContactCard } | null,
```

- [ ] **Step 5: 收尾那个没人读的图片文件**

```bash
ls site/brand/contact/
rm site/brand/contact/maker-avatar.webp
rmdir site/brand/contact 2>/dev/null || true
```

`loadMakerAvatar` 是唯一读它的地方，删掉函数它就成了死资源。这个文件**从未进过 git**（`site/brand/contact/` 整个目录是未跟踪的），所以这一步只动本地磁盘，仓库里没有东西要删。删之前如果你想留着这张图，先复制到别处——它不会再有读取方。

- [ ] **Step 6: 确认没有别的地方还在引用**

```bash
grep -rn "makerAvatar\|loadMakerAvatar\|avatarSourceId\|maker-avatar\|MakerFace" --include=*.ts --include=*.tsx --include=*.md . | grep -v node_modules
npm run typecheck
```

grep 只应剩下 `docs/superpowers/specs/2026-10-08-jlu-oa-pipeline-design.md` 里描述这次改动的第 233 行（spec 是历史记录，不改）。typecheck 必须通过——`SiteContact` 少了字段却还有人读，会在这一步报出来。

- [ ] **Step 7: 跑 Web 测试并构建**

```bash
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
```

预期全绿。构建成功同时证明 `public/art` 与 `public/fonts` 里的文件都就位了（`app.css` 的 `@font-face` 指向它们）。

- [ ] **Step 8: 写更新说明**

`docs/deploy.md` 的 `### 更新` 一节下、最新一条 `####` 之上加一条（该节按时间倒序）：

```markdown
#### 关于页的做站人形象（2026 年 10 月 8 日）

关于页 maker 块里的圆头像换成了站点自己的角色形象，跟着指针换状态。头像原先是两个来源之一：
`site/site.ts` 的 `ABOUT.maker.avatarSourceId`（取某个信源的头像）或
`site/brand/contact/maker-avatar.*`（随站点发布的文件）。这两个来源和 `/api/site/contact` 里的
`makerAvatar` 字段一并去掉了；如果你配过 `avatarSourceId`，它不再有效果。
```

- [ ] **Step 9: 重建镜像并重启**

```bash
docker compose build
docker compose up -d
```

- [ ] **Step 10: 看一眼**

浏览器打开 `http://localhost:3000/about`：maker 块标题左边是角色形象，指针移上去换成另一个状态、按下再换一个、移开回到 `idle`；标题文字仍然是"嗨，我是 MolaMaker"。再看一眼报头题记（`/daily` 的报头）仍然用的是艺术字体。顺带在 DevTools 的 Network 里确认三张 `webp` 都是 200——这一项过了，`onError` 那一层就只是在守着将来。

- [ ] **Step 11: 提交**

```bash
git add apps/web/public apps/web/app/routes/about.tsx packages/backend/src/site/contact.ts \
        apps/api/src/routes/site.ts packages/contracts/src/site.ts site/site.ts docs/deploy.md
git commit -F - <<'EOF'
feat(web): show the site's own character on the about page

The maker block's round avatar is replaced by the site's character, which
answers the pointer. The avatar it replaces had two sources behind it
(ABOUT.maker.avatarSourceId, site/brand/contact/maker-avatar.*) and its own
field on /api/site/contact; with the block gone they have no reader left, so
they go in the same change. The ported fonts are wired in app.css already —
this adds the files they point at.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

---

## 不做什么

- 不改 `apps/web/app/app.css`：设计令牌与艺术字体已经改好并在用，这次只把字体文件入库。
- 不用 `processing` / `success` 两个状态：静止页面上没有能让它们出现的时机，硬造一个触发条件就是编造状态机。
- 不动二维码：`site/brand/contact/` 里没有 `qr-wechat*` / `qr-feishu*`，关于页按设计不渲染那两张卡片。要放二维码是使用者提供图片之后的事。
- 不改 `modules/heatmap/` 里的任何代码，包括它的网格读取层：它已经按"公开出口只从 `publication/` 读"来写了。
- 不新增数据库迁移。
- 不动 `docker-compose.override.yml`、`.omc/`、`*.scratch.*`（这些是本地文件，不属于这次交付）。
