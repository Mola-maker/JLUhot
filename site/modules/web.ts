// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import heatmap from "@aihot/heatmap/web";
import papers from "@aihot/papers/web";

export const WEB_MODULES: readonly WebModule[] = [heatmap, papers];
