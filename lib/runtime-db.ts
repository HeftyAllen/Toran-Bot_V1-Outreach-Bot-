import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) throw new Error("Cloud storage is not connected yet.");
  return env.DB;
}

export type SettingsRow = {
  user_id: string;
  brand_name: string;
  brand_domain: string;
  target_market: string;
  target_locations: string;
  services: string;
  automation_enabled: number;
  research_limit: number;
  api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensureSettings(db: D1Database, userId: string): Promise<SettingsRow> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT OR IGNORE INTO workspace_settings
      (user_id, brand_name, brand_domain, target_market, target_locations, services, automation_enabled, research_limit, created_at, updated_at)
    VALUES (?, 'New business', '', 'Restaurants and ecommerce businesses', 'Midrand, Sandton, Johannesburg', 'Websites, ecommerce, business automation', 0, 3, ?, ?)
  `).bind(userId, now, now).run();
  const result = await db.prepare("SELECT * FROM workspace_settings WHERE user_id = ?").bind(userId).first<SettingsRow>();
  if (!result) throw new Error("Workspace settings could not be loaded.");
  return result;
}

export function publicSettings(row: SettingsRow) {
  return {
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    targetMarket: row.target_market,
    targetLocations: row.target_locations,
    services: row.services,
    automationEnabled: Boolean(row.automation_enabled),
    researchLimit: row.research_limit,
    apiConfigured: Boolean(row.api_key_encrypted),
  };
}
