# Content discovery (Phase 5)

Phase 5 is how a visitor finds things (search, topic and tag pages, related content, pagination) and how the owner keeps the labels behind them tidy (Topic Manager, Tag Manager, Search settings, Navigation). Everything here was built and tested. What was not built or not tested is in [What is not built](#what-is-not-built) and [Before relying on it](#before-relying-on-it).

## At a glance

| Part | Where | What it does |
|---|---|---|
| Search index | built into `dist/assets/search-<lang>.<hash>.json` | One static file per language, built from **public** content only |
| Search page | `/<lang>/search/` (Arabic: `/ar/بحث/`) | Full-text search with filters, sorting, suggestions and results while typing |
| Topic and tag pages | `/<lang>/topics/<slug>/`, `/<lang>/tags/<slug>/` | Built automatically once public content is filed under them |
| Related content | article and project pages, topic and tag pages | Computed from what you filed, no AI |
| Topic Manager | admin › Topics | Tree, create, rename, reorder, move, merge, delete, icon, accent colour, related topics, pinned items |
| Tag Manager | admin › Tags | Duplicates and typos, merge, bulk edit, unused tags, usage numbers |
| Search settings | admin › Search | What is searchable, ranking, page size, normalisation, synonyms, a test box |
| Navigation | admin › Navigation | Header menu and footer links, per language |
| Pagination | blog, portfolio, topic and tag lists, search | Numbered pages (or "Show more" for search) |

## How search works

### What goes in the index

At build time, for each language, the builder reads the **public model** (the same one the pages are drawn from), so a draft, a private tag, a hidden block, a private CV entry or a page that does not exist in that language can never be searched. For each page it stores the title, description, headings, tags, topic names, category, date, reading time, a thumbnail address and the body text (clipped at 60,000 characters per page). What a visitor can find is chosen in **Search settings**: articles, projects, topics, tags, the About page, CV sections.

The index is one JSON file per language with a content hash in its name. Its format is described at the top of `src/core/search-engine.mjs`. It grows with the amount of text: the sample site is about 13 KB for 18 pages; a site with a hundred long articles will be several hundred KB per language, downloaded only when someone opens the search page or focuses the search box.

### How words are compared

The same function (`src/core/search-text.mjs`) turns a word into a key when the index is built and when a visitor types, so both sides always agree. It:

- ignores case and Latin accents (`café` = `cafe`);
- Arabic: treats `أ إ آ ٱ` as `ا`, `ى` as `ي`, removes the short vowels and other marks, removes tatweel (`ـ`); Persian `ک` and `ی` become `ك` and `ي`; Arabic-Indic and Persian digits become `0–9`;
- optionally treats `ة` and `ه` as the same letter, and optionally ignores a leading `ال` (also `وال بال كال فال لل`). Both are **on by default** and can be switched off per language in Search settings (a changed setting changes the index at the next build);
- never changes the text shown. Only the comparison key is normalised.

It does **not** stem or find Arabic roots: `articles` does not match `article`, and a plural is a different word from its singular. A visitor who types the start of a word (while typing, the last word matches as a prefix) usually gets there; for the rest, use synonyms (below).

### What a visitor can type

| Typed | Means |
|---|---|
| `word word` | every word must be found |
| `"exact phrase"` | the words must appear next to each other, in order |
| `-word` | pages that contain the word are left out |

If nothing matches all the words, pages that match some of them are offered and marked as partial. If nothing matches at all, the page suggests the nearest word in the site's own vocabulary ("Did you mean…?"; one or two letters different). Searches related to the results are offered when there are results. Synonym groups from Search settings find each other with a slightly lower score.

### The search page

- Filters: type (article, project, topic, tag, page), topic, tag, and a from/to date. Sort: relevance, newest, oldest. Views: grid, list, compact. All of it lives in the address (`?q=…&type=article&topic=…&sort=newest&view=list&page=2`), so a search can be bookmarked or shared and the Back button works.
- **Suggestions** appear while typing in the box (pages, topics and tags matching the beginning of what was typed). **Results while typing** can be switched off, and so can suggestions.
- Results show the title, a snippet with the matched words marked, type, date, reading time and the first topics and tags. The snippet is built with text nodes, never HTML strings, so text from the index cannot run as markup. Hits are marked with `<mark>`.
- Keyboard: arrow keys and Enter in the suggestion list, Escape closes it. Each result is a normal link.
- The search page is `noindex` (search engines are told not to list result pages) and is not in the sitemap. The site's pages carry a `SearchAction` in their JSON-LD, which tells search engines how the site's own search works.
- The page needs JavaScript. Without it, it says so and offers links to the blog, the portfolio and the topics.

### Ranking

Each field has a weight. The presets in Search settings are:

| Preset | Title | Tags | Headings | Description | Body text |
|---|---|---|---|---|---|
| Balanced (default) | 10 | 6 | 5 | 4 | 1 |
| Titles first | 16 | 8 | 6 | 4 | 1 |
| Content first | 6 | 4 | 4 | 3 | 2 |

On top of the field weights, a title that contains a word of the query gets a bonus, a title that contains all the words in a row a larger one, a title that is exactly the query the largest, and a phrase found in the title one more. Rarer words count more than common ones. There is no learning, no click tracking and no personalisation.

## Topics and tags

### The data

Topics are a tree (`parentId`); tags are flat. Both have a name and a slug **per language**, an optional description, synonyms, search and sharing overrides (`seo`) and a list of old addresses (`redirectSlugs`). Both have a `visibility` (`public` or `private`; a private tag is a working label that never appears on the site). Topics also have an icon (from a fixed list of 22 drawn in code), an optional accent colour, an image (`mediaId`), related topics (up to 12) and pinned items (up to 6). Tags also have aliases (other names for the same thing, found by search and used to spot duplicates) and related tags. See [data-model.md](data-model.md).

### Landing pages

A topic or tag page is built **only when public content in that language is filed under it** (a topic includes its sub-topics' content). An empty topic is a valid record with no page, so the site never shows a "nothing here" page. The editor says so in the preview area. Private tags and private topics never get a page, a link or an index entry.

### Old addresses

Changing a slug in the editor commits when you leave the field, and remembers the old slug in `redirectSlugs`. At build time the old address becomes a small redirect page (a meta refresh to the new one, a canonical link and `noindex`; **not** in the sitemap). GitHub Pages cannot send real HTTP redirects, so this is the best a static site can do: visitors arrive at the right page, search engines are told where the page moved, but the old address answers with a `200`, not a `301`. Merging records adds the merged record's slugs to the survivor's redirects. An old slug may not equal a live slug, the page's own slug or another page's old slug (the validator says so).

### Related content (no AI)

Only what you filed counts:

- content to content: a shared **topic** is worth 3, a shared **tag** 1, and a topic that is the parent or a sub-topic of one of the other's topics 1. Equal scores are ordered newest first;
- topic to topic: the ones you chose, then siblings (same parent), then topics that often appear on the same content;
- tag to tag: the ones you chose, then tags that appear on the same content.

The rules are printed on the Topic Manager screen, so a result is never a surprise. If you filed nothing, nothing is shown.

## The admin screens

### Topics

A tree with usage counts (published / total, rolled up through sub-topics), filtering, and these actions, all staged in the browser until **Review & publish**:

- **Create** under the current parent (in the site's default language, the other languages can be added). The record is valid from the first save.
- **Edit** per language: name, slug (with the old addresses and a "From name" button), description, synonyms, search and sharing overrides.
- **Move and reorder**: choose a parent, move up and down. A topic can never become its own descendant.
- **Merge** into another topic: content, sub-topics, pinned items, related topics and homepage sections follow, and the old address redirects. Merging a topic into its own sub-topic is refused.
- **Delete**: a used topic asks first and removes the topic from the content; its sub-topics move up one level.
- **Icon, accent colour, related topics, pinned items**, a topic image, and a live preview of the real topic page (or an explanation when it has no page yet).
- **Bulk changes** on ticked rows: status, visibility, featured.
- **Insights**: totals, topics with no content, content with no topic, the most used topics.

The accent colour is used only for borders and icons, **never for text**, so it cannot make anything unreadable. It is written as a CSS class (`.topic-c-<hex>`) generated by the build; no inline styles exist on the site.

### Tags

- The list shows each tag's usage and filters by usage (used, unused, used once, private).
- **Similar tags**: same name after normalisation ("Notes" and "notes "), an alias that equals another tag's name, and one-letter typos ("Workflow" / "Workflows"). Each suggestion has a **Merge** button. Nothing is merged without confirmation.
- **Merge**: the content moves once (no duplicates), the merged tag's names become aliases of the survivor, its slugs become old addresses, related tags follow. A language the survivor lacks is reported, not guessed.
- **Bulk actions**: status, visibility (private tags are working labels and never appear on the site), delete (needs confirmation if used), select all unused.
- **Insights**: totals, unused, used once, average per item, most used.

### Search settings

On/off, what can be found, page size (4 to 48, also the size of list pages on the blog and portfolio), default view, "numbered pages" or "show more", ranking preset (the weights are shown), suggestions, results while typing, per-language normalisation, synonym groups (one group per line, words separated by spaces or commas, including `،` and `؛`; 2 to 12 words per group, at most 100 groups per language), and a **test box**. The test box builds a real index from the published content in the browser, with the settings on screen and without saving, and runs a real query. It shows how the query was read, the score of each hit and "Did you mean". It searches published content only, as the site does. **Restore defaults** asks first.

Settings are stored in `content/config/search.json`. The file is optional: with none, the defaults apply.

### Navigation

The header menu and the footer links, separately per language. Each item is a label plus a target: one of the fixed pages (home, about, portfolio, blog, topics, tags, search, contact) or an external link. Items can be added, renamed, reordered and removed. An external link must be an `https:`, `http:`, `mailto:` or `tel:` address; anything else (such as `javascript:`) is flagged in the editor and refused by the validator. With no list for a language, the header shows Home, Blog, Portfolio, About and Contact, and the footer repeats the header. A page that exists in only one language is not linked from the other.

## Security notes

- The search script and the search page build every result with text nodes (`textContent`, `createElement`); no `innerHTML`. Text in the index is data. The build test checks that the shipped script contains no way to inject HTML, and the browser test types markup into the box and checks it is shown as text.
- The query comes from the address bar, so it is length-limited (200 characters), the page number is bounded (1 to 500), and the type, topic and tag filters are checked against the lists in the index.
- **A fix made during this phase:** the `uri` format in the JSON Schema checker accepted any string that started with letters and a colon, so `javascript:` and `data:` were valid in the profile links, project links, canonical URLs and navigation. It now accepts only `http:`, `https:`, `mailto:` and `tel:` addresses with no spaces. The navigation editor also checks external links as you type. The inline-markup links in articles already had this rule (Phase 3).
- Topic accent colours are validated `#rrggbb` values; the class name is derived from the digits only, so nothing typed can reach the stylesheet.
- Private tags and topics, drafts and unpublished languages are excluded from the index, the pages, the sitemap and the redirects (tests check the built files, not only the model).

## Tests

| Where | What |
|---|---|
| `tests/search-text.test.mjs` | Arabic and Latin normalisation, article stripping, ta marbuta, digits, edit distance |
| `tests/search-engine.test.mjs` | Index lookup, prefix, phrases, exclusion, partial matches, synonyms, ranking, suggestions, "did you mean", related searches |
| `tests/taxonomy-ops.test.mjs` | Usage, duplicates and typos, merge (tags and topics), delete, bulk edit, slug redirects, hierarchy, related content, icons, the validator's rules |
| `tests/taxonomy-stage.test.mjs` | Creating valid topics and tags, staging results file by file, bulk delete, previews of empty and draft topics, unsafe links refused in the profile, projects, canonical URLs and navigation, synonym-group parsing |
| `tests/discovery-build.test.mjs` | The built site: landing pages only when there is public content, redirect stubs, private tags, search page and index, pagination, sitemap, header search, language switching |
| `tests/admin.test.mjs` | Every interface string exists in both languages, with matching placeholders and plural forms |
| `tests/e2e/search.e2e.mjs` (20 steps) | The public site in a real browser: header search link, typing with highlights and text never treated as HTML, suggestions with the keyboard, phrases and exclusion, filters and sorting, date filters, grid / list / compact views, "did you mean", synonyms and aliases, related searches, numbered pages and "load more", Arabic (diacritics, hamza, ta marbuta, the article), topic and tag pages, capped lists, old addresses, blog pagination, phone width in both languages, no-JavaScript fallback, a failed index request, the sitemap |
| `tests/e2e/discovery-admin.e2e.mjs` (24 steps) | The four admin screens in a real browser against a local fake of GitHub: create, edit, move, merge, delete and bulk-change topics and tags; settings and synonyms; navigation; one publish commit; the real build accepts it and the built site shows the nav link, search page, topic page, redirect stub and pagination; Arabic with no raw keys or stray "null"; phone width; no console or CSP errors |

Run them with `npm test`, `npm run test:e2e`, `npm run test:e2e:search` and `npm run test:e2e:discovery` (the browser tests need Playwright, which is not a project dependency).

## What is not built

- **No stemming or Arabic root search.** Plurals and inflections are different words; use synonyms or aliases, or type the start of the word.
- **No search without JavaScript.** The search page needs it (the no-script text offers browse links instead).
- **Search results are not indexed by search engines** (on purpose) and there is no server-side search.
- **Topic and tag lists** show the most used first up to the page size; the rest is reached through search or the topic tree.
- **The page size is shared** by search and by the blog and portfolio lists.
- **No tag hierarchy, no per-tag icons or colours.** Topics only.
- **The accent colour never colours text.** This is deliberate (contrast).
- **No search analytics** (what visitors typed): Phase 9, and only in a privacy-respecting form.
- **No drag-and-drop in the topic tree on touch screens.** Move buttons exist.
- **The admin's test box searches published content only**, so a draft cannot be tried there.

## Before relying on it

1. Everything was tested in Chromium against a local fake of GitHub, not against the real GitHub, Firefox or Safari.
2. Arabic normalisation and the visible Arabic screens were checked with tests and screenshots, **not** with a screen reader, and not by a native reader going through the search results. Judge the search quality on your own content: try the words you would really use.
3. Index size grows with the text. Check `dist/assets/search-*.json` after a large import; if it is too big, switch off "CV sections" or "Tags" in Search settings, or shorten long descriptions.
4. A redirect from a changed address is a page with a meta refresh, not an HTTP redirect (see above).
