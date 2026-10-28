import { useState, memo } from "react";
import { Link, useLocation } from "react-router";
import { useMusic } from "./music-context";
import { IconPlay, IconPause, IconSkipForward, IconMusic, IconClose } from "../../components/icons";

export const MusicFloatingBar = memo(function MusicFloatingBar() {
  const { currentTrack, isPlaying, togglePlay, nextTrack } = useMusic();
  const { pathname } = useLocation();
  const [minimized, setMinimized] = useState(false);

  // If already on /music, the floating bar doesn't need to show
  if (pathname === "/music" || minimized) {
    if (minimized && pathname !== "/music") {
      return (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label="展开音乐悬浮窗"
          className="fixed bottom-20 right-5 z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-[#246eb6] shadow-lg transition-transform hover:scale-105 active:scale-95 dark:text-[#72aee6]"
        >
          <IconMusic size={18} className={isPlaying ? "animate-mola-pulse" : ""} />
        </button>
      );
    }
    return null;
  }

  return (
    <aside
      aria-label="音乐播放控制条"
      className="mola-glass-card fixed bottom-16 right-3 z-40 max-w-[calc(100vw-24px)] rounded-full border border-line-strong p-1.5 shadow-xl transition-all duration-200 sm:bottom-6 sm:right-6 sm:max-w-md"
    >
      <div className="flex items-center gap-2.5 pr-2">
        {/* Album Artwork & Rotating Vinyl */}
        <Link to="/music" className="relative size-9 shrink-0 overflow-hidden rounded-full border border-line">
          <img
            src={currentTrack.cover || "/favicon.svg"}
            alt={currentTrack.name}
            className={`size-full object-cover ${isPlaying ? "animate-mola-spin" : ""}`}
          />
        </Link>

        {/* Track Info */}
        <Link to="/music" className="min-w-0 max-w-[130px] flex-1 sm:max-w-[180px]">
          <div className="truncate text-[12.5px] font-semibold text-ink hover:text-[#246eb6] dark:hover:text-[#72aee6]">
            {currentTrack.name}
          </div>
          <div className="truncate text-[11px] text-ink-3">{currentTrack.artist}</div>
        </Link>

        {/* Mini Waveform Bars */}
        <div className="hidden items-center gap-0.5 sm:flex" aria-hidden="true">
          <span
            className={`inline-block w-0.5 rounded-full bg-[#246eb6] ${
              isPlaying ? "animate-[mola-wave-bar_1.1s_ease-in-out_infinite]" : "h-1"
            }`}
          />
          <span
            className={`inline-block w-0.5 rounded-full bg-[#f69dcb] ${
              isPlaying ? "animate-[mola-wave-bar_1.4s_ease-in-out_0.2s_infinite]" : "h-2"
            }`}
          />
          <span
            className={`inline-block w-0.5 rounded-full bg-[#246eb6] ${
              isPlaying ? "animate-[mola-wave-bar_0.9s_ease-in-out_0.4s_infinite]" : "h-1.5"
            }`}
          />
        </div>

        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "暂停" : "播放"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#246eb6] text-white shadow-sm transition-transform active:scale-95 dark:bg-[#72aee6] dark:text-[#111c30]"
        >
          {isPlaying ? <IconPause size={13} /> : <IconPlay size={13} />}
        </button>

        {/* Next Button */}
        <button
          type="button"
          onClick={nextTrack}
          aria-label="下一首"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-bg-sunk hover:text-ink active:scale-95"
        >
          <IconSkipForward size={14} />
        </button>

        {/* Minimize Button */}
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="最小化播放条"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-bg-sunk hover:text-ink-2"
        >
          <IconClose size={12} />
        </button>
      </div>
    </aside>
  );
});
