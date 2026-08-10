// Getting back in, and getting somebody else in, from a terminal.
//
//   npm run member:list
//   npm run member:reset -- ada@example.com     new passphrase, printed once
//   npm run member:add   -- new@example.com "Their Name"
//
// This is the way back when the last account's passphrase is lost. Without it
// the only answer would be erasing the database, which is a strange thing to
// have to do to a live site because somebody forgot a word.
//
// It needs shell access to the server, which is the point: it is the one door
// that does not open over HTTP.
//
// On Cloudflare there is no shell, so reach the same rows through D1:
//   npx wrangler d1 execute whispers --remote --command "select email from members"
// and delete the row to hand the site back to /setup, or use this script
// locally against the same Turso/Postgres URL.

import process from 'node:process';
import './../db.node.js';
import { add, list, resetPassphrase } from '../app/data/members.js';

const [command, ...rest] = process.argv.slice(2);

const show = (people) => {
  if (!people.length) {
    console.log('Nobody yet. The next visitor to /setup claims the site.');
    return;
  }
  for (const person of people) console.log(`  ${person.email.padEnd(32)} ${person.name}`);
};

if (command === 'list') {
  show(await list());
  process.exit(0);
}

if (command === 'reset') {
  const email = String(rest[0] ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Which one?\n  npm run member:reset -- you@example.com');
    process.exit(1);
  }

  const people = await list();
  const person = people.find((row) => row.email === email);

  if (!person) {
    console.error(`No account for ${email}. There is:`);
    show(people);
    process.exit(1);
  }

  const secret = await resetPassphrase(person.id);
  console.log(`\n  ${person.name} <${person.email}>\n  ${secret}\n`);
  console.log('Shown once. It is stored only as a hash.');
  process.exit(0);
}

if (command === 'add') {
  const email = String(rest[0] ?? '').trim();
  const name = rest.slice(1).join(' ').trim();

  if (!email || !name) {
    console.error('Both are needed:\n  npm run member:add -- new@example.com "Their Name"');
    process.exit(1);
  }

  const result = await add({ email, name });
  if (!result.ok) {
    for (const [field, message] of Object.entries(result.errors)) {
      console.error(`  ${field}: ${message}`);
    }
    process.exit(1);
  }

  console.log(`\n  ${result.member.name} <${result.member.email}>\n  ${result.passphrase}\n`);
  console.log('Shown once. Send it to them.');
  process.exit(0);
}

console.error(
  'Usage:\n' +
    '  npm run member:list\n' +
    '  npm run member:reset -- you@example.com\n' +
    '  npm run member:add   -- new@example.com "Their Name"',
);
process.exit(1);
