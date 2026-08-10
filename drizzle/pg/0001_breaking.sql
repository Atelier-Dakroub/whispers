ALTER TABLE "articles" ADD COLUMN "breaking_at" text;--> statement-breakpoint
CREATE INDEX "articles_breaking_idx" ON "articles" USING btree ("breaking_at");