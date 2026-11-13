# Architecture

## 1. Shape of the system

ABDO is **static-first**: content is JSON, a build step turns it into plain HTML/CSS, and GitHub Pages serves the result. There is no server. Nothing runs in a visitor's browser except a ~70-line progressive-enhancement script (theme toggle, mobile menu). The one other piece of code that runs in a browser is the owner's admin app under `/admin/` (section 5), which is a separate application and is never linked from the public pages.

```
content/*.json ──► load ──► validate ──► content model ──► render ──► dist/
 (source of truth)  │         │              │               │         │
                    │         │              │               │         ├─ HTML pages, per language
                    │         │              │               │         ├─ theme.css, glass.css, base.css, site.js
                    │         │              │               │         ├─ media (only files public pages use)
                    │         │              │               │         └─ sitemap.xml, robots.txt, 404.html
                    │         │              │               └── link check (broken link = failed build)
                    │         │              └── publication rules, per-language views, SEO data
                    │         └── JSON Schema + cross-file rules (references, slugs, translations…)
                    └── every file read, JSON errors name the file
```

Each stage lives in its own module and can be tested alone:

| Stage | Module | Responsibility |
|---|---|---|
| Load | `src/lib/validate.mjs` (`loadContent`) → `src/core/assemble.mjs` | Read all JSON under `content/` (Node only), then assemble the content object; remembers which file every record came from |
| Validate | `src/core/validate-core.mjs` + `src/lib/jsonschema.mjs` | Schema checks, then cross-file rules; pure functions, so the browser admin runs the same code; returns errors and warnings, never throws on bad content |
| Model | `src/lib/model.mjs` | The **only** place that decides what is public; builds per-language views |
| Theme | `src/lib/theme.mjs` | Design tokens → `theme.css`; glass settings → `glass.css` |
| SEO | `src/lib/seo.mjs` | JSON-LD, sitemap, robots |
| Render | `src/render/*.mjs`, `src/lib/blocks.mjs`, `src/lib/markup.mjs` | Pure functions from model to HTML strings |
| Admin | `src/admin-build.mjs`, `public/admin/` | Publish the admin app and its shared modules under `dist/admin/` |
| Orchestrate | `src/build.mjs` | Run the stages, write files, check links |

## 2. Key decisions and why

**JSON files as the database.** They diff well in Git, can be edited in the GitHub web UI, can be validated, and map directly onto what the later admin dashboard will read and write through the GitHub REST API. No database to host or secure.

**Zero dependencies.** The package registry was unreachable while building, which turned out to be a useful constraint: nothing to audit or update, and a build that runs anywhere with Node 22. The cost is that the project carries its own small JSON Schema validator (`jsonschema.mjs`, draft-07 subset). It **rejects schema keywords it does not implement** instead of ignoring them, so a schema can never silently promise a check that does not happen.

**One place decides what is public.** `model.mjs` applies the publication rules once; renderers only see the result. Because renderers never see drafts, private CV sections or hidden blocks, they cannot leak them. Tests build a site containing such content and search every output file for it.

**Stable prefixed IDs for every relationship.** Articles, projects, topics, tags, media, blocks, nav items, homepage sections and presets reference each other by ID (`art_`, `prj_`, `top_`, `tag_`, `med_`, `aut_`, `blk_`, `nvi_`, `hsc_`, `dsp_`; CV entries use `exp_`, `edu_`, `skl_`, `cus_`). Renaming a slug or a title never breaks a relationship. Slugs belong to a translation, not to an entity.

**Per-language independence.** There is no "default content with translations bolted on". Each entity holds a `translations` map; each language has its own routes, slugs, navigation, homepage layout, typography, content width, numerals and reading speed. A translation can be published or draft independently of the others.

**Design is data, content is data, they never mix.** Presets and glass settings generate CSS only. A test builds the site with two different presets and asserts every page is byte-identical except for the hashed stylesheet file names.

**Crawlable by default.** Every page is a real file (`/ar/مدونة/…/index.html`); no hash routing. Arabic slugs are stored raw on disk and percent-encoded in URLs.

**Fail the build, not the visitor.** Invalid content, an unsafe CSS value, an unknown reference or a broken internal link stops the build with a message that names the file and field. The previous deployment stays live.

## 3. Output layout

```
dist/
  index.html                 language redirect (by browser language, falls back to default)
  404.html                   multilingual
  sitemap.xml  robots.txt  .nojekyll  .abdo-build
  admin/                     the admin app (index.html, js/, shared/, schemas/, config.json); omitted with --no-admin
  assets/theme.<hash>.css  glass.<hash>.css  base.<hash>.css  site.<hash>.js
  media/…                    only files referenced by public content
  ar/…   en/…                one tree per enabled language
```

Asset file names contain a content hash, so a changed stylesheet is never served stale. `.abdo-build` marks a folder as safe to wipe: the build refuses to delete a non-empty folder without it.

**Base path.** The path of `--site-url` is used as the base path (`https://user.github.io/abdo` → `/abdo`), so project pages work without configuration.

## 4. Security properties of the public site

- Content text is escaped before inline formatting is applied; links accept only `http`, `https`, `mailto`, `tel`, site-relative and `#anchor` URLs.
- Values written into generated CSS (fonts, backdrops, sizes) must pass a character allow-list at validation time.
- Page-embedded JSON is serialised so it cannot close its `<script>` element.
- No credentials, tokens or private data are read by the build. The admin has its own threat model in [security.md](security.md).
- The build only writes inside the chosen output folder, and only into a folder it created or an empty one.

What this design **cannot** protect: anything committed to a public repository is public. See the limitations in the README.

## 5. The admin (Phases 2 and 3)

```
browser ──────────────────────────────►  GitHub REST API  ──►  repository (content/*.json, media)
 /admin/ (static, public code)  token in memory                      │
   ├─ views        screens, text nodes only (no HTML strings)        └─► GitHub Action ─► Pages
   ├─ workspace    base snapshot + staged writes/uploads/deletes
   ├─ validate     src/core/validate-core.mjs (same as the build)
   ├─ studio       block editor, preview, history, typography (Phase 3)
   └─ github-store atomic commit via the Git Data API
```

Key decisions:

- **Static, serverless, no secrets in code.** The admin is published like any other page. Authorization is the user's own fine-grained token; there is nothing to protect on the server because there is no server. The cost: a public repository exposes drafts, and a token is only as safe as the browser tab it lives in ([security.md](security.md)).
- **One validator, two hosts.** `src/core/` has no Node-only imports and is copied to `dist/admin/shared/`. The admin therefore cannot accept content the build would reject, and a test publishes from the admin and runs the real build on the result.
- **Staging, then one atomic commit.** Edits never touch GitHub until "Publish"; the publish is blobs → tree → commit → non-forced branch update, preceded by an expected-head check. Conflicts are surfaced per file and need an explicit choice.
- **The Studio edits specifications, not HTML.** Block forms are generated from one table (`src/core/block-specs.mjs`), the preview runs the build's own renderer in a script-less sandboxed frame, and revision history is read from Git rather than copied. Tiptap/ProseMirror were deliberately not used to keep the project dependency-free. See [editor.md](editor.md).
- **Writes are confined to `content/`** by a path allow-list in the store, checked before any request.
- **No second data model.** The admin reads and writes the Phase 1 JSON files; the schemas are the contract.
- **Testing without the real service.** A local fake of the GitHub API implements the endpoints the store uses, so the whole flow runs in tests and in a real browser. This proves the logic and the UI; it does not prove GitHub's behaviour.

## 6. Planned architecture (not built)

| Concern | Direction | Phase |
|---|---|---|
| Large media, private files, contact form | Cloudflare R2 behind a Worker; the Worker also hosts the contact-form endpoint | 2+ (deferred) |
| Search | Build-time index file per language, queried in the browser | 5 |
| Agent access | Public read-only JSON endpoints generated at build time | 8 |

These are directions, not commitments; each will be re-examined when its phase starts.
