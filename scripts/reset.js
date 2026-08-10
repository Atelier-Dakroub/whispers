// Erases the database and migrates it again:
//
//   npm run db:reset -- --yes
//
// Everything goes — headlines, settings, the logo, every account — and the next
// visitor to /setup claims the site. To get back in without losing anything,
// `npm run member:reset` gives one person a new passphrase instead.
//
// The migrate runs inside this process rather than as `&& npm run db:migrate`
// in the npm script, because npm appends `-- --yes` to the end of the whole
// string: chained, the flag lands on the migrate, this refuses, and the migrate
// succeeds — which looks exactly like a reset that worked.

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
