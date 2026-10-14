/** The read-only catalogue front page. Requests use only the public static snapshot. */
import { catalogueLegislation } from './model.js';
import {
  actIntroduction, actSummary, catalogueSummary, orderedActs, readerHref, legacyReaderHref,
  englishWordCount
} from './catalogue-model.js';
import { node, append, button, prettyDate, plural } from './view.js';

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

function languageDetails(act, summary) {
  if (!summary.languages.length) return null;
  const details = node('details', 'catalogue-languages');
  append(details, node('summary', '', `${plural(summary.languages.length, 'language')} with findings`));
  const list = node('ul', 'catalogue-language-list');
  summary.languages.forEach(language => {
    const link = readerLink(act, `${language.name} ${language.count}`, 'catalogue-language-link', language.code);
    link.setAttribute('aria-label', `${language.name}: ${plural(language.count, 'language finding')}`);
    append(list, append(node('li'), link));
  });
  append(details, list);
  return details;
}

function reviewStatus(act, summary) {
  const label = act.status === 'partial' && summary.percentage !== null
    ? `${number(summary.percentage)}% reviewed`
    : summary.reviewLabel;
  const status = node('span', 'catalogue-status', label);
  if (act.status === 'partial' && summary.percentage !== null) {
    status.title = `${number(summary.reviewed)} of ${number(summary.total)} passage–language comparisons reviewed.`;
  }
  const state = summary.fullyReviewed ? 'complete' : act.status === 'complete' ? 'partial' : act.status;
  status.classList.add(`catalogue-status-${state}`);
  return status;
}

function renderImpactDistribution(act, summary) {
  const wrapper = node('div', 'catalogue-impact-distribution');
  append(wrapper, node('p', 'catalogue-impact-label', 'Potential impact · preliminary ratings'));
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
  append(heading, readerLink(act, introduction.title));
  append(identity, node('p', 'catalogue-reference', introduction.reference), heading);
  if (introduction.description) append(identity, node('p', 'catalogue-description', introduction.description));
  const wordCount = englishWordCount(act);
  const version = node('p', 'catalogue-version',
    `${act.version_label || 'Source version'}${act.version ? ` · ${prettyDate(act.version)}` : ''}`);
  if (wordCount !== null) {
    const length = node('span', '', ` · ${number(wordCount)} ${wordCount === 1 ? 'word' : 'words'} in English`);
    length.title = 'Count of the preserved English source text shown in the reader, including introductory text, annexes and footnotes where available. Whitespace separates words; numbers count and standalone punctuation does not.';
    append(version, length);
  }
  append(identity, version);
  const facts = node('div', 'catalogue-facts');
  const top = node('div', 'catalogue-facts-heading');
  if (summary.count) {
    const count = node('p', 'catalogue-finding-count');
    append(count, node('strong', '', number(summary.count)), node('span', '', 'language findings'));
    append(top, count, reviewStatus(act, summary));
    let impactNotice = null;
    if (summary.assessedCount) impactNotice = renderImpactDistribution(act, summary);
    else if (summary.reviewingCount) {
      impactNotice = readerLink(act, `${plural(summary.reviewingCount, 'impact issue')} under review`,
        'catalogue-unassessed', null, 'unrated');
      impactNotice.href += '&view=impact';
    } else if (hasRatings) impactNotice = readerLink(act, 'No impact rating yet',
      'catalogue-unassessed', null, 'unrated');
    append(facts, top, impactNotice, languageDetails(act, summary));
  } else {
    append(top, node('p', 'catalogue-no-findings', 'No published findings yet'), reviewStatus(act, summary));
    append(facts, top);
  }
  append(facts, readerLink(act,
    summary.count ? 'View findings →' : 'Read source text →', 'catalogue-read-link'));
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
    $('#catalogue-total').textContent = `${plural(summary.acts, 'act')} · ${number(summary.findings)} language findings · ${plural(summary.complete, 'complete review')}`;
    $('#catalogue-date').textContent = catalogue.generated_at ? `Snapshot ${prettyDate(catalogue.generated_at)}` : '';
    $('#catalogue-impact-note').textContent = summary.impact
      ? 'Potential impact is assessed separately by legal issue. MVP ratings are preliminary; unranked issues remain under review.'
      : summary.findings
        ? 'No impact rating yet. An impact explanation may still be in progress.'
        : 'Potential impact is assessed separately when reviewed findings are available.';
    list.replaceChildren(...orderedActs(acts).map(act => renderAct(act, { hasRatings: Boolean(summary.impact) })));
    if (!acts.length) append(list, append(node('div', 'catalogue-empty'),
      node('h2', '', 'No legislation yet'),
      node('p', '', 'Source texts and reviewed findings will appear here when available.')));
  } catch {
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
