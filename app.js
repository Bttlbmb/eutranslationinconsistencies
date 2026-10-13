import {catalogueLegislation, groupedFindings, highlightedSegments, sourceOccurrences, overlappingFindings, officialURL, archiveURL, selectedFromHash, completionMessage} from './model.js';

const $ = selector => document.querySelector(selector);
const state = {legislation: [], act: null, finding: null, query: '', findingsOnly: false, highlightsOnly: false};
let toastTimer;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}
function append(parent, ...children) { children.filter(Boolean).forEach(child => parent.append(child)); return parent; }
function button(text, className, handler, label) {
  const element = node('button', className, text);
  element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  if (handler) element.addEventListener('click', handler);
  return element;
}
function externalLink(text, value, className = 'source-link', accessibleLabel = text.replace(' ↗', '')) {
  const url = officialURL(value);
  if (!url) return null;
  const link = node('a', className, text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${accessibleLabel} (opens a new tab)`);
  return link;
}
function prettyDate(value, fallback = 'Not recorded') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(date);
}
function plural(count, singular, many = `${singular}s`) { return `${count} ${count === 1 ? singular : many}`; }
function category(value) { return (value || 'meaning').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()); }
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function changeSelection(act, finding = null, {scroll = false} = {}) {
  const trigger = document.activeElement;
  const navigationLabel = ['Previous finding', 'Next finding'].includes(trigger?.getAttribute('aria-label')) ? trigger.getAttribute('aria-label') : null;
  const fromComparison = Boolean(trigger?.closest('#comparison'));
  const fromLibrary = Boolean(trigger?.classList.contains('legislation-item'));
  const fromPassage = Boolean(trigger?.classList.contains('passage-highlight') || trigger?.classList.contains('passage-finding-link'));
  const changedAct = state.act?.id !== act?.id;
  const changedFinding = state.finding?.id !== finding?.id;
  state.act = act;
  state.finding = finding;
  if (changedAct) state.highlightsOnly = false;
  const params = new URLSearchParams();
  if (act) params.set('act', act.id);
  if (finding) params.set('finding', finding.id);
  if (location.hash.slice(1) !== params.toString()) history.pushState(null, '', `${location.pathname}${location.search}#${params}`);
  renderLibrary();
  if (changedAct) renderAct();
  else { renderToolbar(); renderComparison(); markSelectedHighlight(); }
  if (changedFinding) $('#comparison').scrollTop = 0;
  if (fromLibrary) $('.legislation-item[aria-current="true"]')?.focus({preventScroll: true});
  if (fromComparison || fromPassage) {
    const heading = $('#comparison h2');
    if (heading) heading.tabIndex = -1;
    const navigation = navigationLabel ? $(`#comparison button[aria-label="${navigationLabel}"]:not(:disabled)`) : null;
    (navigation || heading)?.focus({preventScroll: true});
  }
  if (scroll && finding) scrollToFinding(finding);
  if (changedAct) $('#reader').scrollTop = 0;
  $('#selection-status').textContent = finding ? `${finding.title}. Language comparison updated.` : `${act?.short_title || act?.title || 'Collection'} selected.`;
}
function scrollToFinding(finding, {behavior = 'smooth'} = {}) {
  const highlight = [...document.querySelectorAll('.passage-highlight')].find(item => item.dataset.findings.split(',').includes(finding.id));
  if (highlight && window.matchMedia('(min-width: 1051px)').matches) highlight.scrollIntoView({behavior, block: 'center'});
  else ($('#comparison h2') || $('#comparison')).scrollIntoView({behavior: 'auto', block: 'start'});
}
function markSelectedHighlight() {
  document.querySelectorAll('.passage-highlight').forEach(highlight => {
    const active = highlight.dataset.findings.split(',').includes(state.finding?.id);
    highlight.classList.toggle('selected', active);
    highlight.setAttribute('aria-pressed', String(active));
  });
}
function renderLibrary() {
  $('#library-count').textContent = state.legislation.length;
  $('#filter-all').classList.toggle('active', !state.findingsOnly);
  $('#filter-all').setAttribute('aria-pressed', String(!state.findingsOnly));
  $('#filter-findings').classList.toggle('active', state.findingsOnly);
  $('#filter-findings').setAttribute('aria-pressed', String(state.findingsOnly));
  const container = $('#legislation-list');
  container.replaceChildren();
  const query = state.query.toLocaleLowerCase();
  const filtered = state.legislation.filter(act => (!state.findingsOnly || groupedFindings(act).length) &&
    [act.title, act.short_title, act.celex, act.subject].filter(Boolean).join(' ').toLocaleLowerCase().includes(query));
  if (!filtered.length) {
    append(container, node('p', 'library-empty', state.legislation.length ? 'No legislation matches this view.' : 'The collection is awaiting its first source import.'));
    if (state.query || state.findingsOnly) append(container, button('Clear filters', 'text-button', () => { state.query = ''; state.findingsOnly = false; $('#search').value = ''; renderLibrary(); $('#search').focus(); }));
  }
  filtered.forEach((act, index) => {
    const findings = groupedFindings(act);
    const item = button('', `legislation-item${act.id === state.act?.id ? ' selected' : ''}`, () => changeSelection(act));
    item.setAttribute('aria-current', act.id === state.act?.id ? 'true' : 'false');
    const top = node('span', 'legislation-item-top');
    append(top, node('span', 'item-index', String(index + 1).padStart(2, '0')), node('span', `status-dot status-${act.status || 'imported'}`));
    append(item, top, node('span', 'legislation-name', act.short_title || act.title), node('span', 'legislation-subject', act.subject || act.title));
    append(item, node('span', 'legislation-item-bottom', findings.length ? `${plural(findings.length, 'finding')}  ↗` : act.status === 'complete' ? 'Review complete · no findings' : act.status === 'partial' ? 'Partially reviewed' : act.status === 'analyzing' ? 'Review in progress' : 'Awaiting analysis'));
    container.append(item);
  });
}
function renderAct() {
  const act = state.act;
  const heading = $('#document-heading');
  heading.replaceChildren();
  if (!act) { renderEmptyCollection(); return; }
  document.title = `${act.short_title || act.title} — Concordance`;
  const eyebrow = node('div', 'document-eyebrow');
  append(eyebrow, node('span', 'eyebrow', 'EUROPEAN UNION · LEGISLATION'), node('span', `status-label status-${act.status || 'imported'}`, completionMessage(act, groupedFindings(act))));
  const titleRow = node('div', 'document-title-row');
  append(titleRow, node('h2', '', act.short_title || act.title), externalLink('View on EUR-Lex ↗', act.source_url, 'official-button'));
  append(heading, eyebrow, titleRow, node('p', 'document-subtitle', act.title));
  const metadata = node('dl', 'metadata');
  for (const [label, value] of [['VERSION', `${act.version_label || 'Source version'}${act.version ? ` · ${prettyDate(act.version)}` : ''}`], ['LANGUAGES', `${(act.languages || []).length}${(act.coverage?.total_languages || 0) > (act.languages || []).length ? ` / ${act.coverage.total_languages}` : ''} archived`], ['RETRIEVED', prettyDate(act.retrieved_at)]]) {
    append(metadata, append(node('div'), node('dt', '', label), node('dd', '', value)));
  }
  append(heading, metadata);
  renderToolbar();
  renderReader();
  renderComparison();
}
function renderToolbar() {
  const toolbar = $('#reader-toolbar');
  toolbar.replaceChildren();
  toolbar.hidden = !state.act;
  if (!state.act) return;
  const findings = groupedFindings(state.act);
  const left = node('div', 'toolbar-left');
  append(left, node('span', 'language-monogram', 'EN'), node('span', 'toolbar-title', 'English reference text'));
  const english = (state.act.languages || []).find(language => language.code === 'en');
  const url = archiveURL(english?.text_url);
  if (url) {
    const download = node('a', 'download-link', 'Text file ↓');
    download.href = url;
    download.download = `${state.act.id}-en.txt`;
    append(left, download);
  }
  const right = node('div', 'toolbar-right');
  append(right, node('span', 'finding-count', plural(findings.length, 'finding')));
  const toggle = button(state.highlightsOnly ? 'Show full text' : 'Highlights only', 'highlight-toggle', () => { state.highlightsOnly = !state.highlightsOnly; renderToolbar(); renderReader(); $('.highlight-toggle').focus({preventScroll: true}); });
  toggle.setAttribute('aria-pressed', String(state.highlightsOnly));
  toggle.disabled = !findings.length;
  append(right, toggle);
  append(toolbar, left, right);
}
function renderReader() {
  const reader = $('#reader');
  reader.replaceChildren();
  const act = state.act;
  if (!act) return;
  const findings = groupedFindings(act);
  append(reader, append(node('div', 'reader-intro'), node('span', 'eyebrow', 'THE OFFICIAL TEXT'), node('span', 'reader-legend', 'Gold marks a potential difference')));
  const passages = Array.isArray(act.passages) ? act.passages : [];
  if (!passages.length) append(reader, node('p', 'reader-no-text', 'The English text is not yet available in this snapshot. Follow the official source link above to read the legislation.'));
  passages.forEach(passage => {
    const related = findings.filter(finding => finding.passage_id === passage.id);
    if (state.highlightsOnly && !related.length) return;
    const section = node('section', 'passage');
    section.id = `passage-${passage.id}`;
    const label = node('div', 'passage-label');
    append(label, node('h3', '', passage.label || 'Passage'));
    if (related.length) append(label, button(`${related.length} ${related.length === 1 ? 'finding' : 'findings'} ↗`, 'passage-finding-link', () => changeSelection(act, related[0], {scroll: true})));
    section.append(label);
    const paragraph = node('p', 'passage-text');
    highlightedSegments(passage.text || '', related).forEach(segment => {
      if (!segment.ids.length) paragraph.append(document.createTextNode(segment.text));
      else {
        const first = related.find(finding => finding.id === segment.ids[0]);
        const highlight = button(segment.text, 'passage-highlight', () => changeSelection(act, first, {scroll: !window.matchMedia('(min-width: 1051px)').matches}), `${segment.text}. Read finding: ${first.title}${segment.ids.length > 1 ? `; ${segment.ids.length} findings share this wording` : ''}`);
        highlight.dataset.findings = segment.ids.join(',');
        highlight.setAttribute('aria-controls', 'comparison');
        paragraph.append(highlight);
      }
    });
    append(section, paragraph);
    reader.append(section);
  });
  const end = node('div', 'reader-end');
  append(end, node('span', '', '§'), node('p', '', 'End of archived English text'), externalLink('Consult the official record ↗', act.source_url));
  reader.append(end);
  markSelectedHighlight();
}
function renderComparison() {
  const panel = $('#comparison');
  panel.replaceChildren();
  const act = state.act;
  if (!act) return;
  const findings = groupedFindings(act);
  const selected = state.finding;
  const panelTop = node('div', 'comparison-heading');
  append(panelTop, node('span', 'eyebrow', 'ACROSS LANGUAGES'), node('span', 'comparison-decoration', '↔'));
  panel.append(panelTop);
  if (!selected) {
    const intro = node('div', 'comparison-intro');
    append(intro, node('span', 'comparison-symbol', '≋'), node('h2', '', findings.length ? 'A closer look.' : act.status === 'complete' ? 'No findings in this review.' : 'The text is here.\nThe review comes next.'));
    const message = findings.length ? 'Select a highlighted passage to compare the original wording and explore its potential significance.' : act.status === 'complete' ? 'The review did not identify a supported substantial difference. This is a research result, not a guarantee that all language versions are equivalent.' : act.status === 'partial' ? 'This snapshot contains a partial review. No supported findings have been published so far; the remaining text has not been fully assessed.' : act.status === 'failed' ? 'The analysis was interrupted. Source texts remain available; no complete comparison is claimed.' : 'Official language versions are preserved below. Findings will appear after the independent analyses and evidence review have finished.';
    append(intro, node('p', '', message));
    panel.append(intro);
    if (findings.length) {
      const list = node('div', 'findings-index');
      append(list, node('h3', 'small-heading', 'EXPLORE THE FINDINGS'));
      findings.forEach((finding, index) => {
        const item = button('', 'finding-index-item', () => changeSelection(act, finding, {scroll: true}));
        append(item, node('span', 'finding-index-number', String(index + 1).padStart(2, '0')), append(node('span'), node('strong', '', finding.title), node('small', '', `${category(finding.category)} · ${plural(finding.variants.length, 'language')}`)), node('span', 'finding-index-arrow', '↗'));
        list.append(item);
      });
      panel.append(list);
    }
  } else {
    const index = findings.findIndex(finding => finding.id === selected.id);
    const navigation = node('div', 'finding-navigation');
    const back = button('←', 'icon-button', () => changeSelection(act, findings[index - 1], {scroll: true}), 'Previous finding');
    const next = button('→', 'icon-button', () => changeSelection(act, findings[index + 1], {scroll: true}), 'Next finding');
    back.disabled = index <= 0;
    next.disabled = index >= findings.length - 1;
    append(navigation, button('All findings', 'text-button', () => changeSelection(act)), append(node('div', 'finding-pager'), back, node('span', '', `${index + 1} / ${findings.length}`), next));
    panel.append(navigation);
    const detail = node('div', 'finding-detail');
    append(detail, node('span', 'category-tag', category(selected.category)), node('h2', '', selected.title), node('p', 'finding-explanation', selected.explanation));
    const anchor = node('details', 'english-anchor');
    append(anchor, node('summary', '', 'English passage'), node('blockquote', '', selected.english_quote));
    const passage = act.passages.find(item => item.id === selected.passage_id);
    const occurrences = sourceOccurrences(passage?.text || '', selected.english_quote).length;
    if (occurrences > 1) append(anchor, node('p', 'repeated-wording-note', `This wording occurs ${occurrences} times in this passage; see the explanation for the affected context.`));
    append(detail, anchor);
    const overlaps = overlappingFindings(act, selected);
    if (overlaps.length > 1) {
      const disclosure = node('details', 'overlap-disclosure');
      append(disclosure, node('summary', '', `Related findings (${overlaps.length})`));
      const choices = node('div', 'overlap-choices');
      overlaps.forEach(finding => {
        const choice = button(finding.title, 'finding-choice', () => changeSelection(act, finding));
        choice.setAttribute('aria-pressed', String(finding.id === selected.id));
        append(choices, choice);
      });
      append(disclosure, choices);
      append(detail, disclosure);
    }
    append(detail, node('div', 'variant-heading', plural(selected.variants.length, 'language version')));
    selected.variants.forEach(variant => {
      const card = node('article', 'variant-card');
      const top = node('div', 'variant-title');
      append(top, append(node('div', 'variant-language'), node('span', 'language-monogram', (variant.language || '?').toUpperCase()), node('h3', '', variant.language_name || variant.language)), externalLink('Source ↗', variant.source_url, 'source-link', `Read the official ${variant.language_name || variant.language} source`));
      const quote = node('blockquote', 'original-quote', variant.quote);
      quote.lang = variant.language || '';
      const variantTitle = variant.finding_title && variant.finding_title !== selected.title ? node('h4', 'variant-finding-title', variant.finding_title) : null;
      append(card, top, variantTitle, quote, node('div', 'translation-label', 'ENGLISH TRANSLATION'), node('p', 'translated-quote', variant.translation), append(node('div', 'difference-explanation'), node('span', '', 'THE POTENTIAL DIFFERENCE'), node('p', '', variant.explanation)));
      detail.append(card);
    });
    const review = node('div', 'review-note');
    append(review, node('strong', '', '✓  Independently cross-checked'), node('p', '', selected.review?.method || 'Independent model analysis with evidence review'));
    if (selected.review?.models?.length) append(review, node('p', 'review-models', `Models: ${selected.review.models.join(' · ')}`));
    if (selected.review?.reviewed_at) append(review, node('p', 'review-models', `Reviewed ${prettyDate(selected.review.reviewed_at)}`));
    append(review, button('Copy link to this finding ↗', 'text-button', async () => {
      try { await navigator.clipboard.writeText(location.href); toast('Finding link copied'); }
      catch { toast('Copy the address from your browser to share this finding.'); }
    }));
    append(detail, review, node('p', 'interpretation-note', 'A potential difference in meaning, not an adjudicated legal error. English is the reading reference; all official versions have equal authority.'));
    panel.append(detail);
  }
  append(panel, renderCoverage(act), renderArchives(act));
}
function renderCoverage(act) {
  const coverage = act.coverage || {};
  const reviewed = Number(coverage.reviewed_units) || 0;
  const total = Number(coverage.total_units) || 0;
  const wrapper = node('div', 'coverage-card');
  const top = node('div', 'coverage-top');
  append(top, node('h3', 'small-heading', 'REVIEW COVERAGE'), node('span', '', total ? `${Math.min(100, Math.round(reviewed / total * 100))}%` : 'Pending'));
  const track = node('div', 'coverage-track');
  const fill = node('span');
  fill.style.width = `${total ? Math.max(0, Math.min(100, reviewed / total * 100)) : 0}%`;
  track.append(fill);
  append(wrapper, top, track, node('p', '', total ? `${reviewed} of ${total} comparison units reviewed` : 'No comparison units reviewed yet'));
  if (coverage.total_languages) append(wrapper, node('p', 'coverage-languages', `${coverage.reviewed_languages || 0} of ${coverage.total_languages} languages reviewed`));
  const incompleteLanguages = (act.languages || []).filter(language => language.coverage_incomplete);
  if (incompleteLanguages.length) append(wrapper, node('p', 'source-coverage-warning', `${incompleteLanguages.map(language => language.name || language.code).join(', ')}: the archived source contains incomplete language coverage. See the source archive notes below.`));
  if (act.notes?.length) {
    const notes = node('details', 'source-notes');
    append(notes, node('summary', '', 'Analysis notes'));
    act.notes.forEach(note => append(notes, node('p', '', typeof note === 'string' ? note : note.message || JSON.stringify(note))));
    wrapper.append(notes);
  }
  return wrapper;
}
function renderArchives(act) {
  const details = node('details', 'archives');
  append(details, node('summary', '', `Source archive · ${plural((act.languages || []).length, 'language')}`));
  append(details, node('p', '', 'Preserved plain-text copies of the analyzed source version.'));
  const list = node('div', 'archive-list');
  (act.languages || []).forEach(language => {
    const line = node('div', 'archive-language');
    append(line, node('span', '', language.name || language.code));
    const links = node('span');
    const url = archiveURL(language.text_url);
    if (url) {
      const download = node('a', '', 'TXT ↓');
      download.href = url;
      download.download = `${act.id}-${language.code}.txt`;
      download.setAttribute('aria-label', `Download ${language.name || language.code} text`);
      append(links, download);
    }
    append(links, externalLink('EUR-Lex ↗', language.source_url, 'source-link', `Read ${language.name || language.code} on EUR-Lex`));
    append(line, links);
    list.append(line);
    if (language.coverage_incomplete || language.notes?.length) append(list, node('p', 'archive-language-note', (language.notes || []).join(' ') || 'The official source contains incomplete language coverage.'));
  });
  append(details, list);
  if (act.failed_languages?.length) {
    append(details, node('h4', 'small-heading', 'SOURCE RETRIEVAL INCOMPLETE'));
    act.failed_languages.forEach(language => append(details, node('p', 'unavailable-language', `${language.name || language.code}: ${language.reason || 'The official source could not be retrieved for this snapshot.'}`)));
  }
  if (act.unavailable_languages?.length) {
    append(details, node('h4', 'small-heading', 'UNAVAILABLE IN THIS SNAPSHOT'));
    act.unavailable_languages.forEach(language => append(details, node('p', 'unavailable-language', `${language.name || language.code}: ${language.reason || 'No source available'}`)));
  }
  return details;
}
function renderEmptyCollection(error) {
  $('#reader-toolbar').hidden = true;
  $('#document-heading').replaceChildren();
  $('#comparison').replaceChildren();
  const empty = node('div', 'collection-empty');
  append(empty, node('span', 'empty-glyph', '≋'), node('p', 'eyebrow', 'THE COLLECTION'), node('h2', '', error ? 'The collection is unavailable.' : 'Every language.\nThe same attention.'), node('p', '', error || 'No legislation has been published yet. Archived source texts and reviewed findings will appear here after the first local analysis.'));
  if (error) append(empty, button('Try again ↗', 'official-button', loadCatalogue));
  $('#reader').replaceChildren(empty);
}
async function loadCatalogue() {
  try {
    const response = await fetch('./data/catalogue.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error(`The collection could not be loaded (${response.status}).`);
    const catalogue = await response.json();
    state.legislation = catalogueLegislation(catalogue);
    const selected = selectedFromHash(location.hash, state.legislation);
    state.act = selected.act;
    state.finding = selected.finding;
    $('#snapshot-date').textContent = catalogue.generated_at ? `Snapshot · ${prettyDate(catalogue.generated_at)}` : 'Read-only research collection';
    renderLibrary();
    renderAct();
    if (state.finding) requestAnimationFrame(() => scrollToFinding(state.finding, {behavior: 'auto'}));
  } catch (error) {
    $('#legislation-list').replaceChildren(node('p', 'library-empty', 'The collection could not be loaded.'));
    renderEmptyCollection(error.message === 'Failed to fetch' ? 'Please check your connection and try again.' : error.message);
  }
}
$('#search').addEventListener('input', event => { state.query = event.target.value; renderLibrary(); });
$('#filter-all').addEventListener('click', () => { state.findingsOnly = false; renderLibrary(); });
$('#filter-findings').addEventListener('click', () => { state.findingsOnly = true; renderLibrary(); });
$('#method-button').addEventListener('click', () => $('#method-dialog').showModal());
$('#close-method').addEventListener('click', () => $('#method-dialog').close());
$('#method-dialog').addEventListener('click', event => { if (event.target === $('#method-dialog')) { const bounds = event.target.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close(); } });
window.addEventListener('popstate', () => { const selected = selectedFromHash(location.hash, state.legislation); state.act = selected.act; state.finding = selected.finding; state.highlightsOnly = false; renderLibrary(); renderAct(); if (state.finding) requestAnimationFrame(() => scrollToFinding(state.finding, {behavior: 'auto'})); });
loadCatalogue();
