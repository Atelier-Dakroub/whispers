// Cloudflare Workers entry, sent by `npm run deploy`, and where the database is
// wired for workerd — the job `db.node.js` does for Node.
//
// `env` exists only inside a request, so the store is filled on the first one
// and left in place. That is safe because `env` is one object for the life of
// the isolate, which a `Request` is not.

import { workerFrom } from '@transclude/core/worker';
import { drizzle } from 'drizzle-orm/d1';
import { setDb, store } from './app/data/db.js';
import * as tables from './app/data/schema.sqlite.js';
import * as bundle from './dist/server/assets.js';
import * as entry from './dist/server/entry.js';
import manifest from './dist/routes.json';
import config from './transclude.config.js';

const app = workerFrom({ config, manifest, entry, bundle });

export default {
  /**
   * Wires the database on the first request, then serves.
   *
   * @param {Request} request
   * @param {{ DB: any, COOKIE_SECRET?: string, SITE_URL?: string,
   *   GOOGLE_SAFE_BROWSING_API_KEY?: string }} env
   * @param {any} ctx
   * @returns {Response|Promise<Response>}
   * @throws when no D1 binding named DB is configured
   */
  fetch(request, env, ctx) {
    if (!store()) {
      if (!env.DB) {
        throw new Error(
          '[whispers] no D1 binding named DB. Add one to wrangler.jsonc and run ' +
            '`npx wrangler d1 create whispers`.',
        );
      }

      setDb({ db: drizzle(env.DB), tables, dialect: 'sqlite' });
    }

    // link-check.js and server.js read `process.env`, which workerd fills only
    // for vars it knows about. Copying these two across means neither module
    // needs a branch for this runtime.
    if (globalThis.process?.env) {
      if (env.SITE_URL) globalThis.process.env.SITE_URL ??= env.SITE_URL;
      if (env.GOOGLE_SAFE_BROWSING_API_KEY) {
        globalThis.process.env.GOOGLE_SAFE_BROWSING_API_KEY ??= env.GOOGLE_SAFE_BROWSING_API_KEY;
      }
    }

    // `workerFrom` takes `cookieSecret` from `env.COOKIE_SECRET` itself, which
    // is why the config's own value being null on workerd does not matter.
    return app.fetch(request, env, ctx);
  },
};
