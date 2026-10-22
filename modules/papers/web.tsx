// The papers module on the web: a sidebar entry under 内容 and, for the phone, a row on the 我的
// page (the tab bar stays the engine's four).
import { defineWebModule } from "@aihot/web/modules";
import { IconDoc } from "../../apps/web/app/components/icons";

export default defineWebModule({
  name: "papers",
  sidebar: { section: "内容", items: [{ to: "/papers", label: "论文", icon: IconDoc }] },
  tools: [{ to: "/papers", label: "论文速览", icon: <IconDoc size={20} /> }],
});
