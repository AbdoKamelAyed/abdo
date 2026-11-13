// Interface strings and locale-aware formatting. One instance per language.

export function createI18n(language, strings, timezone) {
  const nu = language.numerals === 'arab' ? 'arab' : 'latn';
  const localeTag = `${language.locale}-u-nu-${nu}`;
  const dateFormat = new Intl.DateTimeFormat(localeTag, { dateStyle: 'long', timeZone: timezone });
  const numberFormat = new Intl.NumberFormat(localeTag);
  const monthFormat = new Intl.DateTimeFormat(localeTag, { year: 'numeric', month: 'long', timeZone: 'UTC' });

  const pluralRules = new Intl.PluralRules(language.locale);

  function t(key, vars = {}) {
    const template = strings[key];
    if (template === undefined) throw new Error(`Missing interface string "${key}" for language "${language.code}"`);
    return template.replace(/\{(\w+)\}/g, (whole, name) => {
      if (!(name in vars)) throw new Error(`Interface string "${key}" (${language.code}) needs {${name}}`);
      return String(vars[name]);
    });
  }

  /**
   * Pick the grammatical form for a count: "<base>_one", "_two", "_few", "_many" or "_other"
   * (Arabic uses all of them; English only one/other). `<base>_other` is always required.
   */
  function plural(base, n) {
    const category = pluralRules.select(n);
    const key = strings[`${base}_${category}`] !== undefined ? `${base}_${category}` : `${base}_other`;
    return t(key, { n: numberFormat.format(n) });
  }

  return {
    code: language.code,
    dir: language.direction,
    t,
    plural,
    has: (key) => strings[key] !== undefined,
    /** The raw strings whose key starts with `prefix` (placeholders untouched), for scripts that run in the browser. */
    withPrefix: (prefix) => Object.fromEntries(Object.entries(strings).filter(([key]) => key.startsWith(prefix))),
    date: (iso) => dateFormat.format(new Date(iso)),
    /** yyyy-mm → "March 2022" */
    yearMonth: (ym) => monthFormat.format(new Date(`${ym}-01T00:00:00Z`)),
    number: (n) => numberFormat.format(n),
    /** Format a date-only value (no time zone shift). */
    dateOnly: (ymd) => new Intl.DateTimeFormat(localeTag, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`)),
  };
}
