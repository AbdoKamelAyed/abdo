# Data model

All content and configuration lives under `content/` as JSON. Every file is checked against a JSON Schema in `schemas/` and then against cross-file rules (references, slugs, translations) before any build output is produced. The schemas are the reference; this page explains how they fit together.

Schema `$id`s use the reserved `https://abdo.invalid/` host. They are identifiers only and are never fetched.

## 1. Conventions

**Schema version.** Every file has `"schemaVersion": 1`. When a later phase changes a shape, it bumps the version and ships a migration; files with an unknown version fail validation instead of being half-understood.

**IDs.** `<prefix>_<8 characters of [0-9a-z]>`, unique across the whole content tree. A record's file is named after its ID (`articles/art_built001.json`); the validator rejects a mismatch. Generate IDs with `npm run new-id -- <kind>`.

| Prefix | Entity | Stored in |
|---|---|---|
| `art_` | Article | `content/articles/<id>.json` |
| `prj_` | Project | `content/projects/<id>.json` |
| `top_` | Topic | `content/taxonomy/topics.json` |
| `tag_` | Tag | `content/taxonomy/tags.json` |
| `med_` | Media asset | `content/media/media.json` |
| `aut_` | Author / owner profile | `content/profile/author.json` |
| `blk_` | Content block | inside an article or project body |
| `nvi_` | Navigation item | `content/config/navigation.json` |
| `hsc_` | Homepage section | `content/config/homepage.json` |
| `dsp_` | Design preset | `content/config/presets.json` |
| `exp_` `edu_` `skl_` `cus_` | CV experience / education / skill group / custom section | inside the profile |

**Dates.** Date-times are ISO 8601 with offset (`2026-11-03T09:00:00+02:00`). Dates shown on pages are formatted in the site's `timezone` (`site.json`), so a post published at 00:30 Cairo time shows the Cairo date.

**Translations.** Anything a visitor reads is stored in a `translations` map keyed by language code. Slugs are per translation. Language codes must be defined in `content/config/languages.json`; a translation in an undefined language is a validation error.

**Samples.** `"sample": true` on a record marks it as placeholder content. `--exclude-samples` removes every such record before validation. Anything real that still references a removed sample (a topic, tag or media asset, say) is reported as an unknown reference; nothing is dropped silently.

## 2. Entities

### Article (`schemas/article.schema.json`)

| Field | Notes |
|---|---|
| `id`, `schemaVersion`, `createdAt`, `updatedAt` | Required |
| `status` | `idea · outline · draft · editing · fact-checking · ready · scheduled · published · archived`. Only `published` is public, plus `scheduled` once its `publishedAt` has passed (below) |
| `publishedAt` | Required when published or scheduled; sets list order (newest first) and is the moment a scheduled page goes live |
| `authorId` | Must exist |
| `template` | Slug-like name (e.g. `editorial`, `long-read`); becomes a CSS class and a homepage filter |
| `typography` | Optional reading typography for this page only: `fontScale` (85–130 %), `lineHeight` (1.2–2.2), `measure` (28–60 rem), `headingWeight` (400–900). Drawn with classes in coarse steps; applies to all translations |
| `internalNotes` | Optional notes for the owner, up to 4000 characters. Never rendered, never in the built site, but stored in the repository like everything else |
| `featured` | Eligible for featured homepage slots |
| `topicIds` | First one is the *primary* topic (used for breadcrumbs and `articleSection`) |
| `tagIds`, `coverMediaId` | Optional; must exist |
| `translations.<lang>` | `status`, `title`, `slug`, `excerpt`, `body` (blocks), optional `seo` override |
| `sample` | Optional flag |

An article is public **in a language** only when the article's status *and* that translation's status are `published` (a `scheduled` status counts as published once the article's `publishedAt` is in the past at build time; see *Scheduled publishing* below). An article can therefore be live in Arabic while its English version is still a draft; the English URL does not exist and Arabic pages do not link to it.

### Project (`schemas/project.schema.json`)

Same lifecycle fields as an article (including `typography`, `internalNotes` and scheduling), plus `projectStatus` (`planned · in-progress · completed · paused`), `startDate`, `endDate`, `tools`, `galleryMediaIds`, `relatedArticleIds`. Translations carry `title`, `slug`, `summary` and optional `subtitle`, `role`, `responsibilities`, `challenge`, `process`, `solution`, `outcome` (case-study sections; blank line separates paragraphs), `links` and a block `body`.

### Topic and tag (`schemas/taxonomy.schema.json`)

Topics are hierarchical (`parentId`) and unlimited; nothing in the code knows a topic by name. The validator rejects cycles. A topic page lists its own items plus its children's, and counts shown on topic tiles roll children up. A topic is public only if its `status` is `published`, its `visibility` is `public`, and it has a translation in that language; a topic that is not public is not rendered, and items that carry it simply do not show it. Tags are flat and public when `status` is `published` and a translation exists. Both have per-language `name`, `slug`, `description`, `synonyms` (other words people use, for search), `seo` overrides and `redirectSlugs` (old addresses that still lead to the page; see [discovery.md](discovery.md#old-addresses)), and a `visibility` (`public` / `private`; a private tag never appears on the site). Topics also have `icon` (a key from `src/core/icons.mjs`), `color` (`#rrggbb`, borders and icons only), `mediaId`, `relatedTopicIds` (up to 12) and `pinnedItemIds` (up to 6, content filed under the topic). Tags also have per-language `aliases` and `relatedTagIds`. A topic or tag page is **built only when public content in that language is filed under it**. The validator checks icons, colours, relations (no self or unknown ids), pinned items (a pinned item not filed under the topic is a warning) and old addresses (an old slug cannot equal a live slug, the page's own slug or another page's old slug); two tags with the same name are a warning that points to the merge tool.

### Media asset (`schemas/media.schema.json`)

`id`, `status` (`active` or `archived`; archived assets are never published), `type` (`image · video · audio · document`), `file` (relative to `content/media/files/`), `mimeType`, optional `width`/`height`/`credit`, an optional `focal` point (`{ x, y }`, whole percentages from the top-left corner: the part that must stay visible when a frame crops the picture; omitted means the centre), and `alt` and `caption` per language. **Every image needs alt text in every enabled language.** Only files referenced by public content are copied to `dist/media/`. SVG files display on the page but are not used for Open Graph / Twitter images.

### Profile (`schemas/profile.schema.json`)

Owner identity (the profile must be `published` to appear), `links` (`email · social · website`), and four collections: `experience`, `education`, `skills`, `customSections`. Every entry has its own ID and `visibility` so an item can be hidden without being deleted. The About page and the Person JSON-LD are generated from the public entries only, and every enabled language must have a profile translation.

### Content blocks (`schemas/block.schema.json`)

A body is an ordered array of blocks with unique IDs within the body. There are 21 types in six kinds (the full table, with every field, is in [editor.md](editor.md)):

- **Text:** `paragraph` (style `body / intro / lead / standfirst / caption / byline / small / highlight`, drop cap, small caps, alignment, text direction), `heading` (levels 2–6; level 1 is the page title), `quote` (`block` or `pull`, optional `cite`), `list`, `checklist`, `definitions`, `code` (language label and caption, never coloured), `table` (header row, column alignment, caption).
- **Images:** `image` (media ID, caption, alt override, size `inline / wide / full`, aspect ratio, border, corner radius), `gallery` (2–24 images in 2–4 columns), `compare` (before and after), `imagetext` (image beside text).
- **Editorial:** `callout` (`note / tip / warning`), `factbox`, `timeline`, `stats`, `related` (article and project IDs), `author` (shows the profile's author card), `footnotes`, `references`, `divider`.

Any block can be `hidden: true`, which keeps it in the file and out of the page, and can carry a `display` object (spacing, width, background tone). Unknown block types or fields are rejected, not ignored. References to media and related pages are IDs and are checked like every other reference.

Inline formatting inside text fields is a small fixed markup, never HTML: `**bold**`, `*italic*`, `++underline++`, `~~strikethrough~~`, `==highlight==`, `^superscript^`, `~subscript~`, `` `code` ``, `[label](url)` and the footnote reference `[^key]`. Links may be `http(s):`, `mailto:`, `tel:`, a site path or a `#fragment`; everything else is escaped or dropped. A text may also contain `⟦placeholder⟧` markers left by an article template: the validator reports them as a **warning** while the translation is a draft and an **error** once it is published.

The editor's forms are generated from `src/core/block-specs.mjs`; a test fails if that table and the schema disagree about a field, an option or a limit.

## 3. Configuration files (`schemas/config.schema.json`)

| File | Purpose |
|---|---|
| `site.json` | Names, tagline, description (per language), canonical domain, timezone, sample banner |
| `languages.json` | Per language: direction, locale, numerals, reading speed, section URL segments, typography, layout widths, enabled/default flags. Exactly one enabled language is the default |
| `i18n/<lang>.json` | Interface strings. Every enabled language must have every key. Counts use plural families (`articles_count_one / _two / _few / _many / _other`, `_other` required) resolved by `Intl.PluralRules` |
| `navigation.json` | Header and footer items per language; a target is a page (`home`, `about`, `portfolio`, `blog`, `topics`, `tags`, `search`, `contact`) or an external `http(s)`, `mailto` or `tel` address. Edited in the admin (Navigation) |
| `search.json` | Optional. What is searchable, page size (4 to 48), default view, "numbered pages" or "show more", suggestions, results while typing, ranking preset, per-language normalisation, synonym groups. Every field is optional; with no file the defaults apply. See [discovery.md](discovery.md) |
| `homepage.json` | Ordered sections per language, each with `type`, `enabled`, `layout`, and a `source` rule (featured only, by topic, by template, a specific item…) |
| `design.json` | Chosen preset, token overrides, Glass Mode settings, animation level |
| `presets.json` | The 8 preset definitions (light/dark colours, shared radii/spacing/backdrops) |

## 4. Publication rules (single source: `src/lib/model.mjs`)

1. Content is public only if its own status is `published`.
2. A translation is public only if its status is `published` too.
3. Topics that are not `published` + `public`, profile entries with `visibility: private`, blocks with `hidden: true` and media that is not `active` are never rendered.
4. Only media referenced by public content is copied to the output.
5. A link is generated only to pages that exist; featured items are not repeated in the list beneath them.
6. With `--exclude-samples`, sample records are removed before any of the above.

These rules are covered by tests that build a site containing drafts, private entries and hidden blocks, then search every output file for them.

## 5. Validation

The rules live in `src/core/validate-core.mjs`, a pure module with no file-system access, so the build (`npm run validate`) and the browser admin run **identical** checks. `npm run validate` reports *all* problems at once, each as `file › field: message`, with a suggestion where possible (`status: must be one of: … — did you mean "published"?`). Beyond the schemas it checks: language defaults, interface-string parity, profile text per language, ID/filename match, ID uniqueness, slug uniqueness per language and kind (old addresses included), all references (topics, tags, media, authors, related articles, homepage and navigation targets), topic cycles, media file existence, alt text, CSS-safe values, and that design presets and homepage sources exist. **Warnings** (non-blocking) cover things like an article that is published but has no published translation.

## 6. Migration notes for later phases

- **The admin (Phase 2)** edits these same files through the GitHub REST API; the shapes above are the contract and the admin has no second data store. Two schema rules exist because of it: an article translation that is a *draft* may have an empty `body` (a new article starts empty), but a *published* translation needs at least one block (`article.schema.json`, `if status = published then body minItems 1`). The admin sets `updatedAt` only on records whose content actually changed, at publish time. Schemas are copied to `/admin/schemas/` at build time, so the admin always validates against the schemas of the deployed version.
- **Revision history (Phase 3)** turned out not to need any stored copies: the Studio reads each file's real Git history (the commits API, and the file as it was at a commit), compares it with the current text and restores from it. Nothing was added to `content/` for it. The limit is that only *published* versions exist in Git.
- **Scheduled publishing (done in the Phase 3 gap work)** reuses the `scheduled` status plus `publishedAt`, and flips nothing: every build treats a record (or translation) whose status is `scheduled` and whose `publishedAt` is not in the future as published for that build, and the files keep saying `scheduled`. A deploy-workflow timer runs the build twice an hour. Scheduled content is validated as strictly as published content. Details and limits: [editor.md](editor.md#scheduling).
- **New languages** are added by adding a language entry and an `i18n/<code>.json`; the validator then lists every file that still needs a translation.
- **Search and agent endpoints** are generated artifacts, not sources; they never need migration.
