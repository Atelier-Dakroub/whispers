// What `scripts/migrate.js` and `scripts/reset.js` share.
//
// Functions rather than a chained npm script, because `npm run db:reset --
// --yes` appends its arguments to the end of the whole string: chained, the
// flag lands on the migrate, the reset refuses, and the migrate succeeds —
// which looks exactly like a reset that worked.

import process from 'node:process';

/** @returns {string} the DB_DRIVER value, or the default */
export const driver = () => process.env.DB_DRIVER ?? 'libsql';

/** @returns {string} the libSQL connection URL */
export const sqliteUrl = () => process.env.DATABASE_URL ?? 'file:./data/whispers.db';

/** @returns {string|null} the path, or null when the URL is remote */
export const sqliteFile = () => {
  const url = sqliteUrl();
  return url.startsWith('file:') ? url.slice('file:'.length) : null;
};

/**
 * Makes the directory a file database will live in, since libSQL will not.
 *
 * @param {string} file
 * @returns {Promise<void>}
 */
export async function ensureDir(file) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * Applies every pending migration to whatever `DB_DRIVER` names.
 *
 * @returns {Promise<string>} what was migrated, for the caller to print
 * @throws when the driver is D1, unknown, or missing its package
 */
export async function applyMigrations() {
  const name = driver();

  if (name === 'd1') {
    throw new Error(
      'D1 applies its own migrations:\n' +
        '  npx wrangler d1 migrations apply whispers --local\n' +
        '  npx wrangler d1 migrations apply whispers --remote',
    );
  }

  if (name === 'libsql' || name === 'turso') {
    const { createClient } = await import('@libsql/client');
    const { drizzle } = await import('drizzle-orm/libsql');
    const { migrate } = await import('drizzle-orm/libsql/migrator');

    const url = sqliteUrl();
    const file = sqliteFile();
    if (file) await ensureDir(file);

    const db = drizzle(createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN }));
    await migrate(db, { migrationsFolder: './drizzle/sqlite' });

    return url;
  }

  if (name === 'better-sqlite3') {
    const { default: Database } = await import('better-sqlite3');
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');

    const file = process.env.DATABASE_URL ?? './data/whispers.db';
    await ensureDir(file);

    migrate(drizzle(new Database(file)), { migrationsFolder: './drizzle/sqlite' });

    return file;
  }

  if (name === 'postgres' || name === 'pg') {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DB_DRIVER=postgres needs DATABASE_URL');

    // `max: 1` because a migration runs statements that must not interleave.
    const client = postgres(url, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: './drizzle/pg' });
    await client.end();

    return 'Postgres';
  }

  throw new Error(
    `DB_DRIVER=${name} is not one this app knows. ` +
      'Use libsql, better-sqlite3 or postgres. D1 is wired in worker.js instead.',
  );
}

/**
 * Removes every table this app owns, so `applyMigrations` rebuilds them.
 *
 * @returns {Promise<string>} what was emptied
 * @throws when the driver is D1 or unknown
 */
export async function dropEverything() {
  const name = driver();
  const TABLES = ['articles', 'assets', 'members', 'settings'];

  if (name === 'd1') {
    throw new Error(
      'D1 keeps its own state. To start it over:\n' +
        `  npx wrangler d1 execute whispers --local --command "drop table if exists ${TABLES.join(', ')}, d1_migrations"\n` +
        '  npx wrangler d1 migrations apply whispers --local',
    );
  }

  if (name === 'libsql' || name === 'turso' || name === 'better-sqlite3') {
    // Tables dropped rather than the file deleted, even for a local file: a
    // server that already opened it keeps a handle on the unlinked inode and
    // goes on serving the data you thought you erased. SQL reaches the same
    // file every other connection is holding.
    const url =
      name === 'better-sqlite3'
        ? `file:${process.env.DATABASE_URL ?? './data/whispers.db'}`
        : sqliteUrl();

    const file = url.startsWith('file:') ? url.slice('file:'.length) : null;
    if (file) await ensureDir(file);

    const { createClient } = await import('@libsql/client');
    const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

    // The bookkeeping table goes too, or the migration thinks it has already
    // run and leaves a database with no tables in it.
    for (const table of [...TABLES, '__drizzle_migrations']) {
      await client.execute(`drop table if exists ${table}`);
    }

    return file ?? url;
  }

  if (name === 'postgres' || name === 'pg') {
    const { default: postgres } = await import('postgres');
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DB_DRIVER=postgres needs DATABASE_URL');

    const client = postgres(url, { max: 1 });
    await client.unsafe(
      `drop table if exists ${TABLES.join(', ')} cascade; drop schema if exists drizzle cascade;`,
    );
    await client.end();
    return 'Postgres';
  }

  throw new Error(`DB_DRIVER=${name} is not one this app knows.`);
}
