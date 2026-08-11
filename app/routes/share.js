// The share card, which the layout points `og:image` at. Its own route rather
// than a mode on `/logo`, for the reason `/sponsor` is: the two pictures are
// different sizes for different readers, and a scraper asking for one should
// not be able to receive the other.

import { SHARE, read } from '../data/assets.js';
import { artwork } from '../lib/artwork.js';

/**
 * @param {{ request: Request|null }} ctx
 * @returns {Promise<Response>}
 */
export const GET = async ({ request }) => artwork(await read(SHARE), request);
