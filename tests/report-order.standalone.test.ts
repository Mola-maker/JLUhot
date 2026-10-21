import assert from "node:assert/strict";
import { test } from "node:test";
import { SECTION_ORDER, SECTION_OF, dailyImportance } from "@aihot/backend/reports/edition";

test("daily issue sections lead with academic and future intelligence", () => {
  assert.deepEqual(SECTION_ORDER.slice(0, 3), ["学术前沿", "未来智能", "学校要闻"]);
  assert.equal(SECTION_OF.research, "学术前沿");
  assert.equal(SECTION_OF.ai, "未来智能");
});

test("daily importance gives research and future intelligence a modest lead bonus", () => {
  const common = { score: 70, participants: 0, official: false, followUp: false };
  assert.equal(dailyImportance({ ...common, category: "research" }) - dailyImportance({ ...common, category: "campus" }), 8);
  assert.equal(dailyImportance({ ...common, category: "ai" }) - dailyImportance({ ...common, category: "campus" }), 8);
  assert.equal(dailyImportance({ ...common, category: "notices" }), dailyImportance({ ...common, category: "campus" }));
});
