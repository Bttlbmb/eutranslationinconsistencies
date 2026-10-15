/** The read-only catalogue front page. Requests use only the public static snapshot. */
import { catalogueLegislation } from './model.js?v=3';
import {
  actIntroduction, actSummary, catalogueSummary, orderedActs, readerHref, legacyReaderHref,
  englishWordCount, overallLanguageSummary
} from './catalogue-model.js?v=4';
import { node, append, button, prettyDate, plural, renderSourceVersion, renderSourceScope } from './view.js?v=3';

const $ = selector => document.querySelector(selector);
const number = value => new Intl.NumberFormat('en-GB').format(value);

function followLegacyLink() {
  const href = legacyReaderHref(location.hash, location.search);
  if (href) location.replace(href);
  return Boolean(href);
}

function readerLink(act, label, className, language, impact) {
  const link = node('a', className, label);
  link.href = readerHref(act, language, impact);
  return link;
}

function renderOverall(acts) {
  const host = $('#catalogue-overall');
  const summary = overallLanguageSummary(acts);
  host.replaceChildren();
  host.hidden = !summary.languages.length;
  if (host.hidden) return;
  const extremes = node('div', 'catalogue-overall-extremes');
  for (const [label, languages] of [['Most', summary.most], ['Fewest', summary.fewest]]) {
    const names = languages.slice(0, 2).map(language => language.name).join(' / ');
    const extra = languages.length > 2 ? ` + ${number(languages.length - 2)} more` : '';
    const count = `${number(languages[0].count)}${languages.length > 1 ? ' each' : ''}`;
    const extreme = node('span', 'catalogue-overall-extreme');
    extreme.setAttribute('aria-label', `${label} differences in meaning: ${languages.map(language => language.name).join(', ')}; ${count}.`);
    append(extreme, node('span', '', `${label}: `),
      node('span', 'catalogue-overall-language', names + extra), node('strong', '', ` ${count}`));
    append(extremes, extreme);
  }
  const panel = node('section', 'catalogue-overall-popover');
  panel.id = 'catalogue-language-ranking';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('aria-labelledby', 'catalogue-language-ranking-title');
  const title = node('h2', '', 'Differences in meaning by language');
  title.id = 'catalogue-language-ranking-title';
  const close = button('Close', 'catalogue-overall-close', () => panel.hidePopover());
  append(panel, append(node('div', 'catalogue-overall-popover-heading'), title, close),
    node('p', 'catalogue-overall-coverage',
      `Same ${plural(summary.completedActs, 'completed review')} · ${plural(summary.languages.length, 'language')}`));
  const list = node('ul', 'catalogue-overall-ranking');
  for (const language of summary.languages) {
    append(list, append(node('li'), node('span', '', language.name),
      node('strong', '', number(language.count))));
  }
  append(panel, list, node('p', 'catalogue-overall-note',
    `Each language-specific finding counts once. These counts describe this collection and do not measure overall translation quality. Languages unavailable in any included act are excluded.${summary.excludedActs ? ` ${plural(summary.excludedActs, 'other act')} excluded because review is unfinished.` : ''}`));
  const compare = button('Compare languages ▾', 'catalogue-overall-compare');
  compare.setAttribute('popovertarget', panel.id);
  compare.setAttribute('aria-controls', panel.id);
  compare.setAttribute('aria-expanded', 'false');
  function positionPanel() {
    if (!panel.matches(':popover-open')) return;
    const anchor = compare.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    panel.style.left = `${Math.max(12, Math.min(anchor.right - bounds.width, width - bounds.width - 12))}px`;
    panel.style.top = `${anchor.bottom + 8 + bounds.height <= height - 12
      ? anchor.bottom + 8 : Math.max(12, anchor.top - bounds.height - 8)}px`;
  }
  panel.addEventListener('toggle', event => {
    compare.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'open') positionPanel();
  });
  window.addEventListener('resize', positionPanel);
  append(host, node('p', 'catalogue-overall-title', 'Differences in meaning by language'), extremes, append(node('div', 'catalogue-overall-scope'),
    node('span', '', `${plural(summary.completedActs, 'completed act review')}`), compare),
    node('p', 'catalogue-overall-note', 'Counts within this collection; not a measure of overall translation quality.'), panel);
}

function languageDetails(act, summary) {
  if (!summary.languages.length) return null;
  const details = node('details', 'catalogue-languages');
  append(details, node('summary', '', `Across ${plural(summary.languages.length, 'language version')}`));
  const list = node('ul', 'catalogue-language-list');
  summary.languages.forEach(language => {
    const link = readerLink(act, `${language.name} ${language.count}`, 'catalogue-language-link', language.code);
    link.setAttribute('aria-label', `${language.name}: ${plural(language.count, 'difference in meaning', 'differences in meaning')}`);
    append(list, append(node('li'), link));
  });
  append(details, list);
  return details;
}

function reviewStatus(act, summary) {
  const label = act.status === 'partial' && summary.percentage !== null
    ? `Review in progress · ${number(summary.percentage)}% of comparisons checked`
    : summary.reviewLabel;
  const status = node('span', 'catalogue-status', label);
  if (act.status === 'partial' && summary.percentage !== null) {
    status.title = `${number(summary.reviewed)} of ${number(summary.total)} planned comparisons checked. Each checks one English passage against one other language version.`;
  }
  const state = summary.fullyReviewed ? 'complete' : act.status === 'complete' ? 'partial' : act.status;
  status.classList.add(`catalogue-status-${state}`);
  return status;
}

function completionBadges(act, summary) {
  const row = node('div', 'catalogue-status-row');
  row.setAttribute('aria-label', 'Review and impact assessment status');
  const coverage = summary.impactAssessment;
  const label = summary.count
    ? coverage.count ? `Impact ratings: ${number(summary.assessedCount)} of ${number(summary.count)} findings` : 'Impact assessment not started'
    : summary.fullyReviewed ? 'No differences to assess' : 'Impact assessment awaits findings';
  const status = node('span', `catalogue-status catalogue-status-${summary.assessedCount === summary.count && summary.count ? 'complete' : 'pending'}`, label);
  let detail = coverage.total
    ? `${number(coverage.count)} of ${number(coverage.total)} currently published findings have an impact assessment.`
    : summary.fullyReviewed
      ? 'There are no published findings to assess.'
      : 'Impact assessment is pending until reviewed findings are available.';
  if (summary.reviewingCount) {
    detail += ` ${plural(summary.reviewingCount, 'impact issue')} ${summary.reviewingCount === 1 ? 'remains' : 'remain'} under review without an assigned rating.`;
  }
  status.title = detail;
  status.setAttribute('aria-label', `${label}. ${detail}`);
  append(row, reviewStatus(act, summary), status);
  const notStarted = coverage.total - coverage.count;
  if (notStarted && coverage.count)
    append(row, node('p', 'catalogue-assessment-progress', `${number(notStarted)} not yet assessed`));
  return row;
}

function renderImpactDistribution(act, summary) {
  const wrapper = node('div', 'catalogue-impact-distribution');
  append(wrapper, node('p', 'catalogue-impact-label', 'Potential impact'));
  const bar = node('div', 'catalogue-impact-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `Potential impact among ${summary.count} published finding records: ${summary.distribution.map(segment => `${segment.label}: ${segment.count}`).join('; ')}.`);
  const legend = node('ul', 'catalogue-impact-legend');
  summary.distribution.filter(segment => segment.count).forEach(segment => {
    const mark = node('span', `catalogue-impact-segment impact-${segment.level}`);
    mark.style.width = `${segment.share * 100}%`;
    mark.setAttribute('aria-hidden', 'true');
    append(bar, mark);
    const link = readerLink(act, '', 'catalogue-impact-key', null, segment.level);
    if (segment.level !== 'unrated') link.href += '&view=impact';
    const swatch = node('span', `catalogue-impact-swatch impact-${segment.level}`);
    swatch.setAttribute('aria-hidden', 'true');
    append(link, swatch, node('span', '', `${segment.label} ${number(segment.count)}`));
    link.setAttribute('aria-label', `Open ${plural(segment.count, 'published finding')} with ${segment.level === 'unrated' ? 'no assigned impact rating' : segment.level === 'high' ? 'high potential impact' : `${segment.label.toLowerCase()} potential impact`}`);
    append(legend, append(node('li'), link));
  });
  return append(wrapper, bar, legend);
}

function renderAct(act, { hasRatings = false } = {}) {
  const introduction = actIntroduction(act);
  const summary = actSummary(act);
  const row = node('article', 'catalogue-act');
  const identity = node('div', 'catalogue-identity');
  const heading = node('h2', 'catalogue-title');
  append(heading, readerLink(act, introduction.label));
  append(identity, heading);
  if (introduction.description) append(identity, node('p', 'catalogue-description', introduction.description));
  const wordCount = englishWordCount(act);
  const version = renderSourceVersion(act, 'catalogue-version');
  if (wordCount !== null) {
    const length = node('span', '', ` · ${number(wordCount)} ${wordCount === 1 ? 'word' : 'words'} in English`);
    length.title = 'Count of the preserved English source text shown in the reader, including introductory text, annexes and footnotes where available. Whitespace separates words; numbers count and standalone punctuation does not.';
    append(version.querySelector('summary'), length);
  }
  append(identity, version, renderSourceScope(act));
  const facts = node('div', 'catalogue-facts');
  const top = node('div', 'catalogue-facts-heading');
  if (summary.count) {
    const count = node('p', 'catalogue-finding-count');
    append(count, node('strong', '', number(summary.count)), node('span', '', 'differences in meaning'));
    append(top, count);
    let impactNotice = null;
    if (summary.assessedCount) impactNotice = renderImpactDistribution(act, summary);
    else if (summary.reviewingCount) {
      impactNotice = readerLink(act, `${plural(summary.reviewingCount, 'impact issue')} under review`,
        'catalogue-unassessed', null, 'unrated');
      impactNotice.href += '&view=impact';
    } else if (hasRatings) impactNotice = readerLink(act, 'No impact rating yet',
      'catalogue-unassessed', null, 'unrated');
    append(facts, top, languageDetails(act, summary), completionBadges(act, summary), impactNotice);
  } else {
    append(top, node('p', 'catalogue-no-findings', summary.fullyReviewed ? 'No differences identified in the completed review' : 'No differences published yet · review unfinished'));
    append(facts, top, completionBadges(act, summary));
  }
  append(facts, readerLink(act,
    summary.count ? 'View differences →' : 'Read source text →', 'catalogue-read-link'));
  return append(row, identity, facts);
}

async function loadCatalogue() {
  const list = $('#catalogue-list');
  list.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./data/catalogue.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Collection unavailable');
    const catalogue = await response.json();
    const acts = catalogueLegislation(catalogue);
    const summary = catalogueSummary(acts);
    renderOverall(acts);
    $('#catalogue-total').textContent = `${plural(summary.acts, 'act')} · ${number(summary.findings)} differences in meaning · ${plural(summary.complete, 'complete review')}`;
    $('#catalogue-date').textContent = catalogue.generated_at ? `Website data exported ${prettyDate(catalogue.generated_at)}` : '';
    $('#catalogue-impact-note').textContent = summary.impact
      ? 'Potential impact is assessed separately by legal issue. Unranked issues remain under review.'
      : summary.findings
        ? 'No impact rating yet. An impact explanation may still be in progress.'
        : 'Potential impact is assessed separately when reviewed findings are available.';
    list.replaceChildren(...orderedActs(acts).map(act => renderAct(act, { hasRatings: Boolean(summary.impact) })));
    if (!acts.length) append(list, append(node('div', 'catalogue-empty'),
      node('h2', '', 'No legislation yet'),
      node('p', '', 'Source texts and reviewed findings will appear here when available.')));
  } catch {
    $('#catalogue-overall').hidden = true;
    $('#catalogue-total').textContent = 'Collection unavailable';
    $('#catalogue-date').textContent = '';
    list.replaceChildren(append(node('div', 'catalogue-empty'),
      node('h2', '', 'The collection could not be loaded'),
      node('p', '', 'Please check your connection and try again.'),
      button('Try again', 'catalogue-retry', loadCatalogue)));
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

$('#method-button').addEventListener('click', () => $('#method-dialog').showModal());
$('#count-guide-button').addEventListener('click', () => $('#method-dialog').showModal());
$('#close-method').addEventListener('click', () => $('#method-dialog').close());
$('#method-dialog').addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
});
window.addEventListener('hashchange', followLegacyLink);
if (!followLegacyLink()) loadCatalogue();
