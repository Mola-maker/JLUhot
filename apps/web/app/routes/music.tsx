import { useState, useMemo } from "react";
import type { Route } from "./+types/music";
import { pageMeta, siteLd } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { useMusic } from "../features/music/music-context";
import { FoliaCanvas } from "../features/music/FoliaCanvas";
import type { VisualizerMode, MusicTrack } from "../features/music/types";
import {
  IconPlay,
  IconPause,
  IconSkipForward,
  IconSkipBack,
  IconVolume,
  IconVolumeX,
  IconSearch,
  IconSparkles,
  IconExternal,
} from "../components/icons";

export const handle: Screen = { tab: "music", name: "音乐视界" };

export function meta() {
  return pageMeta({
    path: "/music",
    title: "音乐视界 · Folia 视觉播放器",
    description: "基于 Folia 灵感打造的音乐全景视觉播放器，加载网易云音乐本地全部播放历史与常听排行",
    jsonLd: siteLd(),
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function MusicPage() {
  const {
    tracks,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    visualMode,
    analyserNode,
    lyrics,
    activeLyricIndex,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    setVisualMode,
    meta,
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ranked" | "all" | "artists">("ranked");
  const [showLyricsPanel, setShowLyricsPanel] = useState(false);

  // Filtered tracks for the list
  const filteredTracks = useMemo(() => {
    let list = tracks;
    if (activeTab === "ranked") {
      list = tracks.filter((t) => t.isRanked);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tracks, activeTab, searchQuery]);

  return (
    <div className="pb-16 pt-2">
      {/* Top Banner & Title */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-ink-3">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#f69dcb]/25 text-[#f69dcb]">
              <IconSparkles size={12} />
            </span>
            <span>辞曲新境 · 灵感源自 Folia</span>
          </div>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
            音乐视界 · <span className="relative inline-block text-[#246eb6] dark:text-[#72aee6]">网易云全景记录</span>
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            已载入本地数据库 300+ 首歌曲与听歌记录 · 本地真实音源 & 动力学动效歌词
          </p>
        </div>

        {/* Visualizer Mode Selector (Folia Stage Modes) */}
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-sm">
          {(
            [
              { id: "tempera", label: "🌊 凝彩" },
              { id: "halo", label: "💫 光晕" },
              { id: "spectrum", label: "🌌 频谱" },
              { id: "cube", label: "🧊 方块魔方" },
              { id: "lyrics", label: "📜 流光歌词" },
              { id: "stardust", label: "✨ 粒子星轨" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setVisualMode(m.id as VisualizerMode)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                visualMode === m.id
                  ? "bg-[#246eb6] text-white shadow-sm dark:bg-[#72aee6] dark:text-[#111c30]"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visualizer Stage Container */}
      <div className="mola-glass-card relative mb-8 overflow-hidden rounded-sheet p-4 shadow-lg sm:p-6">
        <FoliaCanvas
          mode={visualMode}
          isPlaying={isPlaying}
          track={currentTrack}
          analyserNode={analyserNode}
          className="h-64 w-full rounded-panel sm:h-80 md:h-96"
        />

        {/* Floating Now Playing Overlay on Stage */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-card border border-line-strong shadow-md">
              <img
                src={currentTrack.cover || "/favicon.svg"}
                alt={currentTrack.name}
                className={`size-full object-cover ${isPlaying ? "animate-mola-spin-slow" : ""}`}
              />
              <div className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-black/10" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[17px] font-bold text-ink sm:text-[19px]">
                  {currentTrack.name}
                </span>
                {currentTrack.rank && (
                  <span className="hl-pink shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-ink">
                    TOP {currentTrack.rank}
                  </span>
                )}
                {currentTrack.isLocalCached ? (
                  <span className="hl-blue shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-ink">
                    本地原音
                  </span>
                ) : (
                  <span className="rounded bg-bg-sunk px-1.5 py-0.5 text-[10px] text-ink-3">
                    云端高清
                  </span>
                )}
              </div>
              <div className="truncate text-[13px] font-medium text-[#246eb6] dark:text-[#72aee6]">
                {currentTrack.artist}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-ink-4">
                <span>{currentTrack.album}</span>
                {currentTrack.playCount > 1 && <span>· 已听 {currentTrack.playCount} 次</span>}
                <a
                  href={currentTrack.neteaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[#f69dcb] hover:underline"
                >
                  网易云 <IconExternal size={10} />
                </a>
              </div>
            </div>
          </div>

          {/* Player Cockpit Controls */}
          <div className="flex items-center gap-3 self-center sm:self-auto">
            <button
              type="button"
              onClick={() => setShowLyricsPanel(!showLyricsPanel)}
              aria-label="查看歌词"
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                showLyricsPanel
                  ? "border-[#f69dcb] bg-[#f69dcb]/15 text-[#c24672] dark:text-[#f8a8d2]"
                  : "border-line bg-surface text-ink-3 hover:text-ink"
              }`}
            >
              📜 歌词面板
            </button>

            <button
              type="button"
              onClick={prevTrack}
              aria-label="上一首"
              className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-all hover:bg-bg-sunk hover:text-ink active:scale-95"
            >
              <IconSkipBack size={15} />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "暂停" : "播放"}
              className="flex size-12 items-center justify-center rounded-full bg-[#246eb6] text-white shadow-md transition-all hover:bg-[#1a5590] active:scale-95 dark:bg-[#72aee6] dark:text-[#111c30]"
            >
              {isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
            </button>

            <button
              type="button"
              onClick={nextTrack}
              aria-label="下一首"
              className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-all hover:bg-bg-sunk hover:text-ink active:scale-95"
            >
              <IconSkipForward size={15} />
            </button>
          </div>
        </div>

        {/* Progress Bar & Seek */}
        <div className="mt-4 flex items-center gap-3">
          <span className="mono w-10 text-right text-[11px] text-ink-4">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={duration || 180}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="播放进度"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[#246eb6] dark:accent-[#72aee6]"
            />
          </div>
          <span className="mono w-10 text-[11px] text-ink-4">{formatTime(duration)}</span>

          {/* Volume Knob */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              aria-label={volume > 0 ? "静音" : "恢复音量"}
              className="text-ink-3 hover:text-ink"
            >
              {volume > 0 ? <IconVolume size={15} /> : <IconVolumeX size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="音量调节"
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-line-strong accent-[#f69dcb]"
            />
          </div>
        </div>

        {/* Expandable Synced Lyrics Drawer */}
        {showLyricsPanel && (
          <div className="mt-4 max-h-56 overflow-y-auto rounded-card border border-line bg-surface/70 p-4 backdrop-blur-sm">
            <div className="mb-2 text-[12px] font-bold text-ink-3">歌词跟随（点击任意行可跳转播放）：</div>
            {lyrics.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-ink-4">暂无同步歌词或纯音乐</div>
            ) : (
              <div className="space-y-1.5">
                {lyrics.map((l, i) => {
                  const isCur = i === activeLyricIndex;
                  return (
                    <div
                      key={i}
                      onClick={() => seek(l.time)}
                      className={`cursor-pointer rounded px-2.5 py-1 text-[13px] transition-colors ${
                        isCur
                          ? "hl-pink font-bold text-ink"
                          : "text-ink-3 hover:bg-bg-sunk hover:text-ink"
                      }`}
                    >
                      <span className="mono mr-2 text-[11px] text-ink-4">
                        {formatTime(l.time)}
                      </span>
                      <span>{l.text}</span>
                      {l.translation && (
                        <span className="ml-2 text-[11.5px] text-ink-4">({l.translation})</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Library Navigation & Stats */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("ranked")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              activeTab === "ranked"
                ? "bg-[#f69dcb]/20 text-[#c24672] dark:bg-[#f8a8d2]/25 dark:text-[#f8a8d2]"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            🏆 听歌排行 · 核心偏好 ({tracks.filter((t) => t.isRanked).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              activeTab === "all"
                ? "bg-[#246eb6]/15 text-[#246eb6] dark:bg-[#72aee6]/20 dark:text-[#72aee6]"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            📜 本地历史全部 ({tracks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("artists")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              activeTab === "artists"
                ? "bg-accent/15 text-accent dark:bg-accent-soft"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            📊 歌手分布与偏好
          </button>
        </div>

        {/* Search Field */}
        <div className="relative">
          <IconSearch size={14} className="pointer-events-none absolute left-3 top-2.5 text-ink-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索曲名、歌手、专辑..."
            className="h-9 w-56 rounded-full border border-line bg-surface pl-8 pr-3 text-[12.5px] text-ink placeholder:text-ink-4 focus:border-[#246eb6] focus:outline-none"
          />
        </div>
      </div>

      {/* TAB 1 & 2: Song List */}
      {activeTab !== "artists" && (
        <div className="space-y-2">
          {filteredTracks.map((t, idx) => {
            const isCurrent = currentTrack.id === t.id;
            return (
              <div
                key={t.id}
                onClick={() => playTrack(t)}
                className={`group flex cursor-pointer items-center justify-between rounded-control border p-3 transition-all duration-150 ${
                  isCurrent
                    ? "border-[#246eb6] bg-[#246eb6]/5 dark:border-[#72aee6] dark:bg-[#72aee6]/10"
                    : "border-line-soft bg-surface hover:border-[#94bfe9] hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="mono w-6 text-center text-[12px] text-ink-4">
                    {t.rank ? (
                      <span className="font-bold text-[#c24672]">#{t.rank}</span>
                    ) : (
                      idx + 1
                    )}
                  </div>

                  <div className="relative size-11 shrink-0 overflow-hidden rounded-control border border-line">
                    <img src={t.cover || "/favicon.svg"} alt={t.name} className="size-full object-cover" />
                    {isCurrent && isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                        <span className="inline-block size-3 rounded-full bg-[#f69dcb] animate-ping" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-[14px] font-semibold ${isCurrent ? "text-[#246eb6] dark:text-[#72aee6]" : "text-ink"}`}>
                        {t.name}
                      </span>
                      {t.isRanked && (
                        <span className="hl-pink rounded px-1.5 py-0.2 text-[10.5px] font-medium text-ink-2">
                          常听
                        </span>
                      )}
                      {t.isLocalCached && (
                        <span className="hl-blue rounded px-1.5 py-0.2 text-[10px] font-medium text-ink-2">
                          本地原音
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-ink-3">
                      {t.artist} · <span className="text-ink-4">{t.album}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-2 shrink-0">
                  {t.playCount > 1 && (
                    <span className="rounded-full bg-bg-sunk px-2 py-0.5 text-[11px] text-ink-3">
                      {t.playCount} 次
                    </span>
                  )}
                  <span className="mono text-[12px] text-ink-4">
                    {formatTime(t.duration)}
                  </span>
                  <button
                    type="button"
                    aria-label={isCurrent && isPlaying ? "暂停" : "播放"}
                    className={`flex size-8 items-center justify-center rounded-full ${
                      isCurrent && isPlaying
                        ? "bg-[#246eb6] text-white dark:bg-[#72aee6] dark:text-[#111c30]"
                        : "border border-line bg-surface text-ink-2 group-hover:border-[#246eb6] group-hover:text-[#246eb6]"
                    }`}
                  >
                    {isCurrent && isPlaying ? <IconPause size={13} /> : <IconPlay size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: Artist Distribution & Stats */}
      {activeTab === "artists" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="mola-glass-card rounded-card p-4">
              <div className="text-[12px] text-ink-4">总收听歌曲</div>
              <div className="mt-1 text-[24px] font-bold text-ink">{meta.totalTracks} 首</div>
              <div className="mt-1 text-[11px] text-ink-3">涵盖网易云本地所有历史</div>
            </div>
            <div className="mola-glass-card rounded-card p-4">
              <div className="text-[12px] text-ink-4">总播放次数</div>
              <div className="mt-1 text-[24px] font-bold text-[#246eb6] dark:text-[#72aee6]">
                {meta.totalPlays} 次
              </div>
              <div className="mt-1 text-[11px] text-ink-3">高频记录深度回放</div>
            </div>
            <div className="mola-glass-card rounded-card p-4">
              <div className="text-[12px] text-ink-4">累计收听时长</div>
              <div className="mt-1 text-[24px] font-bold text-[#c24672] dark:text-[#f8a8d2]">
                {meta.totalDurationHours} 小时
              </div>
              <div className="mt-1 text-[11px] text-ink-3">记录你的音乐时光</div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[16px] font-semibold text-ink">高频常听艺术家 Top 10</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {meta.topArtists.map((artist, idx) => (
                <div
                  key={artist.name}
                  onClick={() => {
                    setSearchQuery(artist.name);
                    setActiveTab("all");
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-control border border-line-soft bg-surface p-3 transition-colors hover:border-[#246eb6] hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="mono flex size-6 items-center justify-center rounded-full bg-bg-sunk text-[11px] font-semibold text-ink-3">
                      {idx + 1}
                    </span>
                    <span className="text-[14px] font-medium text-ink">{artist.name}</span>
                  </div>
                  <span className="hl-blue rounded px-2 py-0.5 text-[11px] font-semibold text-ink">
                    {artist.plays} 次播放
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
