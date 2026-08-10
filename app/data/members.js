// The people allowed to edit the site, one passphrase each rather than one
// shared between them.
//
// The difference only shows when somebody leaves. With a shared secret, taking
// an address off a list is bookkeeping — the person still knows the secret and
// can type a colleague's address. Here the row is the credential.
//
// A passphrase is never stored and never shown twice: `add` and
// `resetPassphrase` return it once, for the admin to hand over.

import { eq } from 'drizzle-orm';
import { store } from './db.js';
import { encode, generate, verify, waste } from './passphrase.js';
import { all as allSettings } from './settings.js';

/**
 * @typedef {object} Member
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} createdAt
 */

/** The columns that may leave this module. `passphrase` is not among them. */
const columns = (tables) => ({
  id: tables.members.id,
  email: tables.members.email,
  name: tables.members.name,
  createdAt: tables.members.createdAt,
});

const normalize = (email) => String(email ?? '').trim().toLowerCase();

/**
 * How many people can sign in. Zero means the site has not been claimed yet,
 * which is what puts `/setup` in front of `/login`.
 *
 * @returns {Promise<number>}
 */
export async function count() {
  const current = store();
  if (!current) return 0;

  const rows = await current.db.select({ id: current.tables.members.id }).from(current.tables.members);
  return rows.length;
}

/**
 * Everyone, oldest first, without their verifiers.
 *
 * @returns {Promise<Member[]>}
 */
export async function list() {
  const current = store();
  if (!current) return [];

  return current.db
    .select(columns(current.tables))
    .from(current.tables.members)
    .orderBy(current.tables.members.createdAt);
}

/**
 * A short fingerprint of a stored verifier, carried in the session cookie so
 * that changing a passphrase ends every session opened with the old one.
 *
 * Hashing an already salted hash reveals nothing and costs microseconds.
 *
 * @param {string} passphrase the stored verifier, not a plain passphrase
 * @returns {Promise<string>}
 */
async function fingerprint(passphrase) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase));

  return [...new Uint8Array(bytes)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The value to put in the session cookie.
 *
 * @param {string} id
 * @returns {Promise<string|null>} `<id>.<fingerprint>`, or null if no such member
 */
export async function sessionValue(id) {
  const current = store();
  if (!current || !id) return null;

  const rows = await current.db
    .select({ passphrase: current.tables.members.passphrase })
    .from(current.tables.members)
    .where(eq(current.tables.members.id, String(id)))
    .limit(1);

  if (!rows[0]) return null;

  return `${id}.${await fingerprint(rows[0].passphrase)}`;
}

/**
 * The member a session cookie names, or null when the fingerprint no longer
 * matches — which is what makes a passphrase reset hang up old sessions.
 *
 * @param {string|undefined} value the cookie's value
 * @returns {Promise<Member|null>}
 */
export async function bySession(value) {
  const current = store();
  if (!current || !value) return null;

  const [id, mark] = String(value).split('.');
  if (!id || !mark) return null;

  const rows = await current.db
    .select({ ...columns(current.tables), passphrase: current.tables.members.passphrase })
    .from(current.tables.members)
    .where(eq(current.tables.members.id, id))
    .limit(1);

  const row = rows[0];
  if (!row || (await fingerprint(row.passphrase)) !== mark) return null;

  const { passphrase: _hidden, ...member } = row;
  return member;
}

/**
 * The member an id names.
 *
 * @param {string} id
 * @returns {Promise<Member|null>}
 */
export async function find(id) {
  const current = store();
  if (!current || !id) return null;

  const rows = await current.db
    .select(columns(current.tables))
    .from(current.tables.members)
    .where(eq(current.tables.members.id, String(id)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * The member those credentials name, or null.
 *
 * An unknown address costs the same as a wrong passphrase, because `waste` runs
 * the same derivation against a verifier nobody holds. Without it the timing
 * difference is a way to ask which addresses have accounts here.
 *
 * @param {string} email
 * @param {string} passphrase
 * @returns {Promise<Member|null>}
 */
export async function signIn(email, passphrase) {
  const current = store();
  if (!current) return null;

  const rows = await current.db
    .select({ ...columns(current.tables), passphrase: current.tables.members.passphrase })
    .from(current.tables.members)
    .where(eq(current.tables.members.email, normalize(email)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    await waste(String(passphrase ?? ''));
    return null;
  }

  if (!(await verify(String(passphrase ?? ''), row.passphrase))) return null;

  const { passphrase: _hidden, ...member } = row;
  return member;
}

/**
 * Adds a member and returns the passphrase to hand over, once.
 *
 * @param {{ email: string, name: string, passphrase?: string }} input
 * @returns {Promise<{ ok: true, member: Member, passphrase: string }
 *   | { ok: false, errors: Record<string, string> }>}
 */
export async function add({ email, name, passphrase }) {
  const current = store();
  if (!current) return { ok: false, errors: { _: 'No database is reachable.' } };

  /** @type {Record<string, string>} */
  const errors = {};
  const address = normalize(email);
  const who = String(name ?? '').trim();

  // Deliberately loose: the grammar of an address is not something a regex
  // settles, and this list is typed by somebody who knows their own team.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) errors.email = 'That is not an email address.';
  if (address.length > 200) errors.email = 'That address is too long.';
  if (!who) errors.name = 'A name is needed — it is the byline.';
  if (who.length > 80) errors.name = 'Keep the name under 80 characters.';

  const secret = String(passphrase ?? '').trim() || generate();
  if (secret.length < 12) errors.passphrase = 'At least 12 characters.';
  if (secret.length > 200) errors.passphrase = 'At most 200 characters.';

  if (Object.keys(errors).length) return { ok: false, errors };

  const existing = await current.db
    .select({ id: current.tables.members.id })
    .from(current.tables.members)
    .where(eq(current.tables.members.email, address))
    .limit(1);

  if (existing.length) return { ok: false, errors: { email: 'That address is already on the list.' } };

  const { passphraseRounds } = await allSettings();

  const member = {
    id: crypto.randomUUID(),
    email: address,
    name: who,
    passphrase: await encode(secret, passphraseRounds),
    createdAt: new Date().toISOString(),
  };

  await current.db.insert(current.tables.members).values(member);

  return {
    ok: true,
    member: { id: member.id, email: member.email, name: member.name, createdAt: member.createdAt },
    passphrase: secret,
  };
}

/**
 * A new passphrase for one person, returned once.
 *
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function resetPassphrase(id) {
  const current = store();
  if (!current) return null;

  const member = await find(id);
  if (!member) return null;

  const secret = generate();
  const { passphraseRounds } = await allSettings();

  await current.db
    .update(current.tables.members)
    .set({ passphrase: await encode(secret, passphraseRounds) })
    .where(eq(current.tables.members.id, member.id));

  return secret;
}

/**
 * Removes a member, unless they are the last one.
 *
 * A site with no members falls back to `/setup`, so removing yourself when
 * alone would hand it to whoever loads it next.
 *
 * @param {string} id
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function remove(id) {
  const current = store();
  if (!current) return { ok: false, error: 'No database is reachable.' };

  if ((await count()) <= 1) {
    return { ok: false, error: 'This is the only account. Add another before removing this one.' };
  }

  await current.db.delete(current.tables.members).where(eq(current.tables.members.id, String(id)));

  return { ok: true };
}
