# Concordance reader

A static, read-only reader for EU legislation and reviewed potential differences between official language versions. It uses browser-native HTML, CSS and JavaScript without third-party runtime dependencies or external fonts.

## Run locally

Requires Node.js 20 or newer.

```sh
npm test
npm run check
npm run build
npm start
```

Open `http://127.0.0.1:4173`. The development server serves `dist/` on loopback only. `PORT=4174 npm start` changes its port. Rebuild after changing source files or data.

## The collection

The repository contains real official-source imports for Regulation 1924/2006 (`32006R1924`) and Regulation 2019/343 (`32019R0343`), with 47 preserved language texts across the two acts. Their precise versions, source URLs, retrieval times, current analysis status and reviewed findings are recorded in `data/catalogue.json`. Finding totals and coverage can change as the local analysis finishes and new snapshots are exported; the catalogue is the source of truth.

Findings are generated from the preserved evidence by independent analyses and a separate reviewer. They are potential discrepancies, not adjudicated legal errors. Official source gaps and mixed-language expressions remain visible, and a partial or zero-result review is not presented as proof of consistency. No fabricated findings are included in the public dataset.

## Import data

The Python backend exports `data/catalogue.json` and preserved text files in `data/texts/`. The complete, self-contained v1 export contract is in [SCHEMA.md](SCHEMA.md). This repository can be built and hosted independently of the backend once the public export is present.

The build validates the schema version, local archive paths, archive checksums, exact source quotations and official source links before copying the public files into `dist/`. Only the explicit static assets and referenced text archives are included in the deployment.

The reader renders the preserved English text, original-language evidence, English translations, explanations and model review metadata. Findings anchored to the same English quote are displayed together, with each language's original finding title retained. Individual finding links remain valid (`#act=…&finding=…`).

All exact occurrences of repeated quoted wording are highlighted and accompanied by a context note; this does not assert that each occurrence is independently discrepant. Overlapping findings remain separately selectable. Search, filters, next/previous navigation, keyboard activation, source archives and narrow-screen layouts support the same reading workflow.

## Verification

`npm test` checks source highlight preservation, repeated and overlapping quotations, grouping, deep links, URL restrictions and honest completion labels. `npm run check` verifies the actual exported evidence, including all text checksums and foreign-language quotations. `npm run build` repeats the evidence checks before packaging.

Browser verification is a separate release step. Exercise the actual dataset on desktop and narrow screens: choose both acts, follow a finding highlight, switch overlapping findings, inspect grouped language cards, use next/previous and a direct finding link, filter/search the library, expand source-quality notes, download a text archive, and open/close the reading guide with the keyboard. Check that source text remains readable, no horizontal overflow appears, and the browser never calls the local backend. A deployment is complete only after the native hosting service confirms its published URL; the build alone does not verify deployment.

## Publication

OpenAI Sites hosts the `dist/` directory configured in `.openai/hosting.json`. The workspace owner handles registration and publishing. Source and text files are public to the site's allowed audience: do not place private data or credentials here. `robots.txt` and `noindex` request exclusion from search engines; an unlisted URL is not identity-based access control.

Refreshing this site means exporting the new backend snapshot, rebuilding, and publishing a new static deployment. The site never connects to the local backend. There is no automatic legislation update service in this MVP.
