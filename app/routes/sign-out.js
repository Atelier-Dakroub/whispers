// Signing out is a POST, because a GET must not change anything. A link that
// signs you out is a link anything else on the web can follow on your behalf —
// an <img src="/sign-out"> in an email would do it. A GET here answers 405.

export const POST = ({ cookies, url }) => {
  cookies.delete('session', { path: '/' });

  return Response.redirect(new URL('/', url), 303);
};
