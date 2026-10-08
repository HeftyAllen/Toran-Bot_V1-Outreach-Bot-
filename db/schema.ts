import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaceSettings = sqliteTable("workspace_settings", {
  userId: text("user_id").primaryKey(),
  brandName: text("brand_name").notNull().default("New business"),
  brandDomain: text("brand_domain").notNull().default(""),
  targetMarket: text("target_market").notNull().default("Restaurants and ecommerce businesses"),
  targetLocations: text("target_locations").notNull().default("Midrand, Sandton, Johannesburg"),
  services: text("services").notNull().default("Websites, ecommerce, business automation"),
  automationEnabled: integer("automation_enabled", { mode: "boolean" }).notNull().default(false),
  researchLimit: integer("research_limit").notNull().default(3),
  apiKeyEncrypted: text("api_key_encrypted"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  companyName: text("company_name").notNull(),
  websiteUrl: text("website_url").notNull(),
  region: text("region"),
  status: text("status").notNull().default("queued"),
  fitScore: integer("fit_score"),
  confidence: text("confidence"),
  serviceFit: text("service_fit"),
  summary: text("summary"),
  evidence: text("evidence"),
  draftSubject: text("draft_subject"),
  draftBody: text("draft_body"),
  outcome: text("outcome"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  researchedAt: text("researched_at"),
}, (table) => ({
  ownerIdx: index("idx_leads_user_status").on(table.userId, table.status),
  ownerWebsiteUnique: uniqueIndex("idx_leads_user_website").on(table.userId, table.websiteUrl),
}));

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull(),
  processed: integer("processed").notNull().default(0),
  message: text("message"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
}, (table) => ({
  ownerIdx: index("idx_runs_user_created").on(table.userId, table.createdAt),
}));
