# Public export contract — version 2

The reader loads `data/catalogue.json` as UTF-8 JSON. All text archives referenced by it are UTF-8 `.txt` files beneath `data/texts/`. The public export is a self-contained static snapshot; it must not require the Python service, a local file path, a database connection, or a model account to read.

Current exports use v2. The reader also accepts preserved v1 snapshots, keeping their three-level assessments unranked until reassessed. Version 2 changes only the impact contract and adds `rating_status`; source, finding and coverage fields retain their original meaning. Incompatible changes require a new `schema_version` and a corresponding reader update.

## Catalogue

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Must be `2` for current exports; preserved `1` snapshots remain readable. |
| `generated_at` | UTC ISO-8601 string | Time the snapshot was exported; `null` is supported for an empty, uninitialized collection only. |
| `legislation` | array of legislation objects | Every act included in the snapshot; an empty array is valid. |

## Legislation

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable act identifier, normally its base CELEX identifier; unique within the catalogue. |
| `title` | string | Full source title. |
| `short_title` | string | Concise display title. |
| `subject` | string | Short subject description. |
| `celex` | string | Source CELEX identifier recorded by the importer. |
| `source_url` | HTTPS URL | Official EU source record for the selected version. |
| `version` | string | Precise selected source date, normally `YYYY-MM-DD`; interpreted together with `version_label` and `source_url`. |
| `version_label` | string | Human-readable kind, such as `Original act` or `Consolidated text`. |
| `retrieved_at` | UTC ISO-8601 string | When the official source was retrieved. |
| `status` | string | `imported`, `analyzing`, `complete`, `partial`, or `failed`; see status rules below. |
| `languages` | array of language objects | Successfully preserved official language expressions, including English. |
| `unavailable_languages` | array of unavailable-language objects | Language versions not available for the selected source version. |
| `failed_languages` | array, optional | Existing official expressions that could not be retrieved or parsed; uses the same shape as unavailable-language objects. |
| `coverage` | coverage object | Explicit review denominator and completed coverage. |
| `passages` | array of passage objects | Ordered English source units forming the reader text. |
| `findings` | array of finding objects | Supported, agent-reviewed findings only; can be empty at any status. |
| `impact_families` | array of impact-family objects, optional | Current potential-impact proposals linked to original finding IDs. Assigned levels and unranked issues are displayed; empty or absent means no proposal is available for this act. |
| `notes` | array of strings | Public-safe context, source scope and analysis limitations. |

### Status rules

- `imported`: sources are preserved; no completed analysis is claimed.
- `analyzing`: analysis is in progress; already reviewed findings may be present in a snapshot.
- `complete`: the analysis completed for the selected comparable source scope and available official language expressions. Both reviewed totals equal their expected totals, with no failed retrievals or incomplete language expressions.
- `partial`: some units, languages or source expressions remain incomplete. Preserved mixed-language expressions do not become fully reviewed language coverage.
- `failed`: the analysis was interrupted or failed; any preserved evidence remains available.

A complete review with no findings means no supported difference was identified within that review. It does not establish equivalence of every legal reading. A consolidated source can omit historical recitals; its `notes` must disclose this scope instead of silently claiming to include the entire original act.

## Language and source availability

| Language field | Type | Meaning |
| --- | --- | --- |
| `code` | string | Language code, such as `en`, `fr`, or `de`. |
| `name` | string | English language name. |
| `source_url` | HTTPS URL | Official EU URL from which this expression was retrieved. |
| `text_url` | relative path | Path relative to `data/`, for example `texts/32019R0343/version-fingerprint/en.txt`. |
| `sha256` | 64-character hexadecimal string | SHA-256 of the exact UTF-8 bytes in the referenced text file. |
| `coverage_incomplete` | boolean, optional | True for a preserved expression with incomplete or mixed-language coverage; defaults to false. |
| `notes` | array of strings, optional | Public-safe explanation of expression-specific source issues. |

Unavailable-language and failed-language objects each contain `code`, `name`, and a public-safe `reason` string. Keep unavailable versions separate from retrieval failures: one means no corresponding expression was found; the other means an existing expression was not successfully preserved.

`text_url` must begin with `texts/`, end in `.txt`, and contain only ASCII letters, digits, underscore, period, slash or hyphen. Parent directory segments (`..`), query strings, URL schemes, absolute paths and encoded path escapes are forbidden. Publication checks require the referenced file to exist and match `sha256`.

## Coverage

| Field | Type | Meaning |
| --- | --- | --- |
| `total_units` | non-negative integer | Expected English-passage × non-English-language comparison pairs for the selected official expressions. |
| `reviewed_units` | non-negative integer | Distinct comparison pairs whose independent scans and evidence review have completed. |
| `total_languages` | non-negative integer | Number of official expressions expected for this selected version, including English and failed retrievals. |
| `reviewed_languages` | non-negative integer | Languages with completed review coverage; English is included after a comparable non-English review completes. |
| `reviewed_language_codes` | array of unique non-English language codes, optional for older v1 snapshots | Archived target languages whose every English passage has completed review. An incomplete source cannot appear here. New exports include this field even when empty. |

The current exporter computes `total_units` as the number of English passages multiplied by `max(0, total_languages - 1)`. Completed batch coverage is counted once per language/passage pair. Incomplete or mixed-language expressions stay in the denominator but are excluded from fully reviewed language/passage counts. A missing language must not disappear from the denominator merely because its download failed.

For a segmented review, every expected fragment must finish before its parent passage/language pair counts as reviewed. Once a segmented full-act plan exists, its batches supersede older focused studies for public coverage and findings. Reviewed counts cannot exceed expected counts, and `total_languages` must equal preserved languages plus failed official retrievals. The website validator enforces these totals.
When `reviewed_language_codes` is present, `reviewed_languages` must equal its length plus English if at least one target language is complete. A language omitted from the list may still have some reviewed passages; it has not completed an act-wide review.

## Passage

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique, stable source-unit identifier within the act. |
| `label` | string | Display label, such as an article, annex or recital label. |
| `text` | string | Exact normalized English source text for the unit. |

Passages remain in reading order. The backend validates each passage against the preserved English archive. The reader renders the text literally, with its whitespace retained, and inserts highlight controls without changing the source wording.

## Finding

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable finding identifier, unique within the act; used in share links. |
| `passage_id` | string | ID of the English source passage. |
| `english_quote` | non-empty string | Exact contiguous substring of the cited English passage. |
| `title` | string | Concise description of the potential difference. |
| `category` | string | Typically `scope`, `obligation`, `condition`, `exception`, `number`, `definition`, or `other`. |
| `severity` | string | `substantial` for findings published by the MVP. |
| `status` | string | Must be `agent_reviewed` for publication. |
| `explanation` | string | Concise English explanation of the potential change in legal meaning. |
| `variants` | non-empty array of variant objects | Original-language evidence and interpretation. |
| `review` | review object | Method, model identities and review date. |

Rejected, uncertain, invalid-evidence and unreviewed candidates remain private in the backend. They must not be included as public findings. Publication checks reject a finding whose English quote does not match, whose variant quote does not occur in its language archive, or whose variant evidence is incomplete.

Accepted candidates from a batch whose coverage review has not completed remain preliminary and are excluded from the export. A publication hold suppresses all findings for the act without hiding its source texts or coverage. The backend's local hold flag itself is not a public field.

## Potential-impact assessment

`impact_families` is a separate model-reviewed layer. It asks: **If this reading prevails after all authentic versions are interpreted in context, how large could the change in legal outcome be?** MVP proposals need no separate editorial approval; their `review_state` is retained in the export, and unranked issues must be displayed as such. They do not establish that a version is legally wrong, that any product or person is actually affected, or that a market effect occurred. The existing finding `severity: substantial` is the publication threshold and is not a rank on this scale.

The assigned scale has exactly two values: `major` displays **Major** and `limited` displays **Limited**, under **Potential impact**. Rubric `conditional-binary-impact-1` maps the experiment's `severe` to `major` and `non_severe` to `limited`. Major means a material change to an important entitlement, core permission or duty, eligibility, remedy, substantial financial liability or sanction. Limited means a supported narrower or ancillary consequence with no supported major consequence. Neither records proven harm.

Every v2 family has `rating_status`: `current` for a binary assessment or `needs_reassessment` for an earlier assessment. A current assigned level must use the binary rubric and have `review_state` provisional or confirmed. A current `needs_review` assessment has a null level. Earlier assessments retain their original review state, rubric, explanation, uncertainty and date, but export a null level and `needs_reassessment`. Their original levels remain in the private append-only history; there is no automatic mapping from the older High/Medium/Low scale, including its `limited` value.

Unassigned findings display **No impact rating yet**. Earlier issue explanations are marked **Earlier assessment · Awaiting reassessment**, while current unresolved issues show **Impact under review**. Uncertainty never becomes Limited. Confidence remains separate from impact. Provisional binary ratings retain **Provisional AI assessment**. Collection bars and legends use only Major and Limited, with the unrated share neutral; the count above accounts for unassigned findings. Binary assessment coverage excludes earlier assessments awaiting reassessment. Existing issue and finding links retain their explanations and evidence.

Each object describes one legal issue, which may link several language-specific findings and several English-quote display groups. A display group may also contain different issues. The reader must join by original finding ID, never infer family membership from a shared English quote. A finding can belong to at most one published family. Partial acts may contain proposals without implying complete act-wide impact coverage.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | non-empty string | Stable issue-family ID, unique within the act. |
| `title` | non-empty string | Public-safe short description of the legal issue. |
| `legal_anchor` | non-empty string | Affected rule, provision, or condition; not necessarily the finding language's territory. |
| `finding_ids` | non-empty array of strings | Unique original finding IDs in this same act, all present in its published `findings`. |
| `impact_level` | string or null | `major` or `limited` for an assigned binary conditional level; null for current `needs_review` or any `needs_reassessment` family. |
| `rating_status` | string | Required in v2: `current` or `needs_reassessment`, as defined above. |
| `confidence` | string | `high`, `medium`, or `low`; separate from impact. |
| `effect` | non-empty string | Description of the possible changed outcome. Automated proposals use the critical review's scenario. |
| `rationale` | non-empty string | Explanation of the conditional level or unranked hypothesis. |
| `uncertainty` | non-empty string | Main limitation or unresolved interpretive question. |
| `rubric_version` | non-empty string | Version of the assessment method. |
| `assessed_at` | UTC ISO-8601 string | When this assessment was made. |
| `review_state` | string | `provisional`, `needs_review`, or `confirmed`; the reader displays assigned levels and identifies unranked issues. |

The backend exports current provisional and needs-review proposals without a separate editorial approval. An existing confirmed assessment retains its separately approved public wording. The exporter rechecks the source and finding revisions and verifies that none of the members is held or missing from the exported act. Stale automated protocol runs are excluded. If no assessment passes, export `[]` or omit the field. The website validator rejects unexpected fields, inconsistent state and level pairs, and invalid or cross-act references. A missing or empty array means **No impact rating yet** for each published finding; it never means `limited` impact or no possible difference. The v1 compatibility validator retains its old `high|moderate|limited` enum and state rules; the current reader leaves those historical assessments unranked.

### Variant

| Field | Type | Meaning |
| --- | --- | --- |
| `language` | string | Code of the corresponding archived language. |
| `language_name` | string | Display language name. |
| `quote` | non-empty string | Exact original-language quotation from the preserved text. |
| `translation` | non-empty string | English translation of that quotation, identified as a translation in the interface. |
| `explanation` | non-empty string | Difference and its potential effect in the relevant context. |
| `source_url` | HTTPS URL | Official EU source supporting the original quotation. |

The variant language must be a preserved non-English language. Its source URL must match that language's archived source URL; an official link to a different act or version does not validate the quotation.

### Review

| Field | Type | Meaning |
| --- | --- | --- |
| `method` | string | Human-readable review procedure, normally two independent Sol analyses followed by Astra evidence review. |
| `models` | array of strings | Actual model identifiers used. |
| `reviewed_at` | UTC ISO-8601 string | Time of the review. |

## Reader grouping and links

The stored finding records remain separate. For display, the reader groups records with the same `passage_id` and exact `english_quote`, lists all reviewed language variants, and preserves each record's title on its language card. Each original finding ID remains a valid alias for the grouped view. Public labels call these records “differences in meaning”; Method explains that each language-specific finding counts once. Multi-record groups use a neutral excerpt of their English quotation as the heading, retaining every original title on its language card. Both filter menus count finding records; the list and pager count comparison groups.

Links use `#act=<encoded-id>&finding=<encoded-finding-id>`, with optional `&lang=<language-code>` to focus on any accounted-for non-English language, including one with no findings or an unavailable source. Optional `&impact=major|limited|unrated` focuses on assigned potential impact or findings with **No impact rating yet**. Both focuses are retained in shared links and combined by original finding ID before quote grouping. The existing `unrated` URL token names that derived display state for link compatibility; it does not mean Limited impact. Legacy `high` and `moderate` focus tokens open the unrated focus, without assigning a new level. A focus link may omit `finding`. The requested finding must belong to the selected act and match both focuses; otherwise the reader ignores that finding while retaining the focuses. Unknown act IDs fall back to the first available act; an empty catalogue has an explicit empty state. On initial load, a missing or unknown finding selects the first visible finding when available. Browser Back to the finding index restores the view without a selected finding.

The contract has no quote offset. Every exact non-overlapping occurrence is highlighted when wording repeats within a passage. The comparison states the occurrence count and directs the reader to the explanation for the affected context. Highlight repetition must not be described as proof that every matching occurrence is separately discrepant. Overlapping distinct quotes retain separate finding choices.

## Public-data boundary

Source links must use HTTPS on `europa.eu` or its subdomains. Text and explanations are rendered as text, never executable markup. English is a navigation reference; it has no higher authority than the other official versions.

Do not export private model prompts or traces, credentials, local filesystem paths, account information, internal exception messages, rejected candidate quotations, or localhost control endpoints. Public notes must be deliberately sanitized. The website is read-only; submissions, source retrieval, SQLite storage, model calls and publication credentials belong in the local backend.

`scripts/snapshot.mjs` checks the public evidence for both check and build. A build copies the exact catalogue and archive bytes that passed validation, rather than reading them again afterward. Archive paths resolving outside `data/texts/`, including symlinks to external files, are rejected. Only the explicit browser assets and referenced text files enter `dist/`. Older unreferenced public text copies may be pruned after the backend verifies that their original bytes remain in the private source archive.
