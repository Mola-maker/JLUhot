// 热度热力图：最近 35 个北京日 × 24 小时的在架报道数，以及当前热点榜前 10。
// 格子颜色只用 --accent 的深浅（app.css 的令牌），动画走 motion，减弱动效时跳过入场。
import { motion, useReducedMotion } from "motion/react";
import { useLoaderData } from "react-router";
import type { HeatmapHotEntry, HeatmapResponse } from "../types";
import { cachedPage, loadOr404 } from "../../../apps/web/app/lib/api.server";
import { pageReuse } from "../../../apps/web/app/lib/page-reuse";
import { pageMeta } from "../../../apps/web/app/lib/seo";
import { monthDayTime } from "../../../apps/web/app/lib/format";
import { IntentLink } from "../../../apps/web/app/components/ui/IntentLink";
import { EmptyState } from "../../../apps/web/app/components/ui/Page";
import { PhoneBar } from "../../../apps/web/app/components/shell/PhoneBar";
import type { Screen } from "../../../apps/web/app/components/shell/screens";
import { Delta } from "../../../apps/web/app/features/hot/Delta";

export const handle: Screen = { name: "热度热力图" };
export { pageHeaders as headers } from "../../../apps/web/app/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(60, { heatmap: await loadOr404<HeatmapResponse>("/api/module/heatmap/activity", { signal: request.signal }) });
}

export function meta() {
  return pageMeta({
    title: "热度热力图",
    description: "最近 35 天、每天 24 小时的发布热度（北京时间），以及当前讨论最多的 10 件事。",
    path: "/heatmap",
  });
}

/** 0 是空格子的底色；1–4 是 --accent 由浅到深。 */
const CELL_BG = [
  "var(--bg-sunk)",
  "color-mix(in srgb, var(--accent) 22%, var(--surface))",
  "color-mix(in srgb, var(--accent) 42%, var(--surface))",
  "color-mix(in srgb, var(--accent) 65%, var(--surface))",
  "color-mix(in srgb, var(--accent) 90%, var(--surface))",
];

function level(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4));
}

const HOUR_MARKS = new Set([0, 6, 12, 18]);

function Cell({ day, hour, count, max, current, delay, reduce }: {
  day: string;
  hour: number;
  count: number;
  max: number;
  current: boolean;
  delay: number;
  reduce: boolean;
}) {
  const range = `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.25, ease: "easeOut" }}
      className="group relative size-3 rounded-[3px]"
      style={{ background: CELL_BG[level(count, max)] }}
      title={`${day} ${range} · ${count} 篇`}
    >
      {current && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-0.5">
          <span className="absolute inline-flex size-full animate-ping rounded-[4px] bg-accent opacity-60" />
          <span className="absolute inline-flex size-full rounded-[4px] ring-2 ring-accent" />
        </span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 rounded-control bg-surface px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-lg ring-1 ring-line group-hover:block">
        {day} {range} · <span className="num">{count}</span> 篇
      </span>
    </motion.div>
  );
}

function Heatmap({ data }: { data: HeatmapResponse }) {
  const reduce = useReducedMotion() ?? false;
  const { grid, now } = data;
  const counts = new Map(grid.cells.map((c) => [`${c.day} ${c.hour}`, c.count]));
  return (
    <section aria-label="最近 35 天的发布热力图" className="card overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">发布节奏</h2>
        <p className="text-[12px] text-ink-4">
          最近 {grid.days.length} 天共 <span className="num">{grid.total}</span> 篇 · 北京时间
        </p>
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          <div className="flex shrink-0 flex-col gap-[3px] pt-[19px]" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex h-3 items-center justify-end pr-1 text-[9px] leading-none text-ink-4">
                {HOUR_MARKS.has(h) ? <span className="num">{h}</span> : null}
              </div>
            ))}
          </div>
          {grid.days.map((day, d) => (
            <div key={day} className="flex w-3 shrink-0 flex-col gap-[3px]">
              <div className="flex h-4 items-end justify-center text-[9px] leading-none text-ink-4" aria-hidden="true">
                {d % 5 === 0 || d === grid.days.length - 1 ? `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}` : null}
              </div>
              {Array.from({ length: 24 }, (_, h) => (
                <Cell
                  key={h}
                  day={day}
                  hour={h}
                  count={counts.get(`${day} ${h}`) ?? 0}
                  max={grid.max}
                  current={day === now.day && h === now.hour}
                  delay={reduce ? 0 : (d * 24 + h) * 0.0015}
                  reduce={reduce}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-ink-4">
        少
        {CELL_BG.map((bg) => (
          <span key={bg} className="size-3 rounded-[3px]" style={{ background: bg }} />
        ))}
        多
      </div>
    </section>
  );
}

/** 热点榜前 10：条长按热度占比，入场时依次展开。 */
function HotBars({ hot, computedAt }: { hot: HeatmapHotEntry[]; computedAt: string | null }) {
  const reduce = useReducedMotion() ?? false;
  const maxHeat = Math.max(...hot.map((e) => e.heat), 1);
  return (
    <section aria-label="当前热点榜" className="mt-6 lg:mt-7">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 className="text-[15px] font-semibold text-ink">当前热点 Top {hot.length}</h2>
        {computedAt && (
          <p className="text-[12px] text-ink-4">
            <span className="num">{monthDayTime(computedAt)}</span> 更新 · 按讨论热度排序
          </p>
        )}
      </div>
      <ol className="card divide-y divide-line-soft overflow-hidden">
        {hot.map((e, i) => (
          <li key={e.storyPublicId} className="group relative">
            <IntentLink viewTransition to={`/story/${e.storyPublicId}`} className="block px-4 py-3 transition-colors after:absolute after:inset-0 after:content-[''] hover:bg-bg-sunk/70 sm:px-5 dark:hover:bg-bg-muted/40">
              <div className="flex items-center gap-3">
                <span className="mono w-7 shrink-0 text-[13px] font-bold tracking-[0.08em] text-ink-4">{String(e.rank).padStart(2, "0")}</span>
                <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-[650] leading-[1.5] text-ink group-hover:text-accent">{e.title}</h3>
                <Delta trend={e.trend} pct={e.trendPct} />
                <span className="mono shrink-0 text-[17px] font-semibold leading-none text-ink">{Math.round(e.heat)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 pl-10">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-sunk dark:bg-bg-muted/60">
                  <motion.div
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: e.heat / maxHeat }}
                    transition={{ delay: reduce ? 0 : 0.15 + i * 0.06, duration: 0.6, ease: "easeOut" }}
                    className="h-full w-full origin-left rounded-full"
                    style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 45%, var(--surface)), var(--accent))" }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-ink-4">热度指数</span>
              </div>
            </IntentLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function HeatmapPage() {
  const { heatmap } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <PhoneBar title="热力图" large sub={`最近 ${heatmap.grid.days.length} 天 × 24 小时的发布热度（北京时间）`} />
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-accent">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-30" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            站点活跃度
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">热度热力图</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">最近 {heatmap.grid.days.length} 天 × 24 小时的发布热度（北京时间），颜色越深报道越多</p>
        </div>
        <p className="text-[12px] text-ink-4">
          数据于 <span className="num">{monthDayTime(heatmap.generatedAt)}</span> 生成 · 每分钟更新
        </p>
      </header>

      {heatmap.grid.total === 0 ? (
        <div className="card rounded-sheet">
          <EmptyState title="暂时没有数据">最近 35 天还没有公开的报道。</EmptyState>
        </div>
      ) : (
        <Heatmap data={heatmap} />
      )}
      {heatmap.hot.length > 0 && <HotBars hot={heatmap.hot} computedAt={heatmap.hotComputedAt} />}
    </div>
  );
}
