// The heatmap module's backend: the one JSON route its page reads (module.ts apiPaths). Activity comes
// from the public read layer (publication/activity.ts), the ranking from publication/hot.ts, so
// withdrawals reach the page like every other exit.
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { defineServerModule } from "@aihot/backend/modules";
import { loadActivityGrid } from "@aihot/backend/publication/activity";
import { latestHotRanking } from "@aihot/backend/publication/hot";
import type { HeatmapResponse } from "./types.ts";

export default defineServerModule({
  name: "heatmap",
  http(app) {
    app.get("/api/module/heatmap/activity", async (req, reply) => {
      try {
        const [grid, ranking] = await Promise.all([loadActivityGrid(), latestHotRanking()]);
        const generatedAt = new Date();
        const body: HeatmapResponse = {
          generatedAt: generatedAt.toISOString(),
          now: { day: beijingDate(generatedAt), hour: Number(beijingTime(generatedAt).slice(0, 2)) },
          grid,
          hot: (ranking?.entries ?? []).slice(0, 10).map((e) => ({
            rank: e.rank,
            title: e.title,
            heat: e.heat,
            trend: e.trend,
            trendPct: e.trendPct,
            storyPublicId: e.storyPublicId,
          })),
          hotComputedAt: ranking?.computedAt ?? null,
        };
        return reply.header("Cache-Control", "public, max-age=60, s-maxage=60").send(body);
      } catch (error) {
        req.log.error({ err: error }, "heatmap api error");
        return reply.code(503).send({ code: "temporarily_unavailable" });
      }
    });
  },
});
