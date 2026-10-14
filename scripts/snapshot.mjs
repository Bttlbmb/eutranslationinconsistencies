/** Validate the public boundary and retain the exact bytes approved for building. */
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';
import { catalogueLegislation, publicFindings, officialURL, archiveURL } from '../model.js';

const statuses = new Set(['imported', 'analyzing', 'complete', 'partial', 'failed']);
const categories = new Set([
  'scope',
  'obligation',
  'condition',
  'exception',
  'number',
  'definition',
  'other'
]);
const impactLevels = new Set(['high', 'moderate', 'limited']);
const impactConfidence = new Set(['high', 'medium', 'low']);
const impactFields = new Set([
  'id', 'title', 'legal_anchor', 'finding_ids', 'impact_level', 'confidence',
  'effect', 'rationale', 'uncertainty', 'rubric_version', 'assessed_at', 'review_state'
]);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
function utcTimestamp(value) {
  if (!nonempty(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|\+00:00)$/.exec(value);
  if (!match) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6]);
}
const utf8 = new TextDecoder('utf-8', { fatal: true });

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

/** Inject the archive loader so evidence checks can be tested without a server. */
export async function validateSnapshot(catalogue, readArchive) {
  const acts = catalogueLegislation(catalogue);
  requireValid(
    acts.length === catalogue.legislation.length,
    'Every exported act needs an id and title.'
  );
  const ids = new Set();
  const archives = new Map();
  for (const act of acts) {
    requireValid(
      nonempty(act.id) && nonempty(act.title) && !ids.has(act.id),
      'Invalid or duplicate legislation id.'
    );
    ids.add(act.id);
    requireValid(statuses.has(act.status), `Unknown review status for ${act.id}`);
    requireValid(
      Array.isArray(act.passages) && Array.isArray(act.languages) && Array.isArray(act.findings),
      `Missing arrays for ${act.id}`
    );
    requireValid(officialURL(act.source_url), `Expected official EU source for ${act.id}`);

    // Source bytes and URLs are the evidence against which the display is checked.
    const languageTexts = new Map();
    const languageSources = new Map();
    for (const language of act.languages) {
      requireValid(
        /^[a-z]{2}$/.test(language.code) && !languageTexts.has(language.code),
        `Invalid or duplicate language for ${act.id}`
      );
      requireValid(officialURL(language.source_url), `Nonofficial language source in ${act.id}`);
      const url = archiveURL(language.text_url);
      requireValid(url, `Unsafe text archive path for ${act.id}`);
      const bytes = archives.get(url) || (await readArchive(url));
      requireValid(
        createHash('sha256').update(bytes).digest('hex') === language.sha256,
        `Text archive checksum mismatch for ${act.id}/${language.code}`
      );
      languageTexts.set(language.code, utf8.decode(bytes));
      languageSources.set(language.code, officialURL(language.source_url));
      archives.set(url, bytes);
    }
    const english = languageTexts.get('en');
    requireValid(english !== undefined, `Missing English source archive for ${act.id}`);
    const passageIds = new Set();
    for (const passage of act.passages) {
      requireValid(
        nonempty(passage.id) && nonempty(passage.text) && !passageIds.has(passage.id),
        `Invalid or duplicate passage for ${act.id}`
      );
      requireValid(
        english.includes(passage.text),
        `English passage does not match preserved evidence for ${act.id}/${passage.id}`
      );
      passageIds.add(passage.id);
    }

    // A missing official download must stay in the denominator. Complete labels
    // require full source and review coverage, even when there are zero findings.
    const coverage = act.coverage;
    requireValid(
      coverage &&
        ['total_units', 'reviewed_units', 'total_languages', 'reviewed_languages'].every(
          (key) => Number.isSafeInteger(coverage[key]) && coverage[key] >= 0
        ),
      `Invalid coverage totals for ${act.id}`
    );
    const failed = act.failed_languages || [];
    const unavailable = act.unavailable_languages || [];
    requireValid(
      Array.isArray(failed) && Array.isArray(unavailable),
      `Invalid language availability for ${act.id}`
    );
    const availability = new Set(languageTexts.keys());
    for (const language of [...failed, ...unavailable]) {
      requireValid(
        /^[a-z]{2}$/.test(language.code) && !availability.has(language.code),
        `Conflicting language availability for ${act.id}`
      );
      availability.add(language.code);
    }
    requireValid(
      coverage.total_languages === act.languages.length + failed.length &&
        coverage.total_units === act.passages.length * Math.max(0, coverage.total_languages - 1) &&
        coverage.reviewed_units <= coverage.total_units &&
        coverage.reviewed_languages <= coverage.total_languages,
      `Coverage does not reconcile for ${act.id}`
    );
    if (Object.hasOwn(coverage, 'reviewed_language_codes')) {
      const codes = coverage.reviewed_language_codes;
      const archivedTargets = new Set(act.languages
        .filter((language) => language.code !== 'en' && !language.coverage_incomplete)
        .map((language) => language.code));
      requireValid(
        Array.isArray(codes) &&
          codes.every((code) => archivedTargets.has(code)) &&
          new Set(codes).size === codes.length &&
          coverage.reviewed_languages === codes.length + (codes.length ? 1 : 0) &&
          coverage.reviewed_units >= codes.length * act.passages.length,
        `Reviewed language codes do not reconcile for ${act.id}`
      );
    }
    requireValid(
      act.status !== 'complete' ||
        (coverage.reviewed_units === coverage.total_units &&
          coverage.reviewed_languages === coverage.total_languages &&
          failed.length === 0 &&
          !act.languages.some((language) => language.coverage_incomplete)),
      `Complete status overstates review coverage for ${act.id}`
    );

    // Grouping is a browser concern; validate every original finding separately.
    const supported = publicFindings(act);
    requireValid(
      supported.length === act.findings.length,
      `Unreviewed or unmatched finding in ${act.id}`
    );
    const findingIds = new Set();
    for (const finding of supported) {
      requireValid(
        nonempty(finding.id) && !findingIds.has(finding.id),
        `Duplicate finding id in ${act.id}`
      );
      findingIds.add(finding.id);
      requireValid(
        nonempty(finding.title) &&
          nonempty(finding.explanation) &&
          categories.has(finding.category) &&
          finding.severity === 'substantial',
        `Incomplete finding in ${act.id}/${finding.id}`
      );
      requireValid(
        nonempty(finding.review?.method) &&
          Array.isArray(finding.review?.models) &&
          finding.review.models.length > 0 &&
          finding.review.models.every(nonempty) &&
          nonempty(finding.review?.reviewed_at),
        `Missing review provenance in ${finding.id}`
      );
      for (const variant of finding.variants) {
        requireValid(
          variant &&
            [variant.language, variant.quote, variant.translation, variant.explanation].every(
              nonempty
            ),
          `Incomplete variant in ${finding.id}`
        );
        requireValid(
          variant.language !== 'en' && languageTexts.get(variant.language)?.includes(variant.quote),
          `Original-language quote does not match preserved evidence for ${finding.id}`
        );
        requireValid(
          officialURL(variant.source_url) &&
            officialURL(variant.source_url) === languageSources.get(variant.language),
          `Variant source does not match its archived language in ${finding.id}`
        );
      }
    }

    // Impact is an optional, explicitly labeled model-review layer keyed to
    // original finding IDs, not to English-quote display groups.
    const families = act.impact_families === undefined ? [] : act.impact_families;
    requireValid(Array.isArray(families), `Invalid impact families in ${act.id}`);
    const familyIds = new Set();
    const assignedFindings = new Set();
    for (const family of families) {
      requireValid(
        family && typeof family === 'object' && !Array.isArray(family) &&
          Object.keys(family).every((key) => impactFields.has(key)),
        `Unexpected impact-family field in ${act.id}`
      );
      requireValid(
        nonempty(family.id) && !familyIds.has(family.id) &&
          [family.title, family.legal_anchor, family.effect, family.rationale,
            family.uncertainty, family.rubric_version].every(nonempty) &&
          (family.review_state === 'needs_review'
            ? family.impact_level === null
            : impactLevels.has(family.impact_level)) &&
          impactConfidence.has(family.confidence) &&
          ['confirmed', 'provisional', 'needs_review'].includes(family.review_state) &&
          utcTimestamp(family.assessed_at),
        `Invalid impact assessment in ${act.id}`
      );
      familyIds.add(family.id);
      requireValid(
        Array.isArray(family.finding_ids) && family.finding_ids.length > 0 &&
          family.finding_ids.every(
            (id) => nonempty(id) && findingIds.has(id) && !assignedFindings.has(id)
          ) && new Set(family.finding_ids).size === family.finding_ids.length,
        `Impact family refers to missing or repeated finding in ${act.id}/${family.id}`
      );
      family.finding_ids.forEach((id) => assignedFindings.add(id));
    }
  }
  return archives;
}

export async function readSnapshot(root) {
  const catalogueBytes = await readFile(resolve(root, 'data/catalogue.json'));
  const catalogue = JSON.parse(utf8.decode(catalogueBytes));
  const textRoot = resolve(root, 'data/texts');
  const archives = await validateSnapshot(catalogue, async (url) => {
    const file = await realpath(resolve(root, url));
    requireValid(file.startsWith(`${textRoot}${sep}`), 'Text archive resolves outside data/texts.');
    return readFile(file);
  });
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  requireValid(html.includes('noindex'), 'No-index metadata is required.');
  return { catalogue, catalogueBytes, archives };
}
