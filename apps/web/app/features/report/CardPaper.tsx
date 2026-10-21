import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion, MotionConfig, useScroll, useSpring } from "motion/react";
import type { ReportCitation, ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { Badge } from "../../components/ui/Badge";
import { SourceAvatar } from "../../components/ui/SourceAvatar";
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconChevronDown, IconSparkles } from "../../components/icons";
import { Kicker } from "../../components/ui/Kicker";
import { monthDay } from "../../lib/format";
import { useEntrance } from "../../lib/hydration";
import { KIND_LABEL, dateMark, metricItems, neighbourLabel, reportPath, shortDay } from "./format";

const keyOf = (c: ReportCitation) => c.itemId ?? c.title;
const anchorOf = (c: ReportCitation) => c.itemId ? `r-${c.itemId}` : undefined;
const WITHDRAWN_NOTE = "该内容已按来源方要求下架或调整展示方式。";

interface Page {
  id: string;
  label: string;
  summary: string | null;
  items: ReportCitation[];
}

function leadStoryOf(report: ReportDetail): ReportCitation | null {
  if (!report.leadItemId) return null;
  return report.sections.flatMap((s) => s.items).find((c) => c.itemId === report.leadItemId && c.available) ?? null;
}

function pagesOf(report: ReportDetail, lead: ReportCitation | null): Page[] {
  const seen = new Set<string>(lead ? [keyOf(lead)] : []);
  return report.sections.map((section, i) => ({
    id: `s-${i + 1}`,
    label: section.label,
    summary: section.summary,
    items: section.items.filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  })).filter((page) => page.items.length > 0);
}

function SourceLine({ item, large = false }: { item: ReportCitation; large?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
      <SourceAvatar name={item.sourceName} iconUrl={item.sourceIconUrl} iconSrcSet={item.sourceIconSrcSet} size={large ? 20 : 16} />
      <span className="truncate">{item.sourceName}</span>
      {item.firstParty && <Badge tone="accent">一手</Badge>}
    </span>
  );
}

function OriginalLink({ item }: { item: ReportCitation }) {
  return <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`阅读${item.sourceName}原文：${item.title}（新标签页）`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:border-accent/50 hover:text-accent">阅读原文 <IconArrowUpRight size={13} /></a>;
}

function Reveal({ children, delay = 0, className = "", id }: { children: React.ReactNode; delay?: number; className?: string; id?: string }) {
  const entrance = useEntrance();
  return (
    <motion.div
      id={id}
      initial={entrance ? { opacity: 0, y: 34, scale: 0.97, filter: "blur(8px)" } : false}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.68, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >{children}</motion.div>
  );
}

function CitationCard({ item, index, lead = false }: { item: ReportCitation; index: number; lead?: boolean }) {
  const entrance = useEntrance();
  return (
    <motion.article
      id={anchorOf(item)}
      initial={entrance ? { opacity: 0, y: 42, rotateX: 7, scale: 0.965 } : false}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.72, delay: Math.min(index * 0.075, 0.36), ease: [0.16, 1, 0.3, 1] }}
      whileHover={item.available ? { y: -9, rotateX: -1.5, rotateY: 1.4, scale: 1.012, transition: { duration: 0.24 } } : undefined}
      style={{ transformPerspective: 1100 }}
      className={`group relative flex min-h-[220px] scroll-mt-28 flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-5 shadow-[0_8px_30px_rgba(20,34,62,0.045)] transition-shadow hover:shadow-[0_24px_60px_rgba(34,68,125,0.14)] @[640px]:p-6 ${lead ? "min-h-[190px]" : ""} ${item.available ? "" : "opacity-70"}`}
    >
      {item.available && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left bg-gradient-to-r from-accent via-sky-400 to-transparent" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: Math.min(index * 0.075, 0.36) + 0.18 }} />}
      <div className="flex min-w-0 items-center gap-2">
        <SourceLine item={item} />
        {!!item.otherSources && <span className="hidden text-[11px] text-ink-4 @[420px]:inline">另有 {item.otherSources} 家报道</span>}
        {item.followUp && <Badge title={`${monthDay(item.followUp)}的日报报道过这件事，这里是新进展`}>跟进</Badge>}
        {item.publishedAt && <span className="num ml-auto shrink-0 text-[11px] text-ink-4">{shortDay(item.publishedAt)}</span>}
      </div>
      {item.available ? (
        <>
          <h3 className={`mt-5 font-bold leading-[1.48] tracking-[-0.025em] text-ink [overflow-wrap:anywhere] [text-wrap:pretty] ${lead ? "text-[20px] @[640px]:text-[24px]" : "text-[17px] @[640px]:text-[19px]"}`}>
            {item.itemId ? <Link viewTransition to={`/items/${item.itemId}`} className="transition-colors group-hover:text-accent">{item.title}</Link> : item.title}
          </h3>
          {item.summary && <p className="mt-3 line-clamp-4 text-[14px] leading-[1.85] text-ink-2 @[640px]:text-[14.5px]">{item.summary}</p>}
          {!!item.related?.length && <ul className="mt-3 space-y-2 border-l-2 border-accent/20 pl-3">{item.related.slice(0, 3).map((related) => <li key={keyOf(related)} className="text-[12px] leading-relaxed text-ink-3">{related.available && related.itemId ? <Link to={`/items/${related.itemId}`} className="hover:text-accent">{related.title}</Link> : <span className="line-through">{related.title}</span>}{related.available && <span className="ml-2 text-ink-4">{related.sourceName}</span>}</li>)}</ul>}
          <div className="mt-auto flex items-end justify-between gap-3 pt-5"><OriginalLink item={item} /><span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent transition-transform duration-300 group-hover:translate-x-1"><IconArrowUpRight size={15} /></span></div>
        </>
      ) : (
        <p className="mt-5 text-[13px] leading-relaxed text-ink-4"><span className="line-through">{item.title}</span><br />{WITHDRAWN_NOTE}</p>
      )}
      {item.available && <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-8 size-32 rounded-full bg-accent/5 blur-2xl transition-all duration-500 group-hover:bg-accent/15 group-hover:blur-3xl" />}
    </motion.article>
  );
}

function FlashList({ report }: { report: ReportDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal id="s-flash" className="scroll-mt-28">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_8px_30px_rgba(20,34,62,0.04)]">
        <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 p-5 marker:hidden @[640px]:p-6">
          <span className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent"><IconSparkles size={20} /></span><span><span className="block text-[17px] font-bold text-ink">一句话速览</span><span className="mt-1 block text-[12px] text-ink-4">{report.flashes.length} 条快讯</span></span></span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="text-ink-4"><IconChevronDown size={18} /></motion.span>
        </summary>
        <ul className="grid gap-x-8 border-t border-line px-5 pb-5 @[640px]:grid-cols-2 @[640px]:px-6">
          {report.flashes.map((item, i) => <motion.li key={`${keyOf(item)}-${i}`} initial={{ opacity: 0, x: -18 }} animate={{ opacity: open ? 1 : 0, x: open ? 0 : -18 }} transition={{ duration: 0.28, delay: open ? Math.min(i * 0.035, 0.4) : 0 }} className="flex min-w-0 gap-3 border-b border-line py-3 text-[13px] leading-[1.7]">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span className="min-w-0">{!item.available ? <span className="text-ink-4"><span className="line-through">{item.title}</span> · {WITHDRAWN_NOTE}</span> : item.itemId ? <Link viewTransition to={`/items/${item.itemId}`} className="text-ink hover:text-accent">{item.title}</Link> : <span className="text-ink">{item.title}</span>}{item.available && <span className="ml-2 text-[11px] text-ink-4">{item.sourceName}</span>}</span>
          </motion.li>)}
        </ul>
      </details>
    </Reveal>
  );
}

export function CardPaper({ report, index }: { report: ReportDetail; index: ReportNavigationEntry[] }) {
  const entrance = useEntrance();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, restDelta: 0.001 });
  const leadStory = leadStoryOf(report);
  const pages = pagesOf(report, leadStory);
  const lead = report.lead;
  const highlights = report.highlights.filter((item) => !leadStory || keyOf(item) !== keyOf(leadStory)).slice(0, 3);
  const pageItems = new Set(pages.flatMap((page) => page.items.map((item) => item.itemId)).filter(Boolean));
  const pageIndex = [...pages.map((page, i) => ({ id: page.id, label: page.label, count: page.items.length, mark: String(i + 1).padStart(2, "0") })), ...(report.flashes.length ? [{ id: "s-flash", label: "一句话速览", count: report.flashes.length, mark: String(pages.length + 1).padStart(2, "0") }] : [])];
  const mark = dateMark("daily", report.key);
  const [brokenCover, setBrokenCover] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(pageIndex[0]?.id ?? "");
  const cover = report.cover && report.cover.url !== brokenCover ? report.cover : null;
  const metrics = metricItems(report.metrics);

  useEffect(() => {
    const nodes = pageIndex.map((entry) => document.getElementById(entry.id)).filter((node): node is HTMLElement => !!node);
    if (!nodes.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [report.key]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="@container relative pb-8">
        <motion.div aria-hidden="true" className="fixed inset-x-0 top-0 z-[75] h-[3px] origin-left bg-gradient-to-r from-accent via-sky-400 to-indigo-500" style={{ scaleX: progress }} />
        <div className="grid gap-5 @[1080px]:grid-cols-[minmax(0,1fr)_220px] @[1280px]:gap-8">
          <article className="min-w-0">
            <Reveal id="report-start" className="scroll-mt-24">
              <header className="relative isolate overflow-hidden rounded-[30px] border border-line bg-surface p-5 shadow-[0_16px_55px_rgba(26,53,102,0.08)] @[640px]:p-8 @[880px]:p-10">
                <motion.div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 -z-10 size-[360px] rounded-full bg-accent/10 blur-[85px]" animate={{ x: [0, -30, 0], y: [0, 24, 0], scale: [1, 1.12, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
                <motion.div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-1/3 -z-10 size-[300px] rounded-full bg-sky-400/10 blur-[80px]" animate={{ x: [0, 38, 0], y: [0, -20, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 0.7 }} />
                <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-4"><span className="num">{mark.top} {Number(report.key.slice(8, 10))} 日 · {mark.bottom}</span><span>{withSubject(KIND_LABEL.daily)} · 第 {report.issueNumber} 期</span></div>
                <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
                  <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft/70 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-accent"><motion.span animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.16, 1] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2 }}><IconSparkles size={14} /></motion.span>灵动日报 · 今日观察</div>
                    <motion.h1 initial={entrance ? { opacity: 0, y: 22, filter: "blur(8px)" } : false} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }} className="mt-5 text-[32px] font-black leading-[1.18] tracking-[-0.045em] text-ink [text-wrap:balance] @[520px]:text-[44px] @[880px]:text-[56px]">{lead?.title ?? report.title}</motion.h1>
                    {lead?.leadParagraph && <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }} className="mt-5 max-w-[48em] text-[15px] leading-[1.9] text-ink-2 @[640px]:text-[17px]">{lead.leadParagraph}</motion.p>}
                    {leadStory && <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2"><SourceLine item={leadStory} large />{!!leadStory.otherSources && <span className="text-[12px] text-ink-4">另有 {leadStory.otherSources} 家信源报道</span>}{leadStory.followUp && <Badge>跟进</Badge>}<OriginalLink item={leadStory} /></div>}
                  </div>
                  <motion.div initial={{ opacity: 0, rotate: -8, scale: 0.8 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 180, damping: 16, delay: 0.24 }} className="relative grid size-[92px] shrink-0 place-items-center rounded-[26px] border border-accent/20 bg-accent-soft/65 text-accent @[640px]:size-[118px]">
                    <motion.span aria-hidden="true" className="absolute inset-1 rounded-[22px] border border-accent/25" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} />
                    <span className="relative text-center"><span className="num block text-[40px] font-black leading-none tracking-[-0.07em] @[640px]:text-[52px]">{mark.figure}</span><span className="mt-2 block text-[10px] font-semibold tracking-[0.18em]">{mark.bottom}</span></span>
                  </motion.div>
                </div>
                {cover && <motion.figure initial={entrance ? { opacity: 0, y: 24, scale: 0.98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.42 }} className="mt-7 overflow-hidden rounded-[24px] border border-line bg-bg-sunk">
                  <div className="max-h-[460px] overflow-hidden"><motion.img src={cover.url} srcSet={cover.srcSet} alt={cover.caption ?? ""} width={cover.width ?? undefined} height={cover.height ?? undefined} loading="eager" fetchPriority="high" decoding="async" onError={() => setBrokenCover(cover.url)} whileHover={{ scale: 1.035 }} transition={{ duration: 0.8 }} className="max-h-[460px] min-h-40 w-full object-cover" /></div>
                  {cover.caption && <figcaption className="px-4 py-2.5 text-[11px] text-ink-4">{cover.caption}</figcaption>}
                </motion.figure>}
                {!!metrics.length && <div className="mt-7 grid grid-cols-2 gap-2 border-t border-line pt-5 @[520px]:grid-cols-4 @[880px]:gap-3">{metrics.slice(0, 4).map((metric, i) => <motion.div key={metric.unit} initial={entrance ? { opacity: 0, y: 18, scale: 0.88 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 180, damping: 17, delay: 0.38 + i * 0.09 }} className="rounded-2xl bg-bg-sunk/70 px-3 py-3 @[640px]:px-4"><span className="num block text-[25px] font-black leading-none tracking-[-0.04em] text-ink @[640px]:text-[30px]">{metric.value}</span><span className="mt-2 block text-[11px] text-ink-4">{metric.unit}</span></motion.div>)}</div>}
                <div className="mt-5 flex items-center justify-between gap-3 text-[11px] text-ink-4"><span>约 {report.readingMinutes} 分钟读完</span><span>编辑系统根据公开信源整理 · 每条均可追溯</span></div>
              </header>
            </Reveal>

            {highlights.length > 0 && <section aria-label="今日看点" className="mt-8 @[640px]:mt-10">
              <Reveal><div className="mb-4 flex items-end justify-between gap-4"><div><Kicker>今日看点</Kicker><h2 className="mt-2 text-[24px] font-black tracking-[-0.03em] text-ink @[640px]:text-[30px]">值得先读的几件事</h2></div><span className="hidden text-[12px] text-ink-4 @[520px]:inline">向侧滑动，继续发现 <IconArrowRight size={13} className="inline" /></span></div></Reveal>
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-5 scrollbar-none @[640px]:mx-0 @[640px]:grid @[640px]:grid-cols-3 @[640px]:overflow-visible @[640px]:px-0">
                {highlights.map((item, i) => {
                  const inPage = !!item.itemId && pageItems.has(item.itemId);
                  const target = anchorOf(item) && inPage ? `#${anchorOf(item)}` : item.itemId ? `/items/${item.itemId}` : item.sourceUrl;
                  const content = <><span className="flex items-center justify-between"><span className="num text-[12px] font-black tracking-[0.16em] text-accent">0{i + 1} / SIGNAL</span><motion.span aria-hidden="true" animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }} className="text-accent/60"><IconSparkles size={17} /></motion.span></span><span className="mt-6 block line-clamp-3 text-[17px] font-bold leading-[1.55] text-ink">{item.title}</span><span className="mt-auto block truncate pt-5 text-[11px] text-ink-4">{item.sourceName}</span><span className="absolute bottom-0 left-0 h-1 w-full origin-left bg-gradient-to-r from-accent via-sky-400 to-indigo-400" /> </>;
                  return <motion.div key={keyOf(item)} initial={entrance ? { opacity: 0, y: 46, rotate: i % 2 ? 2.5 : -2.5, scale: 0.9 } : false} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.26 + i * 0.13 }} whileHover={{ y: -8, rotate: i % 2 ? 1 : -1, scale: 1.025 }} className="relative min-h-[188px] w-[82vw] max-w-[340px] shrink-0 snap-center overflow-hidden rounded-[24px] border border-line bg-surface p-5 shadow-[0_12px_40px_rgba(30,54,99,0.07)] @[640px]:w-auto @[640px]:max-w-none">{item.available ? inPage ? <a href={target} className="absolute inset-0 flex flex-col p-5">{content}</a> : item.itemId ? <Link viewTransition to={target} className="absolute inset-0 flex flex-col p-5">{content}</Link> : <a href={target} target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex flex-col p-5">{content}</a> : <div className="flex h-full flex-col opacity-60">{content}<span className="mt-2 text-[10px] text-ink-4">{WITHDRAWN_NOTE}</span></div>}</motion.div>;
                })}
              </div>
            </section>}

            {!!pageIndex.length && <Reveal className="mt-4 @[1080px]:hidden"><nav aria-label="本期版面" className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">{pageIndex.map((entry) => <a key={entry.id} href={`#${entry.id}`} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[12px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent"><span className="num font-bold text-accent">{entry.mark}</span>{entry.label}<span className="num text-ink-4">{entry.count}</span></a>)}</nav></Reveal>}

            <div className="mt-10 space-y-8 @[640px]:mt-14 @[640px]:space-y-10">
              {pages.map((page, pageNo) => <section key={page.id} id={page.id} aria-labelledby={`${page.id}-title`} className="scroll-mt-24">
                <Reveal><header className="relative mb-4 overflow-hidden rounded-[24px] border border-line bg-surface p-5 @[640px]:mb-5 @[640px]:p-6"><motion.span aria-hidden="true" className="absolute -right-8 -top-14 size-40 rounded-full border border-accent/15" animate={{ rotate: 360, scale: [1, 1.12, 1] }} transition={{ rotate: { duration: 24, repeat: Infinity, ease: "linear" }, scale: { duration: 5, repeat: Infinity, ease: "easeInOut" } }} /><div className="relative flex items-center gap-3"><span className="num grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-[17px] font-black text-accent-contrast shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)]">{String(pageNo + 1).padStart(2, "0")}</span><div className="min-w-0"><span className="block text-[10px] font-bold tracking-[0.2em] text-accent">BRIEFING / {String(pageNo + 1).padStart(2, "0")}</span><h2 id={`${page.id}-title`} className="mt-1 text-[23px] font-black tracking-[-0.03em] text-ink @[640px]:text-[28px]">{page.label}</h2></div><span className="num ml-auto shrink-0 rounded-full bg-bg-sunk px-3 py-1.5 text-[11px] text-ink-4">{page.items.length} 条</span></div>{page.summary && <p className="relative mt-4 border-l-2 border-accent/35 pl-4 text-[13.5px] leading-[1.8] text-ink-2">{page.summary}</p>}</header></Reveal>
                <div className="grid gap-3 @[640px]:grid-cols-2 @[640px]:gap-4">{page.items.map((item, i) => <CitationCard key={keyOf(item)} item={item} index={i} />)}</div>
              </section>)}
              {report.flashes.length > 0 && <FlashList report={report} />}
            </div>

            <nav aria-label="前后日报" className="mt-10 grid grid-cols-2 overflow-hidden rounded-[24px] border border-line bg-surface @[640px]:mt-14">
              {report.prev ? <Link viewTransition to={reportPath("daily", report.prev)} className="group flex min-h-24 flex-col justify-center gap-2 p-4 transition-colors hover:bg-accent-softer @[640px]:p-6"><span className="inline-flex items-center gap-1 text-[11px] text-ink-4"><IconArrowLeft size={13} />{neighbourLabel("daily", report.prev, "prev")}</span><span className="text-[14px] font-bold text-ink transition-colors group-hover:text-accent">{index.find((entry) => entry.key === report.prev)?.title ?? report.prev}</span></Link> : <span />}
              {report.next ? <Link viewTransition to={reportPath("daily", report.next)} className="group flex min-h-24 flex-col items-end justify-center gap-2 border-l border-line p-4 text-right transition-colors hover:bg-accent-softer @[640px]:p-6"><span className="inline-flex items-center gap-1 text-[11px] text-ink-4">{neighbourLabel("daily", report.next, "next")}<IconArrowRight size={13} /></span><span className="text-[14px] font-bold text-ink transition-colors group-hover:text-accent">{index.find((entry) => entry.key === report.next)?.title ?? report.next}</span></Link> : <span className="border-l border-line" />}
            </nav>
            <footer className="py-8 text-center"><div className="text-[12px] font-semibold tracking-[0.4em] text-ink-4">（本期完）</div><p className="mt-3 text-[11px] leading-relaxed text-ink-4">{SITE.name} 日报由编辑系统根据公开来源自动编辑，每条均附原文</p></footer>
          </article>

          {!!pageIndex.length && <aside className="hidden @[1080px]:block"><nav aria-label="本期栏目" className="sticky top-20 rounded-[22px] border border-line bg-surface/90 p-4 shadow-[0_8px_30px_rgba(20,34,62,0.04)] backdrop-blur"><div className="mb-3 text-[10px] font-bold tracking-[0.18em] text-ink-4">TODAY / INDEX</div><ol className="space-y-1">{pageIndex.map((entry) => <li key={entry.id}><a href={`#${entry.id}`} aria-current={activeSection === entry.id ? "location" : undefined} className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] transition-colors hover:bg-accent-soft hover:text-accent ${activeSection === entry.id ? "bg-accent-soft text-accent" : "text-ink-3"}`}><span className="num text-[10px] font-bold text-accent">{entry.mark}</span><span className="min-w-0 flex-1 truncate">{entry.label}</span><span className="num text-[10px] text-ink-4">{entry.count}</span></a></li>)}</ol><div className="mt-4 border-t border-line pt-3 text-[10px] text-ink-4">滚动浏览 · 进度同步</div></nav></aside>}
        </div>
      </div>
    </MotionConfig>
  );
}
