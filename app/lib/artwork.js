// Serving an uploaded image, for the two routes that do it.
//
// `/logo` and `/sponsor` answer with the same headers and the same conditional
// request. One function, so a fix to one is a fix to both.

/**
 * The response for an uploaded image, or 404 when the slot is empty.
 *
 * Cached for a year. That is safe because every page that uses one of these
 * links it with a `v=` stamp, and the stamp changes when the bytes change.
 *
 * @param {{ mime: string, etag: string, updatedAt: string, bytes: Uint8Array }|null} asset
 * @param {Request|null} request
 * @returns {Response}
 */
export function artwork(asset, request) {
  if (!asset) return new Response('Not found', { status: 404 });

  // No Content-Security-Policy here. `csp: true` registers its middleware ahead
  // of the app's and overwrites what a route sets. What keeps a hostile SVG off
  // these URLs is that assets.js refuses to store one.
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

  // A Uint8Array is a BufferSource and so a valid body. TypeScript's DOM lib
  // models BodyInit narrowly enough to disagree.
  return new Response(/** @type {BodyInit} */ (asset.bytes), { status: 200, headers });
}
