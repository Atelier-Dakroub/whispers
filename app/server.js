// This app's own Hono middleware, handed the app before any route registers.
//
// The feed is mounted here rather than through the framework's `feed` config
// because that block is evaluated before a database exists — its title would
// have to come from an environment variable instead of the settings — and the
// build would write a static, empty feed.xml in front of the live route.
// Middleware does not run during a build, so a route here has neither problem.

import { recent } from './data/articles.js';
import { all as readSettings } from './data/settings.js';

/** The most a reader wants in one document. The archive is on the site. */
const LIMIT = 50;

/**
 * Escapes text for XML.
 *
 * @param {unknown} text
 * @returns {string}
 */
const escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * The origin to build absolute links from, since a relative link in a feed is a
 * broken one. Falls back to the request's own origin for a site that has not
 * been told its address yet.
 *
 * @param {Request} request
 * @returns {string}
 */
const originOf = (request) => {
  const configured = globalThis.process?.env?.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  return new URL(request.url).origin;
};

/**
 * Mounts this app's routes and middleware.
 *
 * @param {import('hono').Hono} app
 * @returns {void}
 */
export default function (app) {
  app.get('/feed.xml', async (c) => {
    const site = await readSettings();
    const items = await recent(LIMIT);
    const origin = originOf(c.req.raw);

    // The newest item, never the clock: a feed whose bytes change on every
    // request cannot be cached by anything.
    const newest = items[0]?.publishedAt ?? null;

    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '<channel>',
      `<title>${escape(site.title)}</title>`,
      `<link>${escape(origin)}/</link>`,
      `<description>${escape(site.tagline || site.title)}</description>`,
      `<language>${escape(site.locale)}</language>`,
      `<atom:link href="${escape(origin)}/feed.xml" rel="self" type="application/rss+xml"/>`,
      newest ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : '',
      ...items.map((item) =>
        [
          '<item>',
          `<title>${escape(item.headline)}</title>`,
          // The link is the story, on somebody else's site — which is what
          // this app is. `isPermaLink="false"` then stops a reader trying to
          // fetch the guid as a page here.
          `<link>${escape(item.url)}</link>`,
          `<guid isPermaLink="false">${escape(item.id)}</guid>`,
          `<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>`,
          item.source ? `<category>${escape(item.source)}</category>` : '',
          '</item>',
        ].join(''),
      ),
      '</channel>',
      '</rss>',
    ]
      .filter(Boolean)
      .join('\n');

    return c.body(body, 200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Short, because this is the one URL readers poll on a timer.
      'Cache-Control': 'public, max-age=300',
    });
  });

  // No compress, etag or secureHeaders middleware: the framework already
  // precompresses, gives each encoding its own ETag, and builds a CSP from the
  // hashes of what each page inlines. Adding them would be worse than either.
}
