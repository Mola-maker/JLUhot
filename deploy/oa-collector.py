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


def fetch_listing(url: str, *, tries: int = 3) -> str:
    """列表页抓取：校园网到 oa.jlu.edu.cn 的链路会偶发丢连接（实测 WinError 10060）。

    列表页失败会丢掉整个频道（collect() 按频道 catch），所以这一层必须重试；
    详情页失败只丢一条，那边已经有 per-item 的容错，不需要在这里兜。
    """
    for attempt in range(1, tries + 1):
        try:
            return fetch(url)
        except (urllib.error.URLError, ConnectionError) as e:
            # 超时/拒连是 URLError（实测 WinError 10060），对端直接断开是 RemoteDisconnected，
            # 它是 ConnectionError——两种都是偶发丢包，都重试；解析错误（RuntimeError）不在其列。
            if attempt == tries:
                raise
            print(f"    列表页第 {attempt} 次失败（{e}），等 {attempt * 2} 秒重试", file=sys.stderr)
            time.sleep(attempt * 2)
    raise AssertionError("unreachable")


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
        page_items = parse_list(fetch_listing(list_url.format(channel_id, page)), today)
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
