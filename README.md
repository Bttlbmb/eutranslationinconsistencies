# Shared legislation reader

This website lets readers explore possible differences in meaning between official EU language versions. It displays preserved English source text alongside original-language quotations, English translations, and explanations from reviewed findings.

The site is static and read-only. It keeps working while the owner's computer is offline and never contacts the local research service. It uses browser-native HTML, CSS, and JavaScript, with no third-party runtime packages or external fonts.

## Read the collection

Choose an act from the selector at the top. Use **Focus language** to show only one language's findings and English-text highlights, including languages with no published findings. Select highlighted wording to open its comparison, and use the arrows to move between findings. **Highlights only** shows passages with findings. A copied finding link retains the focus language for another reader.

Check **Act details**, **Review coverage**, and **Source archive** for the version, progress, and source limitations. A comparison unit is one English passage compared with one other language. A partially reviewed act can already contain supported findings from completed batches. No findings is not proof that the language versions are equivalent.

English is a reading reference and has no higher legal authority than the other official versions. The findings are possible discrepancies reviewed by AI agents, not adjudicated legal errors. Original wording and translated wording are labelled separately.

The current snapshot contains the completed review of Regulation 2019/343. Its exact version, language counts, and findings are recorded in `data/catalogue.json`; the collection can change when the backend exports another snapshot.

## Develop locally

Requires Node.js 20 or newer. There are no packages to install.

```sh
npm test
npm run check
npm run build
npm start
```

Open http://127.0.0.1:4173. The development server serves `dist/` on loopback. `PORT=4174 npm start` changes the port. Rebuild after changing source or public data.

## Code map

| File | Responsibility |
| --- | --- |
| `index.html` | Page structure, accessible controls, method dialog, and search-engine exclusion. |
| `styles.css` | Reading layout, source rows, quote cards, and small-screen rules. |
| `app.js` | Selected act/finding/language, browser history, navigation, and reading panes. |
| `model.js` | Pure grouping, source offsets, highlights, links, and completion labels. |
| `view.js` | Stateless DOM helpers, coverage panel, and source archive panel. |
| `scripts/snapshot.mjs` | Public evidence validation and loading the exact bytes used by a build. |
| `scripts/check.mjs` | Check the existing public snapshot without creating a build. |
| `scripts/build.mjs` | Validate and package only explicit assets and referenced texts into `dist/`. |
| `scripts/serve.mjs` | Local GET/HEAD-only preview server. |
| `scripts/*.test.mjs` | Reader rules and publication-boundary regression tests. |
| `SCHEMA.md` | Authoritative public export contract. |

Read `AGENTS.md` before editing. The backend's [architecture guide](../backend/ARCHITECTURE.md) explains source retrieval, saved review state, locks, and publication.

## Public data and rendering

The backend exports `data/catalogue.json` and versioned text files in `data/texts/`. [SCHEMA.md](SCHEMA.md) defines the self-contained v1 contract. This repository can be built independently once that public snapshot is present. Source imports, model calls, submissions, and private research records belong to the backend.

Build validation checks archive paths and bytes, exact English passages and quotations, foreign-language evidence, official source links, review metadata, language availability, and reconciled coverage. A complete label cannot conceal missing review coverage. Validation and copying use the same loaded bytes, so a newer export cannot silently replace data after it was checked. New browser modules must also be added to the explicit asset list in `scripts/build.mjs`.

The reader renders source wording with text nodes. `passageRows` and highlights refer to offsets in that text, so visual list formatting never rewrites the source characters. Records sharing the same English passage and quote are grouped for display, while each language's original finding title and every original finding link remain available.

The v1 format has no quote offset. When quoted wording repeats, all exact non-overlapping occurrences are highlighted, with a context note. This does not assert that each occurrence is independently discrepant. Overlapping findings remain separately selectable.

## Verify the reader

`npm test` checks source preservation, repeated and overlapping quotes, finding groups, links, URL restrictions, review labels, and rejected invalid snapshots. `npm run check` verifies the actual public evidence. `npm run build` performs the same validation before packaging.

For interface changes, exercise the real snapshot in a browser on desktop and narrow screens:

- Choose different acts; search the collection.
- Follow a highlight, switch overlapping findings, and inspect grouped language cards.
- Focus on a language with findings and one with none; check an unavailable source and review-status wording.
- Use next/previous, switch acts while focused, and follow a direct finding or focus-language link.
- Use browser Back to restore the preceding selection or finding index.
- Expand coverage/source notes, download a text, and use the method dialog with the keyboard.
- Check that wording is readable, no horizontal overflow appears, and requests stay within the static reader or explicit official source links.

## Publication

The existing Sites identity and `dist/` output are configured in `.openai/hosting.json`. The backend's publication workflow validates and builds the reader, pushes its source, and deploys through the owner's signed-in Codex account. A successful build prepares files; only a confirmed hosting result verifies publication.

Updating the reader means exporting a checked backend snapshot, rebuilding, and publishing. Keep the existing project identity and coordinate shared source edits/publication with active chats. The website never starts research or refreshes source legislation itself.

Anyone with the published link can read and forward it. `robots.txt` and `noindex` request search-engine exclusion; they do not enforce private access. Source texts and publishable findings belong here. Keep credentials, prompts, private traces, local paths, and rejected evidence out of this repository and deployment.
