/**
 * Signs out, and only over POST.
 *
 * A GET must not change anything: a link that signs you out is a link anything
 * on the web can follow on your behalf, an `<img src="/sign-out">` in an email
 * included. A GET here answers 405.
 *
 * @param {{ cookies: any, url: string }} ctx
 * @returns {Response}
 */
export const POST = ({ cookies, url }) => {
  cookies.delete('session', { path: '/' });

  return Response.redirect(new URL('/', url), 303);
};
