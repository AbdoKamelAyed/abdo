# Modules

ABDO is specified as 16 modules. Modules talk to each other only through stable IDs and the shared JSON data models, never through each other's internals. This table is the honest status after Phase 5.

Legend: **Working** = built and tested. **Foundation** = the data model and the parts other modules depend on exist; the editing or management interface does not. **Not started** = nothing exists.

| # | Module | Status | What exists now | What does not exist yet | Phase |
|---|---|---|---|---|---|
| 1 | Public Website | **Working** | Homepage, blog, articles, portfolio, projects, topics, tags, search page, About/CV, Contact, 404; pagination; RTL/LTR; responsive; light/dark | Sidebars and per-page-type layouts (see customization.md) | 1 → 5 |
| 2 | Administration Dashboard | **Working** (content) | Sign-in with a fine-grained token, overview, staged edits saved in the browser, validation with the build's own rules, conflict handling, atomic publish; Arabic/English interface; see [admin.md](admin.md) | User roles, pull-request mode; never run against the real GitHub | 2 → 5 |
| 3 | Editorial Studio | **Working** (core) | Block editor with 21 block types generated from one specification table, formatting toolbar and shortcuts, undo/redo, 12 article templates in Arabic and English, live sandboxed preview of the real page (phone/tablet/desktop, light/dark), outline, writing checks, find and replace, focus mode, autosave in the browser, revision history from Git with word-level comparison and restore, per-language Typography Studio panel plus four per-page overrides, nested lists, picture paste/drop/pick through the checked upload flow, picture focal point, internal notes; see [editor.md](editor.md) | Video/audio/PDF/embed blocks, pixel cropping, text colour and per-text fonts, grammar checking, approval workflow and editorial comments between people, custom font upload. Not used: Tiptap/ProseMirror. Not run in browsers other than Chromium | 3 |
| 4 | Blog Management | **Working** (basic) | Create, edit, status, per-language translations, block editing, delete; publish/unpublish per language | Approval workflow, bulk actions. Scheduled publishing exists (per page, released by the first build after the date; the deploy workflow's timer runs twice an hour; not yet run on GitHub itself) | 2 → 3 |
| 5 | Portfolio Management | **Working** (basic) | Create, edit, status, project status, dates, tools, gallery, links, related articles, case-study fields, delete | Drag-and-drop ordering of the project gallery (the gallery *block* in the body is reorderable), bulk actions | 2 → 3 |
| 6 | Personal Profile & CV | **Working** | Profile schema; About page; admin editor for identity, links, experience, education, skills, custom sections and per-entry visibility | Interactive CV filtering, PDF CV | 1 → 2 → 6 |
| 7 | Media Library | **Working** (basic) | Upload checked by content (PNG/JPEG/GIF/WebP), alt text and captions per language, archive/restore, delete unused, usage counts; build copies only referenced files | Pixel cropping, responsive variants, SVG, large files (R2). Focal point and paste/drop upload exist | 2 → 4 |
| 8 | Homepage Builder | **Working** | Per-language section lists in the admin: add ready-made sections, reorder (drag, keyboard, buttons), show or hide, duplicate, delete, copy the structure from the other language, per-kind settings, live preview; see [customization.md](customization.md) | Touch drag-and-drop, a warning for sections that would draw nothing | 1 → 4 |
| 9 | Design & Appearance Studio | **Working** | Preset gallery and your own presets, colours (all languages or one) with contrast checking and Fix, shapes and spacing, Glass Mode controls, Layout Manager per language (widths, header, footer, menu, card style, columns, spacing, tablet and phone breakpoints), Typography Studio with 15 fonts, live preview of any public page; see [customization.md](customization.md) | Sidebars, per-page-type layouts, per-element colours and fonts, custom font upload, palette generator, undo inside the Studio | 1 → 4 |
| 10 | Digital Publishing System | Not started | — | Article PDFs, editions, archive, downloads | 6 |
| 11 | Topic & Tag Management | **Working** | Topic Manager and Tag Manager: tree, create, rename per language, slugs with remembered old addresses, move, reorder, merge, delete, bulk actions, duplicates and typos, usage and unused, icons, accent colours, related and pinned items, live preview; landing pages built from public content; related content without AI; see [discovery.md](discovery.md) | Tag hierarchy, touch drag-and-drop in the tree | 1 → 5 |
| 12 | Advanced Search | **Working** | Static per-language index of public content; Arabic-aware matching; phrases, exclusion, prefix, synonyms, "did you mean"; filters, sorting, views, pagination; suggestions and results while typing; Search settings with a test box; navigation editor | Stemming and Arabic root search, search without JavaScript, search analytics (Phase 9). Not tested on a large archive or with a screen reader | 5 |
| 13 | SEO Management | **Working** (baseline) | Canonical, hreflang, Open Graph/Twitter, JSON-LD, sitemap, robots, per-page `seo` overrides in the schema | RSS/Atom, SEO assistant, Search Console, per-crawler rules | 1 → 7 |
| 14 | Agentic Web System | Not started | Semantic HTML and JSON-LD only | Public JSON endpoints, crawler management, interaction layer | 8 |
| 15 | Analytics | Not started | — | Everything | 9 |
| 16 | Backup & Recovery | Not started | Content is plain files in Git, so history is the backup (every publish is one revertable commit); the build refuses to wipe unmarked folders | Export/restore tooling, tested revert path | 9 |

Phase 2 deliberately did not include the contact form: it needs a server-side endpoint, and a form that cannot send would be a fake feature.

Some Phase 4 and Phase 7 items (design presets, Glass Mode, sitemap, structured data) were built in Phase 1 because the foundation needed a real design system and basic SEO to be meaningful. The management screens for design and the homepage arrived in Phase 4; the SEO screens belong to Phase 7.

## Where each module lives in the code

| Module | Code |
|---|---|
| Public Website | `src/render/*`, `src/lib/blocks.mjs`, `src/lib/markup.mjs`, `public/assets/*` |
| Profile & CV | `schemas/profile.schema.json`, `content/profile/`, `aboutPage` in `src/render/pages.mjs` |
| Blog / Portfolio data | `schemas/article.schema.json`, `schemas/project.schema.json`, `content/articles/`, `content/projects/` |
| Media | `schemas/media.schema.json`, `content/media/` |
| Topics & Tags | `schemas/taxonomy.schema.json`, `content/taxonomy/`; rules in `src/core/taxonomy-ops.mjs`, `taxonomy-stage.mjs`, `related.mjs`, `icons.mjs`; screens in `public/admin/js/views/topics.mjs`, `tags.mjs`, `taxonomy-common.mjs` |
| Search | `content/config/search.json`, `src/core/search-text.mjs`, `search-engine.mjs`, `search-settings.mjs`; index in `src/lib/search-index.mjs` and `search-bundle.mjs`; page in `src/render/search-page.mjs` and `public/assets/search-ui.js`; screen in `public/admin/js/views/search.mjs` |
| Navigation | `content/config/navigation.json`; screen in `public/admin/js/views/navigation.mjs` |
| Homepage | `content/config/homepage.json`, `homePage` and `homeSection` in `src/render/pages.mjs`, resolution in `src/lib/model.mjs`; rules of the Builder in `src/core/homepage-ops.mjs`, screen in `public/admin/js/views/homepage.mjs` |
| Design | `content/config/design.json`, `content/config/presets.json`, `src/lib/theme.mjs`; Studio rules in `src/core/contrast.mjs`, `design-ops.mjs`, `layout.mjs`, `fonts.mjs`; screens in `public/admin/js/views/appearance*.mjs` |
| Languages | `content/config/languages.json`, `content/i18n/*.json`, `src/lib/i18n.mjs` |
| SEO | `src/lib/seo.mjs`, `renderPage` in `src/render/layout.mjs` |
| Validation | `src/lib/jsonschema.mjs`, `src/core/validate-core.mjs` (pure, shared with the admin), `src/lib/validate.mjs` (Node loader) |
| Admin app | `public/admin/`, `src/admin-build.mjs` |
| Scheduled publishing (release logic, timer script, workflow) | `src/core/schedule.mjs`, `tools/scheduled.mjs`, `.github/workflows/deploy.yml` |
| Editorial Studio (editor, toolbar, panels) | `public/admin/js/studio/*`, `public/admin/js/views/article.mjs`, `project.mjs`, `public/admin/js/preview.mjs` |
| Studio logic that needs no browser (specs, editing, undo, writing checks, templates, revisions, typography, preview rendering) | `src/core/block-specs.mjs`, `editing.mjs`, `history.mjs`, `writing.mjs`, `templates.mjs`, `revisions.mjs`, `typography.mjs`, `preview.mjs` |
| GitHub access, staged workspace, content operations | `src/core/github-store.mjs`, `src/core/workspace.mjs`, `src/core/content-ops.mjs` |
| Upload checks, IDs, slugs | `src/core/image-info.mjs`, `src/core/ids.mjs`, `src/core/slugify.mjs` |
