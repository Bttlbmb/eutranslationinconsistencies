# Developing the reader



Requires Node.js 20 or newer. There are no packages to install.

```sh
npm test
npm run check
npm run build
npm start
```

Open http://127.0.0.1:4173 for the collection or http://127.0.0.1:4173/reader.html for the reader. The standalone development server serves `dist/` on loopback; rebuild after changing source or public data. In this workspace, use the single watching reader instead: from `backend/`, run `uv run python scripts/preview.py serve --watch`. It keeps website edits and reviewed data current at the same address, using the checked public collection; the retained DSA trial can add held evidence only to its disposable preview. Reuse that server; do not start competing copies on 4174 or 4175.

## Code map

| File | Responsibility |
| --- | --- |
| `index.html` | Collection front page and legacy reader-link forwarding. |
| `catalogue-model.js` | Pure collection counts, review-state labels, ordering, and reader links. |
| `catalogue.js`, `catalogue.css` | Collection front-page rendering, navigation, and responsive presentation. |
| `reader.html` | Reader structure, accessible controls, compact review status, method dialog, and search-engine exclusion. |
| `site-header.css` | Shared catalogue and reader header, site-title typography, and Method control. |
| `experiments.html`, `experiments.css` | Unlinked, noindex report on the four completed review experiments and the authorized ten-act API cohort run. |
| `styles.css` | Reading layout, source rows, quote cards, and small-screen rules. |
| `app.js` | Selected act/finding/language, browser history, navigation, and reading panes. |
| `model.js` | Pure grouping, source offsets, highlights, links, and completion labels. |
| `explanation-glosses.js` | Evidence-bound phrase alignments for inline English glosses in explanations. |
| `view.js` | Stateless DOM helpers, coverage panel, and source archive panel. |
| `scripts/snapshot.mjs` | Public evidence validation and loading the exact bytes used by a build. |
| `scripts/check.mjs` | Check the existing public snapshot without creating a build. |
| `scripts/build.mjs` | Validate and package only explicit assets and referenced texts into `dist/`. |
| `scripts/serve.mjs` | Local GET/HEAD-only preview server. |
| `tests/*.test.mjs` | Reader rules and publication-boundary regression tests. |
| `docs/schema.md` | Authoritative public export contract. |

Read `AGENTS.md` before editing. The backend's [architecture guide](../../backend/docs/architecture.md) explains source retrieval, saved review state, locks, and publication.

## Public data and rendering

The backend exports `data/catalogue.json` and versioned text files in `data/texts/`. [SCHEMA.md](schema.md) defines the self-contained v2 contract. This repository can be built independently once that public snapshot is present. Source imports, model calls, submissions, and private research records belong to the backend.

The optional `impact_families` export contains current model-reviewed assessments linked to original published finding IDs. Needs-review proposals have no impact level. The validator rejects inconsistent state and level pairs, unknown or repeated finding references, and fields outside its narrow public allowlist. The browser never reads the private assessment database.

Build validation checks archive paths and bytes, exact English passages and quotations, foreign-language evidence, official source links, review metadata, language availability, and reconciled coverage. A complete label cannot conceal missing review coverage. Validation and copying use the same loaded bytes, so a newer export cannot silently replace data after it was checked. New browser modules must also be added to the explicit asset list in `scripts/build.mjs`.

The reader renders source wording with text nodes. `passageRows` and highlights refer to offsets in that text, so visual list formatting never rewrites the source characters. Records sharing the same English passage and quote are grouped for display. A shared group is listed under its first language finding’s title with “+N more”, and its view is headed by the location and language count; each language’s original finding title and every original finding link remain available.

The format has no quote offset. When quoted wording repeats, all exact non-overlapping occurrences are highlighted, with a context note. This does not assert that each occurrence is independently discrepant. Overlapping findings remain separately selectable.

## Verify the reader

`npm test` checks source preservation, repeated and overlapping quotes, finding and issue groups, links, URL restrictions, review labels, and rejected invalid snapshots. `npm run check` verifies the actual public evidence. `npm run build` performs the same validation before packaging.

For interface changes, exercise the real snapshot in a browser on desktop and narrow screens:

- Choose different acts; search the collection; sort it by each option in both directions and reload with the `?sort=` address.
- Follow a highlight, switch overlapping findings, and inspect grouped language cards.
- Switch between Text order and Potential impact; inspect rating labels, unranked issues, confidence notes, and related evidence locations. An empty impact index must not imply low impact.
- Check that changed wording appears as continuous shaded runs in both the official English and its AI translation, each language row carries its own rating, Major badges stay the strongest mark, and accent blue appears only on links and controls.
- Focus on a language with findings and check its dropdown count; follow direct links to zero-finding and unavailable languages and check review-status wording.
- Focus on each assigned impact level and No impact rating yet; combine with languages, confirm only matching original findings appear in shared quote groups, and check empty results never imply low impact.
- Use next/previous, switch acts while focused, and follow a direct finding or focus-language link.
- Use browser Back to restore the preceding selection or finding index.
- Expand coverage/source notes, download a text, and use the method dialog with the keyboard.
- Check that wording is readable, no horizontal overflow appears, and requests stay within the static reader or explicit official source links.
- Verify the pane toolbar baselines at desktop widths, keep a selected quotation visible after switching between Full text and Highlights or resizing, and check the compact pending and unavailable-language states.

## Rebuild and share

The owner retired the OpenAI-hosted reader on 16 October 2026. Public access was removed and the existing deployment is owner-only. The available Sites tools did not provide an undeploy operation. `.openai/publication-disabled` blocks the backend's automatic and explicit Sites commands, not GitHub Pages. Keep the existing identity in `.openai/hosting.json` for reference; do not resume Sites deployment without a new request.

Updating the reader means exporting a checked backend snapshot, rebuilding locally, and pushing reviewed changes to [GitHub](https://github.com/Bttlbmb/eutranslationinconsistencies). The `Check and deploy reader` workflow tests, validates and builds each `main` commit, then publishes only `dist/` to [GitHub Pages](https://bttlbmb.github.io/eutranslationinconsistencies/). Pull requests never deploy. A failed check stops publication and retains the previous hosted version. Follow the [workspace rules](../../backend/docs/workspace.md), confirm the deployment job succeeded, and check the live reader before reporting it updated.

Repository Settings → Pages must use **GitHub Actions** as the source. The workflow can also be run manually from Actions for `main`. It follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): upload the validated build, then deploy with the restricted Pages permissions. Source, tests and documentation are not part of the deployment artifact. Relative asset and data URLs support this repository's `/eutranslationinconsistencies/` path.

The website never starts research or refreshes source legislation itself. Keep credentials, prompts, private traces, local paths and rejected evidence out of this repository. `robots.txt` and `noindex` remain search-engine instructions, not access control.

The build stages all assets and validated data before replacing `dist/`. A failed copy keeps the previous build available. Historical inline phrase alignments live in `tests/fixtures/historical-glosses.js`; the current cohort has no additional configured glosses. New alignments must refer to current findings, and tests reject stale production entries.

To recreate the website with current backend data, run `uv run python scripts/rebuild_website.py` from `backend/`. It stages and validates the new export and build before replacing this repository’s `data/` and `dist/`. Source files and Git history remain here; hosting deployment is separate.
