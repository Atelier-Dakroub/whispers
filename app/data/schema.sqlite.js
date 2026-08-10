// The SQLite half of the schema: Cloudflare D1, libSQL/Turso, better-sqlite3.
// `schema.pg.js` declares the same tables under the same names, which is what
// lets every repository be written once — so a column added here and forgotten
// there is a Postgres install that breaks on a query nobody ran locally.
//
// Three rules keep the dialects from diverging in ways a repository would feel:
//
//   ids          text holding crypto.randomUUID(), so no autoincrement/serial split
//   timestamps   text holding ISO-8601 UTC, which sorts chronologically in both
//   bytes        none at all — the logo is base64 in a text column, because a
//                BLOB is the one type the four drivers genuinely disagree about

import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  // The whole verifier in one self-describing string:
  //   pbkdf2-sha256$<rounds>$<salt b64>$<derived b64>
  // Rounds live in the string rather than in a constant, so raising the cost
  // later leaves every existing passphrase verifiable, and a host with a tight
  // CPU budget can lower it without a migration.
  passphrase: text('passphrase').notNull(),
  createdAt: text('created_at').notNull(),
});

export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    headline: text('headline').notNull(),
    url: text('url').notNull(),
    source: text('source').notNull().default(''),
    // When the story is dated, which is what the page orders and groups by. Not
    // the same as `createdAt`: a headline added this morning can be yesterday's.
    publishedAt: text('published_at').notNull(),
    status: text('status').notNull().default('draft'),
    // Set when a link check had something to say. Advisory: the row is still
    // publishable, and the admin sees the reason.
    flagReason: text('flag_reason'),
    /**
     * When this was marked breaking, not whether it is; null means never.
     *
     * A timestamp expires on its own — the page compares it to a cutoff at
     * render time — where a boolean would need something to come and turn it
     * off, and nothing ever does.
     */
    breakingAt: text('breaking_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    // The public page's only query: published rows, newest first.
    index('articles_status_published_idx').on(table.status, table.publishedAt),
    index('articles_url_idx').on(table.url),
    index('articles_breaking_idx').on(table.breakingAt),
  ],
);

// One row per setting, so shipping a new setting is a write rather than a
// migration — which for an app people install themselves is the difference
// between an update and a support thread.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const assets = sqliteTable('assets', {
  name: text('name').primaryKey(),
  mime: text('mime').notNull(),
  /** base64. See the note at the top about why this is not a BLOB. */
  content: text('content').notNull(),
  updatedAt: text('updated_at').notNull(),
});
