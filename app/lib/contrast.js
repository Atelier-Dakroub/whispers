// APCA — how readable one color is on another.
//
// WCAG 2's contrast ratio is a formula from the 1980s that does not model how
// human vision actually works: it reports the same number for a pair whether
// the text is dark on light or light on dark, and it passes combinations that
// are genuinely hard to read while failing some that are fine. APCA models
// polarity and perceptual lightness, which is why the numbers below differ
// between a light theme and a dark one built from the same two colors.
//
// This app hands every color to the owner. That is the feature — and it means
// the owner can pick a pair nobody can read. So the settings page measures what
// they chose and says so.
//
// It says so rather than refusing. A contrast score is a strong signal, not a
// law: a masthead in a brand color that lands slightly under the bar is the
// owner's call, and an app that blocked it would be wrong about who decides.
//
// Implementation: APCA-W3 0.1.9, the version the WCAG 3 draft describes.

/** @param {string} hex `#rrggbb` or `#rgb` */
function luminance(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');

  const channel = (i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255;

  // 2.4 straight, not the piecewise sRGB transfer function. APCA specifies the
  // simple exponent, and using the piecewise one shifts the scores.
  return (
    0.2126729 * channel(0) ** 2.4 +
    0.7151522 * channel(2) ** 2.4 +
    0.0721750 * channel(4) ** 2.4
  );
}

/** Very dark colors flare in a way the exponent alone does not predict. */
const clampBlack = (y) => (y < 0.022 ? y + (0.022 - y) ** 1.414 : y);

/**
 * Lightness contrast, 0 to about 106.
 *
 * The sign says which way round it is; every caller here wants the size, so
 * this returns the absolute value.
 *
 * @param {string} text
 * @param {string} background
 * @returns {number} Lc, one decimal place
 */
export function contrast(text, background) {
  const ytxt = clampBlack(luminance(text));
  const ybg = clampBlack(luminance(background));

  if (Math.abs(ybg - ytxt) < 0.0005) return 0;

  let sapc;
  let out;

  if (ybg > ytxt) {
    sapc = (ybg ** 0.56 - ytxt ** 0.57) * 1.14;
    out = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    sapc = (ybg ** 0.65 - ytxt ** 0.62) * 1.14;
    out = sapc > -0.1 ? 0 : sapc + 0.027;
  }

  return Math.round(Math.abs(out) * 1000) / 10;
}

/**
 * What each thing on the page needs.
 *
 * From APCA's font-size and weight table, rounded to the sizes this app
 * actually uses. Body text is the strictest because it is the text somebody
 * reads a hundred lines of.
 */
export const NEEDS = {
  /** Headlines, at 1.12rem. */
  headline: 75,
  /** Day headings, sources, times — small, and read in glances. */
  meta: 60,
  /** Pager and colophon links. */
  link: 75,
  /** A breaking headline, which is larger and heavier. */
  breaking: 60,
};

/**
 * Everything worth checking about a palette, as a list of complaints.
 *
 * Empty means every pair clears its bar. Each entry names the pair in the
 * owner's words — "Text on background", not "inkLight/bgLight" — because the
 * person reading it is choosing colors, not reading the schema.
 *
 * @param {import('../data/settings.js').Settings} settings
 * @returns {{ where: string, what: string, lc: number, need: number }[]}
 */
export function audit(settings) {
  /** @type {{ where: string, what: string, lc: number, need: number }[]} */
  const out = [];

  const check = (where, what, text, bg, need) => {
    const lc = contrast(text, bg);
    if (lc < need) out.push({ where, what, lc, need });
  };

  for (const [where, bg, ink, link, flash] of [
    ['Light', settings.bgLight, settings.inkLight, settings.linkLight, settings.breakingLight],
    ['Dark', settings.bgDark, settings.inkDark, settings.linkDark, settings.breakingDark],
  ]) {
    check(where, 'Headlines on the background', ink, bg, NEEDS.headline);
    check(where, 'Links on the background', link, bg, NEEDS.link);
    check(where, 'Breaking headlines on the background', flash, bg, NEEDS.breaking);
  }

  return out;
}
