# Roadmap to deployment

This is the path from the project as it stands today (Phases 1–3 built, Phases 4–9 not) to a live site, and then to the rest of the roadmap. Each stage has an **exit check**: do not start the next stage until you can answer yes.

**The short version.** The site can go live **before** Phases 4–9 are built. Phases 1–3 already give you the bilingual site, the admin and the editor, and everything after them is added later by pushing to the same repository. What must happen first is a **dress rehearsal on real GitHub**, because the admin, History and scheduled publishing have only been tested against a local fake of GitHub (see [security.md](security.md), weakness 6).

Legend: **You** = something only you can do (your GitHub account, your content, your decisions). **Claude** = work done in the code and docs.

---

## Stage 0 — Decisions (about 10 minutes, you)

These change what is built or how it is set up. Safe defaults are given so a missing answer never blocks you.

| # | Decision | Default if undecided | What it affects |
|---|---|---|---|
| 1 | Public or private repository? | **Public** | GitHub Pages from a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise); GitHub Free supports Pages only for public repositories ([GitHub docs](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)). A public repository exposes drafts, private CV entries, scheduled text and internal notes to anyone who reads `content/` ([security.md](security.md), weaknesses 1 and 8). |
| 2 | Repository name, which sets the address | `abdo` → `https://<you>.github.io/abdo/` | A repository named exactly `<you>.github.io` is served at the root, `https://<you>.github.io/`. The build handles both. |
| 3 | Site name, tagline, description in both languages | The sample text | `content/config/site.json` |
| 4 | Fonts: Google Fonts, system fonts, or self-hosted | Google Fonts, as now | Google Fonts makes each visitor's browser contact Google. Self-hosting needs font files and a feature that is deferred. |
| 5 | Custom domain? | No, use `github.io` | Stage 5 |
| 6 | Cloudflare account? Email for contact messages? | Not needed to go live | Contact form and large media only (Stage 6). |

**Exit check:** you know whether the repository is public, and you know the repository name.

---

## Stage 1 — First deploy with the sample content (you, about 30 minutes)

The aim is to see the real pipeline work before any real content is at stake.

1. Create a GitHub repository (name from Stage 0, branch `main`) and push the project to it. Do not commit `node_modules/` or `dist/`.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open the **Actions** tab and run **Deploy** (the workflow also runs on every push to `main`). It runs `npm test`, builds, and deploys.
4. Open `https://<you>.github.io/<repo>/` and check:
   - `/` redirects to the Arabic or English home page;
   - both languages open, the language switch works, dark mode and Glass Mode work;
   - an article opens; the sample banner is visible;
   - `/admin/` shows the sign-in screen;
   - `/sitemap.xml` and `/robots.txt` use the real address, not `example.github.io`.

If a step fails, the Action log names the cause. A failed build leaves the previous site live.

**Exit check:** the sample site is live at the real address, and the Deploy workflow is green.

---

## Stage 2 — Rehearsal of the admin on real GitHub (you, about 45 minutes; Claude fixes what breaks)

This is the stage that turns "tested against a fake" into "tested". Use the sample site; nothing here is permanent.

1. Create a **fine-grained personal access token**: only this repository, **Contents: Read and write**, a short expiry ([admin.md](admin.md#signing-in)). Never put it in a file or a chat.
2. Open `/admin/`, sign in, and check the overview shows the repository and warns if it is public.
3. Edit a sample article, then **Review & publish**. Confirm a single commit appears on `main`, the Action runs, and the change appears on the site.
4. Open **History** on that article. Check it lists the commit, and that comparing and restoring work.
5. Create a new article with a pasted image; publish it; check the image and its alt text on the page.
6. Schedule an article for about 40 minutes ahead. Check the timer run appears in the Actions tab (it runs at :07 and :37), that the `check` job skips runs when nothing is due, and that the page goes live afterwards. GitHub may delay timer runs.
7. Try a conflict on purpose: edit the same file in GitHub's web editor and in the admin, then publish from the admin. It should refuse and ask you to choose.
8. If `main` has branch protection that requires pull requests, direct commits from the admin will be refused. Leave protection off for the admin branch, or tell me and I will add a pull-request mode.

Send me anything that fails (the message the admin shows and the Action log). Those are real bugs I could not find without GitHub.

**Exit check:** steps 3, 4 and 6 worked on real GitHub. If they did not, Claude fixes them and you repeat the step.

---

## Stage 3 — Real content (you write; Claude removes obstacles)

1. **Profile and CV** in the admin (**Profile & CV**), in the languages you will publish. The profile carries a **“sample content”** checkbox (`"sample": true` in the file). Turn it off once the profile holds your real information; the guarded build refuses to publish while it is still on. Sample articles have the same checkbox.
2. **Site identity**: edit `content/config/site.json` (name, tagline, description in both languages, `"sampleBanner": false`). Set `canonicalDomain` to your real address too, so a local `npm run build` matches the live one. The deploy workflow passes the real Pages address itself, so this field does not decide the live URL.
3. **Topics and tags.** There is no topic or tag manager yet (Phase 5), so these are edited by hand in `content/taxonomy/topics.json` and `tags.json`. The sample ones are marked `"sample": true` and are dropped by the guarded build. Replace them with your own, or ask me to bring the topic manager forward.
4. **Media.** The four sample media files are samples too. Upload your own through the admin (alt text is required in every enabled language).
5. **Homepage** sections are edited in the admin (**Homepage**, Phase 4, see [customization.md](customization.md)); **navigation** (`navigation.json`) is still edited by hand until Phase 5.
6. Publish at least: the profile, two or three real articles, and one project, in the language(s) you want live. Publishing a single language is fine; leave the other translation as a draft.
7. When no `"sample": true` remains, set the repository variable **`EXCLUDE_SAMPLES` = `true`** (Settings → Secrets and variables → Actions → Variables). From then on the workflow builds with `--exclude-samples`.

**Exit check:** the live site contains no sample content and no sample banner, and the build is green with `EXCLUDE_SAMPLES` on.

---

## Stage 4 — Go-live checklist (you, with Claude on request)

- [ ] **Privacy review.** Search `content/` for anything that must not be public: private CV sections, phone numbers, drafts, internal notes, scheduled text. In a public repository, all of it is readable (Git history included).
- [ ] **Token hygiene.** The token has one repository, the smallest permission, a short expiry. Revoke the rehearsal token if it was longer-lived.
- [ ] **Read every page once in each language**: heading order, links, images, alt text, Arabic direction and punctuation.
- [ ] **Phone check** on a real phone: reading, menu, language switch, dark mode.
- [ ] **View source on the home page**: canonical and `hreflang` point at the live address; the title and description are yours.
- [ ] **`/sitemap.xml`** lists the pages you expect and nothing from drafts.
- [ ] **Backups.** The repository is the only copy of your content. Clone it to your computer (or download it) now and then. An export and restore tool is planned for Phase 9.
- [ ] **Repository activity.** GitHub disables scheduled workflows after 60 days with no repository activity; any push or a manual run re-enables them.

**Exit check:** every box is ticked. This is the **go-live point**: share the address.

---

## Stage 5 — Custom domain (optional; you, about 30 minutes plus DNS waiting)

1. Buy or choose the domain and set its DNS records as described in [GitHub's custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
2. Repository **Settings → Pages → Custom domain**, then tick **Enforce HTTPS** once the certificate is ready.
3. Run **Deploy** again, then view source: canonical, `hreflang`, sitemap and `robots.txt` must show the new domain. If they still show `github.io`, tell me; I will check how the workflow passes the address.
4. Update `canonicalDomain` in `site.json`.

---

## Stage 6 — After go-live: Phases 4 to 9

Each phase ends with the same routine: Claude builds and tests it and sends a zip, you push it, the Action deploys it, and you check it on the live site. Order and what each needs from you:

| Phase | Delivers | Needs from you | Gate before it counts as done |
|---|---|---|---|
| **4. Customization** | Homepage builder, appearance and typography studio, layout manager, user presets, contrast check for custom colours | Fonts decision (Stage 0, #4) | Live preview matches the real page; custom colours pass the contrast check |
| **5. Content discovery** (delivered) | Topic and tag managers, Arabic-aware search, related content, pagination, navigation editor | Nothing | On the live site: search for words you really use, with and without diacritics and with `ة`/`ه`; open `/assets/search-<lang>.<hash>.json` and check its size; check one changed address redirects (see [discovery.md](discovery.md#before-relying-on-it)) |
| **7. SEO** (can go before 6) | RSS/Atom, SEO assistant, richer structured data | Search Console access, if you want it | Feeds validate; structured data passes a validator |
| **6. Digital publishing** | PDF per article, editions, archive | Looking at the PDFs | **Arabic shaping and right-to-left pagination checked by eye** before it is called working |
| **8. Agentic web** | Public JSON endpoints, `llms.txt`, per-crawler `robots.txt`, knowledge graph | Which crawlers you allow | Nothing private appears in any endpoint (test scans them) |
| **9. Analytics and optimization** | Privacy-respecting analytics, accessibility testing, security review, backup/export and restore | A decision on analytics | Screen-reader pass; security review findings fixed |

**Contact form** (deferred from Phase 2) is independent of the order above. It needs a Cloudflare account, a Worker with validation, rate limiting and spam protection, private message storage, and the email address that should receive messages. Large media on Cloudflare R2 has the same prerequisite.

---

## What could still go wrong on the way

- **Untested against real GitHub:** the admin's API calls, History, scheduling and the `check` job. Stage 2 exists to find these.
- **Chromium only:** the browser tests ran in Chromium. Check the admin once in Firefox or Safari if you will use one.
- **Timers are best effort:** a scheduled article can go live later than its time.
- **Google Fonts:** unavailable or blocked networks fall back to system fonts; the layout is built to survive that, but I have not tested it on a real blocked network.
- **Branch protection** can block the admin's direct commits (Stage 2, step 8).
- **One admin, one token:** there is no second factor on publishing beyond GitHub's own login.
