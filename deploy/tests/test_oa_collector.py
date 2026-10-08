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
            server.server_close()

    def test_a_single_chunk_is_not_split(self):
        server, base = stub()
        try:
            oa.push_all(base, "token", "src", "name", [{"title": "only", "url": "https://oa.jlu.edu.cn/1"}], oa.Pacer(per_minute=1000))
            self.assertEqual([len(b) for b in server.batches], [1])
        finally:
            server.shutdown()
            server.server_close()

    def test_retries_the_same_chunk_after_a_rate_limit(self):
        server, base = stub(replies=[429])
        try:
            items = [{"title": "a", "url": "https://oa.jlu.edu.cn/1"}, {"title": "b", "url": "https://oa.jlu.edu.cn/2"}]
            created = oa.push_all(base, "token", "src", "name", items, oa.Pacer(per_minute=1000))
            self.assertEqual(server.batches, [["a", "b"], ["a", "b"]])  # 同一批重试，一条不丢
            self.assertEqual(created, 2)  # 只算成功的那一次
        finally:
            server.shutdown()
            server.server_close()

    def test_a_non_rate_limit_error_is_not_retried(self):
        server, base = stub(replies=[400])
        try:
            with self.assertRaises(Exception):
                oa.push_all(base, "token", "src", "name", [{"title": "a", "url": "https://oa.jlu.edu.cn/1"}], oa.Pacer(per_minute=1000))
            self.assertEqual(len(server.batches), 1)
        finally:
            server.shutdown()
            server.server_close()


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
            server.server_close()

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
            server.server_close()

    def test_a_page_with_no_items_is_an_error(self):
        """整页解析不出条目 = 页面结构变了，要吵，不能安静地当成空频道。"""
        server, url = list_stub(["<html><body>改版了</body></html>"])
        try:
            with self.assertRaises(RuntimeError):
                oa.collect_channel("179577", TODAY, CUTOFF, list_url=url)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
