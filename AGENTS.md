# Concordance static reader

This directory is an independent Git repository. The neighboring `../backend/` is the local Python service and owns source ingestion, analysis, SQLite storage, and export generation.

Read `README.md` for the module map and verification checklist. Keep evidence and
grouping rules pure in `model.js`, stateless DOM helpers in `view.js`, and selection
state in `app.js`. `scripts/snapshot.mjs` validates the public boundary; both check
and build use it. Add new browser assets to the explicit build allowlist.

- Keep this website static and read-only. Browser requests must not call the local backend or run model analysis.
- `data/catalogue.json` implements the self-contained v2 contract in `SCHEMA.md`. It contains the current real public export, which backend exports replace. Do not invent findings, translations, coverage, review completion, or legislation metadata.
- Render source text safely as text nodes. Highlights must match an exact English passage substring. Publish only agent-reviewed supported findings.
- Keep `severity: substantial` as a publication threshold. MVP impact proposals may be published after the independent model reviews without editorial approval, with `review_state` preserved in the export and `needs_review` displayed without an assigned level. Display binary `major` as Major and `limited` as Limited. Only `conditional-binary-impact-1` supplies current ratings; earlier rubrics remain unranked with their explanations and `needs_reassessment` status; a finding without an assigned level shows No impact rating yet. Do not infer a rating from the finding threshold.
- English is a reading anchor, not a privileged official language. Preserve partial, unavailable, empty, and interrupted states.
- No account tokens, model prompts, local paths, or remote credentials belong in the site, data exports, commits, or logs.
- Keep `noindex` metadata and `robots.txt`. Link sharing is not authentication.
- The root owner controls `.openai/hosting.json` and Sites registration/deployment. Preserve its project identity.
- Run `npm test`, `npm run check`, and `npm run build` after relevant changes. There are no external packages to install.
- Keep the current local reader at http://127.0.0.1:4173 and the existing hosted Site synchronized after website changes, unless the user explicitly requests local-only work or no publication. Follow ../WORKSPACE.md's shared-lock and publication procedure. Never publish the disposable research preview or open additional reader servers on 4174/4175.
