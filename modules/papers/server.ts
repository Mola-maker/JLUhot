// The papers module's backend: the one JSON route its page reads (module.ts apiPaths). Papers come
// from the public read layer (publication/papers.ts), so withdrawals reach the page like every
// other exit.
import { defineServerModule } from "@aihot/backend/modules";
import { loadPapers } from "@aihot/backend/publication/papers";
import { looseQuery } from "../../apps/api/src/http/respond.ts";
import type { PapersPage } from "./types.ts";

export default defineServerModule({
  name: "papers",
  http(app) {
    app.get("/api/module/papers/list", async (req, reply) => {
      try {
        const cursor = looseQuery(req).cursor || null;
        const { entries, nextCursor } = await loadPapers(cursor);
        const body: PapersPage = { generatedAt: new Date().toISOString(), entries, nextCursor };
        // Cache for 12 hours (half day)
        return reply.header("Cache-Control", "public, max-age=43200, s-maxage=43200").send(body);
      } catch (error) {
        req.log.error({ err: error }, "papers api error");
        return reply.code(503).send({ code: "temporarily_unavailable" });
      }
    });
  },
});
