# The Editorial Studio (Phase 3)

The Studio is the writing environment inside the admin, used for articles and projects. This page says what it does, how it is built, what was tested, and — just as important — what the specification asks for that it does **not** do.

## What it is, and one decision to know about

The specification recommends Tiptap and ProseMirror. They were **not used**: the project is zero-dependency (no `npm install`, no bundler) and the admin must stay readable, auditable code that runs straight from GitHub Pages. The Studio is therefore a **block editor with a markup-aware text toolbar and a live preview of the real page**, written for this project. It is not a WYSIWYG canvas: you edit text in fields, and see the finished page in the preview pane.

Why this is still a reasonable shape: the content is stored as structured JSON blocks (as the specification requires), every block has a form generated from a specification table, and the preview is drawn by the same renderer that builds the public site, so what you see is what is published.

## The screen

```
 ┌ Write | Split | Preview ┐ Undo Redo  Templates  Focus mode        138 words · 1 min   Saved in this browser · 14:32
 │ block list (drag, collapse, duplicate, hide, delete)            │  Settings Outline Checks Find History Typography
 │ ▸ each block: its own fields + formatting toolbar               │  (the tab you chose)
 └──────────────────────────────────────────────────────────────────┘
```

| Part | What it does |
|---|---|
| **Write / Split / Preview** | Writing only; writing and the page side by side (below 80 rem the preview sits under the text); the page only. |
| **Undo / Redo** | Whole-document history of the block list, 100 steps. Typing in one field is merged into one step (900 ms pause ends it); adding, deleting, moving, duplicating, hiding, replacing and template insertion are one step each. `Ctrl/Cmd+Z`, `Shift+Z` and `Y` work while the cursor is in the blocks or nowhere in particular; in the title, the find box and other fields the browser's own undo stays in charge. Physical key codes are used, so shortcuts also work on an Arabic keyboard layout. The history belongs to the open editor; leaving the page ends it (Git history is the long-term memory, see *History*). |
| **Templates** | Twelve outlines (below). |
| **Focus mode** | Hides the navigation, header and sidebar so only the text and the Studio bar remain; `Esc` leaves it. |
| **Saved note** | "Saved in this browser · time" appears when the unpublished work has been written to IndexedDB (400 ms after the last change). This is the autosave and the draft recovery: the work comes back when you sign in again to the same repository. It is **not published**; publishing is the separate Review & publish screen. |
| **Word count and reading time** | Live, per language, using the language's `readingWpm`. |

### Side panels

- **Settings** – status, publication date, featured, layout template, cover image, topics, tags, sample flag.
- **Outline** – the headings of the body; click one to jump to its block.
- **Checks** – word, character and paragraph counts, reading time, a rough reading-difficulty estimate (sentence and word length; an estimate, not a grade), an optional word goal that is remembered in this browser, repeated and doubled words, and editorial checks: no content, long text without headings, heading levels that skip, duplicate headings, very long paragraphs, leftover template placeholders, title and description length for search results, missing cover image.
- **Find** – find and replace across all text blocks, case and whole-word options, one confirmation, **one undo step**. Code blocks and link addresses are never searched or changed.
- **History** – see below.
- **Typography** – see below.

## Content format

Content stays structured JSON: a body is an ordered array of blocks with unique IDs. The JSON schema (`schemas/block.schema.json`) is the single definition; the editor forms are generated from `src/core/block-specs.mjs`, and a test fails if a schema field, option or limit has no editor control or lacks an Arabic or English label, so the two cannot drift apart.

### Inline markup inside text fields

| Write | Result |
|---|---|
| `**text**` | bold |
| `*text*` | italic |
| `++text++` | underline |
| `~~text~~` | strikethrough |
| `==text==` | highlight |
| `^text^` / `~text~` | superscript / subscript (no spaces inside) |
| `` `code` `` | inline code |
| `[label](address)` | link (`https://`, `http://`, `mailto:`, `tel:`, a site path, or `#section`) |
| `[^key]` | footnote reference; the text lives in a **Footnotes** block |
| `⟦…⟧` | template placeholder |

Everything else is escaped as plain text. Nothing is ever passed through as HTML. The toolbar inserts these markers around the selection; `Ctrl/Cmd+B`, `I`, `U` and `K` (link) are shortcuts. Text direction is handled by `dir="auto"` on rendered text, with an optional per-block override (`auto`, `ltr`, `rtl`), so mixed Arabic and English lines get correct punctuation and alignment. A special-characters menu inserts left-to-right and right-to-left marks, a no-break space and a zero-width non-joiner.

### The 21 block types

| Group | Types |
|---|---|
| Text | `paragraph` (styles body, intro, lead, standfirst, caption, byline, small, highlight; drop cap; small caps; alignment; direction), `heading` (levels 2–6), `quote` (block or pull, citation), `list` (ordered or not, up to four nesting levels), `checklist` (with levels), `definitions`, `code` (with language and caption), `table` (header row, per-column alignment, caption) |
| Images | `image` (size, aspect ratio, border, corner radius, caption, alt override; its picture has a focal point), `gallery` (2–4 columns, ratio), `compare` (before and after), `imagetext` (image beside text) |
| Editorial | `callout` (note, tip, warning), `factbox`, `timeline`, `stats`, `related` (links to other pages by ID), `author` (the author card from the profile, with an optional note), `footnotes`, `references`, `divider` |

Any block can be hidden (kept in the file, left off the page). Unknown types or fields are rejected, not ignored. Each new block type exists in all four places — schema, validator, renderer, editor — or it is not in this list.

## Templates

Twelve starting outlines: Editorial, Long read, News, Interview, Photo essay, Personal journal, Research, Review, Opinion, Feature story, Report, Tutorial. Each has an English and an Arabic version (not a translation of one into the other; the Arabic outlines are written as Arabic). An outline is real blocks whose prompts are written in `⟦placeholders⟧`.

- Applying a template to an empty body inserts it; to a body with content you choose **Add at the end** or **Replace everything**. Both are one undo step.
- Replacing (or starting from empty) also sets the article's layout name (`template`, used as the CSS class `article--<name>` and by homepage filters). Adding at the end leaves it alone.
- Templates never restrict anything: after insertion they are ordinary blocks.
- Placeholders are a **warning while the page is a draft and an error once it is published**, so an unfinished template cannot go live. Templates contain no images (they would need media IDs).

## Preview

The preview is the real page, not an imitation: `src/core/preview.mjs` runs the build's own renderer on the content *including your unpublished changes*, and the result is shown in an `<iframe sandbox="allow-same-origin">` loaded from a `blob:` URL. The sandbox has no `allow-scripts`, so nothing in the page can run code. Devices (phone 390, tablet 820, desktop 1280 px wide, scaled to fit) and theme (automatic, light, dark) can be switched; it redraws about 350 ms after you stop typing. Media is fetched through the authenticated API and shown as `blob:` images, so it works for uploads that are not yet published.

Limits: it shows the content page only (not the homepage or lists), and it is not a different browser's rendering — it is the same Chromium (or whichever browser you use) drawing the same HTML as the live site.

## History

Revision history is **Git's**, not a second copy kept by the admin. The History panel lists the commits that changed the article's file (`listFileCommits`), and for any of them it reads the file as it was (`readJsonAt`), compares it with the text you have now and shows the result **word by word** with `<ins>` and `<del>` (underline and strike-through, so colour is never the only signal), block by block with *added / removed / changed / moved* and changed display settings.

Restore either the content only, or content, title and summary. Restoring never changes the address (slug) or the status. A restore of the content is one undo step; restoring everything redraws the form, so the undo history of that editing session starts again. Both become an ordinary unpublished change.

What it cannot do: it only knows **published** versions (commits). Unpublished edits are in this browser, not in Git. Each publish is one commit for all changed files, so a commit may be listed that changed other files too; the comparison is always of this file's content. Only the latest 30 commits of the file are listed.

## Typography Studio

Per-language settings in `content/config/languages.json`, edited in the sidebar with the preview showing the effect: font pairing (five Arabic and five Latin ready-made combinations), heading, body and code font stacks, Google Fonts to load, base size, line height of text and of headings, letter spacing, heading weight, line length (`measure`) and content width. Changing it affects every page in that language, which the panel says in words. The advice list warns about: letter spacing on Arabic (it breaks joined letters), Arabic line height below 1.7, body text under 16 px, very large text, very long or short lines, a first-choice font that is neither loaded nor a common system font, and a font that is loaded but never used. **Discard typography changes** reverts the languages file to the last published version (all unpublished changes to that file).

Fonts are loaded from Google Fonts by each visitor's browser; the admin CSP allows exactly that. Empty `googleFonts` means only fonts on the reader's device are used.

## Nested lists

A `list` block keeps its items as strings; a nested item starts with two spaces per level, up to four levels (0, 2, 4 or 6 spaces). A `checklist` item carries a `level` from 0 to 3 instead. In both an item can be at most one level deeper than the item above it and the first item is at level 0, the same rule as an outline; the validator reports violations, and the renderer clamps what it finds, so odd hand-edited data still draws as real nested `<ul>`/`<ol>` elements (ordered lists switch to letters and then roman numerals by depth).

In the editor the list's text box has **Indent** and **Outdent** buttons and `Ctrl/Cmd+]` and `Ctrl/Cmd+[` (physical key codes, so they work on an Arabic layout). They act on the lines touched by the selection, keep the structure valid (outdenting a parent pulls its children up with it), and each press is its own undo step. The Tab key is deliberately *not* taken over, so keyboard users are never trapped in the text box. In a checklist each task has a **Level** selector.

## Pictures: library, focal point, paste and drop

**One upload flow for everything.** The Media screen's Upload button, pasting a picture into the editor, dropping files on the block list and the **Add a picture from your computer** button all use the same code (`public/admin/js/views/upload.mjs`). The file is inspected by its bytes, not by its name or the browser's reported type (only PNG, JPEG, GIF and WebP within the size limits get through), and the owner must describe the picture in every enabled language before it is added to the library. Then an image block pointing at it is inserted: after the block the cursor is in for a paste, before or after the block it was dropped on, at the end for the button. Each picture is one undo step (undo removes the block; the library entry stays until you discard the unpublished changes).

A paste is taken over **only** when the clipboard holds a picture and no plain text, so pasting text copied from a document (which often carries a picture of it too) always stays a text paste. Dropping something that is not a picture is refused with a message; a file that merely claims to be a picture is refused by the byte check.

**Focal point.** Each library picture can have a focal point, the part that must stay visible when a frame crops it (a card, a wide cover, a square thumbnail). *Focal point* on a library card, and next to the picture in an image block, opens a dialog: click or drag on the picture, or use the two sliders (the keyboard and screen-reader route), and three sample frames (wide, square, tall) show what each crop keeps. It is stored on the media asset (`focal: { x, y }`, whole percentages) and applies everywhere the picture is used: covers, cards and image blocks. It is drawn with classes in 5% steps (`fx-30 fy-70`), not with an inline style, so it works under the admin's strict Content Security Policy (the preview) and on the public site; the stored value is exact, the drawn one is rounded to 5%.

What is **not** there: cropping that cuts pixels out of the file, and responsive image variants. Together, the existing shape setting and the focal point give non-destructive framing; the original file is always what is published.

## Typography for one page

The Typography tab starts with **This page only**: four settings stored on the article or project itself (`typography`): text size (85–130 % of the language's size), line height (1.2–2.2), column width (28–60 rem) and heading weight (400–900). Empty means "use the language's setting". They apply to every translation of that page and to nothing else; the language-level settings below them are unchanged. Ranges are enforced by the schema and by the form, and advice appears when a choice is likely to read badly (Arabic with a line height under 1.7, text under 16 px). Like the focal point, the values are drawn with classes (`ov-size-120`, `ov-lh-19`, `ov-measure-44`, `ov-weight-800`) rounded to the steps the stylesheet defines (5 %, 0.1, 2 rem, the listed weights). Colours and font families are not per-page settings.

## Scheduling

A draft translation can be scheduled: **Schedule…** next to the status in the translation's header opens a dialog for a date and time (in your time zone, stored in UTC). The record becomes `scheduled` with that `publishedAt`; **Cancel the schedule** returns it to a draft. Scheduled content is validated as strictly as published content (a body, no leftover template placeholders, alt texts), because it will go live without anyone looking: an error found at schedule time is better than a failed run at the moment it was due. The scheduled time belongs to the whole page, so it applies to every translation that is scheduled; a page that is already live cannot be rescheduled.

**How it goes live.** The site is static, so nothing runs at that moment. Every build asks "has this page's date come?" and treats due content as published for that build (`src/core/schedule.mjs`); the files keep saying `scheduled`. The deploy workflow runs the build on a timer (twice an hour, at :07 and :37), and a `check` job (`tools/scheduled.mjs`) skips timer runs unless something became due in the last 90 minutes, so idle timer runs cost almost nothing. A push or a manual run always builds. Realistic expectation: a page appears within about half an hour after its time.

Honest limits: GitHub sometimes delays timer runs by many minutes under load or drops them (the 90-minute window covers one dropped run; any later push also releases what is due); GitHub disables timers on a repository with no activity for 60 days (a push or a manual run re-enables them); and **scheduled text is already in the repository, readable by anyone who can read it, before its date**. "Scheduled" hides a page from the *site*, not from the repository. The workflow, the skip logic and the timer were tested as code and as a script, not on GitHub itself.

## Internal notes

Each article and project has an **Internal notes** box in Settings (up to 4000 characters) for sources, to-dos and reminders. It is never rendered and never reaches the built site; a test builds the site with and without the admin app and searches every output file for the note. Like everything else it is stored in the repository, so anyone who can read the repository can read it: the box says so, and the validator warns when a note looks like a password or token. These are notes for one person, not editorial comments between several people; there are no threads, assignments or mentions.

## Security of the Studio

The Studio adds no network access (everything goes through the existing GitHub store) and no HTML string building (a source scan still forbids `innerHTML`, `srcdoc` and friends in the admin). The content security policy changed in two ways, both for the preview: `frame-src blob:` (the sandboxed preview frame), `style-src … blob: https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` (the generated preview stylesheets and the fonts). Scripts remain `'self'` only. Because the policy forbids inline style attributes, the Studio sets sizes through the style API and classes. See [security.md](security.md).

## Where the code is

| Concern | Files |
|---|---|
| Block forms, labels, limits | `src/core/block-specs.mjs`, `public/admin/js/studio/fields.mjs`, `blocks-editor.mjs` |
| Text toolbar and text edits | `studio/toolbar.mjs`, `src/core/editing.mjs` |
| Undo / redo | `src/core/history.mjs` |
| Writing statistics and checks | `src/core/writing.mjs`, `studio/panels.mjs` |
| Templates | `src/core/templates.mjs`, `studio/templates-dialog.mjs` |
| Revisions | `src/core/revisions.mjs`, `src/core/github-store.mjs` (`listFileCommits`, `readJsonAt`), `studio/history-panel.mjs` |
| Typography | `src/core/typography.mjs`, `studio/typography-panel.mjs` |
| Preview | `src/core/preview.mjs`, `public/admin/js/preview.mjs` |
| Nested lists | `src/core/lists.mjs` (levels, tree, indent logic), `studio/toolbar.mjs` (buttons and shortcuts) |
| Pictures, focal point | `public/admin/js/views/upload.mjs`, `views/focal.mjs`, `src/core/focal.mjs`, paste/drop in `studio/blocks-editor.mjs` |
| Typography for one page | `studio/override-panel.mjs`, `overrideClasses` in `src/core/typography.mjs` |
| Scheduling | `src/core/schedule.mjs`, `tools/scheduled.mjs`, `.github/workflows/deploy.yml`, `scheduleControls` in `views/editor-common.mjs` |
| The shell that joins them | `studio/studio.mjs` |
| Strings (English and Arabic) | `public/admin/js/strings-studio.mjs`, `strings-studio-chrome.mjs` |

The logic that does not need a browser lives in `src/core/` and is unit-tested; the same files are copied into the admin and used by the build.

## How it was tested

- 347 unit and integration tests in total (the Phase 3 gap work added 26 to the first 109): editing operations, markup round trips and hostile input, block specs against the schema, undo/redo, writing checks, templates in both languages (every template validates), revisions and restore, typography advice, the placeholder rule, and that every interface string exists in both languages; for the gap work: nested-list levels, tree and indent logic, the focal-point and page-typography classes against the stylesheet (every class the renderer can emit exists), scheduled publishing with an injected clock (pages absent before the date and present after, sitemap, validation, the timer script and the workflow file), and that internal notes appear in no output file of the built site.
- A browser test (Chromium, 37 steps, 16 of them for the Studio and its follow-ups) against a local fake of the GitHub API: formatting and shortcuts, undo and redo, adding all 21 block types, drag and drop with a real mouse and with the keyboard, duplicate/hide/delete, find and replace as one undo step, a template blocking publishing until placeholders are replaced, the sandboxed preview in every device and theme with the live text, focus mode, typography editing with the preview following, History listing, comparing and restoring real commits, every panel in both languages without untranslated text, and no horizontal scrolling at phone width in write, split and preview modes. The follow-up steps cover nested lists (button, shortcuts, undo, preview), the focal point dialog (pointer, sliders, samples, saved on the asset, drawn in the preview), pasting, dropping and picking pictures (text paste left alone, bad files refused, cancel, undo), page typography (range check, preview size measured, reset), scheduling (past time refused, strict validation, cancel) and internal notes. Zero CSP violations.

## Specification coverage

| Specification item | Status |
|---|---|
| Block-based content, structured JSON | **Done** (21 block types) |
| Toolbar: bold, italic, underline, strikethrough, super/subscript, highlight, inline code, links, footnotes, special characters, H2–H6 | **Done** |
| Lists (ordered, unordered), quotes, tables, dividers, references, captions, alt text | **Done** |
| Per-image size, aspect ratio, border, radius, alignment through size | **Done** |
| Image focal point | **Done**, stored on the picture and applied to covers, cards and blocks |
| Image crop that cuts pixels, responsive image variants | **Not done** (the shape setting plus the focal point give non-destructive framing) |
| Drop caps, small caps, alignment, RTL/LTR per block | **Done** |
| Undo, redo, autosave, draft recovery | **Done** (autosave is to this browser; draft recovery on next sign-in) |
| Live preview, device preview, light and dark | **Done** |
| Distraction-free mode | **Done** (focus mode). A browser full-screen mode is not added |
| Word, character, paragraph counts, reading time, difficulty, repeated words, find and replace, writing goals | **Done** |
| 12 article templates, Arabic and English | **Done** |
| Revision snapshots, comparison, restore | **Done**, from Git (published versions only) |
| Typography Studio: pairings, per-language fonts, sizes, spacing, weights, measure, advice, live preview | **Done** for the basics |
| Spelling and grammar assistance | **Not done.** The browser's built-in spell check works inside the text boxes; there is no grammar tool |
| Text colour, background colour, per-text font family and size, character spacing and paragraph spacing inside a text | **Not done** (colour and typography are site-wide design settings, edited in Phase 4) |
| Nested lists, indentation | **Done** (four levels, lists and checklists) |
| Video, audio, PDF and embed blocks | **Not done** (they need their own security review: embeds can run third-party code) |
| Clipboard paste of images, drop files, pick from the computer | **Done**, through the checked upload flow |
| Tiptap and ProseMirror | **Not used** (see the decision above) |
| Typography Studio: Google Fonts search and preview, custom font upload (WOFF2/WOFF/TTF/OTF), weights 100–900 per font, per-element assignments (navigation, buttons, captions, dashboard…), the six named presets | **Not done** |
| Per-article typography overrides | **Done** for four settings (size, line height, column width, heading weight); fonts and colours are not per page |
| Editorial workflow: Idea → Outline → Draft → Editing → Fact checking → Ready → Scheduled → Published → Archived | **Partly done.** The nine statuses exist and are set by hand (Settings tab). They are labels, not a pipeline: nothing moves an item along, and only `published` and a *due* `scheduled` are ever public |
| Scheduled publishing | **Done** with limits (see *Scheduling*): per page, released by the first build after the date, about half an hour of slack, tested as code and script but not on GitHub itself |
| Internal notes | **Done** (one box per article or project, never published) |
| Custom statuses, approval steps, track changes, editorial comments between people | **Not done** |
| Editor toolbar items Author, Category, Schedule, Publish in the Studio bar | Not in the bar: they are in Settings and in Review & publish |
| Sidebar tabs Media, Layout, SEO, Publishing | Not as tabs: media is picked in the blocks and the library, SEO overrides sit under the text, publishing is its own screen |

## Known limits

- **Not run against the real GitHub.** History (the commits API and reading a file at a commit) was tested against the local fake only. Check it once on a throwaway repository.
- **Chromium only.** Drag and drop, the preview frame and the blob URLs were not tried in Firefox or Safari. Touch drag and drop is not provided; on phones use the up and down buttons on each block.
- **Fonts could not be verified offline**: the tests stub Google Fonts, so they prove the admin may request them, not how a font looks.
- Undo covers the body of the language you are editing, not changes to the settings fields.
- **Scheduled publishing has not run on GitHub.** The build logic, the timer script and the workflow's YAML were tested; the timer, the `check` job and the skipped-job behaviour were not. After deploying, schedule a throwaway page a few minutes ahead and watch the Actions tab once.
- Scheduled and internal-note text is readable in the repository by anyone who can read it (see *Scheduling* and *Internal notes*).
- The focal point and the per-page typography are drawn in coarse steps (5 %, 0.1, 2 rem), so a stored value of 33 % is drawn at 35 %.
- Pasting a picture from a page copied in a browser needs the clipboard to carry the picture as a file; some browsers and sources only carry a link, in which case nothing is taken over and the paste behaves as text.
- A very large body (hundreds of blocks) redraws the whole list on structural changes; fine for articles, not measured beyond a few dozen blocks.
