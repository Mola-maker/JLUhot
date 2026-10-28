import type { LyricLine } from "./types";

const lyricsCache = new Map<string, LyricLine[]>();

/**
 * Parses standard LRC format text into an array of LyricLine objects
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split("\n");
  const result: LyricLine[] = [];

  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check for timestamps
    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    // Remove all timestamps from the line to get pure text
    let text = trimmed.replace(timeRegex, "").trim();

    // Skip pure credit/metadata lines if empty
    if (!text) continue;

    // Check if line contains translation e.g. "日本語 (中文翻译)"
    let translation: string | undefined;
    const transMatch = text.match(/^(.+?)\s*[（(](.+?)[)）]$/);
    if (transMatch && transMatch[1] && transMatch[2]) {
      text = transMatch[1].trim();
      translation = transMatch[2].trim();
    }

    for (const match of matches) {
      const mins = parseInt(match[1] || "0", 10);
      const secs = parseInt(match[2] || "0", 10);
      const msPart = match[3] || "0";
      const ms = msPart.length === 2 ? parseInt(msPart, 10) * 10 : parseInt(msPart, 10);
      const totalSeconds = mins * 60 + secs + ms / 1000;

      result.push({
        time: totalSeconds,
        text,
        translation,
      });
    }
  }

  // Sort chronologically
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Loads lyrics for a given track id, trying local file first, then API
 */
export async function loadLyrics(songId: string): Promise<LyricLine[]> {
  if (lyricsCache.has(songId)) {
    return lyricsCache.get(songId)!;
  }

  try {
    // 1. Try local cached lrc
    const localRes = await fetch(`/data/lyrics/${songId}.lrc`);
    if (localRes.ok) {
      const text = await localRes.text();
      const parsed = parseLrc(text);
      if (parsed.length > 0) {
        lyricsCache.set(songId, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore and fallback
  }

  try {
    // 2. Fallback to Meting online lyrics resolver
    const onlineRes = await fetch(`https://api.injahow.cn/meting/?type=lrc&id=${songId}`);
    if (onlineRes.ok) {
      const text = await onlineRes.text();
      const parsed = parseLrc(text);
      if (parsed.length > 0) {
        lyricsCache.set(songId, parsed);
        return parsed;
      }
    }
  } catch {
    // Network failure
  }

  return [];
}

/**
 * Finds the index of the currently active lyric line
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) return -1;
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    const l = lyrics[i];
    if (l && l.time <= currentTime + 0.15) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
}
