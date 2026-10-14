/** Front-page summaries of the checked public snapshot. No research state is inferred. */
import { publicFindings, substantialLanguageIndex, impactFamilies, impactDisplayLabel } from './model.js';

// Editorial introductions to the existing acts, based on their preserved official
// titles and scope provisions. Source metadata and legal wording stay unchanged.
const introductions = {
  '32000L0078': {
    title: 'Employment equality',
    description: 'Combats discrimination at work based on religion or belief, disability, age or sexual orientation.'
  },
  '32009L0024': {
    title: 'Computer programs',
    description: 'Protects computer programs by copyright, with rules on ownership and permitted use.'
  },
  '32011L0007': {
    title: 'Late payments',
    description: 'Combats late payment for goods and services in commercial transactions.'
  },
  '32012R0432': {
    title: 'Food health claims',
    description: 'Lists permitted health claims for foods and sets the conditions for using them.'
  },
  '32019R0343': {
    title: 'Generic food descriptors',
    description: 'Defines exemptions for traditional food descriptors under nutrition and health-claim rules.'
  },
  '32022R2065': {
    title: 'Digital Services Act',
    description: 'Sets liability, due diligence and enforcement rules for online intermediary services.'
  }
};

export function actIntroduction(act) {
  const introduction = introductions[act.id];
  const title = introduction?.title || act.short_title || act.title;
  const celex = act.id.match(/^3(\d{4})([RL])(\d{4})$/);
  return {
    title,
    description: act.subject?.trim() || introduction?.description ||
      (act.title !== title ? act.title : ''),
    reference: celex
      ? `${celex[2] === 'R' ? 'Regulation' : 'Directive'} ${celex[1]}/${Number(celex[3])}`
      : act.short_title || act.celex || act.id
  };
}

/** Count the preserved English reader text, including introductory and closing units. */
export function englishWordCount(act) {
  if (!(act.languages || []).some(language => language.code === 'en') || !act.passages?.length) return null;
  // Keep hyphenated words and numbers together; ignore standalone table/list punctuation.
  return act.passages.reduce((total, passage) => total +
    (passage.text.match(/\S+/gu) || []).filter(word => /[\p{L}\p{N}]/u.test(word)).length, 0);
}

function findingImpactDistribution(findings, families) {
  const ratings = new Map();
  for (const family of families) {
    if (!family.impact_level) continue;
    for (const id of new Set(family.finding_ids)) {
      // An ambiguous assignment cannot become a confident rating in the chart.
      ratings.set(id, ratings.has(id) ? 'unrated' : family.impact_level);
    }
  }
  const counts = { high: 0, moderate: 0, limited: 0, unrated: 0 };
  for (const finding of findings) counts[ratings.get(finding.id) || 'unrated']++;
  return Object.entries(counts).map(([level, count]) => ({
    level, label: impactDisplayLabel(level), count,
    share: findings.length ? count / findings.length : 0
  }));
}

/** Shares of published finding records, joined to rated issues by original ID. */
export function impactDistribution(act) {
  return findingImpactDistribution(publicFindings(act), impactFamilies(act));
}

export function actSummary(act) {
  const findings = publicFindings(act);
  const families = impactFamilies(act);
  const coverage = act.coverage || {};
  const total = Number(coverage.total_units) || 0;
  const reviewed = Number(coverage.reviewed_units) || 0;
  const fullyReviewed = act.status === 'complete' &&
    Number.isInteger(coverage.reviewed_units) && Number.isInteger(coverage.total_units) &&
    Number.isInteger(coverage.reviewed_languages) && Number.isInteger(coverage.total_languages) &&
    reviewed === total && coverage.reviewed_languages === coverage.total_languages &&
    !(act.failed_languages || []).length &&
    !(act.languages || []).some(language => language.coverage_incomplete);
  const reviewLabel = fullyReviewed ? 'Review complete' : {
    complete: 'Review incomplete',
    partial: 'Partially reviewed',
    analyzing: 'Review ongoing',
    failed: 'Review interrupted',
    imported: 'Sources available'
  }[act.status] || 'Review incomplete';
  const severities = new Map();
  for (const finding of findings) {
    const severity = finding.severity || 'unspecified';
    severities.set(severity, (severities.get(severity) || 0) + 1);
  }
  const distribution = findingImpactDistribution(findings, families);
  const assessedCount = distribution.filter(segment => segment.level !== 'unrated')
    .reduce((total, segment) => total + segment.count, 0);
  const impact = { high: 0, moderate: 0, limited: 0 };
  families.filter(family => family.impact_level).forEach(family => impact[family.impact_level]++);
  const reviewingCount = families.filter(family => family.review_state === 'needs_review').length;
  // A rounded value must never turn unfinished coverage into a 100% label.
  const percentage = total > 0
    ? Math.min(reviewed < total ? 99.9 : 100, Math.round(reviewed / total * 1000) / 10)
    : null;
  return {
    count: findings.length,
    severities: [...severities].map(([level, count]) => ({ level, count })),
    languages: substantialLanguageIndex(act),
    fullyReviewed,
    reviewLabel,
    reviewed,
    total,
    percentage,
    reviewedLanguages: coverage.reviewed_languages || 0,
    totalLanguages: coverage.total_languages || 0,
    impact,
    distribution,
    impactCount: families.length,
    reviewingCount,
    assessedCount,
    unassessedCount: findings.length - assessedCount
  };
}

export function catalogueSummary(acts) {
  return acts.reduce((summary, act) => {
    const current = actSummary(act);
    summary.acts++;
    summary.findings += current.count;
    summary.complete += Number(current.fullyReviewed);
    summary.impact += current.impactCount;
    return summary;
  }, { acts: 0, findings: 0, complete: 0, impact: 0 });
}

export function orderedActs(acts) {
  const rank = act => {
    const summary = actSummary(act);
    return summary.fullyReviewed ? 0 : summary.count ? 1 : act.status === 'imported' ? 3 : 2;
  };
  return [...acts].sort((a, b) => rank(a) - rank(b) ||
    actIntroduction(a).title.localeCompare(actIntroduction(b).title));
}

export function readerHref(act, language = null, impact = null) {
  const params = new URLSearchParams({ act: act.id });
  if (language) params.set('lang', language);
  if (impact) params.set('impact', impact);
  return `./reader.html#${params}`;
}

/** Preserve existing shared root URLs, including finding aliases and impact links. */
export function legacyReaderHref(hash, search = '') {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return ['act', 'finding', 'lang', 'impact', 'view', 'issue'].some(key => params.has(key))
    ? `./reader.html${search}${hash.startsWith('#') ? hash : `#${hash}`}`
    : null;
}
