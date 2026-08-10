// Erases the database and applies the migrations again.
//
//   npm run db:reset -- --yes
//
// Everything goes: headlines, settings, the logo and every account. The next
// visitor gets /setup and claims the site.
//
// If you only need back in, you do not want this. `npm run member:reset` gives
// one person a new passphrase and leaves the site alone.
//
// The migrate runs from inside this process rather than as `&& npm run
// db:migrate` in the npm script. `npm run db:reset -- --yes` appends the flag
// to the end of the whole script string, so with a chain it lands on the second
// command: the reset reads no `--yes`, refuses, and the migrate that follows
// succeeds — which looks precisely like a reset that worked.

import process from 'node:process';
import { applyMigrations, dropEverything } from './lib/db-admin.js';

if (!process.argv.includes('--yes') && !process.argv.includes('-y')) {
  console.error(
    'This erases every headline, setting and account.\n' +
      '  npm run db:reset -- --yes\n\n' +
      'To get back in without losing anything:\n' +
      '  npm run member:reset -- you@example.com',
  );
  process.exit(1);
}

try {
  console.log(`Emptied ${await dropEverything()}`);
  console.log(`Migrated ${await applyMigrations()}`);
  console.log('The next visitor to /setup claims the site.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
