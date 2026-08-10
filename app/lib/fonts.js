// The font stacks the owner can choose between.
//
// Verbatim from modernfontstacks.com, which picks faces already installed on
// the machines people read on. No web font is downloaded, nothing blocks the
// first paint, and there is no license to buy or host. For a page that is a
// list of links, a font request would be a large fraction of the page weight
// for no reading benefit.
//
// The database stores an `id` from this list, never a font-family value. Two
// reasons, and the second is the one that matters: a stored CSS value is a
// string from a form on its way into a style attribute, which is a thing to
// have to be careful about forever; and an id means a stack can be corrected
// here later without touching anybody's data.

/**
 * @typedef {object} Stack
 * @property {string} id stored in the settings table
 * @property {string} name shown in the admin
 * @property {string} css the font-family value
 */

/** @type {Stack[]} */
export const STACKS = [
  { id: 'system-ui', name: 'System UI', css: 'system-ui, sans-serif' },
  {
    id: 'transitional',
    name: 'Transitional',
    css: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  },
  {
    id: 'old-style',
    name: 'Old Style',
    css: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif",
  },
  {
    id: 'humanist',
    name: 'Humanist',
    css: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
  },
  {
    id: 'geometric-humanist',
    name: 'Geometric Humanist',
    css: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif",
  },
  {
    id: 'classical-humanist',
    name: 'Classical Humanist',
    css: "Optima, Candara, 'Noto Sans', source-sans-pro, sans-serif",
  },
  {
    id: 'neo-grotesque',
    name: 'Neo-Grotesque',
    css: "Inter, Roboto, 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif",
  },
  {
    id: 'monospace-slab-serif',
    name: 'Monospace Slab Serif',
    css: "'Nimbus Mono PS', 'Courier New', monospace",
  },
  {
    id: 'monospace-code',
    name: 'Monospace Code',
    css: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  },
  {
    id: 'industrial',
    name: 'Industrial',
    css: "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif",
  },
  {
    id: 'rounded-sans',
    name: 'Rounded Sans',
    css: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif",
  },
  {
    id: 'slab-serif',
    name: 'Slab Serif',
    css: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif",
  },
  {
    id: 'antique',
    name: 'Antique',
    css: "Superclarendon, 'Bookman Old Style', 'URW Bookman', 'URW Bookman L', 'Georgia Pro', Georgia, serif",
  },
  {
    id: 'didone',
    name: 'Didone',
    css: "Didot, 'Bodoni MT', 'Noto Serif Display', 'URW Palladio L', P052, Sylfaen, serif",
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    css: "'Segoe Print', 'Bradley Hand', Chilanka, TSCu_Comic, casual, cursive",
  },
];

const BY_ID = new Map(STACKS.map((stack) => [stack.id, stack]));

/** Whether a stored value still names a stack. */
export const isStack = (id) => BY_ID.has(String(id));

/**
 * The stack an id names, or the fallback.
 *
 * @param {string} id
 * @param {string} fallback an id, not a stack
 * @returns {Stack}
 */
export const stackOf = (id, fallback) =>
  BY_ID.get(String(id)) ?? BY_ID.get(fallback) ?? STACKS[0];

/** A newspaper reads better in a text face than in the interface one. */
export const DEFAULT_HEADLINE = 'transitional';

/** Labels, datelines, and the whole admin. The reader's own system face. */
export const DEFAULT_INTERFACE = 'system-ui';
