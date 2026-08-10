// What happens to a URL between the form and the database, in two halves.
//
// `canonical` is always on and needs no configuration. It catches what actually
// goes wrong when a trusted person pastes a link: a missing scheme, a tracking
// tail, the same story submitted twice.
//
// `reputation` is optional and advisory. Requiring it would mean every buyer
// provisioning a Google Cloud project, and it is a point-in-time check anyway —
// a site compromised next week stays linked. So it runs only with a key, fails
// open, and a match warns rather than blocks.

/** Parameters that identify a campaign rather than a page. */
const TRACKING = [
  /^utm_/i,
  /^ga_/i,
  /^fb_/i,
  /^mc_/i,
  /^hsa_/i,
  /^(gclid|dclid|fbclid|msclkid|igshid|mkt_tok|vero_id|_hsenc|_hsmi|ref|ref_src|si)$/i,
];

/** Hosts that are not on the public internet, and one that pretends not to be. */
const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd])/i;

export const MAX_URL = 2048;

/**
 * A union rather than one shape with two optional halves, so `if (!link.ok)`
 * narrows and no caller can read `link.url` off a refusal.
 *
 * @typedef {{ ok: true, url: string }} LinkAccepted
 * @typedef {{ ok: false, error: string }} LinkRefused
 */

/**
 * Reads what a person typed and returns the URL to store, or why not.
 *
 * @param {unknown} input
 * @returns {LinkAccepted|LinkRefused}
 */
export function canonical(input) {
  let text = String(input ?? '').trim();
  if (!text) return { ok: false, error: 'A link is needed.' };
  if (text.length > MAX_URL) return { ok: false, error: 'That link is too long.' };

  // `example.com/story` is half of what people paste. Assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'That is not a link.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http and https links.' };
  }

  // `https://user:pass@example.com` renders as example.com and goes elsewhere.
  // No headline needs credentials in its link.
  if (url.username || url.password) {
    return { ok: false, error: 'Remove the username and password from the link.' };
  }

  if (!url.hostname.includes('.') || PRIVATE_HOST.test(url.hostname)) {
    return { ok: false, error: 'That host is not on the public internet.' };
  }

  // Case is meaningless in a host and meaningful in a path, so only one is
  // lowered.
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  // Deleted, not sorted: sorting would rewrite a URL whose server cares about
  // parameter order, and deleting is enough to make two pastes match.
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.some((pattern) => pattern.test(name))) url.searchParams.delete(name);
  }

  // A fragment is a position in a page, not a different page — keeping it would
  // let the same story arrive twice from two scroll positions.
  url.hash = '';

  // A bare origin keeps its slash; a path does not need a trailing one.
  let out = url.toString();
  if (url.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1);

  return { ok: true, url: out };
}

/**
 * @typedef {object} Reputation
 * @property {boolean} checked whether the service was asked at all
 * @property {string|null} reason what it said, when it said anything
 */

/**
 * Asks Google Safe Browsing about a URL, when a key is configured.
 *
 * Never throws and never waits more than the timeout. A network failure, a rate
 * limit or a missing key all answer `{ checked: false }` and the caller
 * publishes — an editor waiting on Google is worse than a headline unchecked.
 *
 * @param {string} url canonical, from `canonical()`
 * @param {{ key?: string|null, timeout?: number, fetch?: typeof globalThis.fetch }} [options]
 * @returns {Promise<Reputation>}
 */
export async function reputation(url, options = {}) {
  const key = options.key ?? globalThis.process?.env?.GOOGLE_SAFE_BROWSING_API_KEY ?? null;
  if (!key) return { checked: false, reason: null };

  const call = options.fetch ?? globalThis.fetch;
  const timeout = options.timeout ?? 3000;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);

  try {
    const response = await call(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          client: { clientId: 'whispers-news', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      },
    );

    if (!response.ok) return { checked: false, reason: null };

    const body = await response.json();
    const match = body?.matches?.[0];
    if (!match) return { checked: true, reason: null };

    const said = String(match.threatType ?? 'THREAT').toLowerCase().replace(/_/g, ' ');
    return { checked: true, reason: `Google Safe Browsing calls this ${said}.` };
  } catch {
    // Aborted, offline, rate-limited or malformed all mean the same thing: we
    // do not know, so we do not stand in the way.
    return { checked: false, reason: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the optional half is configured. The admin form says so.
 *
 * @returns {boolean}
 */
export const reputationEnabled = () =>
  Boolean(globalThis.process?.env?.GOOGLE_SAFE_BROWSING_API_KEY);
