// Site activity for the heatmap module: listed publications per Beijing hour over recent days.
// The public scope is scope.ts's listedCondition, like every other public exit; a withdrawn or not
// yet released report never counts.
import { addDays, beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { listedCondition } from "./scope.ts";

export interface ActivityCell {
  /** Beijing calendar day, YYYY-MM-DD. */
  day: string;
  /** Beijing hour, 0–23. */
  hour: number;
  count: number;
}

export interface ActivityGrid {
  /** Beijing dates covered, oldest first. */
  days: string[];
  /** Only hours with at least one listed publication. */
  cells: ActivityCell[];
  max: number;
  total: number;
}

async function queryActivityGrid(days: number, now: Date): Promise<ActivityGrid> {
  const last = beijingDate(now);
  const first = addDays(last, -(days - 1));
  const from = beijingMidnight(first);
  const to = new Date(beijingMidnight(last).getTime() + 86_400_000);
  const cells = await sql<ActivityCell[]>`
    SELECT to_char(p.timeline_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
           extract(hour FROM p.timeline_at AT TIME ZONE 'Asia/Shanghai')::int AS hour,
           count(*)::int AS count
    FROM publications p
    WHERE ${listedCondition(now)} AND p.timeline_at >= ${from} AND p.timeline_at < ${to}
    GROUP BY 1, 2`;
  return {
    days: Array.from({ length: days }, (_, i) => addDays(first, i)),
    cells,
    max: cells.reduce((m, c) => Math.max(m, c.count), 0),
    total: cells.reduce((sum, c) => sum + c.count, 0),
  };
}

const ACTIVITY_DAYS = 35;

// A minute old at most; concurrent readers share one read (lib/cache.ts).
const grid = cached(() => queryActivityGrid(ACTIVITY_DAYS, new Date()), { freshMs: 60_000, maxStaleMs: 60_000 });

/** The activity grid of the last 35 Beijing days. A given clock (tests, replays) reads afresh. */
export function loadActivityGrid(now?: Date): Promise<ActivityGrid> {
  return now ? queryActivityGrid(ACTIVITY_DAYS, now) : grid.get();
}
