import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { MusicTrack, MusicMeta, VisualizerMode, LyricLine } from "./types";
import musicDataRaw from "./music-data.json";
import { loadLyrics, findActiveLyricIndex } from "./lyrics";

const defaultData = musicDataRaw as { meta: MusicMeta; tracks: MusicTrack[] };

interface MusicContextValue {
  tracks: MusicTrack[];
  currentTrack: MusicTrack;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  visualMode: VisualizerMode;
  analyserNode: AnalyserNode | null;
  frequencyData: Uint8Array | null;
  lyrics: LyricLine[];
  activeLyricIndex: number;
  playTrack: (track: MusicTrack) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  setVisualMode: (mode: VisualizerMode) => void;
  meta: MusicMeta;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const tracks = defaultData.tracks;
  const meta = defaultData.meta;

  const [currentTrack, setCurrentTrack] = useState<MusicTrack>(tracks[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(tracks[0]?.duration || 180);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [visualMode, setVisualMode] = useState<VisualizerMode>("tempera");

  // Lyrics state
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const synthTimerRef = useRef<number | null>(null);
  const isSynthModeRef = useRef<boolean>(false);
  const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

  // Initialize Web Audio Context and Analyser
  const ensureAudioGraph = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.85;

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setAnalyserState(analyser);

      if (audioRef.current) {
        try {
          const source = ctx.createMediaElementSource(audioRef.current);
          source.connect(analyser);
          analyser.connect(ctx.destination);
        } catch {
          // Already connected or cross-origin
        }
      }
    }

    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  }, []);

  // Web Audio generative synth fallback
  const stopSynth = useCallback(() => {
    if (synthTimerRef.current) {
      clearInterval(synthTimerRef.current);
      synthTimerRef.current = null;
    }
    isSynthModeRef.current = false;
  }, []);

  const startSynth = useCallback(
    (track: MusicTrack) => {
      ensureAudioGraph();
      stopSynth();
      const ctx = audioCtxRef.current;
      const analyser = analyserRef.current;
      if (!ctx || !analyser) return;

      isSynthModeRef.current = true;

      // Base frequencies derived from track id
      const hash = track.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const rootNotes = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0];
      const baseFreq = rootNotes[hash % rootNotes.length] || 220;

      const playChord = () => {
        if (!isSynthModeRef.current || !ctx || ctx.state !== "running") return;
        const now = ctx.currentTime;
        const intervals = [1, 1.25, 1.5, 1.75];

        intervals.forEach((ratio, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = idx % 2 === 0 ? "sine" : "triangle";
          osc.frequency.setValueAtTime(baseFreq * ratio * (idx === 0 ? 0.5 : 1), now);

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.04 * volume, now + 0.4);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

          osc.connect(gain);
          gain.connect(analyser);

          osc.start(now);
          osc.stop(now + 3.0);
        });
      };

      playChord();
      synthTimerRef.current = window.setInterval(playChord, 3200);
    },
    [ensureAudioGraph, stopSynth, volume]
  );

  // Play a specific track
  const playTrack = useCallback(
    (track: MusicTrack) => {
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(track.duration || 180);
      ensureAudioGraph();
      stopSynth();

      if (audioRef.current) {
        audioRef.current.src = track.audioUrl;
        audioRef.current.volume = volume;
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.warn("Audio playback issue:", err);
            // Fallback to online stream if local path fails
            if (track.audioUrl.startsWith("/audio/")) {
              const fallbackUrl = `https://api.injahow.cn/meting/?type=url&id=${track.id}`;
              if (audioRef.current) {
                audioRef.current.src = fallbackUrl;
                audioRef.current
                  .play()
                  .then(() => setIsPlaying(true))
                  .catch(() => {
                    startSynth(track);
                    setIsPlaying(true);
                  });
                return;
              }
            }
            startSynth(track);
            setIsPlaying(true);
          });
      } else {
        startSynth(track);
        setIsPlaying(true);
      }
    },
    [ensureAudioGraph, stopSynth, startSynth, volume]
  );

  const togglePlay = useCallback(() => {
    ensureAudioGraph();
    if (isPlaying) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      stopSynth();
      setIsPlaying(false);
    } else {
      if (audioRef.current && audioRef.current.src && audioRef.current.src !== window.location.href) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => playTrack(currentTrack));
      } else {
        playTrack(currentTrack);
      }
    }
  }, [ensureAudioGraph, isPlaying, playTrack, currentTrack, stopSynth]);

  const nextTrack = useCallback(() => {
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = (idx + 1) % tracks.length;
    playTrack(tracks[nextIdx]);
  }, [tracks, currentTrack, playTrack]);

  const prevTrack = useCallback(() => {
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    const prevIdx = (idx - 1 + tracks.length) % tracks.length;
    playTrack(tracks[prevIdx]);
  }, [tracks, currentTrack, playTrack]);

  const seek = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      if (audioRef.current && audioRef.current.duration) {
        audioRef.current.currentTime = seconds;
      }
    },
    []
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  // Sync lyrics when currentTrack changes
  useEffect(() => {
    let active = true;
    loadLyrics(currentTrack.id).then((lines) => {
      if (active) {
        setLyrics(lines);
      }
    });
    return () => {
      active = false;
    };
  }, [currentTrack.id]);

  // Sync active lyric line
  useEffect(() => {
    if (lyrics.length > 0) {
      const idx = findActiveLyricIndex(lyrics, currentTime);
      setActiveLyricIndex(idx);
    } else {
      setActiveLyricIndex(-1);
    }
  }, [currentTime, lyrics]);

  // Update progress timer
  useEffect(() => {
    let timer: number | null = null;
    if (isPlaying) {
      timer = window.setInterval(() => {
        if (audioRef.current && !audioRef.current.paused) {
          setCurrentTime(audioRef.current.currentTime);
          if (audioRef.current.duration && !Number.isNaN(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        } else if (isSynthModeRef.current) {
          setCurrentTime((prev) => {
            if (prev >= duration) {
              nextTrack();
              return 0;
            }
            return prev + 1;
          });
        }
      }, 500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, currentTrack, duration, nextTrack]);

  // Audio element listeners
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const onEnded = () => {
      nextTrack();
    };
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      stopSynth();
    };
  }, [nextTrack, stopSynth]);

  const value: MusicContextValue = {
    tracks,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    visualMode,
    analyserNode: analyserState,
    frequencyData: freqDataRef.current,
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
  };

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    throw new Error("useMusic must be used within a MusicProvider");
  }
  return ctx;
}
