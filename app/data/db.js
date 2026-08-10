// The database, handed in from outside.
//
// `ctx` carries no `env` — that would name one runtime, and this app runs on
// four — so whichever entry knows the runtime builds a Drizzle instance and
// leaves it here. `worker.js` does it for D1, `db.node.js` for everything else.
//
// The slot is a symbol in the global registry rather than a module variable,
// because this file exists more than once at runtime: Vite's SSR graph holds a
// copy, the `--import` preload holds another, and wrangler bundles a third. A
// module variable would be written in one and read from another.
//
// Nothing is imported here and nothing may be: this file is inlined into the
// worker bundle, where a `node:` import is a build error.

const SLOT = Symbol.for('whispers.db');

/**
 * @typedef {object} Store
 * @property {any} db the Drizzle instance
 * @property {any} tables the schema module matching its dialect
 * @property {'sqlite'|'pg'} dialect
 */

/**
 * Wires the database. Called once, by the entry for this runtime.
 *
 * @param {Store} store
 * @returns {void}
 */
export const setDb = (store) => {
  globalThis[SLOT] = store;
};

/**
 * The store, or null when no entry wired one.
 *
 * Null is a real answer: `404.html` is written at build time, where there is no
 * binding, so every repository answers a null store with defaults rather than
 * throwing and failing the build.
 *
 * @returns {Store|null}
 */
export const store = () => globalThis[SLOT] ?? null;

/**
 * Whether a database is reachable at all.
 *
 * @returns {boolean}
 */
export const ready = () => Boolean(globalThis[SLOT]);
