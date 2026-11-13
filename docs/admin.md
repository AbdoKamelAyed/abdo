# Admin dashboard (Phases 2 to 5)

The admin is a small static web app published with the site at `/admin/`. It lets the owner edit articles, projects, the profile/CV and media in the browser and publish them to GitHub in one step. There is no server: the browser talks to the GitHub REST API directly, using a token the owner types in.

Everything here was built and tested. What was **not** tested is listed in [Limits](#limits).

## What you can do

| Area | You can | Notes |
|---|---|---|
| **Overview** | See counts by status, by language and by topic, recent updates | Warns when the repository is public and when the profile is still a sample |
| **Articles** | Create, edit, change status, delete; edit each language independently; add or remove a language; publish or move a language to draft; **schedule** a draft for a future time (it goes live in the first build after it, see [publishing-workflow.md](publishing-workflow.md#scheduled-publishing)); internal notes that are never published | Written in the **Editorial Studio** (Phase 3): 21 block types, formatting toolbar, undo/redo, templates, live preview, outline, writing checks, find and replace, history, typography. See [editor.md](editor.md) |
| **Projects** | Create, edit, status, project status, dates, role, responsibilities, challenge/process/solution/outcome, tools, gallery, links, related articles, delete | Same per-language independence |
| **Profile & CV** | Edit identity, biography, links, experience, education, skills, custom sections; per-entry visibility | Entries keep stable IDs; hiding is different from deleting |
| **Media** | Upload PNG/JPEG/GIF/WebP, edit alt text and captions per language, archive/restore, delete unused files | Files are checked by their content, not their name (see [security](security.md)) |
| **Homepage** | Add, reorder (drag, arrow keys, buttons), show or hide, duplicate and delete homepage sections per language; copy the structure from the other language; per-kind settings; live preview | Phase 4. See [customization.md](customization.md#homepage-builder) |
| **Appearance** | Presets and your own presets, colours (all languages or one), shapes, Glass Mode, layout per language, fonts and sizes per language; contrast check with Fix; live preview of any public page | Phase 4. See [customization.md](customization.md#appearance-studio) |
| **Topics** | A tree with usage counts; create, edit per language, change the address (the old one keeps working), move, reorder, merge, delete (asks first when used), icon, accent colour, related topics, pinned items, bulk changes, insights, live preview | Phase 5. See [discovery.md](discovery.md#the-admin-screens) |
| **Tags** | Usage and filters; duplicates and typos with a merge button; merge, bulk status / visibility / delete, unused tags, insights | Phase 5 |
| **Navigation** | Header menu and footer links per language; fixed pages or external links (`https`, `http`, `mailto`, `tel` only) | Phase 5 |
| **Search** | What is searchable, ranking, page size, normalisation, synonym groups, a test box that runs a real query over the published content | Phase 5 |
| **Review & publish** | See every staged change, resolve conflicts, check validity, publish | One commit contains every change or nothing is published |

Not yet built (see the [roadmap](roadmap.md)): the contact form and large-file storage (needs a Cloudflare Worker), SVG upload. What Phase 4 left out is listed in [customization.md](customization.md#what-is-not-built).

## Signing in

1. Open `https://<you>.github.io/<repo>/admin/`.
2. Create a **fine-grained personal access token** on GitHub (Settings → Developer settings → Personal access tokens → Fine-grained tokens):
   - Repository access: **Only select repositories** → this repository only.
   - Repository permissions: **Contents: Read and write**. Nothing else is needed.
   - Choose a short expiry. GitHub's settings pages change their wording from time to time; the requirement is "read and write access to this one repository's contents".
3. Enter the owner, repository, branch (`main`) and the token. The admin checks them with GitHub before showing anything.

The token is held in memory. Ticking "Keep me signed in while this tab is open" also keeps it in `sessionStorage`, which the browser deletes when the tab closes. It is never written to `localStorage`, IndexedDB, a cookie, the repository or the built site. Signing out removes it.

## How editing and publishing work

```
GitHub (content/*.json) ──load──► base snapshot ─┐
                                                 ├─► workspace ──► validate (same code as the build)
your edits ─────────────► staged writes/uploads ─┘        │
                                                          ▼
                              Review & publish ──► blobs → tree → commit → move branch (no force)
```

- **Staging.** Edits are kept in a workspace: the snapshot that was loaded, plus staged writes, deletes and uploads. Nothing reaches GitHub until you publish. Staged changes are saved in this browser (IndexedDB) so a reload or closed tab does not lose them.
- **One validator.** The admin runs the same validation code as `npm run build` (`src/core/validate-core.mjs`, copied into `/admin/shared/`). It accepts exactly what the build accepts; an end-to-end test publishes from the admin and then runs the real build on the result.
- **Publish is blocked** when nothing is staged, when any staged file conflicts with the repository, or when validation reports an error. Warnings do not block.
- **Atomic commit.** The admin creates the file blobs, one tree, one commit, then moves the branch with `force: false`. If any step fails, the branch is untouched.
- **`updatedAt`** is set at publish time, only on records whose content really changed.
- **After publishing**, the GitHub Action rebuilds the site. The admin links to the commit and to the Actions page but **cannot tell you when the site is live**.

## Conflicts

Each staged file remembers the version it was based on. Before publishing, and again when the branch is moved, the admin checks that the branch did not change underneath you.

- If someone (or the GitHub web editor) changed a file you also changed, it is marked *Changed in the repository too*. Choose **Keep mine** (your version overwrites theirs) or **Discard mine** (the repository version wins). Nothing is merged automatically, and publishing waits until you choose.
- If the branch moved *while* you were publishing, the push is refused, nothing is overwritten, and you are asked to reload and publish again.
- **Reload from repository** fetches the latest content and re-checks your staged changes against it.

## Undo and history

While you are editing, **Undo** and **Redo** in the Studio step back through the changes to the text of the open article. Once something is published, the Studio's **History** panel lists the earlier published versions of that file from Git, compares them with the current text word by word and can restore one (see [editor.md](editor.md#history)). To undo a whole publish, including other files, every publish is a normal Git commit: revert that commit on GitHub (the "Revert" button on the commit's pull request, or `git revert <sha>`); the Action rebuilds the previous state. Reverting was not tested through the admin.

## Languages

The admin interface is available in Arabic (RTL) and English (LTR), switched from the top bar and remembered. Content languages are independent of it. Validation messages come from the shared validator and are **English only**.

## Files

| Path | Purpose |
|---|---|
| `public/admin/` | The app: `index.html`, `admin.css`, `js/` (shell, session, strings, DOM toolkit), `js/views/` (one file per screen), `js/studio/` (the Editorial Studio) |
| `src/core/` | Pure modules shared by the build and the admin: validation, assembly, ID generation, slugs, image inspection, GitHub store, workspace, content operations |
| `src/admin-build.mjs` | Copies the admin and its shared modules to `dist/admin/` and writes `config.json` |
| `tests/admin.test.mjs`, `tests/core.test.mjs`, `tests/github-store.test.mjs`, `tests/workspace.test.mjs` | Unit and integration tests (no browser) |
| `tests/fake-github.mjs` | A local imitation of the GitHub API used by the tests |
| `tests/e2e/admin.e2e.mjs` | 48-step browser test (`npm run test:e2e`; needs Playwright, which is not a project dependency) |
| `tests/e2e/discovery-admin.e2e.mjs`, `tests/e2e/search.e2e.mjs` | 24-step test of the Topics, Tags, Search and Navigation screens and 20-step test of the public search page (`npm run test:e2e:discovery`, `npm run test:e2e:search`) |

Build flags: `--no-admin` leaves the admin out entirely (and removes the `Disallow` line from `robots.txt`); `--admin-api-base <origin>` points it at another API origin (for GitHub Enterprise or tests) and the Content Security Policy is generated to match.

## Limits

- **Never run against the real GitHub.** The GitHub store is tested against a local fake that implements the endpoints it uses. The first real sign-in may expose differences (for example, the `permissions` field of fine-grained tokens is not guaranteed, so only an explicit "no push access" blocks sign-in). Try it first on a throwaway repository.
- Validation messages are English only, even when the interface is Arabic.
- The Studio's limits (not run in Firefox or Safari, no touch drag-and-drop, deferred features) are in [editor.md](editor.md#known-limits).
- The browser test runs in Chromium only. Firefox and Safari were not tested.
- A repository above GitHub's tree-listing limit cannot be loaded (the admin says so instead of loading a partial tree).
- Upload limits: 8 MB and 12 000 px per image; no resizing, cropping or responsive variants yet.
- Staged changes live in the browser, unencrypted, until published or discarded (see [security](security.md)).
