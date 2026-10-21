import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";

const { sources } = JSON.parse(await readFile(resolve(import.meta.dirname, "../industry/sources.json"), "utf8")) as {
  sources: Array<{ id: string; kind: string; config: Record<string, unknown>; participation_mode: string; tier: string; site_fulltext: boolean; syndicate_fulltext: boolean }>;
};

const expected = new Map([
  ["rss-nature-materials", "https://www.nature.com/nm.rss"],
  ["rss-nature-biotechnology", "https://www.nature.com/nbt.rss"],
  ["rss-nature-methods", "https://www.nature.com/nmeth.rss"],
  ["rss-nature-physics", "https://www.nature.com/nphys.rss"],
  ["rss-nature-electronics", "https://www.nature.com/natelectron.rss"],
  ["rss-nature-sustainability", "https://www.nature.com/natsustain.rss"],
  ["rss-the-lancet", "https://www.thelancet.com/action/showFeed?type=etoc&feed=rss&jc=LANCET"],
  ["rss-bmj", "https://www.bmj.com/rss/recent.xml"],
  ["rss-nejm", "https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss"],
  ["rss-elife", "https://elifesciences.org/rss/recent.xml"],
  ["rss-physical-review-letters", "https://feeds.aps.org/rss/recent/prl.xml"],
  ["rss-science-robotics", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=scirobotics"],
  ["rss-science-advances", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv"],
  ["rss-cell-patterns", "https://www.cell.com/patterns/current.rss"],
  ["rss-molecular-cell", "https://www.cell.com/molecular-cell/current.rss"],
  ["rss-plos-biology", "https://journals.plos.org/plosbiology/feed/atom"],
  ["rss-github-trending-daily", "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml"],
  ["rss-github-trending-weekly", "https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml"],
  ["rss-andrej-karpathy", "https://karpathy.bearblog.dev/feed/"],
  ["rss-lilian-weng", "https://lilianweng.github.io/index.xml"],
  ["rss-chip-huyen", "https://huyenchip.com/feed.xml"],
  ["rss-ethan-mollick", "https://www.oneusefulthing.org/feed"],
  ["rss-nathan-lambert", "https://www.interconnects.ai/feed"],
  ["rss-sebastian-raschka", "https://magazine.sebastianraschka.com/feed"],
]);

test("approved research, trending, and author feeds have unique supported source definitions", () => {
  const ids = sources.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length, "source IDs are unique");
  assert.equal(expected.size, 24);
  for (const [id, feedUrl] of expected) {
    const source = sources.find((candidate) => candidate.id === id);
    assert.ok(source, `missing ${id}`);
    assert.equal(source.kind, "rss", id);
    assert.equal(source.config.feedUrl, feedUrl, id);
    assert.deepEqual(unsupportedConfig("rss", source.config), [], id);
    assert.equal(source.participation_mode, "editorial", id);
    assert.equal(source.site_fulltext, false, id);
    assert.equal(source.syndicate_fulltext, false, id);
    assert.ok((source.config._aihot as { initialBackfillLimit?: number } | undefined)?.initialBackfillLimit, `${id} has a bounded first import`);
  }
  for (const id of ["rss-arxiv-cs-ai"]) {
    assert.ok(sources.some((source) => source.id === id), `${id} remains in the catalog`);
  }
  assert.ok(!sources.some((source) => ["rss-cacm", "rss-jmlr"].includes(source.id)), "CACM and JMLR remain excluded");
});
