// Day headers of the timeline (features/feed/Timeline.tsx). Failure case: an item imported from an archive, dated
// 2019-02-19, sits under a header reading "2月19日", and readers take it for this year's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monthDay } from "@aihot/contracts/time";

test("a day of today's year has no year; another year's carries it", () => {
  assert.equal(monthDay("2026-10-05", "2026-10-19"), "10月5日");
  assert.equal(monthDay("2019-02-19", "2026-10-19"), "2019年2月19日");
  assert.equal(monthDay("2025-12-31", "2026-01-01"), "2025年12月31日");
});

test("without today, as everywhere else, it stays month and day", () => {
  assert.equal(monthDay("2019-02-19"), "2月19日");
});
