CREATE TABLE `installation` (
	`installation_key` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE TABLE `segments` (
	`segment_id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`lockout_status` text NOT NULL,
	`locked_out_permit_id` text,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`worker_id` text PRIMARY KEY NOT NULL,
	`qualification` text NOT NULL,
	`cumulative_dose_micro_sv` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permits` (
	`permit_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`zone_id` text NOT NULL,
	`crew_a` text NOT NULL,
	`crew_b` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equipment_checks` (
	`check_id` text PRIMARY KEY NOT NULL,
	`permit_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `space_weather_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`issued_at` text NOT NULL,
	`alert_level` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domain_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`aggregate_id` text NOT NULL,
	`aggregate_name` text NOT NULL,
	`aggregate_state` text,
	`event_name` text NOT NULL,
	`event_payload` text NOT NULL,
	`occurred_at` text NOT NULL,
	`lunar_day` integer NOT NULL,
	`actor_user_id` text NOT NULL
);
