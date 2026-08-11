// The site's own address, which nothing on the server knows by itself.
//
// A feed link and an `og:url` must be absolute, and neither the database nor
// the framework holds a hostname. `SITE_URL` answers when it is set; the
// request's own host is the fallback, and is right until the site answers on
// two names — where a cached page can then carry whichever one asked first.

/**
 * @param {Request|null} [request]
 * @returns {string|null} no trailing slash, or null when there is neither
 */
export function origin(request) {
  const configured = globalThis.process?.env?.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Null rather than a guess. `404.html` is written at build time, where there
  // is no request to read a host from, and a made-up origin in a shared link is
  // worse than none.
  if (!request) return null;

  return new URL(request.url).origin;
}
