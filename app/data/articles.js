// The headlines. Every route reads and writes through this file, so nothing
// above it knows which dialect is underneath — the tables come off the store
// rather than from an import, which is what keeps the two schemas
// interchangeable at runtime.

import {
  and,
  count as countOf,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { store } from './db.js';

/**
 * @typedef {object} Article
 * @property {string} id
 * @property {string} headline
 * @property {string} url
 * @property {string} source
 * @property {string} publishedAt ISO-8601 UTC
 * @property {'draft'|'published'} status
 * @property {string|null} flagReason
 * @property {string|null} breakingAt when it was marked breaking, or null
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} createdBy
 */

export const PUBLISHED = /** @type {const} */ ('published');
export const DRAFT = /** @type {const} */ ('draft');

/**
 * One page of headlines, newest first.
 *
 * `publishedAt` is ISO-8601 text, so ordering it as a string is ordering it
 * chronologically, in both dialects, with no date type involved.
 *
 * @param {{ page?: number, perPage?: number, status?: 'draft'|'published'|null,
 *   settled?: string|null }} [options]
 *   `status: null` includes drafts, which only the admin wants.
 *   `settled` is a breaking cutoff: pass one and anything still breaking is
 *   left out, because it is being shown in its own band above this list.
 *   Excluding it in SQL rather than filtering afterwards is what keeps the
 *   count and the page size exact.
 * @returns {Promise<{ items: Article[], page: number, pages: number, total: number }>}
 */
export async function list({ page = 1, perPage = 60, status = null, settled = null } = {}) {
  const current = store();
  if (!current) return { items: [], page: 1, pages: 1, total: 0 };

  const { articles } = current.tables;

  const clauses = [];
  if (status) clauses.push(eq(articles.status, status));
  if (settled) {
    clauses.push(or(isNull(articles.breakingAt), lt(articles.breakingAt, settled)));
  }

  const where = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const [{ total }] = await current.db.select({ total: countOf() }).from(articles).where(where);

  // A page past the end lands on the last one rather than on nothing, so
  // deleting the only row on page 4 does not leave an empty page.
  const pages = Math.max(1, Math.ceil(total / perPage));
  const wanted = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const items = await current.db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(perPage)
    .offset((wanted - 1) * perPage);

  return { items, page: wanted, pages, total };
}

/** The reader's page: published only. */
export const published = (options = {}) => list({ ...options, status: PUBLISHED });

/**
 * The stories *still* breaking, newest mark first.
 *
 * The column holds when a story was marked, not that it is, so one leaves this
 * list on its own once the window passes. Nothing has to run for that.
 *
 * @param {string} settled the cutoff from `breakingCutoff()`
 * @returns {Promise<Article[]>}
 */
export async function breaking(settled) {
  const current = store();
  if (!current || !settled) return [];

  const { articles } = current.tables;

  return current.db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.status, PUBLISHED),
        isNotNull(articles.breakingAt),
        gte(articles.breakingAt, settled),
      ),
    )
    .orderBy(desc(articles.breakingAt))
    .limit(5);
}

/**
 * Marks a story as breaking, or stops.
 *
 * @param {string} id
 * @param {boolean} on
 * @returns {Promise<Article|null>}
 */
export const setBreaking = (id, on) =>
  update(id, { breakingAt: on ? new Date().toISOString() : null });

/**
 * How many there are, for the admin to report without counting a page.
 *
 * @returns {Promise<{ total: number, drafts: number }>}
 */
export async function counts() {
  const current = store();
  if (!current) return { total: 0, drafts: 0 };

  const { articles } = current.tables;

  const [{ total }] = await current.db.select({ total: countOf() }).from(articles);
  const [{ drafts }] = await current.db
    .select({ drafts: countOf() })
    .from(articles)
    .where(eq(articles.status, DRAFT));

  return { total, drafts };
}

/**
 * The most recent published headlines, for the feed.
 *
 * @param {number} [limit]
 * @returns {Promise<Article[]>}
 */
export async function recent(limit = 50) {
  const current = store();
  if (!current) return [];

  const { articles } = current.tables;

  return current.db
    .select()
    .from(articles)
    .where(eq(articles.status, PUBLISHED))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(limit);
}

/**
 * @param {string} id
 * @returns {Promise<Article|null>}
 */
export async function byId(id) {
  const current = store();
  if (!current || !id) return null;

  const rows = await current.db
    .select()
    .from(current.tables.articles)
    .where(eq(current.tables.articles.id, String(id)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Whether this URL is already here, ignoring one row by id so an edit that
 * leaves the URL alone does not report itself as a duplicate.
 *
 * @param {string} url
 * @param {string} [exceptId]
 * @returns {Promise<Article|null>}
 */
export async function byUrl(url, exceptId) {
  const current = store();
  if (!current || !url) return null;

  const { articles } = current.tables;
  const where = exceptId
    ? and(eq(articles.url, url), ne(articles.id, exceptId))
    : eq(articles.url, url);

  const rows = await current.db.select().from(articles).where(where).limit(1);

  return rows[0] ?? null;
}

/**
 * @param {object} input
 * @param {string} input.headline
 * @param {string} input.url already canonical; see link-check.js
 * @param {string} [input.source]
 * @param {string} [input.publishedAt] ISO-8601; now when left out
 * @param {'draft'|'published'} [input.status]
 * @param {string|null} [input.flagReason]
 * @param {string|null} [input.breakingAt]
 * @param {string|null} [input.createdBy]
 * @returns {Promise<Article|null>}
 */
export async function add(input) {
  const current = store();
  if (!current) return null;

  const now = new Date().toISOString();

  /** @type {Article} */
  const row = {
    id: crypto.randomUUID(),
    headline: input.headline,
    url: input.url,
    source: input.source ?? '',
    publishedAt: input.publishedAt ?? now,
    status: input.status ?? DRAFT,
    flagReason: input.flagReason ?? null,
    breakingAt: input.breakingAt ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
  };

  await current.db.insert(current.tables.articles).values(row);

  return row;
}

/**
 * @param {string} id
 * @param {Partial<Article>} patch
 * @returns {Promise<Article|null>}
 */
export async function update(id, patch) {
  const current = store();
  if (!current || !id) return null;

  const allowed = [
    'headline',
    'url',
    'source',
    'publishedAt',
    'status',
    'flagReason',
    'breakingAt',
  ];
  /** @type {Record<string, unknown>} */
  const set = { updatedAt: new Date().toISOString() };

  for (const key of allowed) {
    if (key in patch) set[key] = patch[key];
  }

  await current.db
    .update(current.tables.articles)
    .set(set)
    .where(eq(current.tables.articles.id, String(id)));

  return byId(id);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function remove(id) {
  const current = store();
  if (!current || !id) return false;

  await current.db
    .delete(current.tables.articles)
    .where(eq(current.tables.articles.id, String(id)));

  return true;
}
