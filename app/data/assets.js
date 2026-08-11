// The logo, and anything else the owner uploads.
//
// Bytes live in the database rather than object storage: one thing to provision
// instead of two, and a backup of the database is a backup of the site.
//
// They are base64 in a text column, because a BLOB is the one type the four
// drivers genuinely disagree about — Buffer, ArrayBuffer, Uint8Array. A third
// more on one small row removes that branch from the code entirely.

import { eq } from 'drizzle-orm';
import { store } from './db.js';

export const LOGO = 'logo';

/**
 * The optional second artwork, for a dark background.
 *
 * A separate row rather than a column on the first, because the table was
 * always keyed by name — so a third variant later is another row rather than
 * another migration.
 */
export const LOGO_DARK = 'logo-dark';

/** The optional artwork for the sponsor slot. Same table, another row. */
export const SPONSOR = 'sponsor';

/**
 * The picture a link to this site shows when somebody pastes it somewhere.
 *
 * Uploaded rather than shipped. A card drawn here would carry this product's
 * name onto the buyer's masthead, and nothing can draw one per site at request
 * time: workerd has no canvas and no rasterizer.
 */
export const SHARE = 'share';

/** What an owner may upload. SVG and PNG cover a wordmark and a bitmap logo. */
export const ACCEPTED = ['image/svg+xml', 'image/png'];

/**
 * Big enough for a detailed wordmark, small enough to sit in a row without
 * thought. Base64 makes the stored string about a third larger again.
 */
export const MAX_BYTES = 256 * 1024;

/**
 * Where a slot disagrees with those defaults.
 *
 * A scraper reads the share card, and that changes all three numbers. It
 * refuses an SVG, because Facebook, X and Slack all skip one — accepting it
 * would store a file nothing displays. It takes twice the bytes, being a
 * picture rather than a wordmark. And it has a floor, because under it the card
 * is drawn small beside the text instead of above it.
 */
const SLOTS = {
  [SHARE]: {
    accepts: ['image/png'],
    max: 512 * 1024,
    min: { width: 600, height: 315 },
  },
};

/**
 * What one slot accepts. The form reads this too, so the `accept` attribute and
 * the check behind it cannot drift apart.
 *
 * @param {string} [name]
 * @returns {{ accepts: string[], max: number, min: { width: number, height: number }|null }}
 */
export const rulesFor = (name = LOGO) =>
  SLOTS[name] ?? { accepts: ACCEPTED, max: MAX_BYTES, min: null };

/**
 * @typedef {object} Asset
 * @property {string} name
 * @property {string} mime
 * @property {Uint8Array} bytes
 * @property {string} updatedAt
 * @property {string} etag
 */

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toBase64 = (bytes) => {
  // In chunks, because `String.fromCharCode(...bytes)` on a 256KB array
  // overflows the argument limit on every runtime here.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
const fromBase64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

/**
 * What must not be inside an uploaded SVG.
 *
 * An SVG is a document, not a picture: it can carry script, fetch a remote
 * resource, and declare entities that expand until the parser gives up. None of
 * that runs inside the masthead's `<img>`, but `/logo` serves the same file at
 * its own URL, where opening it is opening a document from this origin.
 *
 * Refused rather than stripped or served carefully — bytes checked once stay
 * safe behind any CDN, and quietly rewriting somebody's artwork is worse than
 * telling them what is in it.
 */
const SVG_REFUSALS = [
  [/<script[\s>]/i, 'a script tag'],
  [/<foreignObject[\s>]/i, 'a foreignObject element'],
  [/[\s"']on[a-z]+\s*=/i, 'an event handler attribute'],
  [/javascript:/i, 'a javascript: URL'],
  [/<!ENTITY/i, 'an entity declaration'],
  [/<(?:image|use|a)\b[^>]*(?:xlink:)?href\s*=\s*["']?(?:https?:)?\/\//i, 'a link to another site'],
];

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The pixel size a PNG declares.
 *
 * IHDR is required to be the first chunk, so the two numbers are always at the
 * same offset: eight bytes of signature, four of length, four of type, then the
 * width and the height as big-endian 32-bit integers.
 *
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number }|null} null when it is too short
 */
function sizeOf(bytes) {
  if (bytes.length < 24) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * A strong ETag: the same bytes always produce the same one.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>} quoted, ready for the header
 */
async function etagOf(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `"${hex}"`;
}

/**
 * @param {string} [name]
 * @returns {Promise<Asset|null>}
 */
export async function read(name = LOGO) {
  const current = store();
  if (!current) return null;

  const rows = await current.db
    .select()
    .from(current.tables.assets)
    .where(eq(current.tables.assets.name, name))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const bytes = fromBase64(row.content);

  return { name: row.name, mime: row.mime, bytes, updatedAt: row.updatedAt, etag: await etagOf(bytes) };
}

/**
 * Whether an asset exists, without reading it back — the masthead asks on every
 * render and does not want a quarter of a megabyte to answer.
 *
 * @param {string} [name]
 * @returns {Promise<boolean>}
 */
export async function exists(name = LOGO) {
  const current = store();
  if (!current) return false;

  const rows = await current.db
    .select({ name: current.tables.assets.name })
    .from(current.tables.assets)
    .where(eq(current.tables.assets.name, name))
    .limit(1);

  return rows.length > 0;
}

/**
 * The version stamp for a cache-busting query, so a replaced logo is fetched
 * again rather than served from a year-long cache.
 *
 * @param {string} [name]
 * @returns {Promise<string|null>}
 */
export async function stamp(name = LOGO) {
  const current = store();
  if (!current) return null;

  const rows = await current.db
    .select({ updatedAt: current.tables.assets.updatedAt })
    .from(current.tables.assets)
    .where(eq(current.tables.assets.name, name))
    .limit(1);

  return rows[0]?.updatedAt ?? null;
}

/**
 * @param {object} input
 * @param {string} [input.name]
 * @param {string} input.mime
 * @param {Uint8Array} input.bytes
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function write({ name = LOGO, mime, bytes }) {
  const current = store();
  if (!current) return { ok: false, error: 'No database is reachable.' };

  const rules = rulesFor(name);

  if (!rules.accepts.includes(mime)) {
    return {
      ok: false,
      error: rules.accepts.length > 1 ? 'Upload an SVG or a PNG.' : 'Upload a PNG.',
    };
  }

  if (!bytes?.length) return { ok: false, error: 'That file is empty.' };
  if (bytes.length > rules.max) {
    return { ok: false, error: `Keep it under ${Math.round(rules.max / 1024)} KB.` };
  }

  // The declared type is only the browser's word for it, so check the bytes.
  if (mime === 'image/png') {
    if (PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
      return { ok: false, error: 'That does not look like a PNG.' };
    }

    const size = sizeOf(bytes);

    if (rules.min && (!size || size.width < rules.min.width || size.height < rules.min.height)) {
      return {
        ok: false,
        error:
          `That is ${size ? `${size.width} by ${size.height}` : 'too small to read'}. ` +
          `Use at least ${rules.min.width} by ${rules.min.height} pixels, and 1200 by 630 to fill the card.`,
      };
    }
  } else {
    // The whole document, not the first kilobyte: a script at the end is still
    // a script.
    const text = new TextDecoder().decode(bytes);
    if (!text.trimStart().startsWith('<')) {
      return { ok: false, error: 'That does not look like an SVG.' };
    }

    for (const [pattern, what] of SVG_REFUSALS) {
      if (pattern.test(text)) {
        return { ok: false, error: `That SVG contains ${what}. Export it without one.` };
      }
    }
  }

  const row = {
    name,
    mime,
    content: toBase64(bytes),
    updatedAt: new Date().toISOString(),
  };

  await current.db
    .insert(current.tables.assets)
    .values(row)
    .onConflictDoUpdate({
      target: current.tables.assets.name,
      set: { mime: row.mime, content: row.content, updatedAt: row.updatedAt },
    });

  return { ok: true };
}

/**
 * @param {string} [name]
 * @returns {Promise<boolean>}
 */
export async function remove(name = LOGO) {
  const current = store();
  if (!current) return false;

  await current.db.delete(current.tables.assets).where(eq(current.tables.assets.name, name));

  return true;
}
