# 吉大 OA 通知接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `oa.jlu.edu.cn` 五个频道的校内通知全部进入站点、可浏览可搜索可归档，跨度三个月。三个月内的通知都进公开池，只有发布 ≤48 小时的才算新闻。

**Architecture:** 采集器在宿主机（只有它有到校园内网的路由）把**正文**和**精确发布时间**抓下来，通过已有的 `POST /api/ingest/items` 推送。后端 `ingest/items.ts` 把 `excerpt` / `bodyText` 透传给 `upsertMaterial`——后者早就支持这两个字段，只是推送接口没有透出。有了正文，`missingEvidence` 不再拦（闸门 1）；有了发布时间，`publish.ts:286` 放回补条目进公开池（闸门 2）。"宽收窄发"由框架既有的 `decideTimeline` / `isHistorical` 直接得出，**不改任何不变量**。

**Tech Stack:** Python 3（宿主机采集器，只用标准库）、Node.js 24 + TypeScript（后端直接跑 TS，无构建步骤）、PostgreSQL 17、`node:test`。

**Spec:** `docs/superpowers/specs/2026-10-08-jlu-oa-pipeline-design.md`

## Global Constraints

- 前端只通过 HTTP 读 `apps/api`；数据库、模型调用和密钥只在后端。
- 所有公开出口都从 `packages/backend/src/publication/` 这一个读取层读。本计划不新增公开出口。
- 读者打开页面不触发模型调用；模型只在 worker 的任务里调用。本计划不新增模型调用点。
- 付费请求都经过回执（`providers/receipts.ts`）和预算熔断，不要绕开。本计划不新增付费调用点。
- 安全阀只有设成 `true` 才打开。开发时保持关闭：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`。
- **测试里推送一直关着，采集和模型调用只连本地假服务，不访问任何外部服务。** 新增的 Python 测试同样只用夹具字符串与本地 stub，不联网。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许时才打开全文。五个 OA 源都是 `site_fulltext: false`，本计划不动它。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- 不要提交 `.env`、密钥和 `.data/`。采集器读 `.env` 里的 `INGEST_TOKEN`，不写死。
- 不要使用 AIHOT 的名字和 Logo。
- 数据库迁移放在 `database/migrations/`。**本计划不需要迁移**：`articles` 的 `excerpt` / `body_text` / `body_status` / `author` / `published_at` / `backfill_reason` 都是既有列。
- 代码注释语言跟周围一致：`packages/`、`apps/`、`tests/` 下的 TypeScript 注释是**英文**；`docs/` 与 `deploy/` 下的脚本注释是**中文**。
- 停用或替换一个功能时，同一个改动删掉它的代码、测试、文档和存下的状态。本计划没有停用任何功能。
- 提交信息结尾加一行 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## Review Focus

最可能咬到使用者的五类输入或状态，按可能性从高到低。每条下面都写了它落在哪个任务、由哪个测试钉住。

1. **详情页 `div.content_font` 缺失或改版**——列表页只有标题，正文是唯一让通知能被分析的材料。若解析不出来却照样推送，就精确复现了本次要修的原始 bug（30 条全部 `relevance='unknown'`）。要求：单条解析失败要跳过并打印地址；一个频道 0 条成功要非 0 退出。→ Task 1（夹具测试）+ Task 2（频道级失败退出）。
2. **宿主机不是北京时区，或一轮采集跨过午夜**——`今天` / `昨天` 必须按北京时间换算，否则午夜前后的条目会差一天，进而落错日报。→ Task 1（`item_time` 测试用固定 today，不看系统时钟）。
3. **重推同一窗口**（自愈库里那 30 条）——不能产生重复文章，也不能把没变化的条目重新分析一遍（`draft` 重复、模型重复付费）。→ Task 3（重推同一 URL 的测试）。
4. **一批推送撞上 429**——限流是 10 请求/分钟，一个月回补有 18 批（900 ÷ 50）。`Pacer` 按 8 批/分钟节流，正常情况下**不该**撞上（Task 4 第 3 步会 grep 确认一轮里 0 次）。但一旦撞上，必须重试**同一批**：跳过会静默丢条目，重复推送会重复计数。→ Task 2（429 重试测试 + Task 4 第 3 步的 grep）。
5. **列表条目缺 `id=` 或不是 oa.jlu.edu.cn 的地址**——必须跳过，不能推出相对 URL 或空 URL（那样去重和归属都会错）。→ Task 1（`parse_list` 测试）。

## 与 spec 的三处偏差

写计划时核对代码，发现 spec 里有三项应当调整，三处都是减项、都有证据：

1. **不推送 `media`。** spec 第 3 步曾写"`div.immmges` 与正文内 `<img>` → `media`"。核对后不做：
   - 站点只有在渲染 X 帖时才渲染媒体（`apps/web/app/routes/item.tsx:534`：`isX && item.x!.media.length > 0 && <MediaGallery …/>`），普通文章的 `media` **没有任何渲染出口**；
   - 就算有，图片走服务端代理 `/api/img-proxy`（`apps/api/src/routes/media.ts:16`），而代理侧有 SSRF 防护（`assertPublicUrl`，被 `lib/http-fetch.ts` 使用），容器根本取不到 `oa.jlu.edu.cn` 的图。
   推一所不能显示、二取不回来的图片，只会做出坏图。图片留在 OA 原站，通知的原文链接就是入口。
2. **不推送 `bodyHtml`。** 同理：`site_fulltext: false` 时正文不进公开页（`publication/rules.ts:48`），模型读的是 `bodyText`，`body_html` 存下来没有任何读取方。少存一份也就少一处 HTML 解析的脆弱点。
3. **兜底摘要少一个标题。** spec 第 3 步的模板是 `{标题}｜{部门}｜{发布时间}｜正文为图片/附件`。`compose_excerpt` 不拼标题，只出 `该通知的正文只有图片，没有文字。发布单位：X；发布时间：Y。`：标题已经是这条文章的 `title` 字段，拼进去会让公开页的同一条信息出现两遍。其余三项（部门、发布时间、"正文是什么形态"）原样保留。

仍然推送**正文文字**（`bodyText`）、**图片/附件的诚实说明**（`excerpt`）、**发布单位**（`author`）和**精确到分钟的发布时间**（`publishedAt`）。

---

### Task 1: 解析层 `deploy/oa_parse.py`

纯函数：输入 HTML 字符串和"今天"，输出推送字段。不联网、不读环境变量、不看系统时钟——这样才可以用固定夹具钉住上面 Review Focus 的第 1、2、5 条。

**Files:**
- Create: `deploy/oa_parse.py`
- Test: `deploy/tests/test_oa_parse.py`
- Create: `deploy/tests/fixtures/list.html`
- Create: `deploy/tests/fixtures/detail.html`
- Create: `deploy/tests/fixtures/detail-poster.html`

**Interfaces:**
- Consumes: 无（本计划的第一环）
- Produces:
  - `BEIJING: datetime.timezone` — 固定 +08:00
  - `BASE: str` = `"https://oa.jlu.edu.cn/defaultroot/"`
  - `LIST_URL: str` — 两个 `{}`：channelId、page
  - `DETAIL_URL: str` — 两个 `{}`：item id、channelId
  - `CHANNELS: list[tuple[str, str, str]]` — (channelId, sourceId, sourceName)
  - `item_time(raw: str, today: datetime) -> datetime | None`
  - `parse_list(html: str, today: datetime) -> list[dict]` — 每项 `{"title": str, "url": str, "channelItemId": str, "publishedAt": str | None}`
  - `parse_detail(html: str) -> dict` — `{"publishedAt": str | None, "department": str | None, "bodyText": str | None, "attachmentText": str | None, "hasImage": bool}`
  - `compose_excerpt(department: str | None, published_at: str | None, *, has_image: bool, has_attachment: bool) -> str | None`

- [ ] **Step 1: 写夹具**

这三个 HTML 按实测的页面结构写（spec「站点结构（实测）」）。真实页面每条 `<DIV class="li rel">` 里没有嵌套的 `</DIV>`，所以既有的非贪婪正则能截出整块——夹具必须保持这一点。

`deploy/tests/fixtures/list.html`：

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>校内通知</title></head>
<body>
<DIV class="li rel">
  <A class="font14" href="/defaultroot/PortalInformation!getInformation.action?id=70970002&channelId=179577">[置顶]2026年专业技术职务评聘工作安排</A>
  <A class="column" href="#">人事处</A>
  <SPAN class="time">2026-09-28</SPAN>
</DIV>
<DIV class="li rel">
  <A class="font14" href="/defaultroot/PortalInformation!getInformation.action?id=70988469&channelId=179577">鸽子楼之声名家讲坛（202640期）</A>
  <A class="column" href="#">地球科学学院</A>
  <SPAN class="time">今天 08:34</SPAN>
</DIV>
<DIV class="li rel">
  <A class="font14" href="/defaultroot/PortalInformation!getInformation.action?id=70988001&channelId=179577">关于做好2026年国庆节期间实验室安全工作的通知</A>
  <A class="column" href="#">实验室与设备管理处</A>
  <SPAN class="time">昨天 15:13</SPAN>
</DIV>
<DIV class="li rel">
  <A class="column" href="#">后勤处</A>
  <SPAN class="time">昨天 09:00</SPAN>
</DIV>
<DIV class="li rel">
  <A class="font14" href="/defaultroot/PortalInformation!getInformation.action?channelId=179577">缺少 id 的条目</A>
  <A class="column" href="#">某处</A>
  <SPAN class="time">2026-10-07</SPAN>
</DIV>
</body></html>
```

倒数第二块没有标题链接、最后一块没有 `id=`——它们是 Review Focus 第 5 条的输入，解析必须跳过而不是推空 URL。

`deploy/tests/fixtures/detail.html`：

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<div class="wrap">
  <div class="content">
    <div class="content_t">关于做好2026年国庆节期间实验室安全工作的通知</div>
    <div class="content_time">2026年10月08日 15:13&nbsp;&nbsp;<span>实验室与设备管理处</span></div>
    <div class="content_font">
      <p>校内各相关单位：</p>
      <p>为确保国庆节期间实验室安全，请各单位于<b>9月30日前</b>完成自查，并将结果报实验室与设备管理处。</p>
      <p>联系人：李老师，电话 85160000。</p>
    </div>
    <p><strong>相关图片：</strong></p>
    <div class="immmges"><img src="/defaultroot/upload/html/20261008151300001.jpg" alt=""></div>
    <div class="news_aboutFile">
      <table><tr><td><a href="/defaultroot/upload/file/20261008/1.docx">实验室安全自查表.docx</a></td></tr></table>
    </div>
  </div>
</div>
</body></html>
```

`deploy/tests/fixtures/detail-poster.html`：正文只有一张海报图，没有文字——`compose_excerpt` 存在的理由。

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<div class="content">
  <div class="content_t">鸽子楼之声名家讲坛（202640期）</div>
  <div class="content_time">2026年10月08日 08:34&nbsp;&nbsp;<span>地球科学学院</span></div>
  <div class="content_font"><p><img src="/defaultroot/upload/html/20261008083322866.jpg" alt=""></p></div>
  <p><strong>相关图片：</strong></p>
  <div class="immmges"></div>
  <div class="news_aboutFile"></div>
</div>
</body></html>
```

- [ ] **Step 2: 写失败的测试**

`deploy/tests/test_oa_parse.py`：

```python
# 解析层的行为（deploy/oa_parse.py）：固定夹具、固定"今天"，不联网、不看系统时钟。
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from oa_parse import BEIJING, compose_excerpt, item_time, parse_detail, parse_list

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
TODAY = datetime(2026, 10, 8, 16, 0, tzinfo=BEIJING)


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return f.read()


class ItemTimeTests(unittest.TestCase):
    def test_today_and_yesterday_use_beijing_time(self):
        self.assertEqual(item_time("今天 08:34", TODAY).isoformat(), "2026-10-08T08:34:00+08:00")
        self.assertEqual(item_time("昨天 15:13", TODAY).isoformat(), "2026-10-07T15:13:00+08:00")

    def test_absolute_date_has_no_time_of_day(self):
        self.assertEqual(item_time("2026-09-28", TODAY).isoformat(), "2026-09-28T00:00:00+08:00")

    def test_an_unreadable_time_is_not_guessed(self):
        self.assertEqual(item_time("", TODAY), None)
        self.assertEqual(item_time("上周三", TODAY), None)
        self.assertEqual(item_time("2026年9月28日", TODAY), None)

    def test_yesterday_crosses_the_month_boundary(self):
        first = datetime(2026, 10, 1, 9, 0, tzinfo=BEIJING)
        self.assertEqual(item_time("昨天 23:50", first).isoformat(), "2026-09-30T23:50:00+08:00")


class ParseListTests(unittest.TestCase):
    def test_keeps_only_items_with_a_title_and_an_id(self):
        items = parse_list(fixture("list.html"), TODAY)
        self.assertEqual([i["channelItemId"] for i in items], ["70970002", "70988469", "70988001"])

    def test_title_drops_the_pinned_marker_and_resolves_the_url(self):
        first = parse_list(fixture("list.html"), TODAY)[0]
        self.assertEqual(first["title"], "2026年专业技术职务评聘工作安排")
        self.assertEqual(first["url"], "https://oa.jlu.edu.cn/defaultroot/PortalInformation!getInformation.action?id=70970002&channelId=179577")

    def test_carries_the_listed_time(self):
        items = parse_list(fixture("list.html"), TODAY)
        self.assertEqual(items[1]["publishedAt"], "2026-10-08T08:34:00+08:00")
        self.assertEqual(items[2]["publishedAt"], "2026-10-07T15:13:00+08:00")

    def test_a_page_with_no_items_is_empty_not_an_error(self):
        self.assertEqual(parse_list("<html><body>nothing here</body></html>", TODAY), [])


class ParseDetailTests(unittest.TestCase):
    def test_reads_the_exact_time_the_department_and_the_body(self):
        detail = parse_detail(fixture("detail.html"))
        self.assertEqual(detail["publishedAt"], "2026-10-08T15:13:00+08:00")
        self.assertEqual(detail["department"], "实验室与设备管理处")
        self.assertIn("请各单位于9月30日前完成自查", detail["bodyText"])
        self.assertIn("联系人：李老师", detail["bodyText"])
        self.assertEqual(detail["attachmentText"], "实验室安全自查表.docx")
        self.assertTrue(detail["hasImage"])  # 图在正文下面那组里

    def test_body_stops_at_the_content_font_boundary(self):
        detail = parse_detail(fixture("detail.html"))
        self.assertNotIn("相关图片", detail["bodyText"])

    def test_an_image_only_notice_has_no_body_text(self):
        detail = parse_detail(fixture("detail-poster.html"))
        self.assertEqual(detail["bodyText"], "")
        self.assertTrue(detail["hasImage"])  # 图在正文里，immmges 是空的
        self.assertEqual(detail["department"], "地球科学学院")

    def test_a_page_that_lost_its_container_reads_as_missing(self):
        detail = parse_detail("<html><body><div class='content'>改版了</div></body></html>")
        self.assertEqual(detail["bodyText"], None)
        self.assertEqual(detail["publishedAt"], None)


class ComposeExcerptTests(unittest.TestCase):
    def test_describes_an_image_only_notice_honestly(self):
        text = compose_excerpt("地球科学学院", "2026-10-08T08:34:00+08:00", has_image=True, has_attachment=False)
        self.assertIn("图片", text)
        self.assertIn("地球科学学院", text)
        self.assertIn("2026-10-08T08:34:00+08:00", text)

    def test_names_both_forms_when_both_are_there(self):
        text = compose_excerpt("某处", None, has_image=True, has_attachment=True)
        self.assertIn("图片和附件", text)

    def test_nothing_to_describe_is_none_rather_than_an_empty_claim(self):
        self.assertEqual(compose_excerpt("某处", None, has_image=False, has_attachment=False), None)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: 跑测试，确认失败**

```bash
python -m unittest discover -s deploy/tests -v
```

预期：`ModuleNotFoundError: No module named 'oa_parse'`。

- [ ] **Step 4: 写解析层**

`deploy/oa_parse.py`：

```python
# OA 页面的解析层：把列表页与详情页的 HTML 变成推送字段。
#
# 单独一个模块，因为 deploy/oa-collector.py 的文件名带连字符、不能直接 import。
# 这里全是纯函数——不联网、不读环境变量、不看系统时钟（"今天"由调用方传入），
# 所以可以用固定夹具把解析行为钉住（deploy/tests/test_oa_parse.py）。
#
# 编码是 UTF-8（页面自己声明 charset=utf-8），不要按 GBK 解码。

import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin

BEIJING = timezone(timedelta(hours=8))

BASE = "https://oa.jlu.edu.cn/defaultroot/"
LIST_URL = BASE + "PortalInformation!jldxList.action?1=1&channelId={}&startPage={}"
DETAIL_URL = BASE + "PortalInformation!getInformation.action?id={}&channelId={}"

# (channelId, sourceId, sourceName)——sourceId 与 industry/sources.json 里的五个 OA 源对应。
CHANNELS = [
    ("179577", "jlu-oa-notice", "吉大OA·校内通知"),
    ("179578", "jlu-oa-kuaixun", "吉大OA·校内快讯"),
    ("179579", "jlu-oa-jiaoxue", "吉大OA·教学信息"),
    ("179580", "jlu-oa-xueshu", "吉大OA·学术动态"),
    ("179581", "jlu-oa-student", "吉大OA·学生天地"),
]

# void 元素不会闭合，遇到它们不能加嵌套深度，否则 div.content_font 的深度永远回不到 0。
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

ITEM_RE = re.compile(r'<DIV class="li rel">(.*?)</DIV>', re.S | re.I)
LINK_RE = re.compile(r'<A class="font14" href="([^"]*getInformation\.action[^"]*)"[^>]*>(.*?)</A>', re.S | re.I)
TIME_RE = re.compile(r'<SPAN class="time"[^>]*>([^<]+)</SPAN>', re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
ID_RE = re.compile(r"[?&]id=(\d+)")
PIN_RE = re.compile(r"^\s*\[置顶\]\s*")
REL_DAY_RE = re.compile(r"^(今天|昨天)\s*(\d{1,2}):(\d{2})$")
ABS_DAY_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
DETAIL_TIME_RE = re.compile(r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})")
SPACE_RE = re.compile(r"\s+")


class _Capture(HTMLParser):
    """收集第一个「标签名 + class 命中」元素的文字。

    用嵌套深度找元素的结束，而不是找第一个 </div>——正文里有嵌套的 <p> / <div>。
    `started` 为假表示页面上没有这个元素（改版了）；正文就此读作 None，而不是读出错的值。
    """

    def __init__(self, tag: str, cls: str) -> None:
        super().__init__(convert_charrefs=True)
        self.tag = tag
        self.cls = cls
        self.depth = 0
        self.started = False
        self.closed = False
        self.text: list[str] = []
        self.images = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.closed:
            return
        if not self.started:
            if tag == self.tag and self.cls in (dict(attrs).get("class") or "").split():
                self.started = True
                self.depth = 1
            return
        if tag == "img":
            self.images += 1
        if tag not in VOID:
            self.depth += 1

    def handle_endtag(self, tag: str) -> None:
        if not self.started or self.closed or tag in VOID:
            return
        self.depth -= 1
        if self.depth == 0:
            self.closed = True

    def handle_data(self, data: str) -> None:
        if self.started and not self.closed:
            self.text.append(data)


def _capture(html: str, tag: str, cls: str) -> _Capture:
    cap = _Capture(tag, cls)
    cap.feed(html)
    cap.close()
    return cap


def text_of(html: str) -> str:
    """把一段 HTML 变成一行文字：去标签、把空白折成单个空格。"""
    return SPACE_RE.sub(" ", TAG_RE.sub(" ", html)).strip()


def item_time(raw: str, today: datetime) -> datetime | None:
    """列表页的时间：今天/昨天带时刻，更早的只有日期。读不出来就返回 None，不猜。

    `today` 由调用方按北京时间给，所以这一支不看宿主机的时区。
    """
    raw = SPACE_RE.sub(" ", raw or "").strip()
    m = REL_DAY_RE.match(raw)
    if m:
        # 相对的是"今天"这个日期，不是当前时刻：所以先取日期再套上页面给的时刻。
        day = today if m.group(1) == "今天" else today - timedelta(days=1)
        return day.replace(hour=int(m.group(2)), minute=int(m.group(3)), second=0, microsecond=0)
    m = ABS_DAY_RE.match(raw)
    if m:
        # 列表页这一天没有时刻；详情页会给出精确到分钟的时间并覆盖它。
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=BEIJING)
    return None


def parse_list(html: str, today: datetime) -> list[dict]:
    """列表页 → 条目。标题或 id 缺一个就跳过：没有 id 就拼不出详情页地址，也没有身份可去重。"""
    items: list[dict] = []
    for block in ITEM_RE.findall(html):
        link = LINK_RE.search(block)
        if not link:
            continue
        href, title_html = link.group(1), link.group(2)
        title = PIN_RE.sub("", text_of(title_html)).strip()  # [置顶] 是页面的标记，不是标题
        id_m = ID_RE.search(href)
        if not title or not id_m:
            continue
        time_m = TIME_RE.search(block)
        when = item_time(time_m.group(1) if time_m else "", today)
        items.append({
            "title": title,
            "url": urljoin(BASE, href),
            "channelItemId": id_m.group(1),
            "publishedAt": when.isoformat() if when else None,
        })
    return items


def parse_detail(html: str) -> dict:
    """详情页 → 精确时间、发布单位、正文、附件、正文里有没有图。

    `bodyText` 为 None 表示页面上找不到正文容器（改版了）；为空字符串表示容器在但正文没文字
    （图片型通知）。两者要分开：前者是解析失败，后者是诚实的"只有图"。
    """
    body = _capture(html, "div", "content_font")
    gallery = _capture(html, "div", "immmges")
    stamp = _capture(html, "div", "content_time")
    stamp_text = SPACE_RE.sub(" ", "".join(stamp.text)).strip()
    when, department = _split_stamp(stamp_text)
    attachment = text_of("".join(_capture(html, "div", "news_aboutFile").text)) or None
    return {
        "publishedAt": when,
        "department": department,
        "bodyText": text_of("".join(body.text)) if body.started else None,
        "attachmentText": attachment,
        # 图有两种位置：正文里的，和正文下面 `div.immmges` 里那一组。两种都算"这条有图"。
        "hasImage": body.images > 0 or gallery.images > 0,
    }


def _split_stamp(raw: str) -> tuple[str | None, str | None]:
    """`content_time` 的文字形如 `2026年10月08日 15:13  实验室与设备管理处`，按日期切开。"""
    m = DETAIL_TIME_RE.search(raw)
    if not m:
        return None, None
    when = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), tzinfo=BEIJING)
    return when.isoformat(), SPACE_RE.sub(" ", raw[m.end():]).strip() or None


def compose_excerpt(department: str | None, published_at: str | None, *, has_image: bool, has_attachment: bool) -> str | None:
    """正文没有文字时的兜底：把页面已有的字段拼成一句实话。

    这不是编造材料——它只说三件页面自己写着的事：正文是什么形态、谁发的、什么时候发的。
    正文既没文字也没有图片/附件时返回 None：那种通知本来就没有可供判断的材料，
    拼一句话出来只会让模型对着一句空话打分。
    """
    if not has_image and not has_attachment:
        return None
    what = {(True, True): "图片和附件", (True, False): "图片", (False, True): "附件"}[(has_image, has_attachment)]
    who = f"发布单位：{department}；" if department else ""
    when = f"发布时间：{published_at}。" if published_at else ""
    return f"该通知的正文只有{what}，没有文字。{who}{when}"
```

- [ ] **Step 5: 跑测试，确认通过**

```bash
python -m unittest discover -s deploy/tests -v
```

预期：全部 PASS。若某个断言不符，先确认夹具与真实页面的结构一致（可用 Step 6 的命令对照），不要改断言去迁就实现。

- [ ] **Step 6: 拿真实页面复核夹具**

有校园网时抓一次真实页面，与本地的夹具结构对照（只写进 `/tmp`，不进仓库）：

```bash
python -c "
import urllib.request, os
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
req = urllib.request.Request('https://oa.jlu.edu.cn/defaultroot/PortalInformation!jldxList.action?1=1&channelId=179577&startPage=1', headers={'User-Agent':'Mozilla/5.0'})
html = op.open(req, timeout=30).read().decode('utf-8', 'replace')
open(os.environ['TEMP'] + '/oa-list.html','w',encoding='utf-8').write(html)
print('bytes', len(html), 'items', html.count('class=\"li rel\"'))
"
```

若真实页面的类名或结构与夹具不同，**改夹具和解析**（不是改断言）；若一致，夹具就是可信的。

- [ ] **Step 7: 提交**

```bash
git add deploy/oa_parse.py deploy/tests/
git commit -F - <<'EOF'
feat(deploy): parse JLU OA list and detail pages

The list page carries only titles, so a notice reaches the framework with no
evidence to judge and is parked (analyze.ts missingEvidence). The detail page
has the body, the exact minute and the department; this layer turns both pages
into the fields the push contract can carry.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

---

### Task 2: 采集器 `deploy/oa-collector.py`

重写现有脚本：绕开系统代理、翻页到 `--days` 窗口、逐条抓详情页、分块推送并节流、单个频道失败不影响其他。

**Files:**
- Modify: `deploy/oa-collector.py`（整体重写）
- Test: `deploy/tests/test_oa_collector.py`

**Interfaces:**
- Consumes: Task 1 的 `BEIJING` / `CHANNELS` / `LIST_URL` / `DETAIL_URL` / `parse_list` / `parse_detail` / `compose_excerpt`
- Produces（供测试与定时任务使用）:
  - `MAX_ITEMS: int` = 50
  - `PUSHES_PER_MINUTE: int` = 8
  - `Pacer(per_minute: int = PUSHES_PER_MINUTE)`，方法 `wait() -> None`
  - `push(api_base, token, source_id, source_name, items: list[dict], *, tries: int = 3) -> dict`
  - `push_all(api_base, token, source_id, source_name, items: list[dict], pacer: Pacer) -> int`
  - `collect_channel(channel_id: str, today: datetime, cutoff: datetime, *, list_url: str = LIST_URL) -> list[dict]`（`list_url` 是给测试用的注入点）
  - `enrich(channel_id: str, items: list[dict]) -> tuple[list[dict], int]`
  - `main(argv: list[str] | None = None) -> int` — 命令行入口，返回退出码

- [ ] **Step 1: 写失败的测试**

两件事都用本地 stub 服务器钉住，测试不联网：推送的分块与 429 重试（现有脚本 `items[:50]` 直接丢掉多余的），以及列表翻页的停页判断（现有脚本只抓第一页）。

`deploy/tests/test_oa_collector.py`：

```python
# 采集器的行为：翻页、分块、限流重试。用本地 stub 服务器，不碰任何外部服务。
import importlib.util
import json
import pathlib
import re
import sys
import threading
import unittest
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from oa_parse import BEIJING

# 文件名带连字符，不能 import，只能按路径加载。模块自己会把 deploy/ 加进 sys.path。
_spec = importlib.util.spec_from_file_location("oa_collector", HERE.parent / "oa-collector.py")
oa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oa)

TODAY = datetime(2026, 10, 8, 16, 0, tzinfo=BEIJING)
CUTOFF = TODAY - timedelta(days=3)  # 2026-10-05


class _Stub(BaseHTTPRequestHandler):
    """记录每一批推送的条数，按 scripted 状态码逐次应答。"""

    def do_POST(self):  # noqa: N802 (http.server 的命名)
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.batches.append([i["title"] for i in body["items"]])
        status = self.server.replies.pop(0) if self.server.replies else 200
        self.send_response(status)
        if status == 429:
            self.send_header("Retry-After", "0")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "created": len(body["items"])}).encode())

    def log_message(self, *args):
        pass


def stub(replies: list[int] | None = None):
    server = HTTPServer(("127.0.0.1", 0), _Stub)
    server.batches, server.replies = [], list(replies or [])
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


class _ListStub(BaseHTTPRequestHandler):
    """按 startPage 给一页 HTML；页码超出就重复最后一页（这样漏停会被 hits 抓到）。"""

    def do_GET(self):  # noqa: N802
        page = int(re.search(r"startPage=(\d+)", self.path).group(1))
        self.server.hits.append(page)
        body = self.server.pages[min(page, len(self.server.pages)) - 1].encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def list_stub(pages: list[str]):
    server = HTTPServer(("127.0.0.1", 0), _ListStub)
    server.hits, server.pages = [], list(pages)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}/PortalInformation!jldxList.action?1=1&channelId={{}}&startPage={{}}"


def list_html(rows) -> str:
    """按真实列表页的结构拼一页；rows 是 (标题, id, 时间文字)。"""
    blocks = "".join(
        f'<DIV class="li rel">'
        f'<A class="font14" href="/defaultroot/PortalInformation!getInformation.action?id={iid}&channelId=179577">{title}</A>'
        f'<A class="column" href="#">某处</A><SPAN class="time">{when}</SPAN></DIV>'
        for title, iid, when in rows
    )
    return f"<html><body>{blocks}</body></html>"


class PushTests(unittest.TestCase):
    def test_pushes_every_item_in_chunks_of_at_most_max_items(self):
        server, base = stub()
        try:
            items = [{"title": f"t{i}", "url": f"https://oa.jlu.edu.cn/{i}"} for i in range(120)]
            created = oa.push_all(base, "token", "src", "name", items, oa.Pacer(per_minute=1000))
            self.assertEqual([len(b) for b in server.batches], [50, 50, 20])
            self.assertEqual(created, 120)
            self.assertEqual([t for b in server.batches for t in b], [f"t{i}" for i in range(120)])
        finally:
            server.shutdown()

    def test_a_single_chunk_is_not_split(self):
        server, base = stub()
        try:
            oa.push_all(base, "token", "src", "name", [{"title": "only", "url": "https://oa.jlu.edu.cn/1"}], oa.Pacer(per_minute=1000))
            self.assertEqual([len(b) for b in server.batches], [1])
        finally:
            server.shutdown()

    def test_retries_the_same_chunk_after_a_rate_limit(self):
        server, base = stub(replies=[429])
        try:
            items = [{"title": "a", "url": "https://oa.jlu.edu.cn/1"}, {"title": "b", "url": "https://oa.jlu.edu.cn/2"}]
            created = oa.push_all(base, "token", "src", "name", items, oa.Pacer(per_minute=1000))
            self.assertEqual(server.batches, [["a", "b"], ["a", "b"]])  # 同一批重试，一条不丢
            self.assertEqual(created, 2)  # 只算成功的那一次
        finally:
            server.shutdown()

    def test_a_non_rate_limit_error_is_not_retried(self):
        server, base = stub(replies=[400])
        try:
            with self.assertRaises(Exception):
                oa.push_all(base, "token", "src", "name", [{"title": "a", "url": "https://oa.jlu.edu.cn/1"}], oa.Pacer(per_minute=1000))
            self.assertEqual(len(server.batches), 1)
        finally:
            server.shutdown()


class PaginationTests(unittest.TestCase):
    def test_a_pinned_old_item_does_not_stop_the_walk(self):
        """置顶条目在列表最上面，日期很旧。不能因为它就在第一页停下。"""
        server, url = list_stub([
            list_html([("置顶旧闻", "1", "2026-09-28"), ("窗口内甲", "2", "今天 08:00"), ("窗口内乙", "3", "昨天 09:00")]),
            list_html([("窗口外甲", "4", "2026-09-01"), ("窗口外乙", "5", "2026-08-30")]),
        ])
        try:
            items = oa.collect_channel("179577", TODAY, CUTOFF, list_url=url)
            self.assertEqual(server.hits, [1, 2])  # 翻到第二页，整页都在窗口外，才停
            self.assertEqual([i["channelItemId"] for i in items], ["2", "3"])
        finally:
            server.shutdown()

    def test_an_item_with_no_readable_date_is_kept(self):
        """列表页读不出的时间，先收下——详情页会给准确时间。"""
        server, url = list_stub([list_html([("时间看不懂", "7", "上周三")])])
        try:
            items = oa.collect_channel("179577", TODAY, CUTOFF, list_url=url)
            self.assertEqual([i["channelItemId"] for i in items], ["7"])
            self.assertIsNone(items[0]["publishedAt"])
            self.assertEqual(server.hits, [1])
        finally:
            server.shutdown()

    def test_a_page_with_no_items_is_an_error(self):
        """整页解析不出条目 = 页面结构变了，要吵，不能安静地当成空频道。"""
        server, url = list_stub(["<html><body>改版了</body></html>"])
        try:
            with self.assertRaises(RuntimeError):
                oa.collect_channel("179577", TODAY, CUTOFF, list_url=url)
        finally:
            server.shutdown()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
python -m unittest discover -s deploy/tests -v
```

预期：七个用例全红——四个 `PushTests` 报 `AttributeError: module 'oa_collector' has no attribute 'push_all'`（现有脚本只有 `push`，且它截断到 50 条），三个 `PaginationTests` 报 `AttributeError: … has no attribute 'collect_channel'`（现有脚本只抓第一页）。

- [ ] **Step 3: 重写采集器**

`deploy/oa-collector.py`：

```python
# 吉大 OA 采集器：oa.jlu.edu.cn 解析到校园内网（10.100.18.18），只有连着校园网/VPN 的宿主机
# 能访问它。不要放进 Docker：框架的 SSRF 防护会拦内网地址（生产环境直接拒绝启动，
# packages/backend/src/config.ts:105），容器也没有到内网的路由。
#
# 所以采集在宿主机做，并且替框架把**正文**取回来：列表页只有标题没有正文，而只有正文才能让
# 框架分析一条通知（packages/backend/src/editorial/analyze.ts:416 的 missingEvidence——
# 只有标题的条目会被搁置，relevance 停在 unknown，既不会公开也不会被拦）。
#
# 抓到的条目通过 POST /api/ingest/items 交给网站；身份、去重、时间规则都由框架统一处理，
# 这里不自己判断新旧。
#
# 用法：
#   python deploy/oa-collector.py --days 3                    # 日常增量（约 90 条）
#   python deploy/oa-collector.py --days 30                   # 回补一个月（约 900 条，约 20 分钟）
#   python deploy/oa-collector.py --days 90                   # 回补三个月（约 2400 条，约 55 分钟）
#   python deploy/oa-collector.py --days 3 --dry-run          # 只解析并打印，不推送
#   python deploy/oa-collector.py --days 3 --channel 179577   # 只跑一个频道
#
# 五个 OA 源都是 external（框架不主动抓，interval_minutes 对它们不生效），日常增量靠
# Windows 任务计划每天跑一次 `--days 3`。不装这个计划任务，站点就会停在最后一批数据上。
#
# INGEST_TOKEN 从仓库根目录的 .env 读取（或用环境变量覆盖）。

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from oa_parse import BEIJING, CHANNELS, DETAIL_URL, LIST_URL, compose_excerpt, parse_detail, parse_list

# 站点一次最多收 50 条（packages/backend/src/ingest/items.ts 的 MAX_ITEMS）——改动要两边同步。
MAX_ITEMS = 50
# 站点侧的 INGEST_RATE_LIMIT 默认 10 次/分钟（docker-compose.yml），这里留出余量。
PUSHES_PER_MINUTE = 8
# 抓 OA 自己服务器的间隔，别把它当成压测。
FETCH_PAUSE = 0.4
# 翻页的上限，防止解析异常时无限翻下去（一天的条目远多于 30 条时才会用到这么多页）。
PAGE_LIMIT = 400

# 绕开系统代理：Windows 上装了 Clash 之类的工具后，urllib 会从注册表读到 127.0.0.1:7897，
# 把校园内网的请求也塞进代理，结果五个频道全部握手超时。推送也走这个 opener——
# 否则推到 localhost:3000 的请求同样可能被代理拦掉。
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def read_token(repo_root: str) -> str:
    if os.environ.get("INGEST_TOKEN"):
        return os.environ["INGEST_TOKEN"]
    env_path = os.path.join(repo_root, ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("INGEST_TOKEN="):
                return line.split("=", 1)[1].strip()
    sys.exit("INGEST_TOKEN 未找到：填进 .env 或用环境变量提供")


def fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (MolaMaker OA collector)"})
    with OPENER.open(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="replace")


class Pacer:
    """推送节流：站点侧每分钟只收 PUSHES_PER_MINUTE 次，超了会 429。"""

    def __init__(self, per_minute: int = PUSHES_PER_MINUTE) -> None:
        self.per_minute = per_minute
        self.times: list[float] = []

    def wait(self) -> None:
        now = time.monotonic()
        self.times = [t for t in self.times if now - t < 60]
        if len(self.times) >= self.per_minute:
            time.sleep(max(0.0, 60 - (now - self.times[0]) + 0.5))
            self.times = [t for t in self.times if time.monotonic() - t < 60]
        self.times.append(time.monotonic())


def push(api_base: str, token: str, source_id: str, source_name: str, items: list[dict], *, tries: int = 3) -> dict:
    """推一批。被限流就等 Retry-After 之后重试**同一批**——不能跳过，那会静默丢条目。"""
    body = json.dumps({"sourceId": source_id, "sourceName": source_name, "items": items}).encode()
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(
            f"{api_base}/api/ingest/items",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        try:
            with OPENER.open(req, timeout=120) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries:
                raise
            wait = int(e.headers.get("Retry-After") or 60)
            print(f"  被限流，等 {wait} 秒后重试这一批", file=sys.stderr)
            time.sleep(wait + 1)
    raise RuntimeError("推送重试用尽")


def push_all(api_base: str, token: str, source_id: str, source_name: str, items: list[dict], pacer: Pacer) -> int:
    """分块推送：站点一次最多收 MAX_ITEMS 条，多的必须分批（截断会把条目悄悄丢掉）。"""
    created = 0
    for start in range(0, len(items), MAX_ITEMS):
        chunk = items[start:start + MAX_ITEMS]
        pacer.wait()
        result = push(api_base, token, source_id, source_name, chunk)
        created += int(result.get("created") or 0)
        print(f"  推送 {start + len(chunk)}/{len(items)}，新增 {result.get('created')} 条")
    return created


def parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def collect_channel(channel_id: str, today: datetime, cutoff: datetime, *, list_url: str = LIST_URL) -> list[dict]:
    """翻列表页取窗口内的条目。

    列表按时间倒序。停下的判断是"这一页没有任何条目能落在窗口内"，不是"第一条落在窗口外"——
    置顶条目的日期很旧，却和当前条目一起挤在第一页，用第一条判断会在第一页就停住。

    日期读不出来的条目照收（详情页会给准确时间），但它不算"落在窗口内"；所以一整页的日期都
    读不出来的话，翻页会在这里停下并打印一行提示。列表页上还没有见过这种日期，真出现了要先看
    提示再决定怎么办，不要当成正常。

    `list_url` 只为测试而留：本地 stub 服务器用它替换真实地址，其余调用走默认值。
    """
    picked: list[dict] = []
    seen: set[str] = set()
    for page in range(1, PAGE_LIMIT + 1):
        page_items = parse_list(fetch(list_url.format(channel_id, page)), today)
        if not page_items:
            raise RuntimeError(f"第 {page} 页没有解析到条目（页面结构变了？）")
        fresh = 0
        unreadable = 0
        for item in page_items:
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            when = parse_iso(item.get("publishedAt"))
            if when is None:
                unreadable += 1
            elif when >= cutoff:
                fresh += 1
            if when is None or when >= cutoff:
                picked.append(item)
        if unreadable:
            print(f"  第 {page} 页有 {unreadable} 条的时间读不出来（先收下，详情页会给准确时间）", file=sys.stderr)
        if fresh == 0:
            break
        time.sleep(FETCH_PAUSE)
    return picked


def enrich(channel_id: str, items: list[dict]) -> tuple[list[dict], int]:
    """逐条抓详情页补正文与精确时间。返回（可推送的条目，解析失败数）。

    详情页给出的时间精确到分钟，覆盖列表页的日期粒度；没有正文也没有图片/附件的条目跳过并
    报出地址——宁可少一条，也不要推一条没有材料、注定被搁置的通知（那正是本次要修的 bug）。
    """
    out: list[dict] = []
    failures = 0
    for item in items:
        detail_url = DETAIL_URL.format(item["channelItemId"], channel_id)
        try:
            detail = parse_detail(fetch(detail_url))
        except Exception as e:
            print(f"    详情页抓取失败 {detail_url}：{e}", file=sys.stderr)
            failures += 1
            continue
        time.sleep(FETCH_PAUSE)

        body = detail["bodyText"]
        if detail["attachmentText"]:
            body = f"{body}\n附件：{detail['attachmentText']}" if body else f"附件：{detail['attachmentText']}"
        if body:
            item["bodyText"] = body
        else:
            excerpt = compose_excerpt(
                detail["department"], detail["publishedAt"],
                has_image=detail["hasImage"], has_attachment=bool(detail["attachmentText"]),
            )
            if not excerpt:
                print(f"    详情页没有正文、也没有图片或附件，跳过 {detail_url}", file=sys.stderr)
                failures += 1
                continue
            item["excerpt"] = excerpt

        if detail["publishedAt"]:
            item["publishedAt"] = detail["publishedAt"]
        if detail["department"]:
            item["author"] = detail["department"]
        item.pop("channelItemId", None)
        out.append(item)
    return out, failures


def collect(api_base: str, token: str, *, days: int, dry_run: bool, only: str | None) -> int:
    """跑一轮。返回失败频道数，决定退出码。"""
    today = datetime.now(BEIJING)
    cutoff = today - timedelta(days=days)
    pacer = Pacer()
    failures = 0
    for channel_id, source_id, source_name in CHANNELS:
        if only and channel_id != only:
            continue
        print(f"{source_name}:")
        try:
            listed = collect_channel(channel_id, today, cutoff)
        except Exception as e:  # 单个频道失败不影响其他频道
            print(f"  列表失败：{e}", file=sys.stderr)
            failures += 1
            continue
        items, broken = enrich(channel_id, listed)
        if broken:
            print(f"  {broken} 条详情页没有可用正文（已跳过，地址见上）", file=sys.stderr)
        if not items:
            print(f"  {days} 天窗口内没有可用条目", file=sys.stderr)
            failures += 1
            continue
        if dry_run:
            for item in items[:5]:
                print(f"  {item.get('publishedAt')} {item['title'][:36]} 正文 {len(item.get('bodyText') or item.get('excerpt') or '')} 字")
            print(f"  dry-run：解析到 {len(items)} 条，未推送")
            continue
        created = push_all(api_base, token, source_id, source_name, items, pacer)
        print(f"  {len(items)} 条，新增 {created} 条")
    return failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="吉大 OA 采集推送（5 个频道）")
    parser.add_argument("--days", type=int, default=3, help="往回取多少天；日常增量 3，回补用 30 或 90")
    parser.add_argument("--api", default="http://localhost:3000", help="网站地址（本地 web 端口）")
    parser.add_argument("--channel", default=None, help="只跑一个 channelId")
    parser.add_argument("--dry-run", action="store_true", help="只解析并打印，不推送")
    args = parser.parse_args(argv)

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    token = "" if args.dry_run else read_token(repo_root)
    failures = collect(args.api, token, days=max(1, args.days), dry_run=args.dry_run, only=args.channel)
    if failures:
        print(f"{failures} 个频道没有取到可用条目", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
python -m unittest discover -s deploy/tests -v
```

预期：全部 PASS（Task 1 的解析测试也一起跑）。Task 2 共七个用例：四个 `PushTests` + 三个 `PaginationTests`。若 `test_a_pinned_old_item_does_not_stop_the_walk` 挂在 `server.hits == [1, 2]`，说明停页判断写成了"第一条落在窗口外就停"。

- [ ] **Step 5: 用真实站点跑 dry-run**

有校园网时，先不推送，只看解析结果：

```bash
python deploy/oa-collector.py --days 3 --dry-run
```

预期：五个频道各打印前 5 条的发布时间、标题与正文字数，末尾 `解析到 N 条，未推送`。若某频道报"列表失败"或"没有可用条目"，先查它的解析，不要带着空频道继续。

- [ ] **Step 6: 提交**

```bash
git add deploy/oa-collector.py deploy/tests/test_oa_collector.py
git commit -F - <<'EOF'
feat(deploy): collect JLU OA notices with their bodies

The old collector read only the list page, so every notice arrived title-only
and was parked, and it truncated a run at 50 items without saying so. It also
let urllib route campus-internal requests through the Windows system proxy,
which timed out every channel.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

---

### Task 3: 推送契约接受正文 `packages/backend/src/ingest/items.ts`

`upsertMaterial` 早已支持 `excerpt` / `bodyText`（`content/materials.ts:32-45`），只是推送接口没有透出。加上这两个字段的透传，并把 `docs/sources.md` 里 `external` 信源那一节补上。

**Files:**
- Modify: `packages/backend/src/ingest/items.ts`
- Modify: `tests/ingest.test.ts`（追加测试）
- Modify: `docs/sources.md`（`external` 信源 / 推送接口那一节）

**Interfaces:**
- Consumes: 无（后端自有类型）
- Produces: `POST /api/ingest/items` 的 `items[]` 新增两个可选字段 `excerpt`、`bodyText`（都是字符串）。推送带 `bodyText` 的条目时，`articles.body_status` 自动成为 `ok`（`content/materials.ts:188` 的既有推断），`content/extract.ts:123` 因此跳过正文抓取。

- [ ] **Step 1: 写失败的测试**

追加到 `tests/ingest.test.ts`（保留文件里已有的那个测试，它覆盖暂停的信源）：

```ts
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
```

在文件顶部的 import 区补上三个：

```ts
import { extractArticleBody } from "@aihot/backend/content/extract";
import { loadAnalyzeInput } from "@aihot/backend/editorial/input";
import { missingEvidence } from "@aihot/backend/editorial/writing";
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test npm test -- tests/ingest.test.ts
```

预期：第一个测试 `body_text` / `excerpt` 为 null（推送的字段被丢掉了）而失败；第三个测试的 `revision` 不增。若连 `DATABASE_URL` 都没配，先按 `AGENTS.md` 建一个以 `_test` 结尾的库（没有会自动建好并迁移）。

- [ ] **Step 3: 加字段**

改 `packages/backend/src/ingest/items.ts`。文件头注释补一句，让下一个读的人知道这个入口能带正文：

```ts
// External collection reports (POST /api/ingest/items). Same identity rules and timeline
// rule as every other entrance: old or future-dated items and explicit backfill never count as
// today's news and are never pushed. Unknown sources are created isolated, awaiting an operator.
// A report may carry the copy it already fetched (excerpt, bodyText): a source whose pages the
// framework cannot reach itself (a campus intranet, a login wall) still needs evidence to be
// judged, and a confirmed body also stops extract.ts from trying to fetch it again.
```

`ItemIn` 加上两个字段：

```ts
interface ItemIn {
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  author?: unknown;
  excerpt?: unknown;
  bodyText?: unknown;
  raw?: { _aihot?: { backfill?: boolean; baseline?: boolean } } & Record<string, unknown>;
}

/** The ceiling the prompt builder also uses (editorial/writing.ts MAX_BODY_CHARS): one report cannot flood a row. */
const MAX_PUSHED_TEXT = 60_000;

/** A pushed copy field: a non-empty trimmed string, or null. */
function copyField(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}
```

并在 `upsertMaterial(...)` 调用里补两行（其余参数不动）：

```ts
      excerpt: copyField(it.excerpt, 2_000),
      bodyText: copyField(it.bodyText, MAX_PUSHED_TEXT),
```

**不要传 `bodyStatus`**：`content/materials.ts:188` 已经从 `bodyText` 推断出 `ok`，插入与修订两条路径都走这个推断（修订路径见 `materials.ts:251`）。多传一个反而多一处可能与推断不一致的地方。

- [ ] **Step 4: 跑测试，确认通过**

```bash
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test npm test -- tests/ingest.test.ts
npm run typecheck
```

预期：全绿。

- [ ] **Step 5: 补文档**

`docs/sources.md` 里 `external` 信源那一节（现在写着 `sourceId` 不存在时会自动建一个 `external` 信源、`external` 也不支持主动试抓）补上推送字段的说明，紧跟在讲推送接口的位置：

```markdown
推送的每条可以有 `excerpt` 与 `bodyText`：前者是摘要，后者是正文。带上正文的条目会被记为
"正文已确认"，框架也就不再去抓它（`content/extract.ts` 跳过 `body_status = 'ok'`）。这对
框架自己到不了的来源是必须的——校园内网、登录墙后面的页面，只有采集端能把正文带回来；
而没有正文的条目会被搁置（`relevance` 停在 `unknown`），既不公开也不拦截。

吉大 OA（`oa.jlu.edu.cn`）就是这个用法：采集器在连着校园网的宿主机上跑，
见 `deploy/oa-collector.py` 的文件头。
```

- [ ] **Step 6: 提交**

```bash
git add packages/backend/src/ingest/items.ts tests/ingest.test.ts docs/sources.md
git commit -F - <<'EOF'
feat(ingest): accept a pushed excerpt and body

A source the framework cannot reach itself still needs evidence to be judged:
without a body a pushed item is parked at relevance unknown, and with one
extract.ts correctly skips the fetch it would otherwise fail.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
```

---

### Task 4: 接通并回补

这一步动真实数据和真实站点。前四步做完之前不要跑第五步。

**Files:**
- 无代码改动（运维与验收）
- 已知相关：`industry/sources.json`（五个 OA 源的权威配置）、`docker-compose.yml:19`（限流）

**Interfaces:**
- Consumes: Task 2 的采集器、Task 3 的推送契约
- Produces: 站点上真实可浏览的 OA 通知

- [ ] **Step 1: 把 `jlu-oa-notice` 的参与方式改回 `editorial`**

库内这一行是 `hot_signal`（配置文件里是 `editorial`，手工改过留下的漂移）。`hot_signal` 下 `isPoolEligible` 恒为 false、`hasItemPage` 也为 false——**连详情页都不会有**。

在后台信源页把 `jlu-oa-notice` 改成"编辑"参与、60 分钟间隔最省事；用 SQL 改的话，改完必须与 `industry/sources.json` **完全一致**（这正是这条漂移当初的病根）。改完查一次，五个源必须全对：

```bash
docker compose exec db psql -U aihot -d aihot -c "
SELECT s.id, s.participation_mode, s.interval_minutes, s.tier, s.enabled, s.site_fulltext
FROM sources s WHERE s.id LIKE 'jlu-oa-%' ORDER BY s.id;"
```

预期：五行全部 `editorial`、`60`、`T1`、`t`、`f`。

- [ ] **Step 2: 小窗口重推，让库里那 30 条自愈**

库里只有 `jlu-oa-notice` 有 30 条，全部 `relevance='unknown'`、`body_status` 不是 `ok`，其中 23 条 `published_at IS NULL`。重推同一个窗口就会自愈：补上日期会写回 `published_at`（`materials.ts:104` 把 `unknown-publication-time` 当作"没有明确回补标记"），正文后到会改变 `content_hash`（`materials.ts:226`），两者都会产生修订、重置 `processing_state`、重新进分析队列。

先看再推：

```bash
python deploy/oa-collector.py --days 3 --channel 179577 --dry-run
python deploy/oa-collector.py --days 3 --channel 179577
```

推完等 worker 跑一会儿（回补条目按 `PRIORITY.history = -2` 排在实时任务之后），再查：

```bash
docker compose exec db psql -U aihot -d aihot -c "
SELECT a.source_id,
       count(*) AS total,
       count(*) FILTER (WHERE a.body_status = 'ok') AS body_ok,
       count(*) FILTER (WHERE a.published_at IS NULL) AS no_pub,
       count(*) FILTER (WHERE an.relevance = 'pass') AS rel_pass
FROM articles a LEFT JOIN analyses an ON an.article_id = a.id
WHERE a.source_id LIKE 'jlu-oa-%' GROUP BY 1 ORDER BY 1;"
```

预期：`body_ok` 接近 `total`，`no_pub` 掉到 0（或只剩解析不出日期的极少数），`rel_pass` **大于 0**——这是整件事的验收点，之前是 0。

- [ ] **Step 3: 回补一个月**

```bash
python deploy/oa-collector.py --days 30
```

约 900 条、约 20 分钟抓取，推送按每分钟 8 批节流。前台跑会占住终端，用后台跑并把输出留到文件里：

```bash
python deploy/oa-collector.py --days 30 > /tmp/oa-30d.log 2>&1
```

跑完查同一个查询：五个频道都有数据，`rel_pass` 明显增长。再看一眼站点：

```bash
node scripts/smoke.ts --base http://localhost:3000
```

节流要真的生效——推送这一侧的上限是 10 次/分钟（`docker-compose.yml:19` 的 `INGEST_RATE_LIMIT`），撞上去会返回 429。查一下整轮里有没有 429：

```bash
grep -c "被限流" /tmp/oa-30d.log     # 期望 0（脚本只在真的收到 429 时打这行）
```

非 0 就把 `PUSHES_PER_MINUTE` 从 8 调低到 6 再跑。采集器会按 `Retry-After` 重试同一批，所以数据不会丢，但一轮里出现 429 就说明节奏卡在了上限上，日常增量迟早会偶发。

- [ ] **Step 4: 抽样验收公开面**

```bash
# 一条三个月内的 OA 通知应当有详情页（把 <id> 换成库里某个 jlu-oa- 条目的 id）
docker compose exec db psql -U aihot -d aihot -tAc "
SELECT id, title, published_at FROM articles WHERE source_id LIKE 'jlu-oa-%' AND published_at IS NOT NULL ORDER BY published_at LIMIT 3;"
```

对其中一条：它在 `/all` 里能搜到，详情页返回 200，按**原发布时间**归档，**不出现在今天的日报里**（`isHistorical()` 让它不立事件、不进精选）。若某条已 `relevance='pass'` 却没有详情页，回头查它的参与方式与 `published_at`。

- [ ] **Step 5: 放长到三个月**

`--days 90` 是最终目标（约 2400 条、约 55 分钟抓取、约 6 分钟推送节流）。**等一个月的数据在站点上看过、确认无误再跑这一步**——重推是幂等的，已经分析过的条目不会重复分析，但没验证就放大窗口，错了要重来一遍。

```bash
python deploy/oa-collector.py --days 90 > /tmp/oa-90d.log 2>&1
```

- [ ] **Step 6: 装日常增量**

五个 OA 源是 `external`，框架不会主动抓，`interval_minutes: 60` 对它们不生效。不装计划任务，站点就停在最后一批数据上。以管理员身份运行一次（下面的路径按实际仓库位置改）：

```powershell
schtasks /Create /TN "MolaMaker OA collect" /SC DAILY /ST 07:30 /TR "python E:\AIHOT\deploy\oa-collector.py --days 3" /RL LIMITED /F
```

跑一次确认它能工作（也可以不装计划任务，手动跑这一行）：

```bash
python deploy/oa-collector.py --days 3
```

预期：五个频道各几十条，新增数很小（大部分已入库）。若 `schtasks` 失败，记下报错——`python` 不在系统 PATH 里是常见原因，那就把 `python` 换成绝对路径。

---

## 不做什么

- 不放宽 `missingEvidence`，不改 `analyze.ts` 与 `industry/selection.ts` 的门槛（`T1:60 / T1_5:65 / T2:76`）。通知进公开池靠补材料。
- 不打开 `ALLOW_PRIVATE_NETWORK_FETCH`，不为内网地址加 SSRF 例外。
- 不改 `industry/prompts/prefilter.md`（已是吉大语境）。
- 不改 `site_fulltext`，正文只喂模型，公开页仍只有摘要与原文链接。
- 不给采集器加本地已抓缓存：日常增量约 90 条，不值得引入一份要维护的状态。
- 不推送 `media`、不推送 `bodyHtml`（理由见「与 spec 的三处偏差」）。
- 不新增数据库迁移（用到的都是既有列）。
