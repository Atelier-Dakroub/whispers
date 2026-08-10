// Applies migrations to whatever DB_DRIVER names.
//
//   npm run db:migrate
//
// D1 is the exception: Cloudflare applies its own, over the API, reading the
// same drizzle/sqlite directory that wrangler.jsonc names as migrations_dir.
//
//   npx wrangler d1 migrations apply whispers --local
//   npx wrangler d1 migrations apply whispers --remote

import process from 'node:process';
import { applyMigrations } from './lib/db-admin.js';

try {
  console.log(`Migrated ${await applyMigrations()}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
