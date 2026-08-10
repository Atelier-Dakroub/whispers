// The words the reader sees that are not the news. Everything else on the page
// is a headline somebody typed, a date `Intl` formats, or a color.
//
// The admin is deliberately not here: it is a hundred and fifty strings seen by
// the handful of people who chose to install an English product, where this is
// the part their *audience* reads.
//
// Two rules keep it translatable. No markup inside a string, because a
// translator cannot move an `<a>` buried in one. And no concatenation — `Page
// {page} of {pages}` is one string with two holes, since "of" lands somewhere
// different in almost every language.
//
// Missing keys fall back to English one at a time, so a partial translation is
// useful rather than broken.

/** @typedef {Record<keyof typeof EN, string>} Strings */

const EN = {
  skip: 'Skip to the headlines',
  feed: 'Feed',
  signIn: 'Sign in',
  empty: 'Nothing here yet.',
  emptyInvite: 'Sign in to post the first headline.',
  newer: 'Newer',
  older: 'Older',
  morePages: 'More headlines',
  pageOf: 'Page {page} of {pages}',
  breaking: 'Breaking',
  poweredBy: 'Powered by Whispers',
  notFound: 'Not found',
  notFoundBody: 'There is nothing at this address.',
  backToHeadlines: 'Back to the headlines',
};

/**
 * Keyed by language subtag, not full tag: `fr-CA` and `fr-FR` want the same
 * words, and `Intl` already has the full tag for dates and numbers. To add a
 * language, add a key.
 */
const TRANSLATIONS = {
  fr: {
    skip: 'Aller aux titres',
    feed: 'Flux',
    signIn: 'Se connecter',
    empty: 'Rien pour l’instant.',
    emptyInvite: 'Connectez-vous pour publier le premier titre.',
    newer: 'Plus récents',
    older: 'Plus anciens',
    morePages: 'Plus de titres',
    pageOf: 'Page {page} sur {pages}',
    breaking: 'Dernière minute',
    poweredBy: 'Propulsé par Whispers',
    notFound: 'Introuvable',
    notFoundBody: 'Il n’y a rien à cette adresse.',
    backToHeadlines: 'Retour aux titres',
  },
  es: {
    skip: 'Ir a los titulares',
    feed: 'Fuente',
    signIn: 'Iniciar sesión',
    empty: 'Todavía no hay nada.',
    emptyInvite: 'Inicia sesión para publicar el primer titular.',
    newer: 'Más recientes',
    older: 'Más antiguos',
    morePages: 'Más titulares',
    pageOf: 'Página {page} de {pages}',
    breaking: 'Última hora',
    poweredBy: 'Con la tecnología de Whispers',
    notFound: 'No encontrado',
    notFoundBody: 'No hay nada en esta dirección.',
    backToHeadlines: 'Volver a los titulares',
  },
  de: {
    skip: 'Zu den Schlagzeilen springen',
    feed: 'Feed',
    signIn: 'Anmelden',
    empty: 'Noch nichts vorhanden.',
    emptyInvite: 'Melden Sie sich an, um die erste Schlagzeile zu veröffentlichen.',
    newer: 'Neuere',
    older: 'Ältere',
    morePages: 'Weitere Schlagzeilen',
    pageOf: 'Seite {page} von {pages}',
    breaking: 'Eilmeldung',
    poweredBy: 'Bereitgestellt von Whispers',
    notFound: 'Nicht gefunden',
    notFoundBody: 'Unter dieser Adresse gibt es nichts.',
    backToHeadlines: 'Zurück zu den Schlagzeilen',
  },
  pt: {
    skip: 'Ir para as manchetes',
    feed: 'Feed',
    signIn: 'Entrar',
    empty: 'Ainda não há nada aqui.',
    emptyInvite: 'Entre para publicar a primeira manchete.',
    newer: 'Mais recentes',
    older: 'Mais antigas',
    morePages: 'Mais manchetes',
    pageOf: 'Página {page} de {pages}',
    breaking: 'Última hora',
    poweredBy: 'Desenvolvido com Whispers',
    notFound: 'Não encontrado',
    notFoundBody: 'Não há nada neste endereço.',
    backToHeadlines: 'Voltar às manchetes',
  },
  ar: {
    skip: 'انتقل إلى العناوين',
    feed: 'الخلاصة',
    signIn: 'تسجيل الدخول',
    empty: 'لا شيء هنا بعد.',
    emptyInvite: 'سجّل الدخول لنشر أول عنوان.',
    newer: 'الأحدث',
    older: 'الأقدم',
    morePages: 'المزيد من العناوين',
    pageOf: 'الصفحة {page} من {pages}',
    breaking: 'عاجل',
    poweredBy: 'مدعوم بواسطة Whispers',
    notFound: 'غير موجود',
    notFoundBody: 'لا يوجد شيء على هذا العنوان.',
    backToHeadlines: 'العودة إلى العناوين',
  },
};

/** The languages that are more than English. The admin lists them. */
export const TRANSLATED = ['en', ...Object.keys(TRANSLATIONS)];

/**
 * The words, in the closest language there is to the one asked for.
 *
 * @param {string} locale a full tag, like `fr-CA`
 * @returns {Strings} English for anything untranslated, key by key
 */
export function stringsFor(locale) {
  const language = String(locale ?? '')
    .split(/[-_]/)[0]
    .toLowerCase();

  return { ...EN, ...(TRANSLATIONS[language] ?? {}) };
}

/**
 * Fills the holes in a string, writing numbers the way the locale writes them.
 *
 * Through `Intl.NumberFormat`, because a numbering system is part of a
 * language: `ar-EG` writes ٣ where `ar-LB` writes 3, and that is not a decision
 * a translator should have to make.
 *
 * @param {string} template with `{name}` holes
 * @param {Record<string, number|string>} values
 * @param {string} locale
 * @returns {string} unknown holes are left as they are
 */
export function fill(template, values, locale) {
  const numbers = new Intl.NumberFormat(locale);

  return String(template).replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in values)) return whole;
    const value = values[name];

    return typeof value === 'number' ? numbers.format(value) : String(value);
  });
}
