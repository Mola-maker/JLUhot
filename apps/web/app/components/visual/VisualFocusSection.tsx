import { useState, useEffect, memo } from "react";
import { Link } from "react-router";
import { SITE } from "@aihot/site";
import { IconFlame, IconMusic, IconSparkles, IconChevronDown, IconChevronUp } from "../icons";

interface VisualFocusProps {
  hotCount?: number;
}

export const VisualFocusSection = memo(function VisualFocusSection({ hotCount = 12 }: VisualFocusProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("molamaker_focus_collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("molamaker_focus_collapsed", String(next));
  };

  return (
    <section
      aria-label="全景焦点板块"
      className="mola-glass-card relative mb-6 overflow-hidden rounded-card transition-all duration-300"
    >
      {/* Background ambient glowing pink and blue orbs */}
      <div
        className="pointer-events-none absolute -left-12 -top-12 size-48 rounded-full bg-[radial-gradient(circle,rgba(246,157,203,0.3)_0%,transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(248,168,210,0.2)_0%,transparent_70%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -right-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(36,110,182,0.22)_0%,transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(114,174,230,0.18)_0%,transparent_70%)]"
        aria-hidden="true"
      />

      {/* Decorative celestial orbit from molamaker design */}
      <svg
        viewBox="0 0 540 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none absolute -right-16 -top-8 hidden h-44 w-96 opacity-60 lg:block dark:opacity-40"
        aria-hidden="true"
      >
        <ellipse
          cx="270"
          cy="90"
          rx="240"
          ry="65"
          stroke="#94bfe9"
          strokeWidth="1.2"
          strokeDasharray="6 6"
          className="animate-mola-spin-slow origin-center"
        />
        <circle cx="510" cy="90" r="4.5" fill="#f69dcb" className="animate-mola-pulse" />
        <circle cx="30" cy="90" r="3.5" fill="#246eb6" />
        <path
          d="M 120 40 Q 270 15 420 40"
          stroke="#246eb6"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>

      <div className="relative z-10 px-4 py-4 sm:px-6 sm:py-5">
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#f69dcb]/20 text-[#f69dcb] dark:bg-[#f8a8d2]/25 dark:text-[#f8a8d2]">
              <IconSparkles size={15} />
            </span>
            <div className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-ink-3">
              <span className="inline-block size-1.5 rounded-full bg-[#f69dcb] animate-ping" />
              <span>焦点视界 · MolaMaker Spotlight</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "展开焦点面板" : "收起焦点面板"}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink-2"
          >
            <span>{collapsed ? "展开" : "收起"}</span>
            {collapsed ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
          </button>
        </div>

        {/* Content Body */}
        {!collapsed && (
          <div className="mt-3.5 space-y-4">
            {/* Title & Slogan */}
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight text-ink sm:text-[23px]">
                全景汇聚{" "}
                <span className="relative inline-block text-[#246eb6] dark:text-[#72aee6]">
                  98 个优质信源
                  <svg
                    viewBox="0 0 160 12"
                    fill="none"
                    className="absolute -bottom-1 left-0 h-2.5 w-full stroke-[#f69dcb]"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M 2 8 C 40 2, 120 3, 158 7"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                ，双审模型打分精选
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3 sm:text-[14px]">
                校内通知、学院学术、科研前沿与 AI 行业资讯全天候同步 · 淡色荧光笔标注关键事实与核心依据
              </p>
            </div>

            {/* Quick Action & Feature Cards */}
            <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
              {/* Card 1: Today's News */}
              <Link
                to="/hot"
                className="group flex items-center justify-between rounded-control border border-line-soft bg-surface/75 p-3 transition-all duration-200 hover:border-[#94bfe9] hover:bg-surface hover:shadow-[0_4px_16px_rgba(36,110,182,0.08)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#c24672]/10 text-[#c24672]">
                    <IconFlame size={17} />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold text-ink group-hover:text-[#246eb6] dark:group-hover:text-[#72aee6]">
                      实时热点事件
                    </div>
                    <div className="text-[11px] text-ink-4">多来源聚类热议</div>
                  </div>
                </div>
                <span className="rounded-full bg-hot-soft px-2 py-0.5 text-[11px] font-medium text-hot">
                  TOP {hotCount}
                </span>
              </Link>

              {/* Card 2: Daily Paper & Highlights */}
              <Link
                to="/daily"
                className="group flex items-center justify-between rounded-control border border-line-soft bg-surface/75 p-3 transition-all duration-200 hover:border-[#f69dcb] hover:bg-surface hover:shadow-[0_4px_16px_rgba(246,157,203,0.12)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f69dcb]/15 text-[#f69dcb] dark:bg-[#f8a8d2]/20 dark:text-[#f8a8d2]">
                    <IconSparkles size={17} />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold text-ink group-hover:text-[#c24672] dark:group-hover:text-[#f8a8d2]">
                      吉大早报 & 简报
                    </div>
                    <div className="text-[11px] text-ink-4">每天早晨定点汇编</div>
                  </div>
                </div>
                <span className="hl-pink rounded px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
                  读得完
                </span>
              </Link>

              {/* Card 3: Music Visualizer Lounge (Folia) */}
              <Link
                to="/music"
                className="group flex items-center justify-between rounded-control border border-line-soft bg-surface/75 p-3 transition-all duration-200 hover:border-[#246eb6] hover:bg-surface hover:shadow-[0_4px_16px_rgba(36,110,182,0.12)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#246eb6]/10 text-[#246eb6] dark:bg-[#72aee6]/20 dark:text-[#72aee6]">
                    <IconMusic size={17} />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold text-ink group-hover:text-[#246eb6] dark:group-hover:text-[#72aee6]">
                      音乐视界 · Folia
                    </div>
                    <div className="text-[11px] text-ink-4">网易云 300+ 专属记录</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="inline-block w-0.5 animate-[mola-wave-bar_1.2s_ease-in-out_infinite] rounded-full bg-[#246eb6]" />
                  <span className="inline-block w-0.5 animate-[mola-wave-bar_1.5s_ease-in-out_0.2s_infinite] rounded-full bg-[#f69dcb]" />
                  <span className="inline-block w-0.5 animate-[mola-wave-bar_1.1s_ease-in-out_0.4s_infinite] rounded-full bg-[#246eb6]" />
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
});
