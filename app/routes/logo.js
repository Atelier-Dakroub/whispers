// The uploaded logo, served from the database.
//
// One route for both artworks. `/logo` is the one every site has; `/logo?dark`
// is the optional second, for a dark background. The masthead links each with
// its own `v=` stamp, so the year-long cache below is safe and a replaced logo
// is fetched again rather than served from it.

import { LOGO, LOGO_DARK, read } from '../data/assets.js';

export const GET = async ({ request, url }) => {
  const wants = new URL(url).searchParams.has('dark') ? LOGO_DARK : LOGO;

  const asset = await read(wants);
  if (!asset) return new Response('No logo', { status: 404 });

  const headers = {
    'Content-Type': asset.mime,
    ETag: asset.etag,
    'Last-Modified': new Date(asset.updatedAt).toUTCString(),
    'Cache-Control': 'public, max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    // No Content-Security-Policy here. `csp: true` registers the policy
    // middleware ahead of the app's own, so it sets the header on the way out
    // and replaces anything a route set: a per-route policy is not something an
    // app can express right now.
    //
    // It would have been the weaker half anyway. What keeps a hostile SVG off
    // this URL is that `app/data/assets.js` refuses to store one. Bytes checked
    // once stay safe however they are later served.
  };

  // A revalidating browser sends the ETag back. Answering 304 saves resending a
  // quarter of a megabyte for a file that has not changed.
  if (request?.headers.get('if-none-match') === asset.etag) {
    return new Response(null, { status: 304, headers });
  }

  // A Uint8Array is a BufferSource and so a valid body. TypeScript's DOM lib
  // models BodyInit narrowly enough to disagree.
  return new Response(/** @type {BodyInit} */ (asset.bytes), { status: 200, headers });
};
