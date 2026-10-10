// The heatmap module on the web: a sidebar entry under 内容 and, for the phone, a row on the 我的 page
// (the tab bar stays the engine's four).
import { defineWebModule } from "@aihot/web/modules";
import { IconChart } from "../../apps/web/app/components/icons";

export default defineWebModule({
  name: "heatmap",
  sidebar: { section: "内容", items: [{ to: "/heatmap", label: "热力图", icon: IconChart }] },
  tools: [{ to: "/heatmap", label: "热度热力图", icon: <IconChart size={20} /> }],
});
