# EU Translation Inconsistencies: reader

The reader makes possible differences between EU language versions easier to inspect. Choose a law, open a finding, and compare its source quotations and explanation. English is the common reading reference; it has no higher authority than the other official versions.

This is a static website. It reads a checked export and never starts research or contacts the local backend. The [backend](../backend/README.md) has its own Git repository and preserves the private review history. This repository holds only public material and is backed up at [Bttlbmb/eutranslationinconsistencies](https://github.com/Bttlbmb/eutranslationinconsistencies).

The published reader is at [bttlbmb.github.io/eutranslationinconsistencies](https://bttlbmb.github.io/eutranslationinconsistencies/). Every push to `main` runs the tests, validates the snapshot, builds `dist/`, and deploys that output to GitHub Pages. Pull requests run the same checks without deployment. The former OpenAI-hosted copy remains retired.

## Run the reader

Use Node.js 20 or newer. There are no packages to install.

```sh
npm test
npm run check
npm run build
npm start
```

Open <http://127.0.0.1:4173>. If the workspace's watching reader is already running there, reuse it. The [development guide](docs/development.md) covers the shared reader and publication procedure.

## Find your way around

| Location | Purpose |
| --- | --- |
| `index.html`, `catalogue*.js`, `catalogue.css` | Collection page, counts and navigation. |
| `reader.html`, `app.js`, `model.js`, `view.js`, `styles.css` | Reading interface, selection state, evidence rules and rendering. |
| `site-header.css`, `favicon.svg`, `robots.txt` | Shared presentation and search-engine instructions. |
| `experiments.html`, `experiments.css` | Preserved experiment report. |
| `scripts/` | Snapshot validation, safe build and local server. |
| `tests/` | Evidence, interaction-model and publication regression checks. |
| `docs/` | [Reading guide](docs/reader.md), [development](docs/development.md), and the authoritative [export schema](docs/schema.md). |
| `data/` | Current checked public catalogue and source texts. |
| `dist/` | Generated site; ignored by Git. |

Only files explicitly listed in the build are published. Validation rejects undocumented fields and checks the source bytes and quotations before a build replaces the previous output. See [AGENTS.md](AGENTS.md) before changing the project.
