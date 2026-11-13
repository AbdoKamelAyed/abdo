# Roadmap

ABDO is built in nine controlled phases. A phase is finished only when its features work, are tested and are documented; the next phase does not start before that.

| Phase | Theme | Status |
|---|---|---|
| 1 | Foundation | **Complete** (this repository) |
| 2 | Content management | **Complete** (this repository), except the contact form |
| 3 | Editorial experience | **Complete** (this repository), with a list of deferred items |
| 4 | Customization | **Complete** (this repository), with a list of deferred items |
| 5 | Content discovery | **Complete** (this repository), with a list of deferred items |
| 6 | Digital publishing | Planned |
| 7 | SEO | Planned (baseline already exists) |
| 8 | Agentic web | Planned |
| 9 | Analytics & optimization | Planned |

**Getting the site live is a separate, shorter path:** [deployment.md](deployment.md) lists the stages (decisions, first deploy, rehearsal on real GitHub, real content, go-live checklist, custom domain) and can be done before Phases 4–9.

## Phase 1 — Foundation (complete)

Delivered, with tests:

- [x] Architecture, module breakdown, data model, directory layout, design system, roadmap (this `docs/` folder)
- [x] Arabic and English foundations: independent routes, slugs, navigation, homepage, typography, layout, plural-aware strings, RTL/LTR
- [x] Public homepage (data-driven sections), navigation, responsive layout, light/dark/system theme
- [x] Static page generation: blog, articles, portfolio, projects, topics, tags, About/CV, Contact, 404, language redirect
- [x] Basic data architecture: 8 schemas, validator with actionable messages, stable IDs, publication rules
- [x] Design tokens, 8 presets, Glass Mode (pulled forward from Phase 4 because the design system needed it)
- [x] SEO baseline: canonical, hreflang, Open Graph/Twitter, JSON-LD, sitemap, robots (pulled forward from Phase 7)
- [x] GitHub Pages deployment workflow; build-time link checking
- [x] 154 automated tests; layout checked in a real browser at desktop and phone widths in both languages

Known gaps are listed in the README ("What is not built yet").

## Phase 2 — Content management (complete, contact form deferred)

Goal: edit content without touching JSON by hand, safely.

Delivered, with tests (212 unit/integration tests plus a 21-step browser test):

- [x] **Secure publishing design first**, documented in [security.md](security.md): GitHub REST API with a fine-grained token limited to one repository, entered at login, held in memory (optionally the tab's `sessionStorage`), never committed or embedded.
- [x] Admin shell at `/admin/`: own code and CSS, strict CSP, `noindex`, `Disallow` in `robots.txt`, excluded from the sitemap, not linked from public pages. `--no-admin` leaves it out.
- [x] Article and project managers: list, filter, create, edit metadata and per-language translations, block editing, status changes, publish/unpublish per language, delete.
- [x] Profile / CV manager over the per-entry IDs and visibility flags.
- [x] Media library: upload checked by content, alt text and captions per language, archive, delete unused, usage counts.
- [x] The **same validator** in the build and in the browser (`src/core/`); an end-to-end test proves what the admin publishes passes the real build.
- [x] Atomic publish (one commit), conflict detection, local persistence of unpublished work, undo through Git revert (documented, not exercised through the admin).
- [x] Arabic and English admin interface with RTL, plural-aware strings.

Exit criteria status: create → edit → publish → unpublish for articles and projects works end to end against the fake GitHub; an invalid edit is rejected with a message pointing at the field; no credential appears in the built site or in the admin source (tested).

**Deferred from Phase 2:** the contact form. It needs a Cloudflare Worker with validation, rate limiting and spam protection, and private message storage; none of that exists, so no form is shown. Large-file storage (R2) is deferred with it.

**Before relying on it:** run the admin once against a throwaway GitHub repository. The tests use a local imitation of the GitHub API; real GitHub may differ in details, and the browser test ran in Chromium only.

## Phase 3 — Editorial experience (complete; a short list deferred)

Goal: a professional writing environment inside the admin, on the existing block format. Full description: [editor.md](editor.md).

Delivered, with tests (347 unit/integration tests, 135 of them new in Phase 3, plus a 37-step browser test, 16 of those new):

- [x] **Block editor** whose forms are generated from one specification table (`src/core/block-specs.mjs`); a test compares it with `schemas/block.schema.json`. 21 block types: 7 existing and 14 new (checklist, definitions, code, table, gallery, compare, image with text, fact box, timeline, statistics, related pages, author card, footnotes, references), each with schema, validator, renderer and editor together.
- [x] Inline formatting toolbar and keyboard shortcuts (bold, italic, underline, strikethrough, highlight, superscript, subscript, code, link, footnote, special characters), working on an Arabic keyboard layout; text direction per block.
- [x] Undo and redo of the whole block list; typing merged per field; each structural change one step.
- [x] Drag-and-drop and keyboard reordering, duplicate, hide, delete, collapse.
- [x] Twelve article templates in Arabic and English; template placeholders block publishing.
- [x] Live preview of the real page from the build's own renderer, in a script-less sandboxed frame; phone / tablet / desktop; light / dark.
- [x] Outline, writing statistics, reading time, word goal, readability estimate, repeated words, editorial checks, find and replace (one undo step).
- [x] Focus mode; autosave and draft recovery in this browser.
- [x] Revision history from Git with word-by-word comparison and restore of content (never the address or status).
- [x] Typography panel per language with ten font pairings, controls for sizes, spacing, weights and line length, plain-language advice and a live preview.
- [x] **Gap work, done after the first delivery:** nested lists and checklists (four levels); pasting, dropping and picking pictures through the checked upload flow; picture focal point (library and blocks, covers and cards); per-page typography overrides (size, line height, column width, heading weight); scheduled publishing (per page, a deploy-workflow timer, strict validation); internal notes.
- [x] Admin CSP extended only as far as the preview needs (see [security.md](security.md)); no new network destination except Google Fonts for the typography preview.

Exit criteria status: every block type can be added, edited, previewed, published through the real build and removed; undo and redo work for typing, structure and templates; the preview matches the build's output; history compares and restores real commits (against the fake GitHub); no untranslated text in either language; no horizontal scrolling at phone width; zero CSP or console errors in the browser test.

**Deferred from Phase 3** (each is listed again in [editor.md](editor.md)): Tiptap/ProseMirror (replaced by the zero-dependency editor, a deliberate decision); video, audio, PDF and embed blocks (they need a security review of third-party code); pixel cropping and responsive image variants; text colour, per-text fonts and character spacing inside a text; grammar checking; approval workflow, track changes and editorial comments between people; custom font upload, Google Fonts search, per-element font assignments and named typography presets.

**Before relying on it:** (1) run History once against a throwaway GitHub repository: it uses the commits API, tested only against the local fake; (2) look at the editor in Firefox and Safari: the browser test ran in Chromium only, and touch drag-and-drop is not provided (phones use the move buttons); (3) check how the chosen fonts look: font loading could not be tested offline; (4) schedule a throwaway page a few minutes ahead and watch the Actions tab once: the timer, the `check` job and the skipped-job behaviour were not exercised on GitHub.

## Phase 4 — Customization (complete)

Delivered, with tests (397 unit/integration tests, 50 of them new in Phase 4, plus a 48-step browser test, 11 of those new). Details: [customization.md](customization.md).

- [x] **Homepage Builder** (`#/homepage`): per-language section lists; add ready-made sections (featured item, latest articles, featured topics, selected and latest projects, personal insights, professional highlights, follow); drag, keyboard and button reordering; show or hide; duplicate; delete; copy the structure from the other language; per-kind settings (layout, number of items, image shape, spacing, topic and template filters); live preview of the real page.
- [x] **Appearance Studio** (`#/appearance`) with a live preview of any public page in either language: preset gallery, **your own presets** (save, rename, delete), nine colours per mode with colour picker and hex entry, colours for all languages or for one language only, shapes and spacing, card shadow, motion.
- [x] **Contrast checking for custom colours:** below 3 : 1 blocks publishing, 3 to 4.5 : 1 warns, **Fix** and **Fix all** repair a colour for every colour it is paired with; your own presets are checked too; Glass Mode readability is checked over black and white backgrounds.
- [x] **Glass Mode controls** (elements, blur, opacity, border, shadow, surface colour, separately for light and dark) with range checks.
- [x] **Layout Manager** per language: page and text width, card style, header, footer and menu variants, sticky header, tablet and phone breakpoints, columns, gaps, section spacing and page padding for desktop, tablet and phone.
- [x] **Typography Studio** per language: a list of 15 fonts (6 Arabic, 7 Latin, 2 system) labelled by whether they contact Google Fonts; sizes, line heights, weight; letter spacing locked for right-to-left; a language on system fonts loads nothing from Google.
- [x] The validator checks colours, glass and layout in the build and in the browser with the same code.

Exit criteria status: every screen works in a real browser against the fake GitHub; the published result is accepted by the real site build (homepage, layout and fonts were each published and built in the browser test); no untranslated text in either language; no horizontal scrolling at phone width; zero CSP or console errors.

**Deferred from Phase 4:** sidebars and other new page regions; layouts per page type; text colour and font per element; custom font upload and self-hosting; palette generation; undo inside the Studio (Discard on *Review & publish* and per-colour Reset exist); touch drag-and-drop for homepage sections; a warning when a homepage section would currently draw nothing.

**Before relying on it:** (1) look at each language on a real phone after changing the layout: the generated CSS and attributes are tested, how it looks was checked by screenshot only during development; (2) Chromium only, against a local fake of GitHub; (3) choose fonts knowing that the "Google" ones make each visitor's browser contact Google.

## Phase 5 — Content discovery (complete)

Delivered, with tests (482 unit/integration tests, 85 of them new in Phase 5; a 20-step browser test of the public search page and a 24-step browser test of the new admin screens, alongside the 48-step admin test). Details: [discovery.md](discovery.md).

- [x] **Search:** one static index per language built from public content only; Arabic-aware matching (diacritics, alef/ya/ta-marbuta variants, Persian letters, digits, the article `ال`; both optional switches per language); `AND` queries, prefix while typing, `"exact phrases"`, `-exclusion`, partial matches when nothing matches everything, synonyms, "Did you mean", related searches; field-weighted ranking with three presets.
- [x] **Search page** (`/<lang>/search/`): instant results, suggestions, type / topic / tag / date filters, sorting, grid / list / compact views, numbered pages or "Show more", a shareable address, keyboard use, `noindex`, `SearchAction` structured data, a header search box, text-node rendering only.
- [x] **Topic and tag landing pages** built from the content filed under them, with sub-topics rolled up; topic icons and accent colours (never on text); old addresses kept as redirect pages when a slug changes or records merge.
- [x] **Related content without AI:** shared topics, shared tags, parent and sub-topics; related topics and tags; pinned items on topic pages. The rules are shown on screen.
- [x] **Topic Manager** (`#/topics`): tree with usage and roll-up counts, create, edit per language, move, reorder, merge, delete with confirmation, bulk changes, insights, live preview of the real page.
- [x] **Tag Manager** (`#/tags`): duplicates and one-letter typos with a merge button, merge, bulk status / visibility / delete, unused tags, usage filter and statistics.
- [x] **Search settings** (`#/search`) with a test box that runs a real query over published content, and **Navigation** (`#/navigation`) for the header and footer per language.
- [x] **Pagination** of the blog, portfolio, topic, tag and search lists.
- [x] **Security fix:** the schema checker's `uri` format allowed `javascript:` and `data:` links in the profile, projects, canonical URLs and navigation; it now allows only `http`, `https`, `mailto` and `tel`.

Exit criteria status: the new screens work in a real browser against the fake GitHub; the published result is accepted by the real site build; the built site shows the nav link, search page, topic page, redirect stub and pagination; no untranslated text, raw keys or stray "null" in either language; no horizontal scrolling at phone width; zero CSP or console errors.

**Deferred from Phase 5:** stemming or Arabic root search; search without JavaScript; search analytics (Phase 9); touch drag-and-drop in the topic tree; a separate page size for search and lists; tag hierarchy; trying drafts in the Search settings test box.

**Before relying on it:** (1) Chromium only, against a local fake of GitHub; (2) Arabic search was tested with normalisation tests and screenshots, not by native readers on a large archive and not with a screen reader; (3) a changed slug leaves a meta-refresh page, not an HTTP 301 (GitHub Pages cannot send one); (4) the index grows with the text of your pages.

## Phase 6 — Digital publishing

Per-article PDF from print templates; edition generator (cover, contents, chapters, credits); publication archive; download controls. Needs an Arabic-capable PDF pipeline; Arabic shaping and RTL pagination must be verified visually before this is declared working.

## Phase 7 — SEO

RSS/Atom per language, SEO assistant and checks in the dashboard, Search Console integration, richer structured data, per-page `seo` overrides surfaced in the UI (the fields already exist in the schema).

## Phase 8 — Agentic web

Public read-only JSON endpoints generated at build time, per-crawler `robots.txt` rules, `llms.txt`-style guidance, a knowledge graph from topics and relationships, and an interaction layer where an inquiry is only submitted after explicit confirmation. An optional personal assistant only if it can be built without exposing private data.

## Phase 9 — Analytics & optimization

Privacy-respecting analytics, search analytics, performance monitoring, accessibility testing with real assistive technology, a security review, backup/export and restore.

## Decisions waiting for the owner

These need an answer before the matching feature is built.

1. Will the repository be public or private? (Determines how drafts and private CV sections must be handled; the admin warns on a public one.)
2. Final site name, tagline and the real GitHub Pages address or custom domain.
3. Is a Cloudflare account available for Workers/R2 (contact form, large media)?
4. Which email address should receive contact messages?
5. Is loading fonts from Google Fonts acceptable (each visitor's browser contacts Google), or should the site use system fonts only or self-hosted fonts? The typography panel supports both; self-hosting needs font files and the custom-font feature, which is deferred.
