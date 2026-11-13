# Customization (Phase 4)

Two admin screens change how the site looks and what its homepage shows, without touching any article, project or the profile:

- **Homepage** (`#/homepage`) edits `content/config/homepage.json`.
- **Appearance** (`#/appearance`) edits `content/config/design.json`, `content/config/presets.json` and `content/config/languages.json` (typography and layout).

Both stage their changes like every other edit: nothing is public until it is published from **Review & publish**, as one commit, after the same validator the build uses has passed. The pure rules behind both screens live in `src/core/` (`homepage-ops.mjs`, `design-ops.mjs`, `contrast.mjs`, `layout.mjs`, `fonts.mjs`) and are shared by the screens, the validator, the build and the tests, so what the screen allows is exactly what the build accepts.

Design stays apart from content: a test builds the site with two different presets and asserts every page is byte-identical except for the hashed stylesheet names (`tests/build.test.mjs`), and layout settings reach only their own language's stylesheet rules and `<html>` attributes (`tests/appearance-build.test.mjs`).

## Homepage Builder

Each language has its **own** list of sections. Changing the English homepage never changes the Arabic one.

| You can | How |
|---|---|
| Add a section | Pick a ready-made kind (Featured item, Latest articles, Featured topics, Selected projects, Latest projects, Personal insights, Professional highlights, Follow) and press **Add**. It is an ordinary section afterwards. |
| Reorder | Drag the handle, or focus the handle and use the up/down arrow keys, or use the ↑ ↓ buttons. Touch screens use the buttons (touch drag-and-drop is not provided). |
| Show or hide | The "Shown on the page" box. A hidden section stays stored and is simply not drawn. |
| Duplicate, delete | Buttons on each section. A copy gets a new ID. |
| Copy the structure from the other language | Replaces this language's list with a copy of the other's, after a confirmation: same kinds, order, layouts and settings, new IDs. Custom titles and introductions are **not** copied (they are in the other language), so the headings follow the interface language until you write your own. |
| Change a section | **Settings** shows only what that kind of section really has: title, introduction, layout (grid, editorial, list, split or overlay depending on the kind), number of items (held to 1–12; the field shows the value that was kept), image shape, spacing, "only featured items", topics, article templates, and for a Featured item the specific article or project. A setting the page renderer would ignore is not offered. |
| See the result | The preview beside the list is the real page, drawn by the build's own renderer from the unpublished data, in a script-less sandboxed frame. |

**A section with nothing to show is not drawn.** For example a "Personal insights" section filtered to the *Personal journal* template draws nothing until a published article of that template exists, and a Follow section draws nothing until the profile has links. This is intentional (no empty headings); the builder does not currently warn about it.

Stored shape: `homepage.json → languages.<lang>.sections[]`, each `{ id: "hsc_…", type, enabled, title?, intro?, layout?, limit?, imageRatio?, spacing?, source? }` (`schemas/config.schema.json#/$defs/homepageSection`). Unset values are not stored, so the file lists real choices only.

## Appearance Studio

Four tabs; a preview of any public page (Home, Blog, Portfolio, Topics, About) in either language sits beside them and updates as you change things.

### Look: presets, colours, shapes

- **Presets.** The eight shipped presets can be chosen but never changed or deleted. Choosing one changes only `design.preset`; your own colour changes are kept unless you press **Clear my colour changes** (everywhere or for one language).
- **Your own presets.** **Save the current look as a preset** copies the preset in use plus your site-wide colour and size changes into a new preset (`custom: true`, an ID `dsp_…`, a key made from the English name, a name in both languages). Your presets can be renamed and deleted; the one in use cannot be deleted. Preset names are interface text only.
- **Colours.** Nine colours per mode (light and dark): page background, cards and panels, text, secondary text, text on buttons, borders, buttons and strong elements, secondary colour, accent. Each has a colour picker, a hex box and a **Reset**. Only real changes are stored (a colour equal to what it would be anyway is not written). A **Colours for** selector applies the change to all languages or to one language only (`design.json → languageOverrides.<lang>`), so the Arabic site can have a warmer accent than the English one.
- **Shapes and spacing.** Corner radius, large corner radius, space between sections and page margins (plain CSS lengths: `px`, `rem`, `em`, `ch`, `vw`, `%`), card shadow (none, soft, medium, strong), and motion (none, subtle, full; `prefers-reduced-motion` always wins).

### Readability check

Every colour pair that has to be readable is measured with the WCAG relative-luminance formula, for the site-wide look and for each language that has colours of its own:

| Pair | Used for |
|---|---|
| text on page, text on cards | body text |
| secondary text on page, on cards | captions, dates |
| accent on page, on cards | links and highlights |
| text on buttons on button colour | button labels |

- **Below 3 : 1 is an error and blocks publishing** (practically unreadable). **3 to 4.5 : 1 is a warning** (WCAG AA for normal text is 4.5 : 1).
- **Fix** repairs one colour: it mixes it toward black or white in small steps until it reaches 4.5 : 1 against **every colour it is paired with** (for example text on both the page and the cards), so the hue stays recognisable. **Fix all** repairs everything it can.
- The owner's own saved presets are checked as well; a weak one is a warning, found before it is chosen.
- Shipped presets are guarded by tests for all eight presets in both modes (see [design-system.md](design-system.md#7-accessibility-and-quality-gates)).

### Glass Mode

Enable it, switch its elements (header, menu, cards, hero, footer) on or off, and set blur (0–60 px), opacity (0–100 %), border, shadow and an optional surface colour **separately for light and dark**. A field typed outside its range snaps back to the value that was kept. Hero panels are held at 85 % opacity or more whatever the setting says.

Because the content behind glass is not known (a photograph, a gradient), readability there is **a warning, not a block**: primary text is measured over pure black and pure white behind the glass at its opacity (secondary text over the page colour). Fully clear glass (0 %) is reported; the shipped 68 % default passes.

**Glass Mode and card style.** While Glass Mode styles cards (glass enabled with *cards* on), it decides how cards look and the *Card style* in Layout has no visible effect. The Studio says so beside the switch. To use flat, outlined or elevated cards, turn Glass Mode's cards off.

### Layout

Per language. Anything left on **Default** keeps the site's normal look and writes nothing, so older content and older presets render exactly as before.

| Setting | Values |
|---|---|
| Page width, Text width | a CSS length |
| Card style | flat (no frame), outlined (thin border), elevated (shadow instead of a border) |
| Header | classic (name left, menu centred, tools right), centred (name above a centred menu on wide screens), compact |
| Footer | columns, centred, minimal |
| Menu style | underline, pill, plain |
| Keep the header visible while scrolling | on or off |
| Tablet and phone breakpoints | integers in px (tablet 600–1400, phone 360–900); the tablet width must be larger than the phone width, which is an error otherwise |
| Per desktop, tablet and phone | columns in card grids (1–4), space between cards, space around sections, page padding |

Desktop settings apply everywhere; tablet settings apply at the tablet width and narrower, phone settings at the phone width and narrower (later rules win). Warnings (not errors): a text column wider than the page, more than 12 rem around sections, more than 3 rem of padding on a phone. The page records header, footer, menu and sticky choices as `data-header`, `data-footer`, `data-nav` and `data-sticky` on `<html>`.

### Typography

Per language (articles can still override size, line height, column width and heading weight in their own editor, see [editor.md](editor.md)).

- **Fonts come from a list of 15**, not a free text box, so a typo can never silently load nothing: 6 Arabic (IBM Plex Sans Arabic, Noto Naskh Arabic, Cairo, Tajawal, Noto Kufi Arabic, Amiri), 7 Latin (Inter, IBM Plex Sans, Newsreader, Source Serif 4, Lora, Playfair Display, IBM Plex Serif) and 2 system stacks. A right-to-left language is offered Arabic and system fonts only; a left-to-right language Latin and system fonts. A stack set by hand in the JSON shows as "Custom" and is kept.
- **Privacy.** Each font is labelled *Google* or *system*. A "Google" font makes every visitor's browser contact Google Fonts. A language whose heading and body are both system fonts loads **nothing** from Google (its pages contain no Google Fonts link; tested in the build and in the browser test). The Google Fonts request is rebuilt from the chosen fonts, so fonts no longer used are dropped.
- **Sizes.** Text size (a CSS length), line height (1–2.6), heading line height (1–2), heading weight (400–800), letter spacing. **Letter spacing is locked to 0 for right-to-left languages**, because spacing breaks the joining of Arabic letters.

## What is stored where

| File | What changes |
|---|---|
| `config/homepage.json` | sections per language |
| `config/design.json` | `preset`, `overrides` (colours per mode, shared sizes, card shadow), `languageOverrides`, `glass`, `animation` |
| `config/presets.json` | the owner's own presets (shipped presets are never rewritten) |
| `config/languages.json` | per language `typography` and `layout` |

## What is not built

Said plainly, so nothing is assumed:

- **No sidebars or other new page regions.** The Layout Manager changes widths, grids, spacing and the shape of the header, footer, menu and cards; it does not add regions the pages do not have.
- **Layout is per language, not per page type.** There is no separate layout for the blog, the portfolio or one article.
- **No per-element text colours or per-element font assignments.** Colours are the nine tokens above; fonts are one heading and one body font per language.
- **No custom font upload and no self-hosted fonts.** Only the list of 15 (13 of them from Google Fonts, 2 system stacks).
- **No palette generator or colour-harmony suggestions**, no automatic dark mode from a light palette.
- **No undo inside the Studio.** Changes are staged; **Discard** on *Review & publish* returns to the published state, and **Clear my colour changes** and **Reset** undo colours.
- **Touch drag-and-drop is not provided** for homepage sections; phones use the ↑ ↓ buttons.
- **The builder does not warn that a section would currently draw nothing** (see above).
- **Browsers:** all of this was tested in Chromium only, against a local fake of the GitHub API. Not Firefox or Safari, and not the real GitHub. Look at the preview of each language once on a phone before relying on a new layout.
- **Visual verification:** header, footer, menu and card variants and the phone layout were checked by screenshot in both languages during development; the automated tests check the generated CSS and attributes, not how it looks.

## Tests

| Suite | What it proves |
|---|---|
| `tests/contrast.test.mjs` (12) | WCAG ratios, error and warning boundaries, Fix finds the nearest passing colour for every paired background, glass checks, and the validator reports bad custom colours (error below 3 : 1, warning below 4.5 : 1) |
| `tests/design-ops.test.mjs` (8) | only real colour changes are stored, per-language colours sit on top of site-wide ones, choosing a preset keeps your colours, safe unique preset keys, a new preset from the current look is valid, shipped presets cannot be deleted or renamed, the one in use cannot be deleted |
| `tests/homepage-ops.test.mjs` (7) | every section kind and ready-made section is accepted by the schema and validator, unique IDs and defaults, duplicate, move, hide, remove, settings the renderer ignores are dropped, the limit is clamped, copy structure gives new IDs |
| `tests/layout.test.mjs` (8) | defaults write no CSS, desktop, tablet and phone rules in the right order, card styles, anything that is not a plain length or a sane column count is never written into the stylesheet, breakpoint order is an error |
| `tests/fonts.test.mjs` (7) | the catalogue, the shipped fonts are recognised, script filtering, Google Fonts requests follow the chosen fonts, system fonts remove every request, custom stacks are kept, letter spacing locked for right-to-left |
| `tests/appearance-build.test.mjs` (8) | the real build: the default site is unchanged, one language's layout reaches only that language, per-language colours, card shadow only when chosen, bad breakpoints stop the build with a clear message, the preview of the home page works in both languages without scripts, a hidden section is not drawn |
| `tests/admin.test.mjs` | every new interface string exists in both languages; every dynamic string key belongs to a checked family |
| `tests/e2e/admin.e2e.mjs` (11 steps added) | in a real browser: add, hide, duplicate, delete, keyboard and drag reordering, limits, copy structure, publish and build the homepage; preset choice with a live preview; an unreadable colour blocks publishing and Fix repairs it; save, rename, use and delete a preset (never the one in use); glass ranges and warnings; layout checks and per-language build output; fonts per script and no Google request for system fonts; no untranslated text in either language; no horizontal scroll at phone width; no console or CSP errors |

Two bugs these tests found and fixed while building: a number typed above its range stayed on screen even though the stored value was corrected, and Fix repaired text for the page but left it weak on cards.
