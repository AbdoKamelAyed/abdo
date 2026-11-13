# Design system

The visual layer is generated from data and kept strictly apart from content. Content files never contain colours or fonts; design files never contain text that visitors read.

```
content/config/presets.json ─┐
content/config/design.json  ─┼─► src/lib/theme.mjs ─► theme.css   (colour, spacing, per-language typography, motion)
content/config/languages.json┘                      └► glass.css   (Glass Mode only)
public/assets/base.css  (hand-written layout and components, reads the variables above)
```

`base.css` knows no colour values; it only uses variables. Change a preset and the site is re-skinned without any page text changing (tested).

## 1. Principles

- Editorial first: generous measure, strong hierarchy, content before decoration.
- Arabic is a first-class design target, not a mirrored English layout: its own fonts, larger base size, taller line height and a narrower reading measure.
- Logical CSS properties only (`margin-inline`, `inset-inline-start`, `border-block-end`…), so right-to-left needs no separate stylesheet.
- Everything works without JavaScript. The script adds the theme toggle and the mobile menu.
- Readable by default: contrast, focus and motion rules below are enforced by tests, not left as intentions.

## 2. Tokens

| Group | Tokens | Source |
|---|---|---|
| Colour (per mode) | `--bg --surface --text --muted --border --primary --on-primary --secondary --accent` | preset `light` / `dark` |
| Shape and space | `--radius --radius-lg --section-space --gutter` | preset `shared` |
| Backdrop | `--backdrop` (optional gradient behind the page) | preset `shared.backdropLight/Dark` |
| Typography (per language) | `--font-heading --font-body --font-mono --fs-base --lh-body --lh-heading --ls-body --heading-weight` | `languages.json` |
| Layout (per language) | `--content-width --measure` | `languages.json` |
| Motion | `--dur` (`0ms / 160ms / 280ms`) | `design.json` `animation`; forced to 0 for `prefers-reduced-motion` |

`design.json → overrides` can replace any colour token for a mode without editing the preset, and `design.json → languageOverrides.<lang>` replaces colours for one language only (merged over the site-wide ones). The Appearance Studio edits all of this; see [customization.md](customization.md). Card shadow (`shared.cardShadow`: none, soft, medium, strong) applies when Glass Mode does not style cards.

## 3. Colour modes

`light`, `dark`, and *system*. The default follows `prefers-color-scheme`; a visitor's explicit choice sets `data-theme` on `<html>` and is remembered in `localStorage` (wrapped in try/catch, so a blocked storage only means the choice is not remembered). A small inline script sets the attribute before first paint to prevent a flash of the wrong theme.

## 4. Presets

Eight presets ship in `content/config/presets.json`: Editorial Magazine (default), Minimal Portfolio, Modern Glass, Classic Newspaper, Creative Journal, Professional Profile, Luxury Editorial, Academic Publication. Each defines a light and a dark palette plus radius, section spacing and an optional backdrop. Presets do **not** change fonts; typography belongs to the language so Arabic and English can differ regardless of preset. A preset is chosen with one line in `design.json` (`"preset": "classic-newspaper"`) or in the Appearance Studio. The owner can also save their own presets (`custom: true` in `presets.json`); shipped presets are never rewritten.

## 5. Typography

Per language, in `languages.json`:

| | Arabic | English |
|---|---|---|
| Body | IBM Plex Sans Arabic | IBM Plex Sans |
| Headings | Noto Naskh Arabic | Newsreader |
| Base size | 1.125rem | 1.0625rem |
| Line height | 1.95 (headings 1.5) | 1.7 (headings 1.15) |
| Content width / measure | 74rem / 40rem | 72rem / 38rem |
| Reading speed (for "min read") | 180 wpm | 230 wpm |
| Numerals | Latin digits (`numerals: "latn"`), locale `ar-EG` | `en-GB` |

Fonts are loaded from Google Fonts with `display=swap`; every stack has system fallbacks. A language whose heading and body fonts are both system fonts loads nothing from Google (`googleFonts` is empty). The Typography tab of the Appearance Studio offers a list of 15 fonts (6 Arabic, 7 Latin, 2 system) per language, labelled by whether they contact Google, and keeps `googleFonts` in step with the choice; letter spacing is locked to 0 for right-to-left languages. Values are validated (sizes, weights and font-family strings are checked against an allow-list of characters).

## 6. Glass Mode

A separate stylesheet (`glass.css`) controlled by `design.json → glass`:

- `enabled`, and per mode (`light`, `dark`): `blur` (0–60 px), `opacity` (0–100 %), `border`, `shadow` (`none / soft / medium / strong`), optional `surface` colour.
- `elements`: `header`, `menu`, `cards`, `hero`, `footer` switched on/off individually.
- Default: blur 18 px, opacity 68 %, 1 px translucent border, soft shadow.

Safeguards:

1. All glass rules sit inside one `@supports (backdrop-filter…)` block. Browsers that cannot blur keep the solid surface colours from `base.css`; nothing becomes see-through and unreadable.
2. **Hero panels never go below 85 % opacity**, because they sit on photographs. The floor is applied in code (`HERO_MIN_OPACITY`), whatever the setting says.
3. The validator warns when a mode's opacity is below 50 %.
4. Glass never reads or changes colour tokens other than using the page background as its default surface. A test confirms `theme.css` is identical with glass on, off or reconfigured.
5. With Glass Mode off, `glass.css` is an empty comment.

**Glass Mode and card style.** The Layout setting *card style* (flat, outlined, elevated) applies only while Glass Mode is not styling cards. With Glass Mode enabled and *cards* on, glass decides how cards look. The Studio says so beside the switch.

## 6b. Layout (per language)

`languages.json → layout` (all optional; defaults write nothing): `contentWidth`, `measure`, `cards`, `header`, `footer`, `nav`, `stickyHeader`, `breakpoints` (tablet, phone) and `devices.desktop|tablet|mobile` (`columns`, `gap`, `sectionSpacing`, `pagePadding`). The generator writes them as rules scoped to `html[lang="xx"]`, so one language's layout never reaches the other. Desktop settings apply everywhere; tablet and phone settings apply at their breakpoint and narrower. The page carries `data-header`, `data-footer`, `data-nav` and `data-sticky` on `<html>`. Details and limits: [customization.md](customization.md#layout).

## 7. Accessibility and quality gates

**Your own colours are checked too** (`src/core/contrast.mjs`, used by the validator and the Studio): text, secondary text and accent on the page and on cards, and button text on the button colour. Below 3 : 1 is an error that blocks publishing; 3 to 4.5 : 1 is a warning. Glass readability is a warning (the content behind glass is unknown).

Enforced by `tests/theme.test.mjs` for **all 8 presets in both modes**:

- Body, muted and accent text ≥ 4.5 : 1 on both the page and surface colours; button text on primary ≥ 4.5 : 1.
- The accent colour (used for the focus ring) ≥ 3 : 1 on page and surface.
- Hero glass text ≥ 4.5 : 1 over pure black and pure white photographs at the 85 % floor.
- Header/card glass text ≥ 4.5 : 1 over the page background and the preset's backdrop gradient colours.

Built into the markup and CSS:

- Skip link, landmarks, exactly one `<h1>` on every content page (the bilingual 404 has one per language), breadcrumbs with `aria-current`, `lang` and `dir` on every page and on mixed-language fragments.
- Visible 3 px focus outline in the accent colour.
- `prefers-reduced-motion` cuts animation and transition durations to near zero; `forced-colors: active` falls back to system colours with borders on cards; a print stylesheet hides navigation chrome.
- Collapsing menu on narrow screens (`aria-expanded` kept in sync); no horizontal scroll at 390 px or 1280 px wide (checked in a headless browser during development).

**Not yet verified**: screen-reader testing with real assistive technology, automated axe-style audits, and Lighthouse scores. These belong to Phase 9's accessibility testing; until then, do not describe the site as "WCAG compliant" — only the contrast gates above are measured.
