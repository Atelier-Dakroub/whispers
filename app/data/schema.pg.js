// The Postgres half of the schema.
//
// Every table name, column name and nullability here matches `schema.sqlite.js`
// exactly. The repositories never import either file — they read the tables off
// the store `db.js` holds — so the two only have to agree with each other, and
// nothing else has to know which one is loaded.
//
// If you add a column, add it to both files in the same commit and generate
// both migration sets. `npm run db:generate` does both at once for that reason.

import { index, pgTable, text } from 'drizzle-orm/pg-core';

export const members = pgTable('members', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** pbkdf2-sha256$<rounds>$<salt b64>$<derived b64>. See schema.sqlite.js. */
  passphrase: text('passphrase').notNull(),
  createdAt: text('created_at').notNull(),
});

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    headline: text('headline').notNull(),
    url: text('url').notNull(),
    source: text('source').notNull().default(''),
    publishedAt: text('published_at').notNull(),
    status: text('status').notNull().default('draft'),
    flagReason: text('flag_reason'),
    /** See schema.sqlite.js: a timestamp, so it expires without a cron. */
    breakingAt: text('breaking_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('articles_status_published_idx').on(table.status, table.publishedAt),
    index('articles_url_idx').on(table.url),
    index('articles_breaking_idx').on(table.breakingAt),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const assets = pgTable('assets', {
  name: text('name').primaryKey(),
  mime: text('mime').notNull(),
  /** base64, matching SQLite. Not `bytea`: the point is one code path. */
  content: text('content').notNull(),
  updatedAt: text('updated_at').notNull(),
});
