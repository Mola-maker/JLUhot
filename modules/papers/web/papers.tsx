// 论文：期刊与 arXiv 信源（`_aihot.paper`）的最新条目，按北京日分组的列表，一页 40 条，游标翻页。
// 论文独立成条，没有事件卡片；每条是标题、来源、时间和摘要，点开是文章详情页。
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
import type { Screen } from "../../../apps/web/app/components/shell/screens";

export const handle: Screen = { name: "论文" };
export { pageHeaders as headers } from "../../../apps/web/app/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const cursor = new URL(request.url).searchParams.get("cursor");
  const path = cursor ? `/api/module/papers/list?cursor=${encodeURIComponent(cursor)}` : "/api/module/papers/list";
  return cachedPage(60, { cursor, papers: await loadOr404<PapersPage>(path, { signal: request.signal }) });
}

export function meta({ loaderData }: { loaderData?: { cursor: string | null; papers: PapersPage } }) {
  return pageMeta({
    title: loaderData?.cursor ? "论文速览 · 继续浏览" : "论文速览",
    description: "Nature、Science、Cell、arXiv 等学术信源的最新论文与研究，按天列出，点开看摘要与原文。",
    path: "/papers",
    noindex: !!loaderData?.cursor,
  });
}

function PaperRow({ entry }: { entry: PapersPage["entries"][number] }) {
  const at = entry.publishedAt ?? entry.discoveredAt;
  return (
    <article className="lg:card lg:card-hover lg:px-[18px] lg:pb-[13px] lg:pt-[14px]">
      <header className="flex min-h-[18px] items-center gap-2 text-[12.5px] leading-[18px] text-ink-4">
        <span className="truncate">{entry.sourceName}</span>
        <time dateTime={at} className="mono ml-auto shrink-0 text-[12px]">
          {beijingTime(at)}
        </time>
      </header>
      <h3 className="mt-1 text-[15px] font-[650] leading-[1.5]">
        <Link to={`/items/${entry.id}`} className="text-ink transition-colors hover:text-accent">
          {entry.title}
        </Link>
      </h3>
      {entry.summary && <p className="mt-1 line-clamp-3 text-[13.5px] leading-[1.65] text-ink-3">{entry.summary}</p>}
      <footer className="mt-1.5 flex items-center gap-2">
        {entry.selected && <SelectedBadge />}
        <ScoreLabel score={entry.score} />
        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[12px] text-ink-4 transition-colors hover:text-accent">
          原文 ↗
        </a>
      </footer>
    </article>
  );
}

export default function PapersPage() {
  const { papers } = useLoaderData<typeof loader>();
  const today = beijingDate(Date.now());
  const days = byBeijingDay(papers.entries, (e) => e.publishedAt ?? e.discoveredAt);
  return (
    <div className="pb-10">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="论文" large sub="期刊与 arXiv 的最新论文与研究" />
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-accent">论文速览</div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">论文</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">Nature、Science、Cell、arXiv 等学术信源的最新论文，按天列出</p>
        </div>
        <p className="text-[12px] text-ink-4">
          每页 <span className="num">{papers.entries.length}</span> 篇 · 每分钟更新
        </p>
      </header>

      {days.length === 0 ? (
        <div className="card rounded-sheet">
          <EmptyState title="还没有论文">期刊信源还没有公开的条目，稍后再来看看。</EmptyState>
        </div>
      ) : (
        <div>
          {days.map(({ day, entries }) => (
            <section key={day} aria-label={day}>
              <div className="flex items-baseline justify-between gap-3 px-1 pb-1 pt-5 lg:pt-6">
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
