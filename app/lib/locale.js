// Which way the page runs, from its language tag.
//
// A page that claims `lang="en"` while showing Arabic is read aloud in the
// wrong voice and hyphenated by the wrong rules, so the locale setting decides
// both attributes on <html> rather than only the date format.

/** The direction a script runs, when `Intl` has nothing to say. */
const RTL = new Set([
  'ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'khw', 'ks', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
]);

/**
 * The direction a language runs in.
 *
 * Asks `Intl.Locale` first, since it knows more tags than any list here would.
 * The list above is the fallback for a runtime built without text info, where
 * defaulting to `ltr` would silently mirror an Arabic site the wrong way.
 *
 * @param {string} tag a language tag, like `ar-LB`
 * @returns {'rtl'|'ltr'}
 */
export function directionOf(tag) {
  const text = String(tag ?? '').trim();
  if (!text) return 'ltr';

  try {
    const locale = new Intl.Locale(text);
    const info = locale.textInfo ?? locale.getTextInfo?.();
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction;

    return RTL.has(locale.language) ? 'rtl' : 'ltr';
  } catch {
    return RTL.has(text.split(/[-_]/)[0].toLowerCase()) ? 'rtl' : 'ltr';
  }
}
