// Who is asking, for the pages under admin/.
//
// READ THIS BEFORE ADDING A PAGE UNDER admin/.
//
// Every action under admin/ starts with `member`, and returns `turnAway` when
// there is none. Keep doing that.
//
// It is belt and braces now rather than the only thing holding the door.
// Through core 0.8.2 the framework ran a page's POST/PUT/PATCH/DELETE handler
// *before* rendering, layouts included — so `admin/_layout.html` guarded every
// GET below it and no action at all, `ctx.layout` was undefined inside one, and
// a signed-out POST reached the handler. CSRF did not close that: Hono's guard
// rejects a cross-origin form post and claims nothing more, so anything able to
// set an `Origin` header walked past it.
//
// Core 0.10.0 runs the layout guards first. The layout now turns a signed-out
// action away before it starts, and these calls are redundant.
//
// They stay because the cost is one line and the failure they prevent is
// silent: an unauthenticated write, discovered by whoever finds it first. A
// second check also survives a page moved out from under the guarding layout,
// which is a refactor nothing else would catch. `test/app.test.js` asserts a
// signed-out POST to every admin route is refused, so a new page that forgets
// this fails the suite whichever layer is doing the work.

import { find } from '../data/members.js';

/**
 * The signed-in member, or null.
 *
 * @param {{ cookies: any, request: Request|null }} ctx
 * @returns {Promise<{ id: string, email: string, name: string, createdAt: string }|null>}
 */
export async function member(ctx) {
  // Null while prerendering, which is the only time there is no request. There
  // is no visitor at build time, and reading a signed cookie without a secret
  // throws rather than quietly accepting an unsigned value.
  if (!ctx.request) return null;

  const id = await ctx.cookies.signed.get('session');
  return id ? find(id) : null;
}

/**
 * The answer for a request with no session.
 *
 * A redirect rather than a 403: the usual way to arrive here is a session that
 * expired while a form sat open, and the useful answer to that is the sign-in
 * page with somewhere to come back to.
 *
 * @param {{ url: string }} ctx
 * @returns {Response}
 */
export function turnAway(ctx) {
  const next = new URL(ctx.url).pathname;
  return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, ctx.url), 303);
}
