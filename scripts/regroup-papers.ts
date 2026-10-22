// One-time: regroups the paper sources' existing articles after `_aihot.paper` was introduced, so
// each one drops its automatic event membership (the fast path then settles it standalone without a
// model call). Manual memberships are kept by requestRegroup. Worker must be running to drain the jobs.
// Re-runnable:  node scripts/regroup-papers.ts
import { closeDb, sql } from "@aihot/backend/db";
import { requestRegroup } from "@aihot/backend/events/corrections";

const RUN = `papers-regroup-${new Date().toISOString().slice(0, 10)}`;
const rows = await sql<{ id: string }[]>`
  SELECT DISTINCT a.id FROM articles a
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN fact_articles fa ON fa.article_id = a.id AND fa.manual = false
  LEFT JOIN story_signals ss ON ss.article_id = a.id
  WHERE s.config->'_aihot'->>'paper' = 'true' AND (fa.article_id IS NOT NULL OR ss.article_id IS NOT NULL)`;
let queued = 0;
for (const { id } of rows) {
  if (await requestRegroup(id, `${RUN}:${id}`, sql)) queued += 1;
}
console.log(`regroup queued for ${queued} of ${rows.length} paper articles`);
await closeDb();
