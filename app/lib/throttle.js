// A limit on sign-in attempts.
//
// A handful of people share this door and each holds one passphrase, so the
// only way in from outside is to guess one. Without a limit, guessing is free
// and unlimited. With one, it is neither.
//
// The counter is in memory, which means it is per-process, and on workerd
// per-isolate. An attacker spread across enough isolates gets more attempts
// than the numbers below suggest. That is a real weakness and the honest fix is
// a shared counter, which would be a database write on every failed sign-in —
// the wrong trade for a site with five accounts. What this does buy is the
// thing that actually happens: a script hammering one address from one place
// stops after eight tries.

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
 * Who is asking, as well as this can be known.
 *
 * Behind Cloudflare, `cf-connecting-ip` is set by the edge and cannot be forged
 * by the client. `x-forwarded-for` can be, by anyone, unless a proxy you run
 * overwrites it — so it is a hint here and not an identity. The address is half
 * the key; the email is the other half, which keeps one attacker from locking
 * out an entire office by failing on purpose.
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

const sweep = (now) => {
  for (const [key, entry] of seen) {
    if (entry.until < now && entry.first + WINDOW < now) seen.delete(key);
  }
};

/**
 * Whether this key may try, and how long until it may.
 *
 * @param {string} key
 * @param {number} [now]
 * @returns {{ allowed: boolean, retryAfter: number }} seconds
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
 * Records a failed attempt, and closes the door once there have been enough.
 *
 * @param {string} key
 * @param {number} [now]
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

/** Forgets a key. Called on a sign-in that worked. */
export const reset = (key) => void seen.delete(key);

/** Only the tests use this. */
export const forget = () => seen.clear();
