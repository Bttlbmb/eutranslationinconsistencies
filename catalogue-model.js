/** Front-page summaries of the checked public snapshot. No research state is inferred. */
import { publicFindings, substantialLanguageIndex, impactFamilies, impactDisplayLabel, targetReviewCoverage } from './model.js?v=7';

// Editorial introductions to the existing acts, based on their preserved official
// titles and scope provisions. Source metadata and legal wording stay unchanged.
const introductions = {
  '31997R1103': {
    title: 'Introduction of the euro',
    description: 'Sets rules for currency conversion, rounding and the continuity of contracts.'
  },
  '32004R0261': {
    title: 'Air passenger rights',
    description: 'Sets compensation and assistance rules for denied boarding, cancellations and long flight delays.'
  },
  '32006R1924': {
    title: 'Nutrition and health claims',
    description: 'Sets conditions for nutrition and health claims in food labelling and advertising.'
  },
  '32010R1231': {
    title: 'Social security for non-EU nationals',
    description: 'Extends EU social-security coordination to qualifying nationals of non-EU countries.'
  },
  '32013R0655': {
    title: 'Cosmetic product claims',
    description: 'Sets common criteria for substantiating claims about cosmetic products.'
  },
  '32014R0828': {
    title: 'Gluten-free food labelling',
    description: 'Sets conditions for gluten-free and very-low-gluten information on food.'
  },
  '32019R0649': {
    title: 'Industrial trans fats',
    description: 'Restricts trans fats other than those naturally occurring in fat of animal origin.'
  },
  '32024R3228': {
    title: 'Online dispute resolution platform closure',
    description: 'Ends the EU online dispute-resolution platform and provides for handling users’ case data.'
  },
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
  // Keep the official citation's suffix and numbering order, including older regulations.
  const citation = act.title.trim().match(/^(?:(?:Council|Commission)\s+)?(?:(?:Implementing|Delegated)\s+)?(Directive|Regulation)\s+(\((?:EU|EC|EEC)\)\s+)?(No\.?\s+)?(\d+\/\d+(?:\/(?:EU|EC|EEC))?)(?=\s|$)/i);
  const reference = citation
    ? [citation[1][0].toUpperCase() + citation[1].slice(1).toLowerCase(),
      citation[2]?.trim().toUpperCase(), citation[3] ? 'No' : '', citation[4].toUpperCase()]
      .filter(Boolean).join(' ')
    : celex
      ? `${celex[2] === 'R' ? 'Regulation' : 'Directive'} ${celex[1]}/${Number(celex[3])}`
      : act.short_title || act.celex || act.id;
  return {
    title,
    reference,
    label: reference === title ? title : `${reference} — ${title}`,
    description: act.subject?.trim() || introduction?.description ||
      (act.title !== title ? act.title : '')
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
  const counts = { major: 0, limited: 0, unrated: 0 };
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

/** Assessment coverage includes explicit needs-review decisions, independently of ratings. */
function impactAssessmentSummary(findings, families, fullyReviewed) {
  const assignments = new Map();
  for (const family of families.filter(family => family.rating_status !== 'needs_reassessment')) {
    for (const id of new Set(family.finding_ids)) {
      assignments.set(id, (assignments.get(id) || 0) + 1);
    }
  }
  const count = findings.filter(finding => assignments.get(finding.id) === 1).length;
  const total = findings.length;
  const state = total && count === total ? 'complete' : count ? 'partial' :
    !total && fullyReviewed ? 'not-needed' : 'pending';
  const label = {
    complete: 'Impact assessed', partial: 'Impact partial',
    pending: 'Impact pending', 'not-needed': 'No findings to assess'
  }[state];
  return { count, total, state, label };
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
  // Count fully compared target versions; English is the common reference.
  // This is saved coverage, not an indication that a review is running now.
  const targets = targetReviewCoverage(act);
  const reviewState = fullyReviewed ? 'Complete' : 'Incomplete';
  const reviewedLanguagesLabel = `${targets.reviewed} of ${targets.total} languages reviewed`;
  const reviewLabel = `${reviewedLanguagesLabel} · ${reviewState}`;
  const severities = new Map();
  for (const finding of findings) {
    const severity = finding.severity || 'unspecified';
    severities.set(severity, (severities.get(severity) || 0) + 1);
  }
  const distribution = findingImpactDistribution(findings, families);
  const assessedCount = distribution.filter(segment => segment.level !== 'unrated')
    .reduce((total, segment) => total + segment.count, 0);
  const impact = { major: 0, limited: 0 };
  families.filter(family => family.impact_level).forEach(family => impact[family.impact_level]++);
  const reviewingCount = families.filter(family => !family.impact_level).length;
  const reassessmentCount = families.filter(family => family.rating_status === 'needs_reassessment').length;
  return {
    count: findings.length,
    severities: [...severities].map(([level, count]) => ({ level, count })),
    languages: substantialLanguageIndex(act),
    fullyReviewed,
    reviewLabel,
    reviewState,
    reviewedLanguagesLabel,
    impact,
    distribution,
    impactCount: families.length,
    reviewingCount,
    reassessmentCount,
    impactAssessment: impactAssessmentSummary(findings, families, fullyReviewed),
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

/** Compare the same completed acts and available target languages, including zero findings. */
export function overallLanguageSummary(acts) {
  const completed = acts.filter(act => actSummary(act).fullyReviewed);
  const targets = completed.map(act => new Map((act.languages || [])
    .filter(language => language.code !== 'en' && !language.coverage_incomplete)
    .map(language => [language.code, language.name || language.code.toUpperCase()])));
  const common = [...(targets[0] || new Map()).keys()]
    .filter(code => targets.every(languages => languages.has(code)));
  const languages = common.map(code => ({ code, name: targets[0].get(code), count: 0 }));
  const byCode = new Map(languages.map(language => [language.code, language]));
  for (const act of completed) {
    for (const language of substantialLanguageIndex(act)) {
      const total = byCode.get(language.code);
      if (total) total.count += language.count;
    }
  }
  languages.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    completedActs: completed.length,
    excludedActs: acts.length - completed.length,
    languages,
    most: languages.filter(language => language.count === languages[0]?.count),
    fewest: languages.filter(language => language.count === languages.at(-1)?.count)
  };
}

export function orderedActs(acts) {
  const rank = act => {
    const summary = actSummary(act);
    return summary.fullyReviewed ? 0 : summary.count ? 1 : act.status === 'imported' ? 3 : 2;
  };
  return [...acts].sort((a, b) => rank(a) - rank(b) ||
    actIntroduction(a).title.localeCompare(actIntroduction(b).title));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

/** The act's own date from its official title ("… of 20 December 2006"), else its version date. */
export function actDate(act) {
  const match = (act.title || '').match(/\bof (\d{1,2}) ([A-Za-z]+) (\d{4})\b/);
  const month = match ? MONTHS.indexOf(match[2].toLowerCase()) : -1;
  if (month >= 0) return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(act.version || '') ? act.version.slice(0, 10) : '';
}

export const sortOptions = Object.freeze([
  { key: 'status', label: 'Review status' },
  { key: 'date', label: 'Date of act', descending: 'newest first', ascending: 'oldest first' },
  { key: 'findings', label: 'Differences', descending: 'most first', ascending: 'fewest first' }
]);

/** Read `?sort=date-desc`; anything unknown falls back to the review-status order. */
export function parseSort(search = '') {
  const value = new URLSearchParams(search).get('sort') || '';
  const [key, direction] = value.split('-');
  if (!sortOptions.some(option => option.key === key) || key === 'status') return { key: 'status', direction: 'desc' };
  return { key, direction: direction === 'asc' ? 'asc' : 'desc' };
}

export function sortParam(sort) {
  return sort.key === 'status' ? null : `${sort.key}-${sort.direction}`;
}

/** Review status keeps the editorial order; other sorts break ties by title. */
export function sortActs(acts, sort = { key: 'status', direction: 'desc' }) {
  const base = orderedActs(acts);
  if (sort.key === 'status') return base;
  const value = sort.key === 'date' ? actDate : act => publicFindings(act).length;
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...base].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = typeof left === 'number' ? left - right : String(left).localeCompare(String(right));
    return sign * order || actIntroduction(a).title.localeCompare(actIntroduction(b).title);
  });
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

/** Metered AI cost in US dollars, or null when no paid ledger covers the act. */
export function processingCost(act) {
  const cost = act?.ai_processing;
  return cost && Number.isFinite(cost.metered_usd) ? cost.metered_usd : null;
}

export function collectionProcessingCost(acts) {
  const costs = acts.map(processingCost).filter(cost => cost !== null);
  return costs.length ? costs.reduce((total, cost) => total + cost, 0) : null;
}

export const formatUsd = value => `$${value.toFixed(2)}`;
