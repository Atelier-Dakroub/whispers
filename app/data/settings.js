// Everything the owner can change, as one row per setting — so shipping a new
// setting is a write rather than a migration.
//
// Reads come back as a typed object with defaults filled in, so no caller ever
// handles a missing row or a string that should be a number.

import { DEFAULT_HEADLINE, DEFAULT_INTERFACE, isStack } from '../lib/fonts.js';
import { store } from './db.js';

/**
 * @typedef {object} Settings
 * @property {string} title shown in the masthead and the <title>
 * @property {string} tagline under the masthead, optional
 * @property {boolean} showTitle write the name as well, when a logo is up
 * @property {string} timezone IANA name; decides where a day ends
 * @property {string} locale how a day heading is spelled
 * @property {'auto'|'light'|'dark'} themeMode
 * @property {string} fontHeadline a stack id from lib/fonts.js
 * @property {string} fontInterface a stack id from lib/fonts.js
 * @property {string} bgLight
 * @property {string} inkLight
 * @property {string} linkLight
 * @property {string} bgDark
 * @property {string} inkDark
 * @property {string} linkDark
 * @property {boolean} dayHeadings
 * @property {boolean} showSource
 * @property {boolean} showTime
 * @property {boolean} rules
 * @property {'compact'|'normal'|'relaxed'} density
 * @property {string} breakingLight
 * @property {string} breakingDark
 * @property {number} breakingHours 0 keeps a story breaking until it is unmarked
 * @property {boolean} credit
 * @property {boolean} newTab headlines open in a new tab
 * @property {boolean} sponsor show the sponsor slot
 * @property {string} sponsorText the line the sponsor bought
 * @property {string} sponsorUrl where it points, optional
 * @property {string} sponsorLabel the disclosure above it
 * @property {number} perPage
 * @property {number} passphraseRounds
 */

/** @type {Settings} */
export const DEFAULTS = {
  title: 'whispers.news',
  tagline: '',
  // Whether the masthead writes the name as well as drawing the logo. Off,
  // because a logo stood in place of the name before this setting existed and
  // an upgrade must not redraw a masthead nobody touched. With no logo the
  // name is written either way — the other reading is a masthead with nothing
  // in it.
  showTitle: false,
  timezone: 'UTC',
  // `404.html` is written at build time, where there is no database to read a
  // setting from, so the one page that cannot ask takes it from the
  // environment instead. Everything else reads the row.
  locale: globalThis.process?.env?.SITE_LOCALE ?? 'en-US',
  themeMode: 'auto',
  fontHeadline: DEFAULT_HEADLINE,
  fontInterface: DEFAULT_INTERFACE,
  bgLight: '#fbfaf7',
  inkLight: '#16150f',
  linkLight: '#1c3f8f',
  bgDark: '#12120f',
  inkDark: '#eae7dd',
  // Lightened from #9db9f0, which was APCA Lc 64 on the dark ground and
  // needed 75 for the footer and pager links it colors.
  linkDark: '#b8cdf4',
  dayHeadings: true,
  showSource: true,
  showTime: true,
  rules: true,
  density: 'normal',
  breakingLight: '#c0261c',
  // Lightened from #ff8a7a, which was APCA Lc 57 on the dark ground and
  // needs 60 for a headline. See app/lib/contrast.js.
  breakingDark: '#ff9485',
  // Long enough for a morning story to still be breaking at lunch, short
  // enough that nothing is breaking tomorrow.
  breakingHours: 12,
  credit: true,
  // Off. A new tab is the reader's to ask for — they can already, with a
  // modifier key, and there is no gesture for the opposite.
  newTab: false,
  sponsor: false,
  sponsorText: '',
  sponsorUrl: '',
  // A disclosure, not a decoration. In the United States the FTC requires a
  // paid placement to say so, and other markets have their own rule. It is a
  // setting because the right word differs by market and by language, and it
  // ships filled in because a buyer will not add one that starts empty.
  sponsorLabel: 'Sponsored',
  perPage: 60,
  // See app/data/passphrase.js: workerd refuses PBKDF2 above this.
  passphraseRounds: 100_000,
};

const HEX = /^#[0-9a-f]{6}$/i;
/** Every setting that is a color. Exported so the form can reset all of them. */
export const COLORS = [
  'bgLight',
  'inkLight',
  'linkLight',
  'breakingLight',
  'bgDark',
  'inkDark',
  'linkDark',
  'breakingDark',
];
const MODES = ['auto', 'light', 'dark'];
const DENSITIES = ['compact', 'normal', 'relaxed'];
/**
 * Every setting that is a checkbox. Exported because the settings form reads
 * the boxes off the submission with it, and two copies of this list is how one
 * flag came to be validated here and never sent from there.
 */
export const FLAGS = [
  'showTitle',
  'dayHeadings',
  'showSource',
  'showTime',
  'rules',
  'credit',
  'newTab',
  'sponsor',
];

/**
 * Every setting the settings form carries as a text, number or select input —
 * that is, all of them but the checkboxes, which submit differently.
 *
 * Derived from `DEFAULTS` rather than listed, because a list is something to
 * forget: the two breaking colors were on the form for a week and absent from
 * the hand-written copy of this, so choosing one did nothing at all.
 *
 * `passphraseRounds` is deliberately not on the form, and must not be — the
 * validator below accepts anything down to 10,000, so a submission that could
 * name it could weaken every passphrase hashed afterwards.
 */
export const FIELDS = Object.keys(DEFAULTS).filter(
  (key) => !FLAGS.includes(key) && key !== 'passphraseRounds',
);

/**
 * Line height and row padding together, because that pair is what "density"
 * means to a reader. Changing only the leading moves the words and leaves the
 * rows where they were, which reads as a mistake rather than as a setting.
 */
export const DENSITY = {
  compact: { leading: '1.2', pad: '0.4rem' },
  normal: { leading: '1.35', pad: '0.62rem' },
  relaxed: { leading: '1.5', pad: '0.95rem' },
};

/** Whether a runtime knows this zone. An unknown one would throw at render. */
const knownZone = (name) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
};

/** Whether a runtime knows this locale tag. */
const knownLocale = (tag) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
};

/**
 * Every setting, with defaults for the ones never written.
 *
 * Answers `DEFAULTS` when no database is wired, which is what makes the build
 * of `404.html` work on a machine with no D1 binding.
 *
 * @returns {Promise<Settings>}
 */
export async function all() {
  const current = store();
  if (!current) return { ...DEFAULTS };

  const rows = await current.db
    .select({ key: current.tables.settings.key, value: current.tables.settings.value })
    .from(current.tables.settings);

  const held = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const out = { ...DEFAULTS };

  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in held)) continue;
    const raw = held[key];

    if (typeof DEFAULTS[key] === 'boolean') out[key] = raw === '1';
    else if (typeof DEFAULTS[key] === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = n;
    } else out[key] = raw;
  }

  return out;
}

/**
 * Validates a patch and writes the keys that pass, or writes nothing.
 *
 * Colors land in a `style` attribute the template escapes, so this is not what
 * stands between the page and an injection — but a value that is not a color is
 * a broken site, and the person who typed it should hear about it here.
 *
 * @param {Record<string, unknown>} patch only the keys present are touched
 * @returns {Promise<{ ok: boolean, errors: Record<string, string> }>}
 */
export async function save(patch) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, string>} */
  const writes = {};

  const text = (key, value, { max = 200, required = false } = {}) => {
    const trimmed = String(value ?? '').trim();
    if (required && !trimmed) errors[key] = 'This cannot be empty.';
    else if (trimmed.length > max) errors[key] = `Keep this under ${max} characters.`;
    else writes[key] = trimmed;
  };

  if ('title' in patch) text('title', patch.title, { max: 80, required: true });
  if ('tagline' in patch) text('tagline', patch.tagline, { max: 160 });
  if ('sponsorText' in patch) text('sponsorText', patch.sponsorText, { max: 120 });
  if ('sponsorLabel' in patch) text('sponsorLabel', patch.sponsorLabel, { max: 24 });

  if ('sponsorUrl' in patch) {
    const value = String(patch.sponsorUrl ?? '').trim();
    let url = null;

    if (value) {
      try {
        url = new URL(value);
      } catch {
        url = null;
      }
    }

    // Deliberately not `canonical()` from link-check.js. That function strips
    // tracking parameters, which is right for a headline and wrong here: a
    // sponsor's `utm_` tags are how they measure the placement they paid for.
    if (!value) writes.sponsorUrl = '';
    else if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      errors.sponsorUrl = 'Use a full http or https link.';
    } else if (value.length > 2048) {
      errors.sponsorUrl = 'That link is too long.';
    } else writes.sponsorUrl = value;
  }

  if ('timezone' in patch) {
    const zone = String(patch.timezone ?? '').trim();
    if (!knownZone(zone)) errors.timezone = 'Not a time zone this server knows.';
    else writes.timezone = zone;
  }

  if ('locale' in patch) {
    const tag = String(patch.locale ?? '').trim();
    if (!knownLocale(tag)) errors.locale = 'Not a language tag this server knows.';
    else writes.locale = tag;
  }

  if ('themeMode' in patch) {
    const mode = String(patch.themeMode ?? '');
    if (!MODES.includes(mode)) errors.themeMode = 'Pick automatic, light or dark.';
    else writes.themeMode = mode;
  }

  for (const key of ['fontHeadline', 'fontInterface']) {
    if (!(key in patch)) continue;
    const id = String(patch[key] ?? '');
    // An id, never a font-family value. The list is the allow-list, so nothing
    // a form can say reaches a style attribute.
    if (!isStack(id)) errors[key] = 'Pick one of the font stacks.';
    else writes[key] = id;
  }

  for (const key of COLORS) {
    if (!(key in patch)) continue;
    const value = String(patch[key] ?? '').trim();
    if (!HEX.test(value)) errors[key] = 'Use a six-digit hex color, like #1c3f8f.';
    else writes[key] = value.toLowerCase();
  }

  for (const key of FLAGS) {
    if (key in patch) writes[key] = patch[key] ? '1' : '0';
  }

  if ('density' in patch) {
    const value = String(patch.density ?? '');
    if (!DENSITIES.includes(value)) errors.density = 'Pick compact, normal or relaxed.';
    else writes.density = value;
  }

  if ('perPage' in patch) {
    const n = Number(patch.perPage);
    if (!Number.isInteger(n) || n < 5 || n > 500) errors.perPage = 'Between 5 and 500.';
    else writes.perPage = String(n);
  }

  if ('breakingHours' in patch) {
    const n = Number(patch.breakingHours);
    if (!Number.isInteger(n) || n < 0 || n > 720) {
      errors.breakingHours = 'Between 0 and 720 hours. 0 means until you unmark it.';
    } else writes.breakingHours = String(n);
  }

  if ('passphraseRounds' in patch) {
    const n = Number(patch.passphraseRounds);
    // The ceiling is workerd's, not a preference — above it, sign-in throws
    // rather than slows. See app/data/passphrase.js.
    if (!Number.isInteger(n) || n < 10_000 || n > 100_000) {
      errors.passphraseRounds = 'Between 10,000 and 100,000.';
    } else writes.passphraseRounds = String(n);
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const current = store();
  if (!current) return { ok: false, errors: { _: 'No database is reachable.' } };

  // One upsert per key: a dozen rows, written when somebody clicks Save, is not
  // worth a multi-value statement that would differ between the two dialects.
  for (const [key, value] of Object.entries(writes)) {
    await current.db
      .insert(current.tables.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: current.tables.settings.key, set: { value } });
  }

  return { ok: true, errors: {} };
}

/**
 * The `color-scheme` value for `<html>`, which is the whole light/dark
 * mechanism: `light dark` follows the reader, naming one pins the site to it.
 * No script, no cookie, no flash.
 *
 * @param {Settings} settings
 * @returns {string}
 */
export const colorScheme = (settings) =>
  settings.themeMode === 'auto' ? 'light dark' : settings.themeMode;

/**
 * The instant a story stops counting as breaking: anything marked at or after
 * it still is.
 *
 * An ISO string because that is what the column holds, so the comparison
 * happens in SQL rather than over every row. With `breakingHours` at 0 nothing
 * expires, and the cutoff is a date every real timestamp sorts after.
 *
 * @param {Settings} settings
 * @param {Date} [now]
 * @returns {string}
 */
export function breakingCutoff(settings, now = new Date()) {
  if (!settings.breakingHours) return '0000-01-01T00:00:00.000Z';

  return new Date(now.getTime() - settings.breakingHours * 3600_000).toISOString();
}
