# Publishing workflow

There are two ways to change content, and they end in the same place: a commit on `main`, which GitHub builds and publishes. Pick one per change; mixing them is safe (the admin detects outside edits, see below).

**A. The admin dashboard (Phase 2).** Edit in the browser at `/admin/`; the admin validates, then writes one commit through the GitHub API. See [admin.md](admin.md).

**B. Editing JSON by hand.** Sections 2–4 below. Still the only way to change topics, tags, navigation, the homepage layout and the design until Phases 4–5.

## Publishing from the admin

```
edit in /admin/ ─► staged in the browser ─► Review & publish ─► validate (same rules as the build)
                                                                     │
                                  one commit on main  ◄──────────────┘  blocked on errors or conflicts
                                        │
                                        ▼
                    GitHub Action: test ─► validate + build ─► deploy to Pages
```

1. **Sign in** with a fine-grained token (one repository, Contents read/write). See [security.md](security.md).
2. **Edit.** Changes are staged locally and saved in the browser; nothing is sent yet. The top bar shows how many files are unpublished.
3. **Review & publish.** Every changed file is listed. Fix any validation problem shown; resolve any *changed in the repository too* conflict (**Keep mine** or **Discard mine**).
4. **Publish.** One commit contains every change (or nothing is committed). The admin cannot tell when the Pages deployment finishes; follow the link to the Actions page.
5. **Take down / undo.** *Move to draft* on a language removes its page on the next deploy; *Delete* removes the file. To undo a whole publish, revert its commit on GitHub (not exercised through the admin).

If the Action's build fails (for example because of a rule that only the full build enforces), the previous site stays live; read the Action log, fix, and publish again.

**Two people, or the admin and the GitHub web editor, at once.** If someone commits between your load and your publish, the admin refuses to overwrite: a file edited on both sides is flagged, and a plain race is caught by a non-forced branch update. Nothing is merged for you.

## Scheduled publishing

In the admin, **Schedule…** (next to a draft translation's status) sets the record's status to `scheduled` and its `publishedAt` to the chosen time; by hand, set `status` and the translation's `status` to `"scheduled"` and give `publishedAt`. Nothing is public yet. The deploy workflow runs the build twice an hour (a timer); a `check` job runs `node tools/scheduled.mjs` first and skips timer runs unless something became due in the last 90 minutes, and any push or manual run builds as usual. The first build after the date treats the page as published, so it appears within about half an hour of its time; the files in the repository still say `scheduled`, and set them to `published` whenever you like (the page stays the same).

```
timer (:07, :37) ─► check: anything due in the last 90 min? ─ no ─► stop (cheap)
                                  │ yes
                                  ▼
              test ─► validate + build (due pages count as published) ─► deploy to Pages
```

`node tools/scheduled.mjs` lists what is scheduled and what is due (use `--now 2030-01-01T09:00:00Z` to look ahead). Limits: GitHub may delay or drop timer runs; it disables timers on a repository that has had no activity for 60 days (a push or a manual run re-enables them); and scheduled text is readable in the repository before its date. To cancel, use **Cancel the schedule** or set the status back to `draft` before the time. See [editor.md](editor.md#scheduling).

## Publishing by editing JSON

```
edit content/*.json ─► commit to main ─► GitHub Action: test ─► validate + build ─► deploy to Pages
                                              │                     │
                                              └── failure stops here; the live site is unchanged
```

## 1. Set up once

1. Push the project to a GitHub repository, branch `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. Replace the sample content (see the README), then set the repository variable `EXCLUDE_SAMPLES` to `true`.

## 2. Publish a new article

1. Get an ID: `npm run new-id -- article` (or invent any unused `art_xxxxxxxx` with eight characters `0-9a-z`).
2. Create `content/articles/<that id>.json`. Easiest: copy an existing article and change it.
   - Set `status` to `draft` while writing. Drafts are excluded from the site.
   - Fill each language you want: `translations.ar` and/or `translations.en` with `status`, `title`, `slug`, `excerpt`, `body`.
   - Choose `topicIds` (first = primary topic), optional `tagIds`, `coverMediaId`.
   - Block IDs (`blk_xxxxxxxx`) must be unique within a body: `npm run new-id -- block 5` prints five.
3. If you use new images: put the file in `content/media/files/`, add an entry to `content/media/media.json` with alt text **in every enabled language**.
4. Check it: `npm run validate`. Fix what it reports; messages name the file and field.
5. Preview: `npm run dev`, open <http://localhost:4173>. (Draft content is not shown in the preview either; set the statuses to `published` to see a page.)
6. To publish: set the article's `status` to `published`, set `publishedAt`, set the translation's `status` to `published`, and commit to `main`.

Publishing one language at a time is normal: publish the Arabic translation now and leave the English one as `draft`.

## 3. Take something down

- **Temporarily:** set the article or translation `status` back to `draft` (or `archived`). Its page disappears on the next deploy.
- **Permanently:** delete the file. Validation will tell you if anything still references it (related articles, homepage "specific item", etc.).
- Remember that Git history and the repository itself still contain it. See the privacy note below.

## 4. Change the look

Use **Appearance** in the admin (presets, colours, Glass Mode, layout, fonts; see [customization.md](customization.md)), or edit `content/config/design.json` (`preset`, `overrides`, `languageOverrides`, `glass`, `animation`) and the `typography` and `layout` of each language in `content/config/languages.json`. No content changes. Contrast is checked for every colour you change: below 3 : 1 text fails validation and blocks the build, between 3 and 4.5 : 1 is a warning, and Glass Mode readability is a warning. Run `npm run validate` to see them.

## 5. What the pipeline checks

| Step | Fails when |
|---|---|
| `npm test` | Any unit, content or build test fails |
| Validation | Schema violation, unknown reference, duplicate ID or slug, missing translation of a required string, missing alt text, missing media file, unsafe CSS value, topic cycle |
| Build | The profile is still `sample` with `--exclude-samples`; output folder is not a previous build |
| Link check | Any internal link or asset reference in the built pages points at a missing file |

Warnings (for example "published, but no translation is published") do not stop the build; read them.

## 6. Privacy: what this workflow can and cannot protect

- The build leaves drafts, private CV entries and hidden blocks out of the **website**.
- If the repository is **public**, those same files are visible to anyone who opens the repository. Use a private repository (check GitHub's current plan requirements for Pages from a private repository) or keep sensitive drafts elsewhere. Phase 2 did not add private storage; the admin only warns when it detects a public repository, and its unpublished changes are kept unencrypted in the browser until you publish or discard them (see [security.md](security.md)).
- Never put passwords, tokens or personal data you would not publish into `content/`. The build copies nothing from outside `content/` and `public/`, but it cannot know what you consider secret.

## 7. Backup and recovery

Everything is plain text in Git, and every admin publish is a single commit, so a publish can be reverted as a unit. To roll back, revert the commit on GitHub; the Action rebuilds the previous state. Export tooling and scheduled backups are Phase 9.
