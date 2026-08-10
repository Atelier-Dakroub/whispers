// The whole app, over real requests. Nothing is stubbed: these go through CSRF,
// the cookie signing, the guard, the link check and a real database.
//
//   npm test
//
// `pretest` builds, deletes `data/test.db` and migrates it, so every run starts
// from a site nobody has claimed. `--import ./db.node.js` wires that database
// before the app loads, the same way `npm run dev` does.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = fs.existsSync(path.join(root, 'dist', 'routes.json'));
const it = built ? test : test.skip;

const { app } = built ? await import('@transclude/core/production') : { app: null };

const ORIGIN = 'http://localhost';

const get = (url, cookie) =>
  app.request(`${ORIGIN}${url}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });

const post = (url, fields, { cookie, origin = ORIGIN } = {}) =>
  app.request(`${ORIGIN}${url}`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });

/** Multipart, which the logo upload needs and urlencoded cannot carry. */
const postFile = (url, fields, cookie) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);

  return app.request(`${ORIGIN}${url}`, {
    method: 'POST',
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body,
    redirect: 'manual',
  });
};

/** The session cookie out of a Set-Cookie, ready to send back. */
const cookieOf = (res) => (res.headers.get('set-cookie') ?? '').split(';')[0];

const FIRST = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  passphrase: 'correct horse battery',
};

// ── claiming the site ──────────────────────────────────────────────────────

let session = '';

it('an unclaimed site sends everything to /setup', async () => {
  assert.match((await get('/login')).headers.get('location') ?? '', /\/setup$/);
  assert.match((await get('/admin')).headers.get('location') ?? '', /\/setup$/);
  assert.equal((await get('/setup')).status, 200);
});

it('the first visitor claims it and is signed in', async () => {
  const res = await post('/setup', { ...FIRST, again: FIRST.passphrase });

  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /\/admin\/settings$/);

  session = cookieOf(res);
  assert.ok(session.startsWith('session='));
});

it('the passphrase is signed, http-only and not the bare id', async () => {
  const header = (await post('/login', FIRST)).headers.get('set-cookie') ?? '';

  assert.match(header, /HttpOnly/i, 'no script needs it, so no script gets it');
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /^session=[^;]+\.[^;]+/, 'a value and a signature, not just an id');
});

it('/setup closes once somebody has claimed it', async () => {
  assert.match((await get('/setup')).headers.get('location') ?? '', /\/login$/);

  // And it cannot be posted to either, or the window would still be open.
  const res = await post('/setup', {
    name: 'Interloper',
    email: 'nope@example.com',
    passphrase: 'another passphrase here',
    again: 'another passphrase here',
  });
  assert.match(res.headers.get('location') ?? '', /\/login$/);
});

// ── the guard ──────────────────────────────────────────────────────────────

it('the guard turns a signed-out visitor away from every admin page', async () => {
  for (const url of ['/admin', '/admin/settings', '/admin/people']) {
    const res = await get(url);
    assert.equal(res.status, 303, url);
    assert.match(res.headers.get('location') ?? '', /\/login\?next=/, url);
  }
});

it('the guard covers actions, not only the pages', async () => {
  // A layout guard runs during the render, and an action runs before it. Every
  // action under admin/ therefore checks the session itself. This is the test
  // that catches a new admin page whose author forgot — see app/lib/guard.js.
  for (const url of ['/admin', '/admin/settings', '/admin/people']) {
    const res = await post(url, { headline: 'Intruder', url: 'https://evil.test/x' });
    assert.equal(res.status, 303, `signed-out POST ${url} must not be handled`);
    assert.match(res.headers.get('location') ?? '', /\/login\?next=/, url);
  }
});

it('a forged cookie is refused', async () => {
  // The browser can read the id. Signing is what stops it inventing one.
  assert.equal((await get('/admin', 'session=1')).status, 303);
});

it('a cross-origin post is refused even with a real session', async () => {
  const res = await post(
    '/admin',
    { headline: 'From somewhere else', url: 'https://evil.test/y' },
    { cookie: session, origin: 'https://evil.example' },
  );

  assert.equal(res.status, 403);
});

it('sign-in never redirects off this origin', async () => {
  // `/\\evil.example` is the one that matters: it passes a `startsWith('//')`
  // check and still lands on another host, because the URL parser reads a
  // backslash as a slash. Pattern-matching a path cannot catch that, so the
  // value is resolved and its origin compared instead.
  const hostile = [
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil.example',
    '/\\\\evil.example',
    'https:evil.example',
    'http://localhost@evil.example',
  ];

  for (const next of hostile) {
    const res = await post('/login', { ...FIRST, next });
    const location = new URL(res.headers.get('location') ?? '', ORIGIN);

    assert.equal(location.origin, ORIGIN, `next=${next} escaped to ${location.origin}`);
    assert.equal(location.pathname, '/admin', `next=${next} should fall back`);
  }

  // And a real destination still works.
  const good = await post('/login', { ...FIRST, next: '/admin/settings?x=1' });
  assert.match(good.headers.get('location') ?? '', /\/admin\/settings\?x=1$/);
});

it('a wrong passphrase says the same thing as an unknown address', async () => {
  const known = 'ada@example.com';
  const unknown = 'nobody@example.com';

  const wrong = await post('/login', { email: known, passphrase: 'nope' }).then((r) => r.text());
  const missing = await post('/login', { email: unknown, passphrase: 'nope' }).then((r) =>
    r.text(),
  );

  assert.match(wrong, /do not match an account/);

  // The two pages differ in exactly one way, and it is the address the visitor
  // typed being put back in the field. Take that out and they must be identical:
  // anything else left over would be the page saying whether the address is
  // known — which is the thing one message for both failures exists to hide.
  const blank = (page, email) => page.replaceAll(email, 'TYPED');

  assert.equal(
    blank(wrong, known),
    blank(missing, unknown),
    'a difference beyond the echoed address would say which addresses have accounts',
  );
});

// ── posting ────────────────────────────────────────────────────────────────

it('a signed-in post adds a headline, and the page shows it', async () => {
  const res = await post(
    '/admin',
    {
      headline: 'Council votes to keep the ferry running',
      url: 'example.test/ferry?utm_source=newsletter',
      source: 'The Standard',
    },
    { cookie: session },
  );

  // Post/Redirect/Get on success: the form must not be re-rendered as the
  // answer to a POST, or the browser restores what was just typed and a refresh
  // posts it again.
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /\/admin\?posted=[a-f0-9-]{36}$/);

  const page = await get('/').then((r) => r.text());
  assert.match(page, /Council votes to keep the ferry running/);
  assert.match(page, /The Standard/);
});

it('the stored link is canonical, with the tracking tail gone', async () => {
  const page = await get('/').then((r) => r.text());

  assert.match(page, /href="https:\/\/example\.test\/ferry"/);
  assert.doesNotMatch(page, /utm_source/);
});

it('the same link twice is refused', async () => {
  const body = await post(
    '/admin',
    { headline: 'A second go at the ferry', url: 'https://example.test/ferry' },
    { cookie: session },
  ).then((r) => r.text());

  assert.match(body, /Already here/);
});

it('a refusal re-renders and keeps what was typed', async () => {
  // The mirror of the redirect above: a rejected form must come back as a page,
  // with the values still in it to be corrected.
  const res = await post(
    '/admin',
    { headline: 'Worth keeping on the page', url: 'javascript:alert(1)' },
    { cookie: session },
  );

  assert.equal(res.status, 200);
  assert.match(await res.text(), /value="Worth keeping on the page"/);
});

it('a link that is not a public http url is refused', async () => {
  for (const [url, says] of [
    ['javascript:alert(1)', /Only http and https/],
    ['http://localhost:3000/x', /not on the public internet/],
    ['https://user:pw@example.test/x', /Remove the username and password/],
  ]) {
    const body = await post('/admin', { headline: 'No', url }, { cookie: session }).then((r) =>
      r.text(),
    );
    assert.match(body, says, url);
  }
});

it('a draft is not on the page or in the feed until it is published', async () => {
  await post(
    '/admin',
    { headline: 'Still being written', url: 'https://example.test/draft', draft: '1' },
    { cookie: session },
  );

  assert.doesNotMatch(await get('/').then((r) => r.text()), /Still being written/);
  assert.doesNotMatch(await get('/feed.xml').then((r) => r.text()), /Still being written/);

  // The admin list is the one place it does show.
  const admin = await get('/admin', session).then((r) => r.text());
  assert.match(admin, /Still being written/);

  const id = admin.match(/\/admin\/articles\/([a-f0-9-]{36})"[^>]*>Still being written/)?.[1];
  assert.ok(id, 'the draft should be linked from the admin list');

  const published = await post(
    `/admin/articles/${id}`,
    { intent: 'publish' },
    { cookie: session },
  );
  assert.equal(published.status, 303);
  assert.match(await get('/').then((r) => r.text()), /Still being written/);
});

it('headlines come newest first', async () => {
  await post(
    '/admin',
    {
      headline: 'An older story',
      url: 'https://example.test/older',
      publishedAt: '2020-01-01T09:00',
    },
    { cookie: session },
  );

  const page = await get('/').then((r) => r.text());
  assert.ok(
    page.indexOf('Council votes to keep the ferry running') < page.indexOf('An older story'),
    'the 2020 story must sit below today’s',
  );
});

it('deleting a headline takes it off the page', async () => {
  const admin = await get('/admin', session).then((r) => r.text());
  const id = admin.match(/\/admin\/articles\/([a-f0-9-]{36})"[^>]*>An older story/)?.[1];
  assert.ok(id);

  assert.equal(
    (await post(`/admin/articles/${id}`, { intent: 'delete' }, { cookie: session })).status,
    303,
  );
  assert.doesNotMatch(await get('/').then((r) => r.text()), /An older story/);
});

it('deleting is behind a confirmation the platform draws', async () => {
  const admin = await get('/admin', session).then((r) => r.text());
  const id = admin.match(/\/admin\/articles\/([a-f0-9-]{36})/)?.[1];
  assert.ok(id);

  const page = await get(`/admin/articles/${id}`, session).then((r) => r.text());

  // `command`/`commandfor` is the platform's invoker: no script, so no CSP
  // hash, and the focus trap, Escape and backdrop come from the browser.
  assert.match(page, /command="show-modal"/);
  assert.match(page, new RegExp(`commandfor="confirm-${id}"`));
  assert.match(page, new RegExp(`<dialog id="confirm-${id}"`));
  assert.match(page, /command="close"/);

  // The id must carry the article's, or two rows on one page would share a
  // dialog and the invoker would open the wrong one. `key` cannot be the prop
  // name — the compiler takes it as a directive and the prop arrives empty.
  assert.doesNotMatch(page, /id="confirm-"/);

  // And the button inside it still posts the same thing it always did.
  assert.match(page, /name="intent" value="delete"/);
});

it('the admin list paginates instead of silently truncating', async () => {
  const page = await get('/admin', session).then((r) => r.text());

  assert.match(page, /\d+ in all/, 'the total is counted, not the page length');

  // Past the end clamps rather than showing an empty page, which is what
  // deleting the last row on the last page would otherwise leave.
  const far = await get('/admin?page=999', session).then((r) => r.text());
  assert.match(far, /Add one/);
});

it('a font stack reaches the page, and an invented one does not', async () => {
  const fields = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'America/New_York',
    locale: 'en-US',
    themeMode: 'dark',
    fontHeadline: 'didone',
    fontInterface: 'neo-grotesque',
    bgLight: '#ffffff',
    inkLight: '#111111',
    linkLight: '#0000ee',
    bgDark: '#0e1116',
    inkDark: '#e6e9ef',
    linkDark: '#8fb6ff',
    dayHeadings: '1',
    perPage: '40',
  };

  assert.equal((await post('/admin/settings', fields, { cookie: session })).status, 303);

  const page = await get('/').then((r) => r.text());
  assert.match(page, /--font-head: Didot/);
  assert.match(page, /--font-ui: Inter/);

  // The stored value is an id from a fixed list, so nothing a form can say
  // reaches a style attribute.
  const bad = await post(
    '/admin/settings',
    { ...fields, fontHeadline: 'x; background: url(evil)' },
    { cookie: session },
  ).then((r) => r.text());

  assert.match(bad, /Pick one of the font stacks/);
  assert.match(await get('/').then((r) => r.text()), /--font-head: Didot/);
});

// ── the feed ───────────────────────────────────────────────────────────────

it('the feed is RSS and carries the headlines', async () => {
  const res = await get('/feed.xml');
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/rss\+xml/);
  assert.match(body, /<title>Council votes to keep the ferry running<\/title>/);
  assert.match(body, /<link>https:\/\/example\.test\/ferry<\/link>/, 'the link is the story');
});

// ── settings ───────────────────────────────────────────────────────────────

it('settings reach the page, and a bad one saves nothing', async () => {
  const ok = await post(
    '/admin/settings',
    {
      intent: 'save',
      title: 'The Whispers',
      tagline: 'Headlines, nothing else.',
      timezone: 'America/New_York',
      locale: 'en-US',
      themeMode: 'dark',
      bgLight: '#ffffff',
      inkLight: '#111111',
      linkLight: '#0000ee',
      bgDark: '#0e1116',
      inkDark: '#e6e9ef',
      linkDark: '#8fb6ff',
      dayHeadings: '1',
      perPage: '40',
    },
    { cookie: session },
  );
  assert.equal(ok.status, 303);

  const page = await get('/').then((r) => r.text());
  assert.match(page, /<title>The Whispers<\/title>/);
  assert.match(page, /color-scheme: dark/, 'the theme is an attribute, not a script');
  assert.match(page, /--bg-d: #0e1116/);

  const bad = await post(
    '/admin/settings',
    { intent: 'save', title: 'Renamed', bgLight: 'not-a-color' },
    { cookie: session },
  ).then((r) => r.text());

  assert.match(bad, /Nothing was saved/);
  assert.match(
    await get('/').then((r) => r.text()),
    /<title>The Whispers<\/title>/,
    'the valid half of a refused form must not be written either',
  );
});

it('every color on the form saves, and Reset returns all of them', async () => {
  // The field names are read off the form rather than listed here. A list in a
  // test agrees with whatever the action happens to read, which is how the two
  // breaking colors sat on the page for a week doing nothing: the swatches were
  // rendered, and the action's own hand-written list had never heard of them.
  const swatches = (html) =>
    [...html.matchAll(/<input[^>]*?\bname="(\w+)"[^>]*?\btype="color"/g)].map((m) => m[1]);

  const before = swatches(await get('/admin/settings', session).then((r) => r.text()));
  assert.ok(before.length >= 8, `expected the color inputs, found ${before.length}`);

  // A different value per swatch, so one field standing in for another shows up.
  const picked = Object.fromEntries(
    before.map((name, i) => [name, `#${(0x111111 * (i + 3)).toString(16).padStart(6, '0')}`]),
  );

  assert.equal((await post('/admin/settings', { intent: 'save', ...picked }, { cookie: session })).status, 303);

  const saved = await get('/admin/settings', session).then((r) => r.text());
  for (const [name, value] of Object.entries(picked)) {
    assert.match(saved, new RegExp(`name="${name}"[^>]*?value="${value}"`, 's'), `${name} did not save`);
  }

  assert.equal((await post('/admin/settings', { intent: 'reset-colors' }, { cookie: session })).status, 303);

  const back = await get('/admin/settings', session).then((r) => r.text());
  for (const name of before) {
    assert.doesNotMatch(back, new RegExp(`name="${name}"[^>]*?value="${picked[name]}"`, 's'), `${name} survived Reset`);
  }
});

// ── people ─────────────────────────────────────────────────────────────────

let secondSession = '';
let secondPassphrase = '';

it('a second member gets a passphrase, shown once', async () => {
  const body = await post(
    '/admin/people',
    { intent: 'add', name: 'Second Editor', email: 'editor@example.com' },
    { cookie: session },
  ).then((r) => r.text());

  secondPassphrase = body.match(/<code class="secret">([^<]+)<\/code>/)?.[1] ?? '';
  assert.match(secondPassphrase, /^[a-z]+(-[a-z]+){5}$/, 'six words');

  // And it is not shown again on the next load.
  const again = await get('/admin/people', session).then((r) => r.text());
  assert.doesNotMatch(again, new RegExp(secondPassphrase));
});

it('the second member can sign in', async () => {
  const res = await post('/login', {
    email: 'editor@example.com',
    passphrase: secondPassphrase,
  });

  assert.equal(res.status, 303);
  secondSession = cookieOf(res);
  assert.equal((await get('/admin', secondSession)).status, 200);
});

it('removing a member is behind a confirmation naming that member', async () => {
  const page = await get('/admin/people', session).then((r) => r.text());

  assert.match(page, /Remove Second Editor\?/, 'the dialog says who, not "this item"');
  assert.match(page, /commandfor="confirm-member-[a-f0-9-]{36}"/);
  assert.doesNotMatch(page, /id="confirm-member-"/, 'the token must carry the member id');

  // Your own row offers no Remove at all, so the confirmation is never the only
  // thing between somebody and locking themselves out. Count distinct ids: one
  // dialog puts its token in `commandfor`, `id`, `aria-labeledby` and the
  // heading, so counting matches would count a single dialog five times.
  const dialogs = new Set(page.match(/confirm-member-[a-f0-9-]{36}/g) ?? []);
  assert.equal(dialogs.size, 1, 'a dialog for the other member, and none for you');
});

it('removing a member locks that member out and nobody else', async () => {
  // This is the whole reason each person has their own passphrase rather than
  // sharing one: removing the row is the revocation, and it does not disturb
  // anyone else's session.
  const people = await get('/admin/people', session).then((r) => r.text());
  const id = people.match(/value="([a-f0-9-]{36})"/g)?.map((m) => m.slice(7, -1)) ?? [];

  let removed = false;
  for (const candidate of id) {
    const res = await post(
      '/admin/people',
      { intent: 'remove', id: candidate },
      { cookie: session },
    ).then((r) => r.text());
    if (!/Removing yourself|only account|No such person/.test(res)) {
      removed = true;
      break;
    }
  }
  assert.ok(removed, 'the second member should have been removable');

  assert.equal((await get('/admin', secondSession)).status, 303, 'their cookie is now inert');
  assert.equal((await get('/admin', session)).status, 200, 'the first member is unaffected');

  const retry = await post('/login', {
    email: 'editor@example.com',
    passphrase: secondPassphrase,
  }).then((r) => r.text());
  assert.match(retry, /do not match an account/);
});

it('the last account cannot remove itself', async () => {
  const people = await get('/admin/people', session).then((r) => r.text());
  const mine = people.match(/value="([a-f0-9-]{36})"/)?.[1];

  const body = await post(
    '/admin/people',
    { intent: 'remove', id: mine },
    { cookie: session },
  ).then((r) => r.text());

  assert.match(body, /Removing yourself/);
});

// ── the logo ───────────────────────────────────────────────────────────────

it('a logo is stored, served with an ETag, and removed behind a confirmation', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><title>W</title></svg>';
  const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });

  assert.equal(
    (await postFile('/admin/settings', { intent: 'save', title: 'The Whispers', logo: file }, session))
      .status,
    303,
  );

  const served = await get('/logo');
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/svg+xml');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  const etag = served.headers.get('etag') ?? '';
  assert.match(etag, /^"[0-9a-f]{32}"$/);
  assert.equal(
    (await app.request(`${ORIGIN}/logo`, { headers: { 'if-none-match': etag } })).status,
    304,
    'the same bytes must revalidate rather than resend',
  );

  // The masthead points at a versioned URL, because /logo is cached for a year.
  assert.match(await get('/').then((r) => r.text()), /<img src="\/logo\?v=[^"]+"/);

  // An SVG is a document and can carry script. It is inert inside the
  // masthead's <img> and not for somebody who opens /logo directly, so the
  // bytes are refused rather than served carefully.
  const hostile = [
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', /a script tag/],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', /event handler/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>', /javascript: URL/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><b>x</b></foreignObject></svg>', /foreignObject element/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x.png"/></svg>', /another site/],
  ];

  for (const [markup, says] of hostile) {
    const bad = new File([markup], 'logo.svg', { type: 'image/svg+xml' });
    const body = await postFile(
      '/admin/settings',
      { intent: 'save', title: 'The Whispers', logo: bad },
      session,
    ).then((r) => r.text());

    assert.match(body, says, markup.slice(0, 60));
  }

  // And the good one is still the one being served.
  assert.equal((await get('/logo')).headers.get('etag'), etag);

  // A file that is not what it claims is refused.
  const lie = new File([svg], 'logo.png', { type: 'image/png' });
  assert.match(
    await postFile('/admin/settings', { intent: 'save', title: 'The Whispers', logo: lie }, session).then(
      (r) => r.text(),
    ),
    /does not look like a PNG/,
  );

  const settings = await get('/admin/settings', session).then((r) => r.text());
  assert.match(settings, /<dialog id="confirm-logo"/);
  assert.match(settings, /commandfor="confirm-logo"/);

  assert.equal(
    (await post('/admin/settings', { intent: 'remove-logo' }, { cookie: session })).status,
    303,
  );
  assert.equal((await get('/logo')).status, 404);
});

it('a dark logo is used only when the dark background is certain', async () => {
  const svg = (label) =>
    new File(
      [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><title>${label}</title></svg>`],
      'logo.svg',
      { type: 'image/svg+xml' },
    );

  const base = { intent: 'save', title: 'The Whispers', timezone: 'UTC', locale: 'en-US' };

  // One artwork only: it is used whatever the theme, and there is no <picture>
  // to choose between.
  await postFile('/admin/settings', { ...base, themeMode: 'auto', logo: svg('light') }, session);

  const one = await get('/').then((r) => r.text());
  assert.doesNotMatch(one, /<picture/);
  assert.match(one, /<img src="\/logo\?v=/);

  await postFile('/admin/settings', { ...base, themeMode: 'auto', logoDark: svg('dark') }, session);
  assert.equal((await get('/logo?dark')).status, 200);

  // Automatic: the reader decides, so the media query is the right instrument.
  const auto = await get('/').then((r) => r.text());
  assert.match(auto, /<picture/);
  assert.match(auto, /media="\(prefers-color-scheme: dark\)"/);
  assert.match(auto, /srcset="\/logo\?dark&amp;v=/);

  // Pinned dark: the site decides, and the reader's own setting is beside the
  // point. Asking `prefers-color-scheme` here would hand the light artwork to
  // anyone whose laptop is in light mode — on a dark masthead.
  await post('/admin/settings', { ...base, themeMode: 'dark' }, { cookie: session });

  const dark = await get('/').then((r) => r.text());
  assert.doesNotMatch(dark, /<picture|prefers-color-scheme/);
  assert.match(dark, /<img[^>]+src="\/logo\?dark&amp;v=/);

  // Pinned light: the main artwork, and never the dark one.
  await post('/admin/settings', { ...base, themeMode: 'light' }, { cookie: session });

  const light = await get('/').then((r) => r.text());
  assert.doesNotMatch(light, /<picture|logo\?dark/);
  assert.match(light, /<img src="\/logo\?v=/);

  // Removing the dark one falls back rather than breaking the masthead.
  await post('/admin/settings', { intent: 'remove-logo-dark' }, { cookie: session });
  assert.equal((await get('/logo?dark')).status, 404);

  await post('/admin/settings', { ...base, themeMode: 'dark' }, { cookie: session });
  assert.match(await get('/').then((r) => r.text()), /<img src="\/logo\?v=/);

  await post('/admin/settings', { intent: 'remove-logo' }, { cookie: session });
  await post('/admin/settings', { ...base, themeMode: 'auto' }, { cookie: session });
});

it('the logo box is a label around a real file input, not a div', async () => {
  const page = await get('/admin/settings', session).then((r) => r.text());

  const labels = page.match(/<label class="logo-drop"[\s\S]*?<\/label>/g) ?? [];
  assert.equal(labels.length, 2, 'one box per artwork');

  for (const box of labels) {
    // A real input, still posting to the settings form. The whole point of
    // hiding it in CSS rather than replacing it with a div and a script is that
    // it stays keyboard-reachable and announced.
    assert.match(box, /<input[^>]*type="file"/, 'a real file input');
    assert.match(box, /form="settings"/, 'still submits with Save');
    assert.match(box, /class="file-input"/, 'clipped, not display:none');

    // A <label> takes phrasing content. A <p> or <div> inside one is invalid
    // however well it renders, and this box is built entirely from spans.
    assert.doesNotMatch(box, /<(p|div)[\s>]/, 'no flow content inside the label');

    // A button inside a label triggers the label's control. Remove must sit
    // outside, or clicking it would open the file picker.
    assert.doesNotMatch(box, /<button/, 'no button inside the label');

    // Every aria reference has to resolve, or it is worse than no attribute.
    const named = box.match(/aria-labelledby="([^"]+)"/)?.[1].split(' ') ?? [];
    const described = box.match(/aria-describedby="([^"]+)"/)?.[1].split(' ') ?? [];
    assert.ok(named.length >= 1 && described.length >= 1);

    for (const id of [...named, ...described]) {
      assert.match(page, new RegExp(`id="${id}"`), `#${id} must exist`);
    }

    // The accessible name must contain the visible call to action, so speaking
    // it matches what is on screen.
    assert.ok(named.some((id) => id.endsWith('-cta')));
  }

  // The filename readout is a live region, and it sits outside the label so it
  // is not swallowed into the control's accessible name.
  assert.equal((page.match(/aria-live="polite"/g) ?? []).length, 2);
  for (const box of labels) assert.doesNotMatch(box, /aria-live/);
});

// ── pagination ─────────────────────────────────────────────────────────────

it('the reader\'s pages link to each other from the head', async () => {
  // Enough published headlines for three pages at the smallest page size the
  // settings allow, posted here rather than inherited: what earlier tests leave
  // behind is not this test's business. Five is the floor `save` enforces, so a
  // smaller page size would be refused and this would silently prove nothing.
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    await post(
      '/admin',
      { headline: `Paging story ${n}`, url: `https://example.test/paging-${n}` },
      { cookie: session },
    );
  }

  await post(
    '/admin/settings',
    { intent: 'save', title: 'The Whispers', perPage: '5' },
    { cookie: session },
  );

  const first = await get('/').then((r) => r.text());
  const second = await get('/?page=2').then((r) => r.text());

  assert.match(second, /Page 2 of 3/, 'three pages, so page two has one either side');

  // A directive on a tag hoisted into <head> is honored as of core 0.10.0.
  // Before that both of these rendered on every page whatever the data said.
  assert.match(first, /<link rel="next" href="\/\?page=2">/);
  assert.doesNotMatch(first, /rel="prev"/, 'the first page has nothing before it');

  assert.match(second, /<link rel="prev" href="\/">/);
  assert.match(second, /<link rel="next" href="\/\?page=3">/);

  // Past the end clamps rather than serving an empty page.
  const far = await get('/?page=999').then((r) => r.text());
  assert.doesNotMatch(far, /rel="next"/, 'the last page has nothing after it');
});

it('source, time, rules and density are the owner\'s to choose', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
    perPage: '40',
  };

  // Everything on.
  await post(
    '/admin/settings',
    { ...base, dayHeadings: '1', showSource: '1', showTime: '1', rules: '1', density: 'normal' },
    { cookie: session },
  );

  const full = await get('/').then((r) => r.text());
  assert.match(full, /class="source"/);
  assert.match(full, /class="at"/);
  assert.match(full, /--headline-rule: 1px/);
  assert.match(full, /--leading: 1\.35/);

  // Everything off. The source and the time are not rendered and then hidden —
  // they are not rendered, so a screen reader is not read a line the page does
  // not show.
  await post(
    '/admin/settings',
    { ...base, dayHeadings: '1', showSource: '0', showTime: '0', rules: '0', density: 'compact' },
    { cookie: session },
  );

  const bare = await get('/').then((r) => r.text());
  assert.doesNotMatch(bare, /class="source"/);
  assert.doesNotMatch(bare, /class="at"/);
  assert.match(bare, /--headline-rule: 0/);
  assert.match(bare, /--leading: 1\.2/);

  // A flat list has no heading saying which day it is, so the stamp carries the
  // date. Under day headings it does not, because the heading already did.
  await post(
    '/admin/settings',
    { ...base, dayHeadings: '0', showSource: '1', showTime: '1', rules: '1', density: 'normal' },
    { cookie: session },
  );

  const flat = await get('/').then((r) => r.text());
  const flatStamp = flat.match(/class="at"[^>]*>([^<]+)</)?.[1] ?? '';
  // A month name, wherever the locale puts it: en-US writes "Aug 9, 06:47 AM"
  // and en-GB "9 Aug, 06:47", so the assertion is that a month is there at all.
  assert.match(flatStamp, /[A-Za-z]{3}/, `a date and a time, got ${JSON.stringify(flatStamp)}`);

  await post(
    '/admin/settings',
    { ...base, dayHeadings: '1', showSource: '1', showTime: '1', rules: '1', density: 'normal' },
    { cookie: session },
  );
  const grouped = await get('/').then((r) => r.text());
  const groupedStamp = grouped.match(/class="at"[^>]*>([^<]+)</)?.[1] ?? '';
  assert.match(groupedStamp, /^\s*\d\d:\d\d(\s|$)/, 'a time, with the day left to the heading');
  assert.ok(
    groupedStamp.length < flatStamp.length,
    'the heading already said the day, so this one says less',
  );

  // A density it does not know is refused rather than written.
  const bad = await post(
    '/admin/settings',
    { ...base, density: 'airy' },
    { cookie: session },
  ).then((r) => r.text());
  assert.match(bad, /compact, normal or relaxed/);
});

it('the colors can be put back', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
  };

  await post(
    '/admin/settings',
    {
      ...base,
      bgLight: '#ff00ff',
      inkLight: '#00ff00',
      linkLight: '#0000ff',
      bgDark: '#111111',
      inkDark: '#222222',
      linkDark: '#333333',
    },
    { cookie: session },
  );
  assert.match(await get('/').then((r) => r.text()), /--bg-l: #ff00ff/);

  assert.equal(
    (await post('/admin/settings', { intent: 'reset-colors' }, { cookie: session })).status,
    303,
  );

  const back = await get('/').then((r) => r.text());
  assert.match(back, /--bg-l: #fbfaf7/, 'the six are back');
  assert.doesNotMatch(back, /#ff00ff/);

  // And only the six. A reset that also reset the typography would be a
  // different button.
  assert.match(back, /--font-head: Charter|--font-head: Didot/);
});

it('resetting a passphrase ends the sessions opened with the old one', async () => {
  // The reason `member:reset` exists is that a passphrase leaked. If the
  // session cookie outlives the reset, it has done nothing about the person
  // holding that cookie — so the cookie carries a fingerprint of the stored
  // verifier and stops matching the moment it changes.
  const added = await post(
    '/admin/people',
    { intent: 'add', name: 'Temporary Editor', email: 'temp@example.com' },
    { cookie: session },
  ).then((r) => r.text());

  const first = added.match(/<code class="secret">([^<]+)<\/code>/)?.[1] ?? '';
  assert.ok(first, 'a passphrase is shown once');

  const theirs = cookieOf(await post('/login', { email: 'temp@example.com', passphrase: first }));
  assert.equal((await get('/admin', theirs)).status, 200, 'they are in');

  // Their row, not the first row: resetting the wrong person is how this test
  // originally logged out the admin running it.
  const rowOf = (page, email) =>
    page
      .split('<li')
      .find((row) => row.includes(email))
      ?.match(/name="id" value="([a-f0-9-]{36})"/)?.[1] ?? null;

  const id = rowOf(await get('/admin/people', session).then((r) => r.text()), 'temp@example.com');
  assert.ok(id, 'their row carries their id');

  await post('/admin/people', { intent: 'reset', id }, { cookie: session });

  assert.equal((await get('/admin', theirs)).status, 303, 'their old cookie is dead');
  assert.equal(
    (await post('/admin', { headline: 'x', url: 'https://e.test/x' }, { cookie: theirs })).status,
    303,
    'and dead for writes, not only for pages',
  );
  assert.equal((await get('/admin', session)).status, 200, 'the admin is untouched');

  await post('/admin/people', { intent: 'remove', id }, { cookie: session });
  assert.doesNotMatch(
    await get('/admin/people', session).then((r) => r.text()),
    /temp@example\.com/,
    'and the fixture is cleaned up for the tests after this one',
  );
});

// ── contrast ───────────────────────────────────────────────────────────────

it('APCA agrees with the reference implementation', async () => {
  const { contrast } = await import('../app/lib/contrast.js');

  // The three values every APCA implementation is checked against. Getting the
  // transfer function wrong — the piecewise sRGB curve instead of a straight
  // 2.4 exponent — shifts all of these by a few points and nothing else notices.
  assert.equal(contrast('#888888', '#ffffff'), 63.1);
  assert.equal(contrast('#000000', '#ffffff'), 106);
  assert.equal(contrast('#ffffff', '#000000'), 107.9, 'reverse polarity scores differently');

  // Which is the whole reason for using APCA over a WCAG ratio: the same pair
  // is not equally readable both ways round.
  assert.notEqual(contrast('#000000', '#ffffff'), contrast('#ffffff', '#000000'));
});

it('the shipped palette passes, and a bad one is reported rather than refused', async () => {
  const { audit } = await import('../app/lib/contrast.js');
  const { DEFAULTS } = await import('../app/data/settings.js');

  assert.deepEqual(audit(DEFAULTS), [], 'the defaults clear every bar');

  // Mid gray on white: a classic that looks fine to the person who picked it.
  const bad = audit({ ...DEFAULTS, inkLight: '#9a9a9a', linkLight: '#b0b0b0' });
  assert.ok(bad.length >= 2);
  assert.match(bad[0].what, /Headlines/);
  assert.ok(bad[0].lc < bad[0].need);

  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
    bgLight: '#ffffff',
    inkLight: '#9a9a9a',
    linkLight: '#b0b0b0',
    breakingLight: '#c0261c',
    bgDark: '#12120f',
    inkDark: '#eae7dd',
    linkDark: '#b8cdf4',
    breakingDark: '#ff9485',
  };

  // Saved, not blocked: the owner picked these and the app is not the authority
  // on their masthead.
  assert.equal((await post('/admin/settings', base, { cookie: session })).status, 303);
  assert.match(await get('/').then((r) => r.text()), /--ink-l: #9a9a9a/);

  const page = await get('/admin/settings', session).then((r) => r.text());
  assert.match(page, /hard to read/);
  assert.match(page, /Headlines on the background/);

  // Put it back.
  await post(
    '/admin/settings',
    { ...base, inkLight: '#16150f', linkLight: '#1c3f8f' },
    { cookie: session },
  );
  assert.doesNotMatch(
    await get('/admin/settings', session).then((r) => r.text()),
    /hard to read/,
  );
});

// ── breaking ───────────────────────────────────────────────────────────────

it('a breaking story sits above the days, and leaves on its own', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
    dayHeadings: '1',
    showSource: '1',
    showTime: '1',
    rules: '1',
    density: 'normal',
    perPage: '40',
    credit: '1',
  };

  await post('/admin/settings', { ...base, breakingHours: '12' }, { cookie: session });

  await post(
    '/admin',
    {
      headline: 'Ferry service suspended after overnight storm',
      url: 'https://example.test/storm',
      source: 'Marine Bulletin',
      breaking: '1',
    },
    { cookie: session },
  );

  const page = await get('/').then((r) => r.text());
  assert.match(page, /class="breaking"/);
  assert.match(page, /Ferry service suspended/);

  // Above the day headings: a breaking story is not "today", it is "now".
  assert.ok(
    page.indexOf('class="breaking"') < page.indexOf('day-heading'),
    'the band comes before the first day',
  );

  // And it is not also in the day list, which is what excluding it in SQL buys.
  assert.equal(
    (page.match(/Ferry service suspended/g) ?? []).length,
    1,
    'shown once, in the band, not twice',
  );

  // The count is exact: the story is out of the list, not filtered out of a
  // page that was already sized.
  const admin = await get('/admin', session).then((r) => r.text());
  assert.match(admin, /Breaking</, 'and the admin list says so');

  // Now make the window shorter than the story is old. Nothing runs to expire
  // it — the query compares the mark to a cutoff, so it just stops matching.
  await post('/admin/settings', { ...base, breakingHours: '0' }, { cookie: session });
  assert.match(await get('/').then((r) => r.text()), /class="breaking"/, '0 means never expires');

  // A mark in the past, with a one-hour window, is over.
  const id = admin.match(/\/admin\/articles\/([a-f0-9-]{36})"[^>]*>Ferry service/)?.[1];
  assert.ok(id);

  await post('/admin/settings', { ...base, breakingHours: '1' }, { cookie: session });

  const { store } = await import('../app/data/db.js');
  const { articles } = store().tables;
  const { eq } = await import('drizzle-orm');
  await store()
    .db.update(articles)
    .set({ breakingAt: new Date(Date.now() - 3 * 3600_000).toISOString() })
    .where(eq(articles.id, id));

  const later = await get('/').then((r) => r.text());
  assert.doesNotMatch(later, /class="breaking"/, 'the band is gone');
  assert.match(later, /Ferry service suspended/, 'and the story is back in the list');
  assert.equal(
    (later.match(/Ferry service suspended/g) ?? []).length,
    1,
    'still exactly once',
  );

  // Unmarking clears it for good.
  await post(`/admin/articles/${id}`, { intent: 'unbreak' }, { cookie: session });
  await post('/admin/settings', { ...base, breakingHours: '12' }, { cookie: session });
  assert.doesNotMatch(await get('/').then((r) => r.text()), /class="breaking"/);
});

it('the footer credit is on by default and can be turned off', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
  };

  await post('/admin/settings', { ...base, credit: '1' }, { cookie: session });
  const on = await get('/').then((r) => r.text());
  assert.match(on, /Powered by Whispers/);
  assert.match(on, /href="https:\/\/whispers\.news"/);

  await post('/admin/settings', { ...base, credit: '0' }, { cookie: session });
  assert.doesNotMatch(await get('/').then((r) => r.text()), /Powered by Whispers/);

  await post('/admin/settings', { ...base, credit: '1' }, { cookie: session });
});

// ── language and direction ─────────────────────────────────────────────────

it('the locale sets the language and the direction on <html>', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'America/New_York',
    themeMode: 'auto',
  };

  await post('/admin/settings', { ...base, locale: 'ar-LB' }, { cookie: session });

  const rtl = await get('/').then((r) => r.text());
  assert.match(rtl, /<html lang="ar-LB" dir="rtl"/);

  await post('/admin/settings', { ...base, locale: 'en-US' }, { cookie: session });

  const ltr = await get('/').then((r) => r.text());
  assert.match(ltr, /<html lang="en-US" dir="ltr"/);
});

it('the pages carry a content security policy', async () => {
  const res = await get('/');
  const policy = res.headers.get('content-security-policy') ?? '';

  assert.match(policy, /frame-ancestors 'self'/, 'the half a <meta> cannot carry');

  const page = await res.text();
  assert.match(page, /script-src 'self'/, 'and the half it can');
});

it('an invalid field says so in a way CSS and a screen reader can read', async () => {
  // `aria-invalid="${Boolean(x)}"` renders the attribute *bare* when true,
  // because the framework writes a boolean attribute the HTML way. For a
  // boolean attribute like `checked` that is right; for an ARIA state, which is
  // an enumerated string, a bare attribute reads as unset — so the field was
  // neither announced as invalid nor matched by `input[aria-invalid='true']`,
  // and the red border never appeared either.
  const body = await post(
    '/admin',
    { headline: '', url: 'javascript:alert(1)' },
    { cookie: session },
  ).then((r) => r.text());

  assert.match(body, /aria-invalid="true"/, 'the literal string, not a bare attribute');
  assert.doesNotMatch(body, /aria-invalid(?=[\s>])/, 'no bare aria-invalid anywhere');
});

it('the reader-facing words follow the locale', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    themeMode: 'auto',
    dayHeadings: '1',
    // Small enough that there is a pager to read the words off. An earlier test
    // leaves this at 40, and a page count of one renders no pager at all.
    perPage: '5',
  };

  await post('/admin/settings', { ...base, locale: 'fr-FR' }, { cookie: session });

  const fr = await get('/').then((r) => r.text());
  assert.match(fr, /Aller aux titres/, 'the skip link');
  assert.match(fr, /Se connecter/, 'the footer');
  assert.match(fr, />Flux</, 'the feed link');
  assert.match(fr, /Page 1 sur 3/, 'one string with two holes, not "Page" + "of"');
  assert.match(fr, /aujourd’hui/, 'today comes from Intl, not from the table');
  assert.doesNotMatch(fr, /Skip to the headlines|Sign in|Page 1 of/);

  // A language with no entry in the table still gets its dates and its
  // direction; only the eleven words fall back.
  await post('/admin/settings', { ...base, locale: 'ja-JP' }, { cookie: session });
  const ja = await get('/').then((r) => r.text());
  assert.match(ja, /今日/, 'Intl covers locales the string table never will');
  assert.match(ja, /Skip to the headlines/, 'and the words fall back to English');

  await post('/admin/settings', { ...base, locale: 'en-US' }, { cookie: session });
});

it('no reader-facing page has an English string baked into it', async () => {
  // The check that catches the next hard-coded word. Every one of these is a
  // string that used to be in a template.
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    themeMode: 'auto',
    dayHeadings: '1',
  };
  await post('/admin/settings', { ...base, locale: 'ar-LB' }, { cookie: session });

  const page = await get('/').then((r) => r.text());

  for (const english of ['Skip to the headlines', 'Sign in', 'Newer', 'Older', 'Nothing here yet']) {
    assert.doesNotMatch(page, new RegExp(english), `"${english}" is not translated`);
  }

  assert.match(page, /dir="rtl"/, 'and Arabic reads right to left');
  assert.match(page, /انتقل إلى العناوين/);

  await post('/admin/settings', { ...base, locale: 'en-US' }, { cookie: session });
});

// ── the one script ─────────────────────────────────────────────────────────

it('only the settings page carries script, and it is an enhancement', async () => {
  // The reader's page ships none. The theme, the fonts and the colors are
  // custom properties the server wrote, resolved before the first paint.
  const reader = await get('/').then((r) => r.text());
  assert.doesNotMatch(reader, /<script/, "the reader's page must ship no script");

  assert.doesNotMatch(await get('/login').then((r) => r.text()), /<script/);
  assert.doesNotMatch(await get('/admin').then((r) => r.text(), session), /<script/);

  const settings = await get('/admin/settings', session).then((r) => r.text());
  assert.match(settings, /<script[^>]+src="\/assets\/[^"]+\.js"/, 'bundled, not inline');

  // And nothing about the form depends on it: the preview is server-drawn from
  // the same tokens the reader's page uses, and the values are already in the
  // controls.
  assert.match(settings, /class="preview"/);
  assert.match(settings, /id="settings"/);

  // Every value in the preview is a token, never a literal. An inline
  // font-family beats the custom property the script sets, which is exactly why
  // the headline sat still while the select changed.
  assert.doesNotMatch(
    settings.slice(settings.indexOf('class="preview"')),
    /style="font-family:/,
    'the preview must not pin a font-family it cannot follow',
  );
});

// ── signing out ────────────────────────────────────────────────────────────

it('signing out is a POST, and it clears the cookie', async () => {
  assert.equal((await get('/sign-out')).status, 405, 'a link must not sign anyone out');

  const res = await post('/sign-out', {}, { cookie: session });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('set-cookie') ?? '', /session=;|Max-Age=0/);
});

// ── the build ──────────────────────────────────────────────────────────────

it('the 404 page is a file, and cannot know who is asking', async () => {
  // An error page has to be bytes: one that renders when a request has already
  // failed can fail too. It is written at build time, where there is no request
  // and no database — which is why every repository answers a null store with
  // defaults instead of throwing.
  assert.ok(fs.existsSync(path.join(root, 'dist', 'static', '404.html')));

  const res = await get('/no-such-page');
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /Sign out/);
});

it('signing in from /login lands on the admin, not back on /login', async () => {
  // The footer's Sign in link has no `next`, so the form posts back whatever
  // the page put in the hidden field. That used to resolve to /login itself:
  // the session was set and the browser was sent straight back to the sign-in
  // form, which reads as a refusal.
  const form = await get('/login').then((r) => r.text());
  const posted = /name="next" value="([^"]*)"/.exec(form)?.[1];
  assert.ok(posted, 'the form must carry a next field');
  assert.notEqual(posted, '/login', 'the form must not point back at itself');

  const landed = await post('/login', { ...FIRST, next: posted });
  assert.equal(landed.status, 303);
  assert.match(
    landed.headers.get('location') ?? '',
    /\/admin$/,
    'a sign-in with no destination belongs on /admin',
  );

  // Asked for explicitly, it is still refused for the same reason.
  for (const next of ['/login', '/setup']) {
    const res = await post('/login', { ...FIRST, next });
    assert.match(res.headers.get('location') ?? '', /\/admin$/, `next=${next}`);
  }
});

it('the built stylesheet keeps light-dark(), rather than a broken polyfill', () => {
  // LightningCSS rewrites `light-dark()` for old targets into
  //   var(--lightningcss-light, A) var(--lightningcss-dark, B)
  // and did not emit the switch variables that choose between A and B, so both
  // landed in the value at once. An invalid var() inside a shorthand voids the
  // declaration, which turned `border: 1px solid var(--rule)` into no border at
  // all — every rule, every input outline, and the whole palette, gone.
  //
  // vite.config.js pins a target new enough to leave the function alone. This
  // reads the built file because the bug lives in the build, not the source.
  const dir = path.join(root, 'dist', 'client', 'assets');
  const sheet = fs.readdirSync(dir).find((f) => f.endsWith('.css'));
  assert.ok(sheet, 'expected a built stylesheet');

  const css = fs.readFileSync(path.join(dir, sheet), 'utf8');

  assert.doesNotMatch(
    css,
    /--lightningcss-/,
    'light-dark() was polyfilled; check build.cssTarget in vite.config.js',
  );
  assert.match(css, /light-dark\(/, 'the stylesheet should still use light-dark()');
});

it('opening headlines in a new tab is a setting, and it reaches the markup', async () => {
  const base = {
    intent: 'save',
    title: 'The Whispers',
    timezone: 'UTC',
    locale: 'en-US',
    themeMode: 'auto',
    dayHeadings: '1',
  };

  // Off by default: no target at all, rather than target="".
  await post('/admin/settings', base, { cookie: session });
  const closed = await get('/').then((r) => r.text());

  assert.doesNotMatch(closed, /target=/, 'no target attribute when the setting is off');
  assert.doesNotMatch(closed, /Links open in a new tab/, 'and nothing to announce');

  // A breaking story, so the band above the days is really on the page. Without
  // one this test passes while the breaking markup goes unchecked — which it
  // did, and the band is separate markup that has been missed before.
  await post('/admin/settings', { ...base, newTab: '1', breakingHours: '12' }, { cookie: session });
  await post(
    '/admin',
    {
      headline: 'Harbour closed as the swell builds',
      url: 'https://example.test/newtab-breaking',
      source: 'Marine Bulletin',
      breaking: '1',
    },
    { cookie: session },
  );

  const open = await get('/').then((r) => r.text());
  assert.match(open, /class="breaking"/, 'the breaking band must be on the page');

  const links = [...open.matchAll(/<a href="http[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(links.length > 1, 'expected the breaking link and the list links');

  for (const link of links) {
    assert.match(link, /target="_blank"/, link);
    // Still there: it applies when the reader opens a link in a new tab too.
    assert.match(link, /rel="noopener"/, link);
  }

  // Said once, not once per link.
  assert.equal(
    (open.match(/Links open in a new tab/g) ?? []).length,
    1,
    'the note belongs before the list, not on every headline',
  );

  await post('/admin/settings', base, { cookie: session });
});

it('passphrases are hashed at a cost workerd will actually run', async () => {
  // workerd refuses PBKDF2 above 100,000 iterations outright — a
  // NotSupportedError, not a slow response — on every Cloudflare plan. These
  // tests run on Node, which happily does 600,000, so nothing else here can
  // catch a default that makes sign-in impossible on the app's primary
  // deployment target. It shipped that way once.
  const WORKERD_MAX = 100_000;

  const { DEFAULT_ROUNDS, encode } = await import('../app/data/passphrase.js');
  assert.ok(
    DEFAULT_ROUNDS <= WORKERD_MAX,
    `DEFAULT_ROUNDS is ${DEFAULT_ROUNDS}; workerd refuses anything over ${WORKERD_MAX}`,
  );

  // The artifact, not just the constant: the count is baked into the verifier,
  // so it is the stored string that has to be runnable wherever the data lands.
  const rounds = Number((await encode('correct horse battery staple')).split('$')[1]);
  assert.ok(rounds <= WORKERD_MAX, `a new verifier stores ${rounds} rounds`);

  // And the setting that overrides it cannot be pushed past the same ceiling.
  const { save } = await import('../app/data/settings.js');
  const refused = await save({ passphraseRounds: 600_000 });
  assert.equal(refused.ok, false, '600,000 rounds must not be accepted');

  const allowed = await save({ passphraseRounds: WORKERD_MAX });
  assert.equal(allowed.ok, true, `${WORKERD_MAX} rounds must still be allowed`);
});

it('no page that reads the database was written to a file', () => {
  const dir = path.join(root, 'dist', 'static');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

  assert.ok(!files.includes('index.html'), 'the headlines change, so the page is not a file');
  assert.ok(!files.includes('admin'), 'nor is anything behind the guard');
});
