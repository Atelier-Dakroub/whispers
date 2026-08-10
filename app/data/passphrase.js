// Passphrase hashing through `crypto.subtle`, which every runtime here has —
// no dependency, and no native build for a buyer to compile.
//
// The stored verifier is one self-describing string:
//
//   pbkdf2-sha256$100000$<salt base64>$<derived base64>
//
// Parameters travel with the hash rather than living in a constant, so raising
// the cost later leaves existing passphrases verifiable and a host on a tight
// CPU budget can lower it without a forced reset.

const encoder = new TextEncoder();

/**
 * The most PBKDF2 iterations that work on every runtime this app targets.
 *
 * OWASP asks for 600,000, and Node, Deno and Bun all manage it — but workerd
 * refuses outright above this figure:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000
 *   are not supported (requested 600000)
 *
 * That is a hard limit in its WebCrypto, not a CPU budget, so it applies on
 * every Cloudflare plan and no amount of waiting gets past it. A higher number
 * here does not make sign-in slow on Workers; it makes sign-in impossible.
 *
 * The count is written into each stored verifier, so an install that will only
 * ever run on Node can raise this and keep working. One that might move to
 * Workers later cannot: the old verifiers would go with it and fail there.
 */
export const DEFAULT_ROUNDS = 100_000;

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

const fromBase64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

/**
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} rounds
 * @returns {Promise<ArrayBuffer>}
 */
async function derive(passphrase, salt, rounds) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' },
    key,
    256,
  );
}

/**
 * A verifier for a new or reset passphrase.
 *
 * @param {string} passphrase
 * @param {number} [rounds]
 * @returns {Promise<string>} the encoded string to store
 */
export async function encode(passphrase, rounds = DEFAULT_ROUNDS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(passphrase, salt, rounds);

  return `pbkdf2-sha256$${rounds}$${toBase64(salt)}$${toBase64(bits)}`;
}

/**
 * Whether an attempt matches a stored verifier.
 *
 * The comparison is constant-time: `===` on two hex strings returns as soon as
 * they differ, and that timing is measurable over enough attempts.
 *
 * @param {string} attempt
 * @param {string|null|undefined} stored an encoded verifier from `encode`
 * @returns {Promise<boolean>} false for anything malformed
 */
export async function verify(attempt, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;

  const rounds = Number(parts[1]);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5_000_000) return false;

  let salt;
  let expected;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }

  const actual = new Uint8Array(await derive(attempt, salt, rounds));
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];

  return diff === 0;
}

/**
 * The same work as a real verification, against a verifier nobody holds.
 *
 * An unknown address has to cost what a known one costs, or the difference is a
 * way to ask which addresses have accounts here.
 *
 * @param {string} attempt
 * @param {number} [rounds]
 * @returns {Promise<false>}
 */
export async function waste(attempt, rounds = DEFAULT_ROUNDS) {
  await derive(attempt, new Uint8Array(16), rounds);
  return false;
}

/**
 * A passphrase for a new member: six words, about 62 bits, and far easier to
 * send to somebody than a random string.
 *
 * @returns {string}
 */
export function generate() {
  const pick = () => WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length];
  return Array.from({ length: 6 }, pick).join('-');
}

// 256 words exactly, so each is 8 bits and the modulo above is unbiased. Short,
// unambiguous, and nothing that reads as a slur or a name.
const WORDS =
  `acid acre aged also arch atom aunt avid away axis bald bark barn base bath bead
   beam bean bear beat beef bell belt bend best bike bill bird bite blue boat bold
   bolt bone book boot bore born both bowl bulk bull burn bush busy cafe cage cake
   calm camp cane cape card care cart case cash cast cave cell chef chin chip city
   clay clip club coal coat code coin cold colt comb cone cook cool copy cord cork
   corn cost cove crew crop crow cube cusp dark dart dash dawn deal dean deep deer
   dent desk dial dice disc dish dock dome done door dose dove down draw drum dual
   dune dusk dust duty each earl earn ease east easy echo edge exit face fact fade
   fair fall fame farm fast fate fawn fern file fill film find fine firm fish five
   flag flat flax flew flow foam foil fold folk fond font food fork form fort four
   fuel full gain gate gave gear gift girl give glad glen glow goal goat gold golf
   gone good gown grab gray grew grid grim grin grip grow gulf hail hair half hall
   halt hand hang hard harp haul have hawk haze head heal heap hear heat held helm
   herb herd hero hide high hill hint hive hold hole holy home hood hoof hook hope
   horn hose host hour huge hunt hurl icon idea idle inch iron isle item jade jazz
   join joke jump keen keep kelp kept kind king kite knee knot lace lake lamb lamp`
    .split(/\s+/)
    .filter(Boolean);

if (WORDS.length !== 256) {
  // A wrong count makes the modulo biased and the entropy claim a lie. Cheaper
  // to fail at import than to ship weaker passphrases quietly.
  throw new Error(`[whispers] the passphrase word list must hold 256 words, not ${WORDS.length}`);
}
