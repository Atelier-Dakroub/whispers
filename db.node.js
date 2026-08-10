// The database, for every runtime that is not workerd.
//
// This file is a preload, not an import. `npm run dev`, `npm start` and
// `npm test` all run it through `node --import ./db.node.js`, which wires the
// store before the transclude binary starts. See package.json.
//
// It lives at the project root and nothing under `app/` references it. That is
// deliberate and it is the whole trick: a `node:` import anywhere in the app
// tree would be pulled into the worker bundle, where it does not exist. Keeping
// the Node wiring outside the tree means wrangler never sees it, and no bundler
// has to be told to ignore anything.
//
// The build does NOT preload this. A build with no database is the correct
// state: every content page is `prerender = false`, and the only page written
// to a file is `404.html`, which must render for a visitor who does not exist
// yet. Every repository answers a null store with defaults so that works.

import process from 'node:process';
import { setDb } from './app/data/db.js';

const driver = process.env.DB_DRIVER ?? 'libsql';

/** Told to the user rather than thrown as a resolution error nobody can read. */
const missing = (pkg, name) => {
  throw new Error(
    `[whispers] DB_DRIVER=${name} needs the ${pkg} package, which is not installed.\n` +
      `  npm install ${pkg}`,
  );
};

/** @returns {Promise<{ db: any, tables: any, dialect: 'sqlite'|'pg' }>} */
async function build() {
  if (driver === 'libsql' || driver === 'turso') {
    const url = process.env.DATABASE_URL ?? 'file:./data/whispers.db';
    const { createClient } = await import('@libsql/client').catch(() =>
      missing('@libsql/client', driver),
    );
    const { drizzle } = await import('drizzle-orm/libsql');
    const tables = await import('./app/data/schema.sqlite.js');

    // An auth token is how Turso and a self-hosted sqld differ from a file.
    const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

    return { db: drizzle(client), tables, dialect: 'sqlite' };
  }

  if (driver === 'better-sqlite3') {
    const path = process.env.DATABASE_URL ?? './data/whispers.db';
    const { default: Database } = await import('better-sqlite3').catch(() =>
      missing('better-sqlite3', driver),
    );
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const tables = await import('./app/data/schema.sqlite.js');

    const sqlite = new Database(path);
    // Concurrent readers alongside a writer, which a news page wants and the
    // default rollback journal does not give.
    sqlite.pragma('journal_mode = WAL');

    return { db: drizzle(sqlite), tables, dialect: 'sqlite' };
  }

  if (driver === 'postgres' || driver === 'pg') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[whispers] DB_DRIVER=postgres needs DATABASE_URL');

    const { default: postgres } = await import('postgres').catch(() =>
      missing('postgres', driver),
    );
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const tables = await import('./app/data/schema.pg.js');

    return { db: drizzle(postgres(url)), tables, dialect: 'pg' };
  }

  throw new Error(
    `[whispers] DB_DRIVER=${driver} is not one this app knows. ` +
      `Use libsql, better-sqlite3 or postgres. D1 is wired in worker.js instead.`,
  );
}

setDb(await build());
