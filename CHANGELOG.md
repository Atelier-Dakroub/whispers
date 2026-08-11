# Changelog

What changed between versions, and what a version needs from you when you
upgrade. Upgrading is `git pull` (or downloading the release), `npm install`,
and `npm run db:migrate` when an entry says so.

Versions follow [semantic versioning](https://semver.org), read from the point
of view of somebody running the site rather than reading the code:

- **Major** — something you have stops working as it did. New migrations that
  invalidate stored data, a setting that changes meaning, a passphrase everyone
  has to reset.
- **Minor** — new features and new settings, including new migrations that only
  add.
- **Patch** — fixes and wording, no migration.

## 1.1.0 — 2026-08-11

No migration. Upgrading is `git pull` (or the release) and `npm install`. The
`npm install` is not optional this time: the cache fix below is in
`@transclude/core` 0.10.2.

### Added

- A sponsor line, for the commercial buyers the license already charges. It
  takes text, a link, and optional artwork, and never a script. A paid link
  gets `rel="sponsored nofollow noopener"`.
- A setting for opening headlines in a new tab. Off by default.
- Open Graph and Twitter card tags, so a pasted link shows the site's name and
  its tagline instead of a bare URL. Every value is a setting, so no install
  advertises another.
- A share card, uploaded at the bottom of `/admin/settings`. It is the picture
  in that preview. PNG only and at least 600 by 315 — an SVG is skipped by every
  scraper, and a small picture is drawn as a thumbnail. No card ships with the
  app: one drawn here would carry this product's name onto your masthead, and
  workerd cannot draw one per site. `SITE_URL` is worth setting now, because the
  two URLs in these tags have to be absolute.

### Changed

- The reader's page breathes more. Day groups sit further apart, a day heading
  is heavier and carries a 2px rule, the last headline in a group drops its own
  rule, and the footer loses its top border. The last two work together: a group
  used to end with a line and the footer began with another, so the page stacked
  rules where it needed space. Nothing is configurable here and nothing you set
  has changed — the page simply looks different after this upgrade.
- `SITE_URL` now builds the canonical link and the share card as well as the
  feed. It is still optional: without it each falls back to the host that asked,
  which is right until the site answers on two names. Worth setting now.

### Fixed

- **The reader's page went stale and stayed stale on Cloudflare, and could hang
  after an edit.** The framework rebuilt a stale page behind the response
  without `waitUntil`, so workerd stopped that work when the response was sent.
  Fixed in `@transclude/core` 0.10.2, which this release requires.
- A section heading and a checkbox both used `id="sponsor"`, so the label
  labelled nothing and clicking it did nothing.

## 1.0.0

The first release.

A headline-only news site: one page of links in date order, an admin to post
them, and no JavaScript on the reader's page. Drizzle over SQLite, Turso,
Postgres or Cloudflare D1. Per-member passphrases, a feed, breaking stories that
expire on their own, six languages, and a palette the owner sets and the admin
measures with APCA.

Nothing before this was tagged, so there is nothing to upgrade from. If you
cloned `main` before this tag, three fixes landed late and are worth knowing
about:

- **Sign-in was impossible on Cloudflare Workers.** Passphrases were hashed at
  600,000 PBKDF2 rounds; workerd refuses anything above 100,000 outright. If you
  created accounts on an earlier clone, the round count is written into each
  stored verifier — those rows still fail on Workers, and each passphrase has to
  be reset from `/admin/people`.
- **Every color was silently dropped in production builds.** The bundler
  rewrote `light-dark()` into a polyfill it did not finish emitting, which voided
  the declarations that used it: no rules between headlines, no input borders,
  and the configured palette replaced by the browser's defaults.
- **The two breaking colors saved nothing.** They were on the settings form and
  missing from the list of fields the action read.
