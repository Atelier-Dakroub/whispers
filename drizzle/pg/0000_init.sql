CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"url" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"published_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"flag_reason" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"name" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passphrase" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "articles_status_published_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_url_idx" ON "articles" USING btree ("url");