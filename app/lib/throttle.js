// A limit on sign-in attempts, so guessing a passphrase is not free.
//
// The counter lives in memory, so it is per-process and on workerd
// per-isolate: an attacker spread across enough isolates gets more attempts
// than the numbers below suggest. A shared counter would mean a database write
// on every failed sign-in, which is the wrong trade for a site with five
// accounts. This still stops the thing that actually happens — one script
// hammering one address.

/** @type {Map<string, { failures: number, first: number, until: number }>} */
const seen = new Map();

/** How long a run of failures is remembered. */
const WINDOW = 15 * 60 * 1000;

/** Failures allowed inside that window before the door closes. */
const LIMIT = 8;

/** How long it stays closed. */
const LOCKOUT = 15 * 60 * 1000;

/** Bounded, so a flood of distinct addresses cannot grow this without end. */
const MAX_KEYS = 5000;

/**
 * The key an attempt counts against.
 *
 * `cf-connecting-ip` is set by Cloudflare's edge and cannot be forged;
 * `x-forwarded-for` can be by anyone, so it is a hint rather than an identity.
 * The email is the other half of the key, which stops one attacker locking out
 * a whole office by failing on purpose.
 *
 * @param {Request|null} request
 * @param {string} email
 * @returns {string}
 */
export function keyFor(request, email) {
  const headers = request?.headers;
  const ip =
    headers?.get('cf-connecting-ip') ??
    headers?.get('x-real-ip') ??
    headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';

  return `${ip}|${String(email ?? '').trim().toLowerCase()}`;
}

/**
 * Drops entries that are neither locked out nor inside their window.
 *
 * @param {number} now
 * @returns {void}
 */
const sweep = (now) => {
  for (const [key, entry] of seen) {
    if (entry.until < now && entry.first + WINDOW < now) seen.delete(key);
  }
};

/**
 * Whether this key may try again yet.
 *
 * @param {string} key from `keyFor`
 * @param {number} [now]
 * @returns {{ allowed: boolean, retryAfter: number }} `retryAfter` in seconds
 */
export function check(key, now = Date.now()) {
  const entry = seen.get(key);
  if (!entry) return { allowed: true, retryAfter: 0 };

  if (entry.until > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.until - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Records a failed attempt, and locks the key out once there have been enough.
 *
 * @param {string} key from `keyFor`
 * @param {number} [now]
 * @returns {void}
 */
export function fail(key, now = Date.now()) {
  if (seen.size > MAX_KEYS) sweep(now);
  if (seen.size > MAX_KEYS) seen.clear();

  const entry = seen.get(key);

  // A run that started longer ago than the window is not a run any more.
  if (!entry || entry.first + WINDOW < now) {
    seen.set(key, { failures: 1, first: now, until: 0 });
    return;
  }

  entry.failures += 1;
  if (entry.failures >= LIMIT) {
    entry.until = now + LOCKOUT;
    entry.failures = 0;
    entry.first = now;
  }
}

/**
 * Forgets a key, after a sign-in that worked.
 *
 * @param {string} key from `keyFor`
 * @returns {void}
 */
export const reset = (key) => void seen.delete(key);

/**
 * Forgets every key. Only the tests use this.
 *
 * @returns {void}
 */
export const forget = () => seen.clear();
