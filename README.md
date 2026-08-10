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

Sign in. All of the controls are below `/admin`.

| | |
| --- | --- |
| `/admin` | post a headline, and the list of everything posted, 50 to a page |
| `/admin/articles/<id>` | edit, publish, unpublish, mark breaking, delete |
| `/admin/settings` | name, tagline, time zone, language, fonts, colors, light/dark, day headings, source, time, rules, density, headlines per page, new-tab links, how long a story stays breaking, the footer credit, logo |
| `/admin/people` | add, remove, and reset a passphrase |

An article has a headline, a link, an optional source, and a date. An article is
a draft, or it is published. A draft is on no page and in no feed.

## The database is yours

The app uses Drizzle. `DB_DRIVER` selects the driver. One schema serves the
SQLite family, and a second schema serves Postgres. The two schemas are
`app/data/schema.sqlite.js` and `app/data/schema.pg.js`. They declare the same
tables with the same names.

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

To add a column, edit both schema files in the same commit. Then run
`db:generate`. That command builds the two dialects together, for this reason.

No file above `app/data/` imports Drizzle. The routes read through
`articles.js`, `settings.js`, `members.js`, and `assets.js`. A third dialect is
therefore one new schema file, not a change through the full app.

## Accounts

Each person has a different passphrase. This is why removal of a person works.
With a shared secret, removal of an address is only bookkeeping: the person
knows the secret and can type the address of a colleague. Here the row is the
credential, and deletion of the row removes the access.

The app makes a passphrase when you add a person. The app shows the passphrase
one time. The app stores only a PBKDF2 verifier. You cannot read a passphrase
again. Reset it instead.

```sh
npm run member:list
npm run member:add   -- them@example.com "Their Name"
npm run member:reset -- you@example.com
```

Use `member:reset` when the last passphrase is lost. The command needs shell
access to the server. This is intentional: it is the one door that does not open
over HTTP.

`db:reset` drops the tables. It does not delete the file. The command therefore
operates on a server that runs, and you do not restart the server. No old
process continues to serve the data that you erased.

**The app hashes a passphrase at 100,000 PBKDF2 rounds. OWASP asks for
600,000.** 100,000 is the limit in workerd. Above the limit, the WebCrypto of
Cloudflare throws `NotSupportedError`. It does not become slow. This is true on
each Cloudflare plan.

An install that runs only on Node, Deno, or Bun can increase `passphraseRounds`
in the settings table. The app writes the count into each stored verifier, so a
change keeps the existing passphrases correct. Do not increase the count if the
install can move to Cloudflare later. The verifiers move with the data and fail
there. Then each person must reset a passphrase.

## Links

The app makes each URL canonical before it stores the URL:

- If the scheme is absent, the app uses `https`.
- The app removes the tracking parameters.
- The app removes the fragment.
- The app refuses a URL that is already in the table.

The app accepts `http` and `https` only. The app refuses credentials in a URL.
The app also refuses a private host and a host that is not public.

Set `GOOGLE_SAFE_BROWSING_API_KEY`. The app then checks each link against Google
Safe Browsing. It checks the link at submission, and again before publication.

The check is advisory:

- A match shows a warning and a **Post anyway** button.
- The app keeps the reason on the record.
- A network failure lets the post through.
- An absent key lets the post through.

Without a key, nothing else changes.

## The reader's page

The owner can enable or disable these items:

- the day headings
- the source after a headline
- the time of a story
- the line between the headlines
- the reading density

The density is compact, normal, or relaxed. It moves the line height and the
space around each row together. That pair is the meaning of density to a reader.

The time has one rule behind it. Below a day heading, the page shows the time
alone, because the heading gives the day. If the headings are off, the time also
carries the date. A bare `06:47` on a story of three days ago looks like this
morning.

The colors have a **Reset colors to default** button. It resets the eight colors
and changes nothing else. A reset that also changed the typography must be a
different button.

## Breaking

A breaking story is above the day headings. It has its own color and a
`BREAKING` label. The label is necessary, because not every reader receives a
color signal.

A story stops to be breaking without help. The column keeps the time when you
marked the story. It does not keep a true or false value. The page compares that
time to a cutoff when it renders. There is therefore no cron job, no cleanup
job, and no state that becomes stuck. You mark a story in the morning. By the
evening the story leaves the band and joins the list, still published, with
nothing lost.

The window is a setting, in hours. `0` keeps a story breaking until a person
removes the mark.

The reason for the limit is not tidiness. Readers will not trust your next
`BREAKING` label if the last one is three days old.

## The sponsor line

The license charges for a site that shows ads, so the app carries a place to put
one. It holds text and a link. It does not hold a script.

The slot sits below the masthead and above the headlines. It is never inside the
list. A reader takes in the full list in one movement, and an interruption
inside it removes the thing this product is for.

Three parts, all in Settings:

- **Disclosure.** The words above the line, `Sponsored` by default. In the
  United States the FTC requires a paid placement to say so, and other markets
  have their own rule. It is a setting because the right word differs by market
  and by language. It renders whenever the slot renders.
- **Text and link.** The link is optional. Without one, the line is text.
- **Artwork.** Optional, uploaded like the logo, and it replaces the text. The
  text becomes the `alt` value.

A paid link gets `rel="sponsored nofollow noopener"`. Google requires
`sponsored` on a link that somebody paid for, and a site without it can receive
a manual action.

The link keeps its query. A headline link goes through `canonical()`, which
strips the tracking parameters. That is right for a headline and wrong here: the
`utm_` tags on a sponsor's link are how they measure what they bought.

**An ad network needs JavaScript from another domain, and this app has no place
for one.** The policy is `script-src 'self'` and `img-src 'self' data:`, so a
network script and its images are blocked. To run one, an owner must:

1. Restate the full Content-Security-Policy. `csp: true` replaces the
   directives; it does not merge them. The site then stops to inherit later
   defaults.
2. Give up the "no JavaScript on the reader's page" claim.
3. Accept a third party that watches the readers.

Direct sponsorship costs none of those three, and it is what a trade wire or a
niche newsletter usually sells.

## The footer credit

The footer shows `Powered by Whispers` by default, and a setting removes it.

Nothing enforces the credit. The personal license asks you to keep it. The
commercial license does not require it. But this app promises that there is no
key to enter and that nothing counts the installs. A technical lock would make
that promise false. The admin states what each license expects, and then trusts
the owner.

## Fonts

There are two settings, for the two roles on the page:

- the face for the headlines
- the face for the labels, the dates, and the admin

Both lists come from [Modern Font Stacks](https://modernfontstacks.com/). Those
faces are already on the machine that reads the page. The browser therefore
downloads nothing, nothing delays the first paint, and there is no license to
host.

The settings table holds a stack **id**. It never holds a `font-family` value.
An id cannot carry text into a style attribute. You can also correct a stack in
`app/lib/fonts.js` later, and no data changes.

## Language and direction

The locale setting controls four things. Only one of them is a translation.

`Intl` controls three of them, for each locale that it supports:

- the format of a date
- the format of a number
- the words *today* and *yesterday*, for example `aujourd'hui`, `أمس`, `今日`

Nobody maintains a table for those three.

The fourth is the 15 strings that the reader sees but that are not the news:

- the skip link
- the footer
- the pager
- the empty state
- the not-found page

They are in `app/lib/strings.js`, in English, French, Spanish, German,
Portuguese, and Arabic. To add a language, add a key. An incomplete language falls back to
English, one string at a time.

The locale also sets `lang` and `dir` on `<html>`. Each direction-sensitive rule
in the stylesheet is logical: it uses `margin-inline-start`, not `margin-left`.
An Arabic site or a Hebrew site therefore mirrors correctly, and you change
nothing else.

**The admin is in English and stays in English.** It has approximately 150
strings. One to five people see them, and those people selected this product.
This file describes the part that the *audience* of a buyer reads.

**`404.html` is the exception.** The build writes it to a file. At that moment
there is no database to read the setting from. The page therefore takes its
language from `SITE_LOCALE` in the build environment.

## The logo, light and dark

The preview box is the upload control. The full box is a `<label>`, and the file
input is inside it. A click anywhere therefore opens the picker, and the gray
"no file chosen" bar of the native control is not visible.

The input is a true `<input type="file">`. The CSS clips it to one pixel. The
CSS does not set `display: none`. That difference is the accessibility of this
pattern. A hidden input is not in the accessibility tree, and the keyboard
cannot reach it. This idiom usually excludes each person who does not use a
mouse. A clipped input stays focusable and stays announced, and `:focus-within`
draws the ring on the box.

Keep two things if you edit this control:

1. The Remove button stays **outside** the label. A button inside a label
   operates the control of that label.
2. The box uses spans. A `<label>` accepts phrasing content, and a `<p>` inside
   a label is invalid, even when the page looks correct.

The script adds what the hidden native control removed: the name of the selected
file, announced in a live region. The script also adds an immediate preview and
drag-and-drop. All of it is additive. If you block the script, a click on the
box opens the picker, and Save uploads the file.

There are two uploads. The app uses the first upload everywhere. The second
upload is optional, and the app uses it on a dark background. A wordmark in
black ink needs the second upload, because it disappears on a dark ground. If
there is no second artwork, the app uses the first artwork on both grounds.

The selection depends on **who decides the theme**. This part is easy to get
wrong.

| Theme setting | Who decides | What the masthead does |
| --- | --- | --- |
| Follow the reader | the reader | `<picture>` with `media="(prefers-color-scheme: dark)"` |
| Always dark | the site | the dark artwork, no media query |
| Always light | the site | the main artwork, no media query |

`prefers-color-scheme` is the setting of the reader. `color-scheme` on `<html>`
is the setting of the site. The two agree only for *follow the reader*. Do not
use the media query with a pinned theme. A reader whose laptop is in light mode
then gets the light artwork on a dark masthead. That is the failure that the
second upload prevents. The tests cover all three rows.

In the admin, each preview sits on the ground that it is for. It does not sit on
the theme of the admin.

## Contrast

Each color is the choice of the owner. That is the feature. It also means that
you can select a palette that nobody can read. The settings page therefore
measures your palette and reports the result. It uses
[APCA](https://git.apcacontrast.com), not a WCAG 2 ratio. APCA includes
polarity: two colors get a different score in a light theme and in a dark theme.
A theming feature usually gets this wrong.

The page shows a warning. The page does not stop you. A masthead in a brand
color can fall a little below the limit. That is the decision of the owner. An
app that refused the color would be wrong about who decides.

The supplied palette passes on both polarities. Two colors did not pass.
Measurement found them; inspection did not:

- `--muted` colors the day headings, the sources, and the times. One percentage
  served both modes. That is Lc 70 on a light ground and **Lc 33** on a dark
  ground. The app now mixes it per polarity, at 50% and 78%.
- `--rule` draws the line between the headlines. In dark mode it computed to
  **Lc 0.0**. In APCA that value means the line was not there.

Where small text failed, the text became larger. It did not become darker. If
you make a label almost black to pass at 11px, you win the measurement and you
lose the design. To correct small text, first make the text larger.

## Light and dark

The eight colors are in the database. They reach the page as custom properties
on `<body>`. The stylesheet resolves them with `light-dark()`, over the
`color-scheme` that the theme setting puts on `<html>`.

The browser therefore selects the theme before the first paint. There is no
script, no cookie, and no flash. "Follow the reader's setting" costs nothing
more.

## Deploying

### Cloudflare

```sh
npx wrangler d1 create whispers          # paste the id into wrangler.jsonc
npx wrangler d1 migrations apply whispers --remote
npx wrangler secret put COOKIE_SECRET
npm run deploy
```

`wrangler.jsonc` points `migrations_dir` at `drizzle/sqlite`. Wrangler and
`npm run db:migrate` therefore apply the same SQL.

`npm run start:worker` runs the true workerd on a local D1. First run
`npx wrangler d1 migrations apply whispers --local`. Use `npm run dev` for daily
work. It has hot reload, and it reads a local file.

### Anything that runs Node

```sh
npm run build
npm start
```

Set `COOKIE_SECRET`, `DB_DRIVER`, and `DATABASE_URL` in the environment.
`.env.example` lists each variable.

## Confirming a delete

`app/elements/confirm-button.html` is a `<dialog>`. The attributes `command` and
`commandfor` open it, and they are the invoker of the platform. The dialog
protects three operations: deletion of a headline, removal of a member, and
removal of the logo.

There is no click handler, so there is no script and no CSP hash. The browser
supplies the backdrop, the focus trap, Escape to dismiss, the inert page behind,
and the return of the focus to the button. Confirmation submits an ordinary
form.

The `token` prop becomes the id of the dialog. The prop is not `key`, because
`key` is a directive of the framework. The compiler takes that attribute, and
the prop arrives empty. Each dialog on the page then has the same id.

The three engines shipped invoker commands during 2025. On older software the
button does nothing. The delete is therefore unreachable, not unguarded. That is
the safe direction, but you must know it.

## Three things worth knowing before editing

**Each action below `admin/` starts with `member(ctx)`** from
`app/lib/guard.js`. Core 0.10.0 runs the layout guards before the action, so
`admin/_layout.html` refuses a signed-out POST already. The call in each action
is a second check. Keep it: it costs one line, and it prevents a silent
unauthenticated write. It also stays correct if somebody moves a page out from
below its layout. `test/app.test.js` tests that the app refuses a signed-out
POST to each admin route.

**A page that reads the database needs `export const prerender = false`.** The
build runs on a machine with no binding. Without that line the build writes a
snapshot, and the page never changes again. `404.html` is the exception. The
build always writes it to a file, so it has no loader, and each repository
answers with the defaults when no database is present. This is why
`npm run build` works in CI.

**`vite.config.js` pins `build.cssTarget`, and that line is necessary.** Below
those versions, LightningCSS rewrites each `light-dark()` into a polyfill. It
does not emit the switch variables for that polyfill, so the value becomes
invalid. An invalid `var()` inside a shorthand voids the full declaration.
`border: 1px solid var(--rule)` then becomes no border, and the palette fails
with it. Nothing in the CSS is wrong when this happens, and that makes the fault
hard to find. `npm test` examines the built stylesheet for it.

## Versions

The releases have tags. [CHANGELOG.md](CHANGELOG.md) gives the changes, and it
tells you when a version needs a migration. To upgrade, pull the changes or
download the release. Then run these commands:

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

**The reader's page is not cached, and the reason is a bug in the framework.**
`export const revalidate` is commented out in `app/routes/index.html`. The
framework rebuilds a stale page behind the response and does not hold that work
with `waitUntil`. workerd cancels it, the promise never settles, and the
framework's `inFlight` map keeps a dead entry for that page. Every later request
waits on it. The page then hangs for good, about one minute after the first
visitor.

Node, Deno and Bun do not cancel the work, so the fault is Cloudflare only. If
you deploy to Node and want the cache, remove the comment. Each page then costs
a few database reads per request, which is what the cache existed to save.

`npm audit` reports four moderate advisories. All of them are in build-time
tools, and `npm audit --omit=dev` reports none. That code is not in the app, and the
deploy does not include it.

`wrangler.demo.jsonc` is the configuration of the public demo at
[demo.whispers.news](https://demo.whispers.news). The repository keeps it as a
worked example of `wrangler.jsonc` with the placeholders filled in. Its
`npm run deploy:demo` and `db:migrate:demo` scripts use a database that you do
not have. Read those scripts; do not run them.
