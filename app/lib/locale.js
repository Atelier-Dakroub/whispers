// What a language tag implies about the page.
//
// The locale setting already decides how a date is spelled. It also decides two
// attributes on <html> that nothing else can work out: which language the text
// is in, and which way it runs.
//
// Both matter more than they look. A page that says `lang="en"` while showing
// Arabic gets read aloud by a screen reader in the wrong voice, hyphenated by
// the wrong rules, and offered to the wrong translation prompt.

/** The direction a script runs, when `Intl` has nothing to say. */
const RTL = new Set([
  'ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'khw', 'ks', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
]);

/**
 * `'rtl'` or `'ltr'` for a language tag.
 *
 * `Intl.Locale` knows this, and knowing it from the tag beats a list somebody
 * has to remember to extend. The list is the fallback for a runtime whose ICU
 * was built without text info, where guessing `ltr` would silently mirror an
 * Arabic site the wrong way.
 *
 * @param {string} tag
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
