// The heatmap module's addresses: its page and the api route its page's data comes from.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "heatmap",
  pages: [{ path: "heatmap", file: "web/heatmap.tsx" }],
  apiPaths: [/^\/api\/module\/heatmap\//],
});
