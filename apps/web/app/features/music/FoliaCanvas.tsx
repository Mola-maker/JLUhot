import { useEffect, useRef, memo, useState } from "react";
import type { VisualizerMode, MusicTrack } from "./types";
import { useMusic } from "./music-context";

interface FoliaCanvasProps {
  mode: VisualizerMode;
  isPlaying: boolean;
  track: MusicTrack;
  analyserNode: AnalyserNode | null;
  className?: string;
}

export const FoliaCanvas = memo(function FoliaCanvas({
  mode,
  isPlaying,
  track,
  analyserNode,
  className = "",
}: FoliaCanvasProps) {
  const { lyrics, activeLyricIndex, currentTime, seek, tracks } = useMusic();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const particlesRef = useRef<Array<{ x: number; y: number; r: number; vx: number; vy: number; color: string }>>([]);

  // Preload top album cover images for the 3D Cube / Matrix stage
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  useEffect(() => {
    const covers = tracks.slice(0, 8).map((t) => t.cover).filter(Boolean);
    const imgs: HTMLImageElement[] = [];
    let loadedCount = 0;
    covers.forEach((src) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        loadedCount++;
        if (loadedCount >= Math.min(covers.length, 4)) {
          setLoadedImages([...imgs]);
        }
      };
      imgs.push(img);
    });
  }, [tracks]);

  // Current cover image
  const currentCoverImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (track.cover) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = track.cover;
      img.onload = () => {
        currentCoverImgRef.current = img;
      };
    }
  }, [track.cover]);

  // Initialize floating background particles
  useEffect(() => {
    const particles = [];
    const colors = ["#f69dcb", "#94bfe9", "#246eb6", "#e6f0fc", "#f8a8d2"];
    for (let i = 0; i < 48; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 2.4 + 1.2,
        vx: (Math.random() - 0.5) * 0.0006,
        vy: (Math.random() - 0.5) * 0.0006,
        color: colors[i % colors.length] || "#f69dcb",
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 420);

    const onResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", onResize);

    const freqArray = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : new Uint8Array(64);

    const render = () => {
      phaseRef.current += isPlaying ? 0.025 : 0.008;
      const phase = phaseRef.current;

      if (analyserNode && isPlaying) {
        analyserNode.getByteFrequencyData(freqArray);
      } else {
        // Natural soothing oscillation when idle
        for (let i = 0; i < freqArray.length; i++) {
          freqArray[i] = Math.sin(phase * 1.5 + i * 0.2) * 18 + 24;
        }
      }

      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      ctx.clearRect(0, 0, width, height);

      // Background atmospheric radial glow
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        15,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      if (isDark) {
        bgGrad.addColorStop(0, "rgba(22, 38, 66, 0.96)");
        bgGrad.addColorStop(0.5, "rgba(16, 27, 46, 0.98)");
        bgGrad.addColorStop(1, "rgba(10, 16, 28, 1)");
      } else {
        bgGrad.addColorStop(0, "rgba(252, 253, 255, 0.98)");
        bgGrad.addColorStop(0.6, "rgba(236, 244, 255, 0.95)");
        bgGrad.addColorStop(1, "rgba(225, 236, 255, 0.92)");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Render floating starry particles
      const particles = particlesRef.current;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1;
        if (p.y > 1) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.35 + Math.sin(phase * 2 + p.x * 10) * 0.2;
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      const avgFreq = freqArray.reduce((a, b) => a + b, 0) / freqArray.length;
      const bassEnergy = (freqArray[0] + freqArray[1] + freqArray[2]) / (3 * 255);

      // ========================================================
      // MODE 1: 🌊 凝彩 (Tempera) - Multilayer fluid waves
      // ========================================================
      if (mode === "tempera") {
        const waveCount = 4;
        const amplitudeMod = 1 + (avgFreq / 255) * 1.5;

        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          const baseOffset = height * (0.45 + w * 0.12);
          ctx.moveTo(0, height);

          for (let x = 0; x <= width; x += 12) {
            const freqIdx = Math.floor((x / width) * 20) % freqArray.length;
            const energy = (freqArray[freqIdx] || 20) / 255;
            const y =
              baseOffset +
              Math.sin(x * 0.005 + phase * 1.8 + w * 1.2) * (26 * amplitudeMod) +
              Math.cos(x * 0.009 - phase + w) * (18 * amplitudeMod) -
              energy * 45;
            ctx.lineTo(x, y);
          }

          ctx.lineTo(width, height);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, baseOffset - 60, width, baseOffset + 60);
          if (w === 0) {
            grad.addColorStop(0, "rgba(246, 157, 203, 0.28)");
            grad.addColorStop(1, "rgba(36, 110, 182, 0.22)");
          } else if (w === 1) {
            grad.addColorStop(0, "rgba(36, 110, 182, 0.25)");
            grad.addColorStop(1, "rgba(148, 191, 233, 0.3)");
          } else if (w === 2) {
            grad.addColorStop(0, "rgba(246, 157, 203, 0.32)");
            grad.addColorStop(1, "rgba(163, 196, 255, 0.25)");
          } else {
            grad.addColorStop(0, "rgba(36, 110, 182, 0.35)");
            grad.addColorStop(1, "rgba(246, 157, 203, 0.25)");
          }

          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      // ========================================================
      // MODE 2: 💫 光晕 (Halo) - Vinyl Disc & Orbiting Energy Rings
      // ========================================================
      else if (mode === "halo") {
        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.26;
        const pulse = (avgFreq / 255) * 20;

        // Outer glowing halo
        const haloGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.6, cx, cy, baseRadius + 75 + pulse);
        haloGrad.addColorStop(0, "rgba(246, 157, 203, 0.35)");
        haloGrad.addColorStop(0.5, "rgba(36, 110, 182, 0.25)");
        haloGrad.addColorStop(1, "rgba(148, 191, 233, 0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 75 + pulse, 0, Math.PI * 2);
        ctx.fill();

        // Orbit ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(phase * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, baseRadius + 48, baseRadius + 26, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#94bfe9";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Orbit celestial dots
        ctx.fillStyle = "#f69dcb";
        ctx.beginPath();
        ctx.arc(baseRadius + 48, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#246eb6";
        ctx.beginPath();
        ctx.arc(-baseRadius - 48, 0, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Vinyl Record Base
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(isPlaying ? phase * 1.2 : 0);

        ctx.beginPath();
        ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#0f172a" : "#1e293b";
        ctx.fill();
        ctx.strokeStyle = isDark ? "#334155" : "#475569";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Vinyl grooves
        for (let r = baseRadius * 0.45; r < baseRadius * 0.92; r += 7) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Center label hole with cover image or pink/blue label
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = "#f69dcb";
        ctx.fill();

        if (currentCoverImgRef.current && currentCoverImgRef.current.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, baseRadius * 0.33, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            currentCoverImgRef.current,
            -baseRadius * 0.33,
            -baseRadius * 0.33,
            baseRadius * 0.66,
            baseRadius * 0.66
          );
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#111c30" : "#ffffff";
        ctx.fill();
        ctx.restore();
      }

      // ========================================================
      // MODE 3: 🌌 频谱 (Spectrum) - Dynamic Gradient Equalizer
      // ========================================================
      else if (mode === "spectrum") {
        const barCount = 36;
        const totalW = width * 0.85;
        const startX = (width - totalW) / 2;
        const barW = (totalW / barCount) * 0.68;
        const gap = (totalW / barCount) * 0.32;
        const centerY = height * 0.62;

        for (let i = 0; i < barCount; i++) {
          const freqVal = freqArray[i % freqArray.length] || 15;
          const barH = Math.max(6, (freqVal / 255) * height * 0.45);
          const x = startX + i * (barW + gap);

          const grad = ctx.createLinearGradient(x, centerY - barH, x, centerY + barH);
          grad.addColorStop(0, "#f69dcb");
          grad.addColorStop(0.5, "#246eb6");
          grad.addColorStop(1, "#94bfe9");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, centerY - barH / 2, barW, barH, 4);
          ctx.fill();

          if (freqVal > 180) {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(x + barW / 2, centerY - barH / 2 - 3, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ========================================================
      // MODE 4: 🧊 方块专辑集合 (Cube / Album Grid Matrix)
      // Folia-Major Inspired 3D Isometric Album Showcase
      // ========================================================
      else if (mode === "cube") {
        const cx = width / 2;
        const cy = height * 0.52;
        const size = Math.min(width, height) * 0.22 * (1 + bassEnergy * 0.2);

        // Ground shadow & reflection
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy + size * 1.25, size * 1.5, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "rgba(0, 0, 0, 0.45)" : "rgba(36, 110, 182, 0.12)";
        ctx.fill();
        ctx.restore();

        // Surrounding orbital floating mini album tiles
        const tileCount = 6;
        for (let i = 0; i < tileCount; i++) {
          const angle = phase * 0.6 + (i * Math.PI * 2) / tileCount;
          const orbitR = Math.min(width, height) * 0.38;
          const tx = cx + Math.cos(angle) * orbitR;
          const ty = cy + Math.sin(angle) * (orbitR * 0.38) - 15;
          const tSize = 36 + Math.sin(phase + i) * 6;

          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(Math.sin(phase + i) * 0.15);

          // Tile glass background
          ctx.fillStyle = isDark ? "rgba(30, 41, 59, 0.85)" : "rgba(255, 255, 255, 0.88)";
          ctx.strokeStyle = i % 2 === 0 ? "#f69dcb" : "#246eb6";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(-tSize / 2, -tSize / 2, tSize, tSize, 6);
          ctx.fill();
          ctx.stroke();

          // Draw album thumbnail if loaded
          const img = loadedImages[i % loadedImages.length];
          if (img && img.complete) {
            ctx.beginPath();
            ctx.roundRect(-tSize / 2 + 2, -tSize / 2 + 2, tSize - 4, tSize - 4, 4);
            ctx.clip();
            ctx.drawImage(img, -tSize / 2 + 2, -tSize / 2 + 2, tSize - 4, tSize - 4);
          }
          ctx.restore();
        }

        // Center 3D Isometric Cube
        const rotX = Math.PI / 6 + Math.sin(phase * 0.7) * 0.08;
        const rotY = phase * 0.9;

        // Project 3D point (x, y, z)
        const project = (x: number, y: number, z: number) => {
          // Rotate Y
          const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
          const y1 = y;
          const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
          // Rotate X
          const x2 = x1;
          const y2 = y1 * Math.cos(rotX) - z1 * Math.sin(rotX);
          const z2 = y1 * Math.sin(rotX) + z1 * Math.cos(rotX);
          // Perspective projection
          const fov = 400;
          const scale = fov / (fov + z2);
          return {
            x: cx + x2 * scale,
            y: cy + y2 * scale,
            scale,
            z: z2,
          };
        };

        const hs = size * 0.9;
        // 8 vertices of cube
        const v = [
          project(-hs, -hs, -hs),
          project(hs, -hs, -hs),
          project(hs, hs, -hs),
          project(-hs, hs, -hs),
          project(-hs, -hs, hs),
          project(hs, -hs, hs),
          project(hs, hs, hs),
          project(-hs, hs, hs),
        ];

        // 6 Faces defined by vertex indices
        const faces = [
          { idx: [0, 1, 2, 3], norm: [0, 0, -1] }, // Front
          { idx: [5, 4, 7, 6], norm: [0, 0, 1] }, // Back
          { idx: [4, 0, 3, 7], norm: [-1, 0, 0] }, // Left
          { idx: [1, 5, 6, 2], norm: [1, 0, 0] }, // Right
          { idx: [4, 5, 1, 0], norm: [0, -1, 0] }, // Top
          { idx: [3, 2, 6, 7], norm: [0, 1, 0] }, // Bottom
        ];

        // Sort faces by depth
        const sortedFaces = faces
          .map((f) => {
            const zAvg = (v[f.idx[0]!].z + v[f.idx[1]!].z + v[f.idx[2]!].z + v[f.idx[3]!].z) / 4;
            return { ...f, z: zAvg };
          })
          .sort((a, b) => b.z - a.z);

        // Draw sorted faces
        sortedFaces.forEach((f, idx) => {
          const p0 = v[f.idx[0]!];
          const p1 = v[f.idx[1]!];
          const p2 = v[f.idx[2]!];
          const p3 = v[f.idx[3]!];

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();

          // Face shading with Folia pink/blue aesthetic
          const faceGrad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
          if (idx % 2 === 0) {
            faceGrad.addColorStop(0, "rgba(246, 157, 203, 0.75)");
            faceGrad.addColorStop(1, "rgba(36, 110, 182, 0.65)");
          } else {
            faceGrad.addColorStop(0, "rgba(36, 110, 182, 0.75)");
            faceGrad.addColorStop(1, "rgba(148, 191, 233, 0.65)");
          }

          ctx.fillStyle = faceGrad;
          ctx.fill();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Draw album cover on front-most face
          if (idx === sortedFaces.length - 1 && currentCoverImgRef.current?.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.closePath();
            ctx.clip();
            ctx.globalAlpha = 0.85;
            ctx.drawImage(
              currentCoverImgRef.current,
              Math.min(p0.x, p3.x),
              Math.min(p0.y, p1.y),
              Math.abs(p1.x - p0.x) + 40,
              Math.abs(p2.y - p1.y) + 40
            );
            ctx.restore();
          }
        });
      }

      // ========================================================
      // MODE 5: 📜 流光歌词舞台 (Kinetic Flowing Lyrics Stage)
      // Folia-Major Inspired Synced Typography Visualizer
      // ========================================================
      else if (mode === "lyrics") {
        const cx = width / 2;
        const cy = height / 2;

        // Background subtle audio ribbons
        ctx.beginPath();
        for (let x = 0; x <= width; x += 16) {
          const y = cy + Math.sin(x * 0.008 + phase) * (18 + bassEnergy * 30);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isDark ? "rgba(148, 191, 233, 0.15)" : "rgba(36, 110, 182, 0.12)";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (lyrics.length === 0) {
          // Instrumental / Pure music ambient stage
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = isDark ? "#ffffff" : "#163f70";
          ctx.fillText(track.name, cx, cy - 14);

          ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = "#f69dcb";
          ctx.fillText(`♪ 纯音乐 / 伴奏欣赏 · 沉浸声光律动 ♪`, cx, cy + 18);
        } else {
          const currentIdx = activeLyricIndex >= 0 ? activeLyricIndex : 0;
          const lineHeight = 38;
          const visibleLines = 5;

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          for (let offset = -2; offset <= 2; offset++) {
            const lineIdx = currentIdx + offset;
            if (lineIdx < 0 || lineIdx >= lyrics.length) continue;
            const line = lyrics[lineIdx];
            if (!line) continue;

            const yPos = cy + offset * lineHeight;
            const isCurrent = offset === 0;

            if (isCurrent) {
              // Active Line: Prominent, Glowing Pink-Blue Highlighter Aura
              const textScale = 1 + bassEnergy * 0.08;
              ctx.save();
              ctx.translate(cx, yPos);
              ctx.scale(textScale, textScale);

              // Fluorescent highlighter bar background
              const textWidth = ctx.measureText(line.text).width;
              ctx.fillStyle = isDark ? "rgba(246, 157, 203, 0.18)" : "rgba(246, 157, 203, 0.28)";
              ctx.beginPath();
              ctx.roundRect(-textWidth / 2 - 12, -14, textWidth + 24, 28, 6);
              ctx.fill();

              // Singing text with neon gradient
              const textGrad = ctx.createLinearGradient(-textWidth / 2, 0, textWidth / 2, 0);
              textGrad.addColorStop(0, "#246eb6");
              textGrad.addColorStop(0.5, "#c24672");
              textGrad.addColorStop(1, "#246eb6");

              ctx.font = "bold 21px -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif";
              ctx.fillStyle = textGrad;
              ctx.fillText(line.text, 0, 0);

              // Translation line if present
              if (line.translation) {
                ctx.font = "12.5px -apple-system, BlinkMacSystemFont, sans-serif";
                ctx.fillStyle = isDark ? "#94bfe9" : "#246eb6";
                ctx.fillText(line.translation, 0, 22);
              }
              ctx.restore();
            } else {
              // Surrounding Lines: Fainter, floating
              const alpha = Math.max(0.18, 0.65 - Math.abs(offset) * 0.25);
              ctx.font = "500 15px -apple-system, BlinkMacSystemFont, sans-serif";
              ctx.fillStyle = isDark ? `rgba(226, 232, 240, ${alpha})` : `rgba(22, 63, 112, ${alpha})`;
              ctx.fillText(line.text, cx, yPos);
            }
          }
        }
      }

      // ========================================================
      // MODE 6: ✨ 粒子星轨 (Stardust Orbit)
      // ========================================================
      else if (mode === "stardust") {
        const cx = width / 2;
        const cy = height / 2;
        const starCount = 64;

        ctx.save();
        ctx.translate(cx, cy);

        // Core star
        const coreR = 12 + bassEnergy * 15;
        const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, coreR * 2.5);
        coreGrad.addColorStop(0, "#ffffff");
        coreGrad.addColorStop(0.4, "#f69dcb");
        coreGrad.addColorStop(0.8, "#246eb6");
        coreGrad.addColorStop(1, "transparent");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coreR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Orbital rings and constellation points
        for (let i = 0; i < starCount; i++) {
          const orbitRadius = 40 + (i * 3.8);
          const angle = phase * (0.8 / (1 + i * 0.05)) + (i * Math.PI) / 6;
          const sx = Math.cos(angle) * orbitRadius;
          const sy = Math.sin(angle) * (orbitRadius * 0.55);

          const freqVal = freqArray[i % freqArray.length] || 20;
          const pSize = 1.5 + (freqVal / 255) * 3.5;

          ctx.fillStyle = i % 2 === 0 ? "#f69dcb" : "#94bfe9";
          ctx.beginPath();
          ctx.arc(sx, sy, pSize, 0, Math.PI * 2);
          ctx.fill();

          // Connect stars with fine stardust filament lines
          if (i % 3 === 0 && i < starCount - 1) {
            const nextAngle = phase * (0.8 / (1 + (i + 1) * 0.05)) + ((i + 1) * Math.PI) / 6;
            const nx = Math.cos(nextAngle) * (40 + (i + 1) * 3.8);
            const ny = Math.sin(nextAngle) * ((40 + (i + 1) * 3.8) * 0.55);

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(nx, ny);
            ctx.strokeStyle = i % 2 === 0 ? "rgba(246, 157, 203, 0.18)" : "rgba(36, 110, 182, 0.18)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", onResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mode, isPlaying, analyserNode, lyrics, activeLyricIndex, loadedImages]);

  return (
    <div className={`relative overflow-hidden rounded-panel ${className}`}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
});
