// Who is asking, for the pages under admin/.
//
// Every action under admin/ starts with `member` and returns `turnAway` when
// there is none. `admin/_layout.html` already turns a signed-out request away
// before the action runs, so this is a second check rather than the only one —
// it is kept because the failure it prevents is a silent unauthenticated write,
// and because it survives a page being moved out from under that layout.

import { bySession } from '../data/members.js';

/**
 * The signed-in member, or null.
 *
 * @param {{ cookies: any, request: Request|null }} ctx a loader or action context
 * @returns {Promise<{ id: string, email: string, name: string, createdAt: string }|null>}
 */
export async function member(ctx) {
  // Null while prerendering, and reading a signed cookie with no secret throws.
  if (!ctx.request) return null;

  return bySession(await ctx.cookies.signed.get('session'));
}

/**
 * The answer for a request with no session: a redirect to sign in, carrying
 * where to come back to.
 *
 * @param {{ url: string }} ctx a loader or action context
 * @returns {Response}
 */
export function turnAway(ctx) {
  const next = new URL(ctx.url).pathname;

  return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, ctx.url), 303);
}
