# ABDO

A bilingual (Arabic / English) personal website, magazine, portfolio and CV, generated as plain static HTML and hosted on GitHub Pages.

This repository is **Phase 5 — Content discovery** of a nine-phase plan (see [docs/roadmap.md](docs/roadmap.md)): the Phase 1 foundation, the Phase 2 admin dashboard, a block-based Editorial Studio inside the admin (Phase 3), a Homepage Builder and Appearance Studio (Phase 4), and search, topic and tag management and navigation (Phase 5). Everything described as working below was built and tested. Anything not listed as working is not built yet; the [limitations](#what-is-not-built-yet) section says so plainly.

## What works today

- **Static site generator** with no dependencies: Node 22+, nothing to `npm install`.
- **Two independent language experiences** (Arabic RTL, English LTR). Each language has its own URLs and slugs, navigation, homepage sections, typography, layout width, reading speed and interface strings. A page that exists in one language only is simply not linked from the other.
- **Real pages**: homepage, blog index + articles, portfolio index + projects, topics (with sub-topics) + topic pages, tags + tag pages, About / CV, Contact, 404.
- **Block-based article bodies**: 21 block types (paragraph, heading, quote, lists, checklist, definitions, code, table, image, gallery, before/after, image with text, callout, fact box, timeline, statistics, related pages, author card, footnotes, references, divider) stored as JSON and rendered to semantic HTML.
- **Content validation** before every build, with errors that name the file, the field and a suggested fix ("did you mean `published`?").
- **Design system**: tokens, 8 presets, light / dark / system theme, per-language typography and layout, and a separate Glass Mode layer. Changing preset, colours, layout or glass settings never touches content.
- **SEO basics**: canonical URLs, reciprocal `hreflang`, Open Graph / Twitter cards, JSON-LD, `sitemap.xml` with language alternates, `robots.txt`.
- **Privacy by construction**: drafts, private CV sections, hidden blocks and unreferenced media never reach the output (covered by tests).
- **Build-time link check**: a broken internal link fails the build.
- **GitHub Pages deployment** through a workflow in `.github/workflows/deploy.yml`.
- **Admin dashboard at `/admin/`** (Arabic and English): create and edit articles, projects, the profile/CV and media in the browser, check them with the same validator the build uses, and publish everything in **one atomic Git commit** through the GitHub API. Conflicts with outside edits are detected, never silently overwritten. See [docs/admin.md](docs/admin.md) and [docs/security.md](docs/security.md).
- **Editorial Studio** (in the article and project editors): formatting toolbar and shortcuts, undo/redo, drag-and-drop block ordering, 12 article templates in Arabic and English, live preview of the real page (sandboxed; phone, tablet, desktop; light and dark), outline, writing checks and word goal, find and replace, focus mode, autosave in the browser, revision history read from Git (word-level comparison, restore), a per-language typography panel with per-page overrides, nested lists, picture paste/drop and focal point, scheduled publishing and internal notes. See [docs/editor.md](docs/editor.md).
- **Homepage Builder and Appearance Studio** (Phase 4): per-language homepage sections you can add, reorder, show or hide and copy between languages; presets and your own presets; colours for all languages or one language with a contrast check that blocks unreadable text and a Fix button; Glass Mode controls; a per-language Layout Manager (widths, header, footer, menu, cards, columns and spacing for desktop, tablet and phone); a Typography Studio with 15 fonts labelled by whether they contact Google; a live preview of the real page. See [docs/customization.md](docs/customization.md).
- **Content discovery** (Phase 5): a static, per-language search index built from public content only, with Arabic-aware matching (diacritics, alef/ya/ta-marbuta variants, the article `ال`), exact phrases, exclusion, synonyms, "did you mean", suggestions while typing, filters, sorting and a shareable address; topic and tag landing pages built when public content is filed under them; related content computed from what you filed (no AI); pagination; a **Topic Manager** (tree, merge, move, pinned items, accent colours), a **Tag Manager** (duplicates and typos, merge, bulk actions, usage), **Search settings** with a test box, and a **Navigation** editor. Old addresses are remembered when a slug changes. See [docs/discovery.md](docs/discovery.md).

## Quick start

```bash
node --version        # must be 22 or newer
npm test              # 482 tests (no browser needed)
npm run dev           # builds for http://localhost:4173 and serves it
```

Open <http://localhost:4173/>. The root page redirects to Arabic or English from the browser language.

**Windows:** double-click `start.bat`. **macOS / Linux:** run `./start.sh`. Either one builds the site and opens it in your browser (Node 22 or newer must be installed).

**Going live:** see [docs/deployment.md](docs/deployment.md), the stage-by-stage roadmap from this project to a published site.

### Why a file called `index.html` looks empty

- **There is no site `index.html` in the source.** Every page of the site, including `index.html`, is *generated* by `npm run build` into the `dist/` folder, which is not part of the zip and not part of the Git repository. GitHub Pages builds it for you through the workflow.
- **`public/admin/index.html` is empty on purpose.** It is only a shell (`<div id="app">`) that JavaScript fills in. Browsers refuse to load JavaScript modules from a file opened by double-click (`file://`), so it shows a blank page; it also contains a `{{API_ORIGIN}}` placeholder that the build fills in.
- **`dist/index.html` is not a page to read either.** It only redirects to `/ar/` or `/en/`, and those paths only exist on a web server. So the site, and the admin at `/admin/`, must be opened through a server: `npm run dev` or `start.bat` on your computer, or GitHub Pages once deployed.

| Command | What it does |
|---|---|
| `npm run validate` | Validates `content/` only; prints every problem; exit code 1 on error |
| `npm run build` | Validates, then writes the site to `dist/` |
| `node src/build.mjs --site-url https://you.github.io/repo` | Production build with the real address (canonical URLs, sitemap, base path) |
| `node src/build.mjs --exclude-samples` | Drops everything marked `"sample": true`; refuses to build while the profile is still a sample |
| `npm run build:local` / `npm run serve` | Local preview build / static server |
| `npm run new-id -- article` | Prints an unused ID (`article`, `project`, `topic`, `tag`, `media`, `author`, `block`, `section`, `nav`, `preset`) |
| `npm test` | Unit, content, admin and full-build tests |
| `npm run test:e2e` | 48-step admin test in a real browser against a local fake of GitHub (needs Playwright installed; not a project dependency; it skips itself with a notice if missing) |
| `npm run test:e2e:search` | 20-step test of the public search page in a real browser |
| `npm run test:e2e:discovery` | 24-step test of the Topic Manager, Tag Manager, Search settings and Navigation screens in a real browser |
| `npm run build:no-admin` | Build without publishing `/admin/` |

Build options: `--site-url`, `--out`, `--content`, `--exclude-samples`, `--validate-only`, `--no-admin`, `--admin-api-base`.

## Using the admin

1. Deploy the site (next section). The admin is then at `https://<you>.github.io/<repo>/admin/`.
2. Create a fine-grained GitHub token limited to this one repository with **Contents: read and write**.
3. Sign in with the owner, repository, branch and token. The token stays in the tab's memory (optionally the tab's `sessionStorage`); it is never stored in the repository or the site.
4. Edit, then open **Review & publish**. Publishing makes one commit; the GitHub Action rebuilds the site.

The admin has **not been run against the real GitHub yet** (only against a local fake). Try it on a throwaway repository first. Details and limits: [docs/admin.md](docs/admin.md).

## Putting it on GitHub Pages

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs the tests, builds, and publishes. The site address (including a project-page sub-path such as `/abdo/`) is detected automatically.
4. When you are ready to go live with your own content, replace the sample files (below), then add a repository **variable** `EXCLUDE_SAMPLES` = `true` (Settings → Secrets and variables → Actions → Variables). The build will then refuse to publish if your profile is still marked as a sample.

## Replacing the sample content

Every sample file carries `"sample": true`.

1. Edit `content/profile/author.json` (your name, headline, bio, experience, education, skills, links) and **remove** `"sample": true`.
2. Edit `content/config/site.json` (site name, tagline, description, `canonicalDomain`, `timezone`).
3. Replace the articles and projects, or delete the sample files. See [docs/publishing-workflow.md](docs/publishing-workflow.md).
4. Run `npm run validate`, then `node src/build.mjs --exclude-samples`.

## Repository layout

```
content/      All content and configuration, as JSON (the only thing you normally edit)
schemas/      JSON Schemas that define every file in content/
src/          Build pipeline: validation, content model, theme, SEO, rendering
public/       Hand-written base.css and site.js for the site; public/admin/ is the admin app
src/core/     Pure modules shared by the build and the admin (validation, GitHub store, workspace…)
tools/        Local preview server and ID generator
tests/        node:test suites
docs/         Architecture, data model, design system, modules, roadmap, workflow
```

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the system fits together and why |
| [docs/admin.md](docs/admin.md) | The admin dashboard: what it does, sign-in, publishing, conflicts, limits |
| [docs/editor.md](docs/editor.md) | The Editorial Studio: blocks, markup, templates, preview, history, typography, tests, what is not done |
| [docs/security.md](docs/security.md) | Threat model: where the token lives, what is mitigated, known weaknesses |
| [docs/modules.md](docs/modules.md) | The 16 modules and what exists of each |
| [docs/data-model.md](docs/data-model.md) | Entities, IDs, schemas, publication rules, migration notes |
| [docs/design-system.md](docs/design-system.md) | Tokens, presets, typography, layout, Glass Mode, accessibility |
| [docs/customization.md](docs/customization.md) | The Homepage Builder and Appearance Studio: what they do, what is stored, what is not built, tests |
| [docs/discovery.md](docs/discovery.md) | Search, topic and tag pages, related content, the Topic and Tag Managers, Search settings, Navigation: how they work, security, tests, what is not built |
| [docs/publishing-workflow.md](docs/publishing-workflow.md) | How content goes from a JSON file to a live page |
| [docs/roadmap.md](docs/roadmap.md) | The nine phases and what is next |

## What is not built yet

These are not built. Nothing in the site or the admin pretends otherwise.

- **Topics, tags, navigation, search settings, the homepage and the design are edited in the admin** (Phases 4 and 5). What Phase 4 does not cover (sidebars, layouts per page type, per-element colours and fonts, custom font upload) is listed in [docs/customization.md](docs/customization.md#what-is-not-built).
- **The admin was tested against a local fake of the GitHub API and in Chromium only.** Not against the real GitHub, Firefox or Safari. This includes the Studio's history panel, which uses GitHub's commits API.
- **The Studio is not everything the Phase 3 specification lists.** Not built: video, audio, PDF and embed blocks; pixel cropping; text colours and per-text fonts; grammar checking; approval workflow, track changes and comments between people; custom font upload. Tiptap/ProseMirror were deliberately not used (the project has no dependencies). Touch drag-and-drop is not provided; phones use move buttons. Full list: [docs/editor.md](docs/editor.md#specification-coverage).
- **Uploads are PNG, JPEG, GIF and WebP only** (8 MB). SVG is refused because it can contain script. No pixel cropping or responsive variants (a focal point keeps the important part visible when a frame crops a picture).
- **Search has no stemming and needs JavaScript.** Plurals and inflections are different words (use synonyms or aliases); the search page offers browse links when scripts are off. Search quality was tested with the sample and test content, not with a large real archive, and not by native readers or with a screen reader. See [docs/discovery.md](docs/discovery.md#what-is-not-built).
- **No contact form.** The Contact page shows the contact links in the profile. Sending messages needs a Cloudflare Worker (or similar) that does not exist yet; the form will appear only when one is configured and working.
- **No RSS/Atom, PDFs or digital editions** (Phases 6–7).
- **No analytics, no per-crawler `robots.txt` rules, no public JSON endpoints** (Phases 8–9). `robots.txt` currently allows everything and points to the sitemap.
- **Scheduled publishing has not run on GitHub.** The site is static, so a `scheduled` page goes live in the first build after its date; the deploy workflow runs a build twice an hour and skips idle timer runs. The logic, the timer script and the workflow file are tested; the timer itself is not, GitHub may delay or drop timer runs, and scheduled text is readable in the repository before its date. See [docs/publishing-workflow.md](docs/publishing-workflow.md#scheduled-publishing).
- **No responsive image variants** (`srcset`): fine for a small site, to be added when media is uploaded through the library. Lists are paginated (Phase 5).
- **Drafts in a public repository are visible in the source.** They are excluded from the built site, but if the repository itself is public, anyone can read the JSON. The admin warns when it detects a public repository. There is no private storage yet; keep unfinished private work out of a public repository.
- **Most fonts come from Google Fonts**, which is a third-party request from your visitors' browsers. The Typography Studio labels each font *Google* or *system*; choosing system fonts for a language removes the request for that language (tested). The pages remain readable with system fonts if the request fails (fallback stacks are defined), but this was verified by reading the CSS, not by running a browser offline.
- **Sample cover images are SVG.** They display on pages but are not used for social-sharing images, because major platforms do not accept SVG there. Use PNG/JPG/WebP for real covers.
