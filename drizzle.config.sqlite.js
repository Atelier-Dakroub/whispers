// Migrations for the SQLite family: D1, libSQL/Turso, better-sqlite3.
//
// `out` is also wrangler's `migrations_dir`, so `wrangler d1 migrations apply`
// and `npm run db:migrate` run the same SQL. One set of files, not two that
// drift.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './app/data/schema.sqlite.js',
  out: './drizzle/sqlite',
});
