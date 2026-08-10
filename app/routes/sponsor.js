// The sponsor's artwork, when the owner uploaded one. A route of its own rather
// than a third mode on `/logo`, because a URL that says `logo` and serves an
// advertisement is a URL that will be blocked by somebody's filter list.

import { SPONSOR, read } from '../data/assets.js';
import { artwork } from '../lib/artwork.js';

/**
 * @param {{ request: Request|null }} ctx
 * @returns {Promise<Response>}
 */
export const GET = async ({ request }) => artwork(await read(SPONSOR), request);
