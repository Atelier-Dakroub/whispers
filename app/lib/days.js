// Headlines, grouped into days.
//
// A day is a property of a timestamp *and a place*: two headlines an hour apart
// fall on different days in Auckland and the same day in Lisbon. So every
// function here takes the site's timezone, and `Intl` does the arithmetic.

/**
 * @typedef {object} Day
 * @property {string} key `2026-08-08` in the site's zone. Stable, sortable.
 * @property {string} label how the heading reads
 * @property {string} iso midday UTC on that day, for a `datetime` attribute
 * @property {any[]} items
 */

/**
 * A formatter's output as named pieces rather than an ordered string.
 *
 * @param {Intl.DateTimeFormat} formatter
 * @param {Date} date
 * @returns {Record<string, string>}
 */
const partsOf = (formatter, date) =>
  Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

/**
 * The calendar day a timestamp falls on, in a zone, as `YYYY-MM-DD`.
 *
 * @param {Date} date
 * @param {string} timezone
 * @returns {string}
 */
export function dayKey(date, timezone) {
  const parts = partsOf(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    date,
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Groups articles into days, newest first.
 *
 * Keeps the order it was given, so the caller's sort decides the result and
 * nothing here sorts again.
 *
 * @param {{ publishedAt: string }[]} items already sorted newest first
 * @param {{ timezone: string, locale: string, today?: Date }} options
 * @returns {Day[]}
 */
export function byDay(items, { timezone, locale, today = new Date() }) {
  const heading = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const nowKey = dayKey(today, timezone);
  const yesterdayKey = dayKey(new Date(today.getTime() - 86_400_000), timezone);

  // `numeric: 'auto'` turns "in 0 days" into the word a language actually uses
  // — aujourd'hui, أمس, gestern — for every locale ICU ships, which is many
  // more than a translation table would carry.
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  /** @type {Map<string, Day>} */
  const days = new Map();

  for (const item of items) {
    const at = new Date(item.publishedAt);
    if (Number.isNaN(at.getTime())) continue;

    const key = dayKey(at, timezone);
    let day = days.get(key);

    if (!day) {
      // Midday, not midnight: `T00:00:00Z` is the previous evening in the
      // Americas, and a browser would show the heading's own date as yesterday.
      const iso = `${key}T12:00:00.000Z`;
      const label =
        key === nowKey
          ? relative.format(0, 'day')
          : key === yesterdayKey
            ? relative.format(-1, 'day')
            : heading.format(at);

      day = { key, label, iso, items: [] };
      days.set(key, day);
    }

    day.items.push(item);
  }

  return [...days.values()];
}

/**
 * The stamp beside a headline.
 *
 * Pass `withDate` when the page has no day headings, because a bare `06:47`
 * reads as this morning whatever day the story is from.
 *
 * @param {string} iso
 * @param {{ timezone: string, locale: string, withDate?: boolean }} options
 * @returns {string} empty when the timestamp will not parse
 */
export function timeOfDay(iso, { timezone, locale, withDate = false }) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...(withDate ? { day: 'numeric', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/**
 * An instant as wall-clock text for a `datetime-local` input.
 *
 * The input has no zone of its own, so the value is shifted into the site's —
 * otherwise an editor in Beirut and one in Boston would write different
 * instants from the same typed string.
 *
 * @param {string} iso
 * @param {string} timezone
 * @returns {string} `YYYY-MM-DDTHH:mm`, or empty if the input will not parse
 */
export function toLocalInput(iso, timezone) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const parts = partsOf(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    at,
  );

  // `en-CA` reports midnight as hour 24, which is a valid clock reading and not
  // a valid input value.
  const hour = parts.hour === '24' ? '00' : parts.hour;

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/**
 * The instant a `datetime-local` value names in the site's zone.
 *
 * Reads the text as if it were UTC, asks what that zone's clock said at that
 * instant, and removes the difference. Done twice because the offset itself can
 * change across the shift, which is what catches the hour either side of a
 * daylight-saving boundary.
 *
 * @param {string} value `YYYY-MM-DDTHH:mm`
 * @param {string} timezone
 * @returns {string|null} ISO-8601 UTC, or null when the value is not a time
 */
export function fromLocalInput(value, timezone) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) return null;

  const asUtc = Date.parse(`${text.length === 16 ? `${text}:00` : text}Z`);
  if (Number.isNaN(asUtc)) return null;

  const offsetAt = (instant) => {
    const parts = partsOf(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
      new Date(instant),
    );

    const hour = parts.hour === '24' ? '00' : parts.hour;
    const wall = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`,
    );

    return wall - instant;
  };

  let instant = asUtc - offsetAt(asUtc);
  instant = asUtc - offsetAt(instant);

  return new Date(instant).toISOString();
}
