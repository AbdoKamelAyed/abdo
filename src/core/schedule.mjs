// Scheduled publishing.
//
// A record (article or project) is scheduled when its status is "scheduled" and its `publishedAt` is
// the moment it should go live. Nothing runs at that moment on its own: the site is static. Instead,
// every build asks "is this due?", and a due record is treated as published for that build. The
// repository's deploy workflow also runs the build on a timer (see .github/workflows/deploy.yml and
// docs/publishing-workflow.md), so a scheduled page appears within about half an hour of its time.
//
// A translation inside a record takes part by being "scheduled" or "published" itself; the record's
// own `publishedAt` decides when. Nothing is written back: the files keep saying "scheduled" until
// the owner changes them, and the built site is simply the state at build time.

const time = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : null; };

/** Has the publication moment of this record come? Needs a valid `publishedAt`. */
export function isDue(record, now = new Date()) {
  const at = time(record.publishedAt);
  return at !== null && at <= now.getTime();
}

/**
 * Make everything that is due public for this build. Statuses "scheduled" at the record or translation
 * level become "published" when the record's date has come; later dates stay as they are.
 * Mutates the loaded content (the build's own copy) and says what it released.
 * @param {{ articles: any[], projects: any[] }} content
 * @returns {{ kind: 'article'|'project', id: string, lang: string|null, publishedAt: string }[]}
 */
export function releaseDue(content, now = new Date()) {
  const released = [];
  for (const [kind, records] of [['article', content.articles], ['project', content.projects]]) {
    for (const record of records) {
      if (!isDue(record, now)) continue;
      if (record.status === 'scheduled') { record.status = 'published'; released.push({ kind, id: record.id, lang: null, publishedAt: record.publishedAt }); }
      for (const [lang, tr] of Object.entries(record.translations ?? {})) {
        if (tr.status === 'scheduled') { tr.status = 'published'; released.push({ kind, id: record.id, lang, publishedAt: record.publishedAt }); }
      }
    }
  }
  return released;
}

/**
 * Everything that is scheduled, soonest first, with whether it is due now.
 * @returns {{ kind: string, id: string, title: string, publishedAt: string|null, due: boolean, langs: string[] }[]}
 */
export function listScheduled(content, now = new Date()) {
  const out = [];
  for (const [kind, records] of [['article', content.articles], ['project', content.projects]]) {
    for (const record of records) {
      const langs = Object.entries(record.translations ?? {}).filter(([, tr]) => tr.status === 'scheduled').map(([lang]) => lang);
      if (record.status !== 'scheduled' && !langs.length) continue;
      const first = Object.values(record.translations ?? {})[0];
      out.push({ kind, id: record.id, title: first?.title ?? record.id, publishedAt: record.publishedAt ?? null, due: isDue(record, now), langs });
    }
  }
  return out.sort((a, b) => (time(a.publishedAt) ?? Infinity) - (time(b.publishedAt) ?? Infinity));
}

/**
 * Did something become due in the last `minutes`? The deploy workflow uses this to skip timer runs
 * when nothing has changed. The window is longer than the timer's interval, so one skipped timer run
 * does not lose a release; any push also publishes whatever is due.
 */
export function dueWithin(content, now, minutes) {
  const from = now.getTime() - minutes * 60_000;
  return listScheduled(content, now).some((s) => {
    const at = time(s.publishedAt);
    return s.due && at !== null && at > from;
  });
}
