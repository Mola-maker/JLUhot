# OA 页面的解析层：把列表页与详情页的 HTML 变成推送字段。
#
# 单独一个模块，因为 deploy/oa-collector.py 的文件名带连字符、不能直接 import。
# 这里全是纯函数——不联网、不读环境变量、不看系统时钟（"今天"由调用方传入），
# 所以可以用固定夹具把解析行为钉住（deploy/tests/test_oa_parse.py）。
#
# 编码是 UTF-8（页面自己声明 charset=utf-8），不要按 GBK 解码。

import re
from datetime import datetime, timedelta, timezone
from html import unescape
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
    raw = unescape(raw or "")  # 列表页"今天/昨天"用 &nbsp; 与时刻分隔，先还原成空白
    raw = SPACE_RE.sub(" ", raw).strip()
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
