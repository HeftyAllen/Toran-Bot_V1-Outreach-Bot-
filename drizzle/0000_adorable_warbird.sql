CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_name` text NOT NULL,
	`website_url` text NOT NULL,
	`region` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`fit_score` integer,
	`confidence` text,
	`service_fit` text,
	`summary` text,
	`evidence` text,
	`draft_subject` text,
	`draft_body` text,
	`outcome` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`researched_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_leads_user_status` ON `leads` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leads_user_website` ON `leads` (`user_id`,`website_url`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`message` text,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_runs_user_created` ON `runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`brand_name` text DEFAULT 'New business' NOT NULL,
	`brand_domain` text DEFAULT '' NOT NULL,
	`target_market` text DEFAULT 'Restaurants and ecommerce businesses' NOT NULL,
	`target_locations` text DEFAULT 'Midrand, Sandton, Johannesburg' NOT NULL,
	`services` text DEFAULT 'Websites, ecommerce, business automation' NOT NULL,
	`automation_enabled` integer DEFAULT false NOT NULL,
	`research_limit` integer DEFAULT 3 NOT NULL,
	`api_key_encrypted` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
