// The uploaded logo, served from the database. `/logo` is the artwork every
// site has; `/logo?dark` is the optional second one, for a dark background.

import { LOGO, LOGO_DARK, read } from '../data/assets.js';

/**
 * Serves an artwork, or 404 when that slot is empty.
 *
 * Cached for a year, which is safe because the masthead links each artwork with
 * a `v=` stamp that changes whenever the bytes do.
 *
 * @param {{ request: Request|null, url: string }} ctx
 * @returns {Promise<Response>}
 */
export const GET = async ({ request, url }) => {
  const wants = new URL(url).searchParams.has('dark') ? LOGO_DARK : LOGO;

  const asset = await read(wants);
  if (!asset) return new Response('No logo', { status: 404 });

  // No Content-Security-Policy here: `csp: true` registers its middleware ahead
  // of the app's, so it overwrites whatever a route sets. What keeps a hostile
  // SVG off this URL is that assets.js refuses to store one.
  const headers = {
    'Content-Type': asset.mime,
    ETag: asset.etag,
    'Last-Modified': new Date(asset.updatedAt).toUTCString(),
    'Cache-Control': 'public, max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
  };

  if (request?.headers.get('if-none-match') === asset.etag) {
    return new Response(null, { status: 304, headers });
  }

  // A Uint8Array is a BufferSource and so a valid body; TypeScript's DOM lib
  // models BodyInit narrowly enough to disagree.
  return new Response(/** @type {BodyInit} */ (asset.bytes), { status: 200, headers });
};
