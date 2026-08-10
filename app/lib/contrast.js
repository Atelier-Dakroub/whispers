// APCA — how readable one color is on another. Implements APCA-W3 0.1.9.
//
// Used instead of a WCAG 2 ratio because APCA accounts for polarity: the same
// two colors score differently as a light theme and as a dark one, which is
// exactly the distinction a theming feature has to get right.
//
// The settings page reports what falls short rather than refusing it. A brand
// color that lands slightly under the bar is the owner's call to make.

/**
 * Screen luminance for a hex color.
 *
 * @param {string} hex `#rrggbb` or `#rgb`
 * @returns {number} 0 to 1
 */
function luminance(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');

  const channel = (i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255;

  // A straight 2.4 exponent, not the piecewise sRGB curve. APCA specifies this
  // one, and the piecewise version shifts every score by a few points.
  return (
    0.2126729 * channel(0) ** 2.4 +
    0.7151522 * channel(2) ** 2.4 +
    0.0721750 * channel(4) ** 2.4
  );
}

/**
 * Softens very dark values, which flare in a way the exponent alone misses.
 *
 * @param {number} y
 * @returns {number}
 */
const clampBlack = (y) => (y < 0.022 ? y + (0.022 - y) ** 1.414 : y);

/**
 * Lightness contrast between two colors.
 *
 * @param {string} text hex
 * @param {string} background hex
 * @returns {number} Lc from 0 to about 106, unsigned, to one decimal
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

/** The Lc each role needs, from APCA's size and weight table. */
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
 * Checks a palette and returns what falls short, empty if nothing does.
 *
 * Complaints name the pair the way the owner sees it, not the way the schema
 * does, because the person reading them is choosing colors.
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
