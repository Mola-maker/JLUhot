// The papers module's addresses: its page and the api route its page's data comes from.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "papers",
  pages: [{ path: "papers", file: "web/papers.tsx" }],
  apiPaths: [/^\/api\/module\/papers\//],
});
