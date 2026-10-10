// What /api/module/heatmap/activity answers (server.ts) and the page draws (web/heatmap.tsx).
// Declared here so the web bundle never imports the backend.

export interface ActivityCell {
  day: string;
  hour: number;
  count: number;
}

export interface ActivityGrid {
  days: string[];
  cells: ActivityCell[];
  max: number;
  total: number;
}

export interface HeatmapHotEntry {
  rank: number;
  title: string;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  trendPct: number | null;
  storyPublicId: string;
}

export interface HeatmapResponse {
  generatedAt: string;
  /** The current Beijing hour: its cell pulses on the page. */
  now: { day: string; hour: number };
  grid: ActivityGrid;
  hot: HeatmapHotEntry[];
  hotComputedAt: string | null;
}
