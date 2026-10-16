/** The read-only catalogue front page. Requests use only the public static snapshot. */
import { catalogueLegislation } from './model.js?v=8';
import {
  actIntroduction, actSummary, catalogueSummary, readerHref, legacyReaderHref,
  englishWordCount, overallLanguageSummary, processingCost, collectionProcessingCost, formatUsd,
  estimatedProcessingCost, collectionEstimatedProcessingCost, formatEstimatedUsd,
  sortOptions, parseSort, sortParam, sortActs
} from './catalogue-model.js?v=12';
import { node, append, button, prettyDate, plural, renderSourceVersion, renderSourceScope } from './view.js?v=9';

const $ = selector => document.querySelector(selector);
const number = value => new Intl.NumberFormat('en-GB').format(value);
const impactLegendLabels = Object.freeze({
  major: 'Major', limited: 'Limited', unrated: 'No impact rating yet'
});

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
  const compare = button('Compare all ▾', 'catalogue-overall-compare');
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
  append(extremes, compare);
  append(host, node('p', 'catalogue-overall-title',
    `Differences by language, across the ${plural(summary.completedActs, 'complete review')}`), extremes, panel);
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
  const state = summary.fullyReviewed ? 'complete' : act.status === 'complete' ? 'partial' : act.status;
  const status = node('p', `catalogue-review catalogue-review-${state}`);
  status.title = 'Counts non-English language versions fully compared with English. Completion applies to the selected text version and source scope; incomplete does not mean a review is running.';
  append(status, append(node('span'), node('strong', '', summary.reviewState), ` · ${summary.reviewedLanguagesLabel}`));
  return status;
}

function renderImpactDistribution(act, summary) {
  const wrapper = node('div', 'catalogue-impact-distribution');
  const bar = node('div', 'catalogue-impact-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `Impact ratings among ${summary.count} published finding records: ${summary.distribution.map(segment => `${impactLegendLabels[segment.level]}: ${segment.count}`).join('; ')}.`);
  const legend = node('ul', 'catalogue-impact-legend');
  legend.setAttribute('aria-label', 'Impact');
  summary.distribution.filter(segment => segment.count).forEach(segment => {
    const label = impactLegendLabels[segment.level];
    const mark = node('span', `catalogue-impact-segment impact-${segment.level}`);
    mark.style.width = `${segment.share * 100}%`;
    mark.setAttribute('aria-hidden', 'true');
    append(bar, mark);
    const link = readerLink(act, '', `catalogue-impact-key impact-key-${segment.level}`, null, segment.level);
    if (segment.level !== 'unrated') link.href += '&view=impact';
    const swatch = node('span', `catalogue-impact-swatch impact-${segment.level}`);
    swatch.setAttribute('aria-hidden', 'true');
    append(link, swatch, node('span', '', `${label} ${number(segment.count)}`));
    link.setAttribute('aria-label', segment.level === 'unrated'
      ? `Open ${plural(segment.count, 'published finding')} with no impact rating yet`
      : `Open ${plural(segment.count, 'published finding')} with ${label.toLowerCase()} impact`);
    append(legend, append(node('li'), link));
  });
  return append(wrapper, bar, legend);
}

function renderAct(act) {
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
  const versionLine = version.querySelector('summary') || version.firstElementChild;
  if (wordCount !== null) {
    const length = node('span', '', ` · ${number(wordCount)} ${wordCount === 1 ? 'word' : 'words'} in English`);
    length.title = 'Count of the preserved English source text shown in the reader, including introductory text, annexes and footnotes where available. Whitespace separates words; numbers count and standalone punctuation does not.';
    append(versionLine, length);
  }
  const cost = processingCost(act);
  if (cost !== null) {
    const spent = node('span', '', ` · ${formatUsd(cost)} AI processing`);
    spent.title = 'Metered API cost of this review. Source audits ran on a subscription and are not included; Review and sources gives details.';
    append(versionLine, spent);
  } else if (estimatedProcessingCost(act) !== null) {
    const estimate = node('span', '', ` · ${formatEstimatedUsd(estimatedProcessingCost(act))} AI processing`);
    estimate.title = 'Estimated equivalent API cost based on saved review usage, including the source audit. The review ran through a subscription; this is not an actual API charge. Review and sources gives details.';
    append(versionLine, estimate);
  }
  append(identity, version, renderSourceScope(act));
  const facts = node('div', 'catalogue-facts');
  const top = node('div', 'catalogue-facts-heading');
  if (summary.count) {
    const count = node('p', 'catalogue-finding-count');
    const link = readerLink(act, '', 'catalogue-count-link');
    append(link, node('strong', '', number(summary.count)),
      node('span', '', summary.count === 1 ? 'difference in meaning' : 'differences in meaning'),
      node('span', 'catalogue-count-arrow', '→'));
    append(top, append(count, link));
    let impactNotice = renderImpactDistribution(act, summary);
    if (!summary.assessedCount && summary.reviewingCount) {
      const notice = summary.reassessmentCount === summary.reviewingCount
        ? `${plural(summary.reassessmentCount, 'earlier assessment')} awaiting reassessment`
        : `${plural(summary.reviewingCount, 'impact issue')} awaiting rating`;
      impactNotice = readerLink(act, notice,
        'catalogue-unassessed', null, 'unrated');
      impactNotice.href += '&view=impact';
    }
    append(facts, top, reviewStatus(act, summary), impactNotice, languageDetails(act, summary));
  } else {
    append(top, node('p', 'catalogue-no-findings', summary.fullyReviewed ? 'No differences identified in the completed review' : 'No differences published yet · review unfinished'));
    append(facts, top, reviewStatus(act, summary), readerLink(act, 'Read source text →', 'catalogue-read-link'));
  }
  return append(row, identity, facts);
}

// Cards are rendered once and only reordered, so open disclosures survive a sort.
const renderedActs = new Map();
let collection = [];

function sortLabel(option, sort) {
  if (option.key !== sort.key || option.key === 'status') return option.label;
  return `${option.label} ${sort.direction === 'asc' ? '↑' : '↓'}`;
}

function showSorted() {
  const sort = parseSort(location.search);
  $('#catalogue-list').replaceChildren(...sortActs(collection, sort).map(act => renderedActs.get(act.id)));
  for (const control of document.querySelectorAll('#catalogue-sort button')) {
    const option = sortOptions.find(item => item.key === control.dataset.sort);
    const active = option.key === sort.key;
    control.textContent = sortLabel(option, sort);
    control.setAttribute('aria-pressed', String(active));
    control.setAttribute('aria-label', active && option.key !== 'status'
      ? `${option.label}, ${sort.direction === 'asc' ? option.ascending : option.descending}. Select to reverse.`
      : option.label);
  }
}

function renderSortControl() {
  const host = $('#catalogue-sort');
  host.replaceChildren(node('span', 'catalogue-sort-label', 'Sort by'));
  for (const option of sortOptions) {
    const control = button(option.label, 'catalogue-sort-option', () => {
      const current = parseSort(location.search);
      const next = option.key === current.key
        ? { key: option.key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key: option.key, direction: 'desc' };
      const url = new URL(location.href);
      const value = sortParam(next);
      if (value) url.searchParams.set('sort', value);
      else url.searchParams.delete('sort');
      history.replaceState(null, '', url);
      showSorted();
    });
    control.dataset.sort = option.key;
    host.append(control);
  }
  host.hidden = collection.length < 2;
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
    const totalCost = collectionProcessingCost(acts);
    const estimatedCost = collectionEstimatedProcessingCost(acts);
    const costs = [totalCost === null ? null : formatUsd(totalCost), estimatedCost === null ? null : formatEstimatedUsd(estimatedCost)].filter(Boolean);
    $('#catalogue-total').textContent = `${plural(summary.acts, 'act')} · ${number(summary.findings)} differences in meaning · ${plural(summary.complete, 'complete review')}${costs.length ? ` · ${costs.join(' + ')} AI processing` : ''}`;
    $('#catalogue-date').textContent = catalogue.generated_at ? `Website data exported ${prettyDate(catalogue.generated_at)}` : '';
    collection = acts;
    renderedActs.clear();
    acts.forEach(act => renderedActs.set(act.id, renderAct(act)));
    renderSortControl();
    showSorted();
    if (!acts.length) append(list, append(node('div', 'catalogue-empty'),
      node('h2', '', 'No legislation yet'),
      node('p', '', 'Source texts and reviewed findings will appear here when available.')));
  } catch {
    $('#catalogue-overall').hidden = true;
    $('#catalogue-sort').hidden = true;
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
$('#close-method').addEventListener('click', () => $('#method-dialog').close());
$('#method-dialog').addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
});
window.addEventListener('hashchange', followLegacyLink);
if (!followLegacyLink()) loadCatalogue();
