// The uploaded logo, served from the database. `/logo` is the artwork every
// site has; `/logo?dark` is the optional second one, for a dark background.

import { LOGO, LOGO_DARK, read } from '../data/assets.js';
import { artwork } from '../lib/artwork.js';

/**
 * Serves an artwork, or 404 when that slot is empty.
 *
 * @param {{ request: Request|null, url: string }} ctx
 * @returns {Promise<Response>}
 */
export const GET = async ({ request, url }) => {
  const wants = new URL(url).searchParams.has('dark') ? LOGO_DARK : LOGO;

  return artwork(await read(wants), request);
};
