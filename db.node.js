// The database, for every runtime that is not workerd.
//
// A preload rather than an import: `npm run dev`, `npm start` and `npm test`
// all run it through `node --import ./db.node.js`, which wires the store before
// the transclude binary starts.
//
// It sits at the project root and nothing under `app/` references it, which is
// the whole trick — a `node:` import inside the app tree would be pulled into
// the worker bundle, where it does not exist.
//
// The build does not preload it. A build with no database is correct: the only
// page written to a file is 404.html, and every repository answers a null store
// with defaults so that works.

import process from 'node:process';
import { setDb } from './app/data/db.js';

const driver = process.env.DB_DRIVER ?? 'libsql';

/**
 * Fails with a message naming the package, rather than a resolution error.
 *
 * @param {string} pkg
 * @param {string} name the DB_DRIVER value that needs it
 * @returns {never}
 * @throws always
 */
const missing = (pkg, name) => {
  throw new Error(
    `[whispers] DB_DRIVER=${name} needs the ${pkg} package, which is not installed.\n` +
      `  npm install ${pkg}`,
  );
};

/**
 * Builds the Drizzle instance DB_DRIVER names.
 *
 * @returns {Promise<{ db: any, tables: any, dialect: 'sqlite'|'pg' }>}
 * @throws when the driver is unknown, or its package is not installed
 */
async function build() {
  if (driver === 'libsql' || driver === 'turso') {
    const url = process.env.DATABASE_URL ?? 'file:./data/whispers.db';
    const { createClient } = await import('@libsql/client').catch(() =>
      missing('@libsql/client', driver),
    );
    const { drizzle } = await import('drizzle-orm/libsql');
    const tables = await import('./app/data/schema.sqlite.js');

    // An auth token is what separates Turso and a self-hosted sqld from a file.
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

    // WAL gives concurrent readers alongside a writer, which a news page wants
    // and the default rollback journal does not.
    const sqlite = new Database(path);
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
