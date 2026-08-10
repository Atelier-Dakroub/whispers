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
