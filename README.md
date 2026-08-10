# Whispers

[![CI](https://github.com/Atelier-Dakroub/whispers/actions/workflows/ci.yml/badge.svg)](https://github.com/Atelier-Dakroub/whispers/actions/workflows/ci.yml)

**A headline-only news site you own.** One scannable page: your logo, and links
in descending date order under a heading for each day. Every headline is a link
out. That is the whole product, and the restraint is the point — a reader takes
in forty stories in the time a normal news site spends loading one.

For people who catch stories early and want somewhere to put them: a beat
reporter, a trade newsletter, a neighborhood wire, an internal feed for a team
that reads the same twenty sources.

**The reader's page ships zero JavaScript.** Not "a small amount" — none. The
theme, the fonts and the colors arrive as custom properties the server wrote,
resolved by the browser before the first paint, so light and dark switch with no
flash and no script. The admin ships one file — 2.3 KB, 800 bytes
compressed — and only so the settings form can preview a color while you pick
it.

**You get the repository, not an account.** Nothing phones home, nothing
expires, and there is no key to enter.

```sh
npm install
npm run db:migrate
npm run dev            # http://localhost:1960
```

Open it and the first visitor to an unclaimed site gets a setup page and makes
the first account. No seed script, no hash to generate on a command line,
nothing to edit before it will let you in.

## What it does

- **An admin built for links.** Paste a URL, write the headline, publish.
  Tracking parameters are stripped, and a link already posted is refused — so
  the same story never runs twice. Save as a draft and it stays off the site.
- **Breaking stories that stop being breaking.** Mark one and it sits above the
  day headings in its own color. It expires on its own after a window you set,
  because a `BREAKING` banner that is three days old costs you every future one.
- **Yours to look at.** Eight colors, two font stacks, light and dark, reading
  density, day headings, sources, times, the rules between lines, and whether a
  headline opens in a new tab — all from the admin, with a live preview. Two
  logos, one for a light page and one for a dark one.
- **Contrast you can trust.** The admin measures your palette with
  [APCA](https://git.apcacontrast.com) and tells you what is hard to read. It
  reports rather than refuses: your masthead is your call.
- **More than one person.** Everyone gets their own passphrase, so removing
  somebody locks them out on its own and disturbs nobody else.
- **A feed**, at `/feed.xml`, from the same headlines. Nothing to configure.
- **Six languages** for the reader's chrome, with dates, number systems and
  *today*/*yesterday* from `Intl` — so locales the translation table never saw
  are still right. Right-to-left works.
- **Anywhere JavaScript runs.** Node, Bun, Deno or Cloudflare Workers. A SQLite
  file by default; Turso, Postgres and Cloudflare D1 from the same code.

## What it costs

**Free** for personal, hobby and other noncommercial sites. **$99 once** if
money changes hands because of the site — ads, sponsorships, affiliate links, a
paid newsletter, or a company. Unlimited sites on both, including sites you
build for clients.

Same code either way. See [LICENSE.md](LICENSE.md), or
[whispers.news](https://whispers.news) to buy.

## What the owner can change

Sign in and everything is under `/admin`.

| | |
| --- | --- |
| `/admin` | post a headline, and the list of everything posted, 50 to a page |
| `/admin/articles/<id>` | edit, publish, unpublish, mark breaking, delete |
| `/admin/settings` | name, tagline, time zone, language, fonts, colors, light/dark, day headings, source, time, rules, density, headlines per page, new-tab links, how long a story stays breaking, the footer credit, logo |
| `/admin/people` | add, remove, and reset a passphrase |

A headline holds a headline, a link, an optional source, and a date. It is a
draft or it is published; a draft is on no page and in no feed.

## The database is yours

Drizzle, with the driver chosen by `DB_DRIVER`. One schema serves the whole
SQLite family and a second serves Postgres; both are generated from
`app/data/schema.sqlite.js` and `app/data/schema.pg.js`, which declare the same
tables under the same names.

| `DB_DRIVER` | `DATABASE_URL` | |
| --- | --- | --- |
| `libsql` *(default)* | `file:./data/whispers.db` | a file, or Turso with a `libsql://` URL |
| `better-sqlite3` | `./data/whispers.db` | `npm install better-sqlite3` |
| `postgres` | `postgres://…` | `npm install postgres` |
| — | — | Cloudflare D1, wired in `worker.js` from the binding |

```sh
npm run db:generate    # regenerate both migration sets after a schema change
npm run db:migrate     # apply them to whatever DB_DRIVER names
npm run db:reset -- --yes    # erase everything and start at /setup again
```

Adding a column means editing **both** schema files in the same commit and
running `db:generate`, which does both dialects at once for that reason.

Nothing above `app/data/` imports Drizzle. The routes read through
`articles.js`, `settings.js`, `members.js` and `assets.js`, so a third dialect
is one new schema file rather than a sweep through the app.

## Accounts

Each person has their own passphrase. That is the whole reason removing somebody
works: with a shared secret, taking an address off a list is bookkeeping,
because the person still knows the secret and can type a colleague's address.
Here the row is the credential, and deleting it is the revocation.

A passphrase is generated when you add somebody, shown once, and stored only as
a PBKDF2 verifier. There is no way to look one up again — reset it instead.

```sh
npm run member:list
npm run member:add   -- them@example.com "Their Name"
npm run member:reset -- you@example.com
```

`member:reset` is the way back in when the last passphrase is lost. It needs
shell access to the server, which is the point: it is the one door that does not
open over HTTP.

`db:reset` drops the tables rather than deleting the file, so it takes effect on
a server that is already running — no restart, and no stale process quietly
serving the data you thought you erased.

**Passphrases are hashed at 100,000 PBKDF2 rounds, not OWASP's 600,000.** That
is workerd's ceiling: above it Cloudflare's WebCrypto throws
`NotSupportedError` rather than running slowly, on every plan. An install that
will only ever run on Node, Deno or Bun can raise `passphraseRounds` in the
settings table — the count is written into each stored verifier, so changing it
leaves existing passphrases working. An install that might move to Cloudflare
later should not: the verifiers travel with the data and would fail there,
locking everyone out until each passphrase is reset.

## Links

Every submitted URL is canonicalized before it is stored: a missing scheme is
assumed to be `https`, tracking parameters are stripped, a fragment is dropped,
and a URL already in the table is refused as a duplicate. `http` and `https`
only, no credentials in the URL, no private or non-public hosts.

Set `GOOGLE_SAFE_BROWSING_API_KEY` and each link is also checked against Google
Safe Browsing on the way in and on the way to being published. It is advisory:
a match shows a warning with a **Post anyway** button, the reason is kept on the
record, and a network failure or a missing key lets the post through. Without a
key nothing else changes.

## The reader's page

What the owner can turn on and off: day headings, the source after a headline,
the time a story is dated, the line between headlines, and the reading density
— compact, normal or relaxed, which moves the line height and the space around
each row together, because that pair is what density means to a reader.

The time is the one with a rule behind it. Under a day heading it shows the time
alone, because the heading already said which day. With headings off it carries
the date as well: a bare `06:47` on a three-day-old story reads as this morning.

Colors have a **Reset colors to default** button. It resets the eight and nothing
else — a reset that also changed the typography would be a different button.

## Breaking

A breaking story sits above the day headings, in its own color, under a
`BREAKING` label — the label matters, because color alone is not a signal
everyone receives.

It stops being breaking on its own. The column holds **when** a story was
marked, not that it is, and the page compares that to a cutoff at render time.
So there is no cron, no cleanup job, and no state that can get stuck: a story
marked this morning is out of the band by evening and back in the list with
everything else, still published, nothing lost.

The window is a setting, in hours. `0` keeps a story breaking until somebody
unmarks it.

The reason for the expiry is not tidiness. A `BREAKING` banner that is three
days old costs you the credibility of every future one.

## Selling it

Purchases go through [Polar](https://polar.sh), which is a merchant of record —
so sales tax and VAT are handled and the buyer gets the invoice the pricing page
promises. The checkout link is created in the Polar dashboard and pasted into
`app/routes/_layout.html` in the marketing site, in one place.

**Do not wire Polar's license keys into this app.** Polar can issue keys with
activation limits and a validation endpoint, and it is tempting. But the pricing
page says, in as many words, that there is no key to enter and nothing counting
installs — and the footer credit is honest for the same reason. A key check
would make both of those false, turn every buyer's outage into your outage, and
buy nothing: the license is a legal instrument, and someone willing to ignore it
is equally willing to delete the check from source they were handed.

Treat the key, if you issue one at all, as a receipt.

## The footer credit

`Powered by Whispers` renders in the footer by default, and a setting turns it
off.

Nothing enforces it. The personal license asks you to keep it and the
commercial license does not require it — but this app promises there is no key
to enter and nothing counting installs, and a technical lock would make that
promise false. The admin states which license expects what, and then trusts the
owner.

## Fonts

Two settings, for the two roles the page has: the face headlines are set in,
and the one labels, dates and the admin use. Both come from
[Modern Font Stacks](https://modernfontstacks.com/) — faces already installed on
the machine reading the page, so nothing is downloaded, nothing blocks the first
paint, and there is no license to host.

The settings table holds a stack **id**, never a `font-family` value. An id
cannot carry anything into a style attribute, and a stack can be corrected in
`app/lib/fonts.js` later without touching anybody's data.

## Language and direction

The locale setting decides four things, and only one of them is a translation.

`Intl` handles three on its own, for every locale it ships: how a date is
spelled, how a number is written, and the words *today* and *yesterday* —
`aujourd'hui`, `أمس`, `今日`. None of those is in a table anybody maintains.

The fourth is the eleven words the reader sees that are not the news: the skip
link, the footer, the pager, the empty state, the not-found page. They live in
`app/lib/strings.js`, with English, French, Spanish, German, Portuguese and
Arabic. Adding a language is adding a key; a partial one falls back to English
one string at a time.

The locale also sets `lang` and `dir` on `<html>`, and every direction-sensitive
rule in the stylesheet is logical — `margin-inline-start`, not `margin-left` —
so an Arabic or Hebrew site mirrors with nothing else to change.

**The admin is English and stays English.** It is a hundred and fifty strings
seen by one to five people who chose to install it. This file is the part a
buyer's *audience* reads.

**`404.html` is the exception.** It is written to a file at build time, where
there is no database to read the setting from, so it takes its language from
`SITE_LOCALE` in the build environment instead.

## The logo, light and dark

The upload is the preview box: the whole thing is a `<label>` and the file
input lives inside it, so clicking anywhere opens the picker and the native
control's gray "no file chosen" bar is gone.

The input is still a real `<input type="file">`, clipped to a pixel rather than
`display: none`. That distinction is the whole accessibility of the pattern —
a hidden input is not in the accessibility tree and cannot be tabbed to, which
is how this idiom usually locks out everybody not using a mouse. Clipped, it
stays focusable and announced, and `:focus-within` paints the ring on the box.

Two consequences worth keeping if you edit it: the Remove button sits **outside**
the label, because a button inside one triggers the label's control; and the box
is built from spans, because a `<label>` takes phrasing content and a `<p>`
inside one is invalid however well it renders.

The script adds what hiding the native control took away — the chosen filename,
announced in a live region — plus an instant preview and drag-and-drop. All of
it is additive: with the script blocked, clicking the box opens the picker and
Save uploads.


Two uploads. The first is used everywhere; the second is optional and is used
on a dark background — which is what a wordmark drawn in black ink needs, since
it disappears otherwise. With no second artwork the first is used on both.

Which one ships depends on **who is deciding the theme**, and this is the part
that is easy to get wrong:

| Theme setting | Who decides | What the masthead does |
| --- | --- | --- |
| Follow the reader | the reader | `<picture>` with `media="(prefers-color-scheme: dark)"` |
| Always dark | the site | the dark artwork, no media query |
| Always light | the site | the main artwork, no media query |

`prefers-color-scheme` is the reader's own setting; `color-scheme` on `<html>`
is this site's. They agree only on *follow the reader*. Use the media query
under a pinned theme and a reader whose laptop is in light mode gets the light
artwork on a dark masthead — the exact failure the second upload exists to
prevent. All three rows are tested.

In the admin each preview sits on the ground it is for, rather than on whatever
the admin's own theme happens to be.

## Contrast

Every color is the owner's to choose, which is the feature — and it means a
palette nobody can read is one click away. So the settings page measures what
was chosen and says so, using [APCA](https://git.apcacontrast.com) rather than a
WCAG 2 ratio: APCA accounts for polarity, so the same two colors score
differently as a light theme and as a dark one, which is exactly the thing a
theming feature gets wrong.

It reports; it does not refuse. A masthead in a brand color that lands slightly
under the bar is the owner's call, and an app that blocked it would be wrong
about who decides.

The shipped palette passes on both polarities. Two things in it did not, and
were found by measuring rather than by looking:

- `--muted` — day headings, sources, times — was mixed at one percentage for
  both modes. That is Lc 70 on a light ground and **Lc 33** on a dark one. It is
  now mixed per polarity, 50% and 78%.
- `--rule`, the line between headlines, computed to **Lc 0.0** in dark mode:
  APCA's way of saying the line was not there at all.

Small text got bigger rather than darker where it was failing. Crushing a label
to near-black to pass at 11px wins the measurement and loses the design; the fix
for small is bigger first.

## Light and dark

The six colors live in the database and reach the page as custom properties on
`<body>`. The stylesheet resolves them with `light-dark()` over the
`color-scheme` the theme setting puts on `<html>`.

So the theme is decided before the first paint, by the browser, with no script,
no cookie and no flash — and "follow the reader's setting" costs nothing extra.

## Deploying

### Cloudflare

```sh
npx wrangler d1 create whispers          # paste the id into wrangler.jsonc
npx wrangler d1 migrations apply whispers --remote
npx wrangler secret put COOKIE_SECRET
npm run deploy
```

`wrangler.jsonc` points `migrations_dir` at `drizzle/sqlite`, so wrangler and
`npm run db:migrate` apply the same SQL.

Locally, `npm run start:worker` runs the real workerd with a local D1 after
`npx wrangler d1 migrations apply whispers --local`. Use `npm run dev` for
day-to-day work — it has hot reload and reads a local file instead.

### Anything that runs Node

```sh
npm run build
npm start
```

Set `COOKIE_SECRET`, `DB_DRIVER` and `DATABASE_URL` in the environment.
`.env.example` lists everything.

## Confirming a delete

`app/elements/confirm-button.html` is a `<dialog>` opened by `command` and
`commandfor` — the platform's own invoker. It guards deleting a headline,
removing a member and removing the logo. There is no click handler, so no
script and no CSP hash, and the browser supplies the backdrop, the focus trap,
Escape to dismiss, the inert page behind, and focus returned to the button
afterwards. Confirming submits an ordinary form.

Its `token` prop becomes the dialog's id. It is not called `key`, because `key`
is one of the framework's directives — the compiler takes the attribute and the
prop arrives empty, which gives every dialog on the page the same id.

Invoker commands shipped across all three engines during 2025. On anything
older the button does nothing, so the delete is unreachable rather than
unguarded — the safe direction, but worth knowing.

## Three things worth knowing before editing

**Every action under `admin/` begins with `member(ctx)`** from
`app/lib/guard.js`. Core 0.10.0 runs the layout guards before the action, so
`admin/_layout.html` already turns a signed-out POST away and these calls are
belt and braces — kept because the cost is a line and the failure they prevent
is a silent unauthenticated write, and because a second check survives a page
being moved out from under its guarding layout. `test/app.test.js` asserts a
signed-out POST to every admin route is refused.

**A page that reads the database needs `export const prerender = false`.** The
build renders on a machine with no binding, and would otherwise write a snapshot
that never changes again. `404.html` is the exception: it is always written to a
file, so it has no loader, and every repository answers with defaults when no
database is wired — which is what makes `npm run build` work in CI.

**`vite.config.js` pins `build.cssTarget`, and it is load-bearing.** Below
those versions LightningCSS rewrites every `light-dark()` into a polyfill whose
switch variables it does not emit, so the value becomes invalid — and an invalid
`var()` inside a shorthand voids the whole declaration. `border: 1px solid
var(--rule)` silently becomes no border, and the palette goes with it. Nothing
in the CSS is wrong when this happens, which is what makes it hard to find.
`npm test` checks the built stylesheet for it.

## Versions

Releases are tagged, and [CHANGELOG.md](CHANGELOG.md) says what changed and
whether it needs a migration. To upgrade: pull or download the release, then

```sh
npm install
npm run db:migrate
```

## Commands

| | |
| --- | --- |
| `npm run dev` | dev server, hot reload |
| `npm run check` | types, from the shapes the loaders return |
| `npm test` | the whole app over real requests |
| `npm run preview` | build, then serve the build |
| `npm run start:worker` | the real workerd, on local D1 |
| `npm run deploy` | build and ship to Cloudflare |

The reader's page is cached for a minute and dropped by tag whenever anything is
edited, so an edit shows at once. On Workers that cache is per-isolate: an edit
clears the isolate that served it, and the others catch up within the minute.

`npm audit` reports four moderate advisories, all of them in build-time
tooling — `npm audit --omit=dev` reports none. Nothing there is in the app or
is deployed.

`wrangler.demo.jsonc` is the config behind the public demo at
[demo.whispers.news](https://demo.whispers.news), kept in the repository as a
worked example of `wrangler.jsonc` with its placeholders filled in. Its `npm run
deploy:demo` and `db:migrate:demo` scripts point at a database you do not have;
they are there to be read, not run.
