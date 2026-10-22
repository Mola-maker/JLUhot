// One-time: adds `_aihot.paper: true` to the paper sources the industry pack marks, for deployments
// seeded before the marker existed (seed's ON CONFLICT DO NOTHING does not update existing rows).
// Everything else the admin has edited stays; each change is audited as source.update.
// Re-runnable:  node scripts/apply-paper-markers.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { audit } from "@aihot/backend/audit";
import { closeDb, sql } from "@aihot/backend/db";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";

const { sources } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: Array<{ id: string; kind: string; config: Record<string, unknown> }> };
let marked = 0;
for (const s of sources) {
  if ((s.config as { _aihot?: { paper?: boolean } })._aihot?.paper !== true) continue;
  assertSupportedConfig(s.kind as never, s.config);
  const [before] = await sql<{ config: Record<string, unknown> }[]>`SELECT config FROM sources WHERE id = ${s.id}`;
  if (!before) continue;
  if ((before.config as { _aihot?: { paper?: boolean } })._aihot?.paper === true) continue;
  const config = { ...before.config, _aihot: { ...(before.config as { _aihot?: object })._aihot, paper: true } };
  await sql.begin(async (tx) => {
    await tx`UPDATE sources SET config = ${tx.json(config as never)}, updated_at = now() WHERE id = ${s.id}`;
    await audit("deploy", "source.update", `source:${s.id}`, "论文信源标记 _aihot.paper（部署脚本，与 industry/sources.json 一致）",
      { config: before.config }, { config }, { db: tx });
  });
  marked += 1;
}
console.log(`paper marker set on ${marked} sources`);
await closeDb();
