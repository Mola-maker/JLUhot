export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artists: string[];
  artist: string;
  album: string;
  cover: string;
  duration: number; // in seconds
  playtime: number; // epoch ms
  playCount: number;
  totalDuration: number;
  rank?: number;
  isRanked: boolean;
  hasLocalAudio: boolean;
  isLocalCached?: boolean;
  audioUrl: string;
  hasLyrics?: boolean;
  lyricsUrl?: string | null;
  neteaseUrl: string;
}

export interface MusicMeta {
  source: string;
  extractedAt: string;
  totalTracks: number;
  cachedAudioCount: number;
  totalPlays: number;
  totalDurationHours: number;
  topArtists: Array<{ name: string; plays: number }>;
}

export interface MusicDataPayload {
  meta: MusicMeta;
  tracks: MusicTrack[];
}

export type VisualizerMode = "tempera" | "halo" | "spectrum" | "cube" | "lyrics" | "stardust";
