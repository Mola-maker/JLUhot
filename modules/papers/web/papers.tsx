// 论文：期刊与 arXiv 信源（`_aihot.paper`）的最新条目，按北京日分组的列表，一页 40 条，游标翻页。
// 支持按分类、精选、期刊与关键词搜索与筛选，半天更新一次。
import { useState, useMemo } from "react";
import { Link, useLoaderData } from "react-router";
import type { PapersPage } from "../types";
import { beijingDate, beijingTime, monthDay } from "@aihot/contracts/time";
import { byBeijingDay } from "../../../apps/web/app/lib/format";
import { cachedPage, loadOr404 } from "../../../apps/web/app/lib/api.server";
import { pageReuse } from "../../../apps/web/app/lib/page-reuse";
import { pageMeta } from "../../../apps/web/app/lib/seo";
import { EmptyState } from "../../../apps/web/app/components/ui/Page";
import { PhoneBar } from "../../../apps/web/app/components/shell/PhoneBar";
import { SelectedBadge } from "../../../apps/web/app/components/ui/Badge";
import { ScoreLabel } from "../../../apps/web/app/components/ui/Score";
import { HighlighterText } from "../../../apps/web/app/components/ui/HighlighterText";
import { IconSearch, IconSparkles } from "../../../apps/web/app/components/icons";
import type { Screen } from "../../../apps/web/app/components/shell/screens";

export const handle: Screen = { name: "论文" };
export { pageHeaders as headers } from "../../../apps/web/app/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const cursor = new URL(request.url).searchParams.get("cursor");
  const path = cursor ? `/api/module/papers/list?cursor=${encodeURIComponent(cursor)}` : "/api/module/papers/list";
  // Cache for 12 hours (43200 seconds / half day)
  return cachedPage(43200, { cursor, papers: await loadOr404<PapersPage>(path, { signal: request.signal }) });
}

export function meta({ loaderData }: { loaderData?: { cursor: string | null; papers: PapersPage } }) {
  return pageMeta({
    title: loaderData?.cursor ? "论文速览 · 继续浏览" : "论文速览 · 前沿科研精选",
    description: "Nature、Science、Cell、arXiv 等学术信源的前沿论文与科研成果，支持分类搜索与筛选，每半天同步更新。",
    path: "/papers",
    noindex: !!loaderData?.cursor,
  });
}

type PaperCategory = "all" | "selected" | "general" | "cs_ai" | "life_med" | "physics_mat";

interface CategoryDef {
  key: PaperCategory;
  label: string;
  match: (entry: PapersPage["entries"][number]) => boolean;
}

const CATEGORIES: CategoryDef[] = [
  { key: "all", label: "全部论文", match: () => true },
  { key: "selected", label: "精选高分", match: (e) => !!e.selected || (e.score !== null && e.score >= 80) },
  {
    key: "general",
    label: "综合顶刊",
    match: (e) => /nature$|science$|pnas/i.test(e.sourceName),
  },
  {
    key: "cs_ai",
    label: "计算机 & AI",
    match: (e) => /arxiv|machine|patterns|robotics|ai|intelligence/i.test(e.sourceName + " " + e.title),
  },
  {
    key: "life_med",
    label: "生命与医学",
    match: (e) => /cell|lancet|nejm|elife|bio|med|health/i.test(e.sourceName),
  },
  {
    key: "physics_mat",
    label: "物理与材料",
    match: (e) => /physic|material|sustain|electronic/i.test(e.sourceName),
  },
];

function PaperRow({ entry }: { entry: PapersPage["entries"][number] }) {
  const at = entry.publishedAt ?? entry.discoveredAt;
  return (
    <article className="lg:card lg:card-hover lg:px-[18px] lg:pb-[13px] lg:pt-[14px]">
      <header className="flex min-h-[18px] items-center gap-2 text-[12.5px] leading-[18px] text-ink-4">
        <span className="truncate font-medium text-ink-3">{entry.sourceName}</span>
        <time dateTime={at} className="mono ml-auto shrink-0 text-[12px]">
          {beijingTime(at)}
        </time>
      </header>
      <h3 className="mt-1 text-[15px] font-[650] leading-[1.5]">
        <Link to={`/items/${entry.id}`} className="text-ink transition-colors hover:text-accent">
          <HighlighterText text={entry.title} />
        </Link>
      </h3>
      {entry.summary && (
        <p className="mt-1 line-clamp-3 text-[13.5px] leading-[1.65] text-ink-3">
          <HighlighterText text={entry.summary} />
        </p>
      )}
      <footer className="mt-1.5 flex items-center gap-2">
        {entry.selected && <SelectedBadge />}
        <ScoreLabel score={entry.score} />
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-[12px] text-ink-4 transition-colors hover:text-accent"
        >
          原文 ↗
        </a>
      </footer>
    </article>
  );
}

export default function PapersPage() {
  const { papers } = useLoaderData<typeof loader>();
  const today = beijingDate(Date.now());

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<PaperCategory>("all");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Available sources list with counts
  const sourceStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of papers.entries) {
      counts.set(e.sourceName, (counts.get(e.sourceName) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [papers.entries]);

  // Filtered papers
  const filteredEntries = useMemo(() => {
    let list = papers.entries;

    // 1. Category filter
    const catDef = CATEGORIES.find((c) => c.key === activeCategory);
    if (catDef && catDef.key !== "all") {
      list = list.filter(catDef.match);
    }

    // 2. Specific source filter
    if (selectedSource) {
      list = list.filter((e) => e.sourceName === selectedSource);
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.originalTitle && e.originalTitle.toLowerCase().includes(q)) ||
          (e.summary && e.summary.toLowerCase().includes(q)) ||
          e.sourceName.toLowerCase().includes(q)
      );
    }

    return list;
  }, [papers.entries, activeCategory, selectedSource, searchQuery]);

  const days = byBeijingDay(filteredEntries, (e) => e.publishedAt ?? e.discoveredAt);

  return (
    <div className="pb-10">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="论文" large sub="期刊与 arXiv 的最新论文与研究" />

      {/* Header section with half-day update banner */}
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-4 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-accent">
            <IconSparkles size={13} className="text-[#f69dcb]" />
            <span>前沿科研 · 学术论文速览</span>
          </div>
          <h1 className="mt-1 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">
            论文精选
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            追踪 Nature、Science、Cell、arXiv 等学术信源最新学术进展，按天列出
          </p>
        </div>
        <p className="text-[12px] text-ink-4">
          每页 <span className="num">{papers.entries.length}</span> 篇 ·{" "}
          <span className="hl-pink rounded px-1.5 py-0.5 font-medium text-ink">每半天更新</span>
        </p>
      </header>

      {/* Search and Classification Toolbar */}
      <div className="mb-5 space-y-3 rounded-sheet border border-line bg-surface p-3.5 shadow-sm">
        {/* Search Input Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <IconSearch size={14} className="pointer-events-none absolute left-3 top-2.5 text-ink-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索论文标题、关键词、期刊或摘要..."
              className="h-9 w-full rounded-full border border-line bg-bg pl-8 pr-8 text-[13px] text-ink placeholder:text-ink-4 focus:border-[#246eb6] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="清空搜索"
                className="absolute right-2.5 top-2 size-5 text-[11px] text-ink-4 hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-[12px] text-ink-4 sm:text-right">
            筛选出 <span className="mono font-bold text-accent">{filteredEntries.length}</span> / {papers.entries.length} 篇
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                setActiveCategory(cat.key);
                setSelectedSource(null);
              }}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                activeCategory === cat.key && !selectedSource
                  ? "bg-[#246eb6] text-white shadow-sm dark:bg-[#72aee6] dark:text-[#111c30]"
                  : "bg-bg-sunk text-ink-3 hover:bg-line hover:text-ink"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Top Journal Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-ink-4">来源期刊：</span>
          {sourceStats.slice(0, 8).map((src) => {
            const isSelected = selectedSource === src.name;
            return (
              <button
                key={src.name}
                type="button"
                onClick={() => setSelectedSource(isSelected ? null : src.name)}
                className={`rounded-control px-2 py-0.5 text-[11px] transition-colors ${
                  isSelected
                    ? "bg-[#f69dcb] font-semibold text-[#163f70]"
                    : "border border-line bg-bg text-ink-4 hover:border-[#94bfe9] hover:text-ink"
                }`}
              >
                {src.name} ({src.count})
              </button>
            );
          })}
          {selectedSource && (
            <button
              type="button"
              onClick={() => setSelectedSource(null)}
              className="text-[11px] text-accent underline hover:opacity-80"
            >
              重置期刊
            </button>
          )}
        </div>
      </div>

      {/* Paper Listing by Day */}
      {papers.entries.length === 0 ? (
        <div className="card rounded-sheet">
          <EmptyState title="还没有论文">期刊信源还没有公开的条目，稍后再来看看。</EmptyState>
        </div>
      ) : days.length === 0 ? (
        <div className="card rounded-sheet">
          <EmptyState title="未找到匹配的论文">没有符合当前搜索或筛选条件的论文，请尝试调整关键词或重置筛选。</EmptyState>
        </div>
      ) : (
        <div>
          {days.map(({ day, entries }) => (
            <section key={day} aria-label={day}>
              <div className="flex items-baseline justify-between gap-3 px-1 pb-1 pt-4 lg:pt-5">
                <h2 className="text-[14px] font-semibold text-ink-2">
                  {day === today ? "今天" : monthDay(day, today)}
                  <span className="mono ml-2 text-[12px] font-normal text-ink-4">{entries.length} 篇</span>
                </h2>
              </div>
              <ol className="space-y-3 lg:space-y-0 lg:pt-1">
                {entries.map((e) => (
                  <li key={e.id}>
                    <PaperRow entry={e} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {/* Pagination Navigation */}
      {(papers.nextCursor || papers.entries.length === 0) && (
        <nav aria-label="翻页" className="mt-6 flex items-center justify-center gap-3">
          {papers.nextCursor && (
            <Link
              to={`/papers?cursor=${encodeURIComponent(papers.nextCursor)}`}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-[14px] text-ink-2 transition-colors hover:border-ink-4 hover:text-ink lg:h-9 lg:px-4 lg:text-[13px]"
            >
              更早的论文
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
