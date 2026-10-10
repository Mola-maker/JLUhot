// About-page contact codes: replaceable from the admin without code changes (file names carry a content
// hash), or shipped with the site (site/brand/contact/qr-wechat…, qr-feishu…). The page shows a
// code only when set.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";

export interface ContactSettings {
  wechatQr: string | null;
  feishuQr: string | null;
}

const PACK_CODES = path.join(REPO_ROOT, "site/brand/contact");

/** The pack's code for a slot, served under /contact/; none when the pack ships no such file. */
function packCode(slot: "wechat" | "feishu"): string | null {
  const file = existsSync(PACK_CODES) ? readdirSync(PACK_CODES).sort().find((f) => f.startsWith(`qr-${slot}`) && /^[\w.-]+\.(png|jpe?g|webp)$/.test(f)) : undefined;
  return file ? `/contact/${file}` : null;
}

const DEFAULTS: ContactSettings = { wechatQr: packCode("wechat"), feishuQr: packCode("feishu") };

export async function loadContact(): Promise<ContactSettings> {
  const [row] = await sql<{ value: Partial<ContactSettings> }[]>`SELECT value FROM settings WHERE key = 'contact_qr'`;
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

