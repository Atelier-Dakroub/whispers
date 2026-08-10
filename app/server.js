// This app's own Hono middleware. The default export is handed the app before
// any route is registered.
//
// One route lives here rather than in `routes/`: the feed.
//
// The framework has a `feed` block in the config that would do most of this,
// and it is the wrong tool here for two reasons. The config is evaluated before
// a database exists, so `title` and `hostname` would have to come from
// environment variables rather than from the settings the owner edits. And the
// build writes a static `feed.xml` into `dist/static` from whatever that
// function returned at build time — on a machine with no D1 binding, an empty
// one — which would then be served in front of the live route.
//
// Middleware does not run during a build, so a route registered here has
// neither problem.

import { recent } from './data/articles.js';
import { all as readSettings } from './data/settings.js';

/** The most a reader wants in one document. The archive is on the site. */
const LIMIT = 50;

const escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * The origin to build absolute links from. A feed is read somewhere else by
 * definition, so a relative link in one is a broken link.
 *
 * `SITE_URL` when it is set, and otherwise the origin this request arrived on,
 * which is right for a site that has not been told its own address yet.
 */
const originOf = (request) => {
  const configured = globalThis.process?.env?.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  return new URL(request.url).origin;
};

/** @param {import('hono').Hono} app */
export default function (app) {
  app.get('/feed.xml', async (c) => {
    const site = await readSettings();
    const items = await recent(LIMIT);
    const origin = originOf(c.req.raw);

    // The channel's own timestamp is the newest thing in it, never the clock:
    // a feed whose bytes change on every request cannot be cached by anything.
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
          // The link is the story, on somebody else's site. That is what this
          // app is: a page of links.
          `<link>${escape(item.url)}</link>`,
          // The URL is the identity, and `isPermaLink="false"` says the guid is
          // not a page on *this* site. Without it a reader may try to fetch it
          // as one.
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

  // Not added, and each for a reason the framework has already settled:
  //
  //   csrf         on by default. See `csrf` in transclude.config.js.
  //   compress     the build writes brotli next to every file and the server
  //                sends it, which beats compressing on each request.
  //   etag         serve.js gives each content-coding its own strong ETag.
  //   secureHeaders  would set a Content-Security-Policy that blocks this
  //                framework's own inlined <style>. `csp: true` in the config
  //                builds one from the hashes of what each page inlines.
}
