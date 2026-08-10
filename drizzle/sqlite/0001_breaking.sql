ALTER TABLE `articles` ADD `breaking_at` text;--> statement-breakpoint
CREATE INDEX `articles_breaking_idx` ON `articles` (`breaking_at`);