# Shared legislation reader

This website lets readers explore differences in meaning between official EU language versions. It displays preserved English source text alongside original-language quotations, English translations, and explanations from reviewed findings.

The site is static and read-only. It keeps working while the owner's computer is offline and never contacts the local research service. It uses browser-native HTML, CSS, and JavaScript, with no third-party runtime packages or external fonts.

## Read the collection

Opening an act shows the **Findings** list in the right pane. Filtering the list keeps it open; select a finding to see its comparison. Direct finding links open that comparison immediately.

The catalogue, reader heading and legislation choices use an identifier-first label such as **Directive 2009/24/EC — Computer programs**. Citations retain the suffix and numbering order from the preserved official title. **Change legislation** opens the choices beside the reader heading.

The front page lists the collection with each act's review status, source version, English word count, language-specific findings, and available impact proposals. Partially reviewed acts show a yellow badge such as **Review in progress · 89.9% of comparisons checked**, using the percentage of recorded passage–language comparisons reviewed, rounded to one decimal place without rounding unfinished coverage up to 100%. Word counts use the preserved English text shown in the reader, including introductory text, annexes and footnotes where available; whitespace separates words, numbers count, and standalone punctuation is excluded. The visible “differences in meaning” total counts published finding records, once per language-specific finding. The reader displays records sharing an English quotation in the same passage together in comparison groups. Expand a language list to see names and counts. Impact bars appear when at least one rating is available; unranked issue proposals are linked separately.

The homepage introduction is one sentence; the footer states equal language authority and the review's source scope. Counting rules and review qualifications are available through Method. Each card shows how many language versions have findings. Review progress and assigned impact ratings are separate, for example **Impact ratings: 19 of 36 findings**. High, Medium and Low label the stored high, moderate and limited levels throughout the website. The bar's inline Impact key shows these same labels; the rating count above accounts for unrated findings. Unranked assessments remain visible in the reader without an extra awaiting-rating line on the cards. Findings without any assessment are distinguished from unranked assessments; **Impact assessment not started →** links to the unrated findings and means no published finding has an assessment, without a second no-rating message. A completed review with no findings shows **No differences to assess**. Review completion applies only to the recorded text version and available source scope.

Open an act to enter the reader, or choose another act from its selector. **Language** in the comparison pane lists only languages with findings matching the active impact filter, with a finding count beside each name. An existing focus with no matching findings remains identifiable in the closed control, with its coverage notice preserved, but is hidden from the menu choices. Both language and impact menus count original finding records, while the list and pager count comparison groups. **All languages** shows the total matching record count. **Impact** shows findings with a **High**, **Medium**, or **Low** assessment, or **No impact rating yet** where no level is assigned. For acts without ratings, expand **Impact options** to reach the filter and issue index. A selected impact focus stays visible, including in direct links. The two filters combine. The unranked state may include an impact issue under review and never means Low impact. Select highlighted wording to open its comparison, and use the arrows to move between findings. **Highlights only** shows passages with findings. **Copy link** beside comparison navigation retains both focuses. Existing root links with an act, finding, language, or issue selection continue to open the reader.

The desktop reader uses a bounded split layout with aligned pane toolbars. Comparison navigation stays visible while its evidence scrolls. Selecting a finding or switching the source-text view brings its exact highlighted wording into view. Acts and focus languages without published findings show a compact status notice above the source text, with review coverage and source archives still accessible.

The comparison panel keeps **Text order** as the default. **Potential impact** offers a separate issue-level index for current impact proposals. One issue can link several language-specific findings and highlighted passages; one highlighted quote can also contain several distinct issues. Ratings describe a possible change in legal outcome if a reading prevails, with confidence and uncertainty shown separately. Needs-review issues appear without a rank. An empty impact index means no proposal is available for that act, not that its findings have limited impact.

An opened comparison identifies each assessment’s language and review state above the language evidence. Multiple issue markers use an expandable summary to keep the quotations near the top; each issue retains its own assessment below the evidence. After the language cards and their **What differs in meaning** explanations, each linked issue has one shared assessment section: **Potential impact if this reading prevails**, the visible rating rationale, and **Assumptions and uncertainty**. Confidence is labelled as confidence in the proposed legal effect, separately from impact size. **Assessment details** expands the date and method. Assigned provisional levels show **Provisional AI assessment**. Distinct issues retain their own titles and markers; impact under review never receives an assigned rating.

Check **Review and sources** for the full source title, version, coverage, source limitations, archives, and finding review method. The document header keeps review status visible. A comparison unit is one English passage compared with one other language. A partially reviewed act can already contain supported findings from completed batches. No findings is not proof that the language versions are equivalent.

English is a reading reference and has no higher legal authority than the other official versions. Each language card keeps official English wording, the translation into English, and original-language wording visible together. Underlining marks mechanical wording differences between the two English quotations; it never assigns legal significance or impact. Quotes retain every source character. The findings describe differences in meaning reviewed by AI agents. Method explains their provisional status and that they do not establish a legal error. Counting rules and impact definitions also live there, with the impact scale available under How ratings work. The findings list uses a compact “36 differences · 26 comparison groups” summary, and the comparison note reads “Underlining marks wording differences.” Translations into English are labelled AI-generated. Original wording and translated wording are labelled separately.

**What differs in meaning** adds short English glosses immediately after matched foreign quotations, for example “contractelor încheiate” (“contracts concluded”). The glosses are exact excerpts of the saved English translation; an ellipsis marks omitted intervening words. Existing inline meanings are retained without a duplicate gloss. The original explanation and all three full quotation blocks remain intact. Phrase alignments in `explanation-glosses.js` are tied to the act, finding and language and apply only while both the foreign phrase and English excerpts match the current evidence. New or changed quotations need an aligned entry; the reader never guesses a translation.

Source labels use **Original publication** or **Consolidated version as of**; expanding a label explains it. The later-consolidation limitation appears beside an original version; detailed source notes, including omitted historical recitals, remain in the Review and sources disclosure. **Website data exported** dates the data snapshot separately from the legal text. The catalogue records each act's exact version, language counts, findings, and review coverage in `data/catalogue.json`; the collection can change when the backend exports another snapshot.

Beside **Legislation**, the **Differences in meaning by language** summary shows the languages with the most and fewest published finding records, including ties. It compares only languages available in every fully completed act review, across those same acts; unfinished reviews stay outside this ranking. **Compare languages** opens all counts, including zeros, with the review scope. Its visible note explains that these are counts within this collection and do not measure overall translation quality. On narrow screens the summary moves below the heading.

## Develop locally

Requires Node.js 20 or newer. There are no packages to install.

```sh
npm test
npm run check
npm run build
npm start
```

Open http://127.0.0.1:4173 for the collection or http://127.0.0.1:4173/reader.html for the reader. The standalone development server serves `dist/` on loopback; rebuild after changing source or public data. In this workspace, use the single watching reader instead: from `backend/`, run `uv run python scripts/local_dsa_preview.py serve --watch`. It keeps website edits and reviewed data current at the same address, including completed DSA evidence held for local review. Reuse that server; do not start competing copies on 4174 or 4175.

## Code map

| File | Responsibility |
| --- | --- |
| `index.html` | Collection front page and legacy reader-link forwarding. |
| `catalogue-model.js` | Pure collection counts, review-state labels, ordering, and reader links. |
| `catalogue.js`, `catalogue.css` | Collection front-page rendering, navigation, and responsive presentation. |
| `reader.html` | Reader structure, accessible controls, compact review status, method dialog, and search-engine exclusion. |
| `site-header.css` | Shared catalogue and reader header, site-title typography, and Method control. |
| `styles.css` | Reading layout, source rows, quote cards, and small-screen rules. |
| `app.js` | Selected act/finding/language, browser history, navigation, and reading panes. |
| `model.js` | Pure grouping, source offsets, highlights, links, and completion labels. |
| `explanation-glosses.js` | Evidence-bound phrase alignments for inline English glosses in explanations. |
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

The optional `impact_families` export contains current model-reviewed assessments linked to original published finding IDs. Needs-review proposals have no impact level. The validator rejects inconsistent state and level pairs, unknown or repeated finding references, and fields outside its narrow public allowlist. The browser never reads the private assessment database.

Build validation checks archive paths and bytes, exact English passages and quotations, foreign-language evidence, official source links, review metadata, language availability, and reconciled coverage. A complete label cannot conceal missing review coverage. Validation and copying use the same loaded bytes, so a newer export cannot silently replace data after it was checked. New browser modules must also be added to the explicit asset list in `scripts/build.mjs`.

The reader renders source wording with text nodes. `passageRows` and highlights refer to offsets in that text, so visual list formatting never rewrites the source characters. Records sharing the same English passage and quote are grouped for display. A shared group uses a neutral English-quotation excerpt as its heading; each language’s original finding title and every original finding link remain available.

The v1 format has no quote offset. When quoted wording repeats, all exact non-overlapping occurrences are highlighted, with a context note. This does not assert that each occurrence is independently discrepant. Overlapping findings remain separately selectable.

## Verify the reader

`npm test` checks source preservation, repeated and overlapping quotes, finding and issue groups, links, URL restrictions, review labels, and rejected invalid snapshots. `npm run check` verifies the actual public evidence. `npm run build` performs the same validation before packaging.

For interface changes, exercise the real snapshot in a browser on desktop and narrow screens:

- Choose different acts; search the collection.
- Follow a highlight, switch overlapping findings, and inspect grouped language cards.
- Switch between Text order and Potential impact; inspect rating labels, unranked issues, confidence notes, and related evidence locations. An empty impact index must not imply low impact.
- Focus on a language with findings and check its dropdown count; follow direct links to zero-finding and unavailable languages and check review-status wording.
- Focus on each assigned impact level and No impact rating yet; combine with languages, confirm only matching original findings appear in shared quote groups, and check empty results never imply low impact.
- Use next/previous, switch acts while focused, and follow a direct finding or focus-language link.
- Use browser Back to restore the preceding selection or finding index.
- Expand coverage/source notes, download a text, and use the method dialog with the keyboard.
- Check that wording is readable, no horizontal overflow appears, and requests stay within the static reader or explicit official source links.
- Verify the pane toolbar baselines at desktop widths, keep a selected quotation visible after toggling highlights or resizing, and check the compact pending and unavailable-language states.

## Publication

The existing Sites identity and `dist/` output are configured in `.openai/hosting.json`. The backend's publication workflow validates and builds the reader, pushes its source, and deploys through the owner's signed-in Codex account. A successful build prepares files; only a confirmed hosting result verifies publication.

Updating the reader means exporting a checked backend snapshot, rebuilding, and publishing. Keep the existing project identity and coordinate shared source edits/publication with active chats. The website never starts research or refreshes source legislation itself.

Website changes must reach both the local reader and this existing hosted Site unless the user explicitly requests local-only work or no publication. Use the shared procedure in [WORKSPACE.md](../WORKSPACE.md), confirm the deployed version, and verify the local address. Held local research evidence remains excluded from the checked public build.

Anyone with the published link can read and forward it. `robots.txt` and `noindex` request search-engine exclusion; they do not enforce private access. Source texts and publishable findings belong here. Keep credentials, prompts, private traces, local paths, and rejected evidence out of this repository and deployment.
