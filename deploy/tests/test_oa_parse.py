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
