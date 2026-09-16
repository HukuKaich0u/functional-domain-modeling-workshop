CREATE TABLE `permits` (
  `permit_id` text PRIMARY KEY NOT NULL,
  `zone_id` text NOT NULL,
  `status` text NOT NULL,
  `state` text NOT NULL,
  `crew_exposure` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_logs` (
  `event_id` text PRIMARY KEY NOT NULL,
  `permit_id` text NOT NULL,
  `event_name` text NOT NULL,
  `payload` text NOT NULL,
  `occurred_at` text NOT NULL,
  `lunar_day` integer NOT NULL
);
