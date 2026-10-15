/** Reader controller: selection, browser history and the two reading panes.
 * Build checks verify the evidence; rendering still treats every string as text.
 */
import {
  catalogueLegislation,
  focusLanguageIndex,
  groupedFindings,
  focusedFindingTitle,
  findingCounts,
  comparedWording,
  impactDisplayLabel,
  impactFamilies,
  impactFocusedFindings,
  highlightedSegments,
  passageRows,
  sourceOccurrences,
  overlappingFindings,
  selectedFromHash,
  selectionHash
} from './model.js?v=3';
import {
  node,
  append,
  button,
  externalLink,
  prettyDate,
  plural,
  renderReviewSources,
  wordingQuote,
  explanationParagraph,
  renderSourceVersion,
  renderSourceScope
} from './view.js?v=3';
import { actIntroduction, actSummary } from './catalogue-model.js?v=3';

const $ = (selector) => document.querySelector(selector);
const state = {
  legislation: [],
  act: null,
  finding: null,
  issue: null,
  issueFindingId: null,
  view: 'text',
  language: null,
  impact: null,
  query: '',
  highlightsOnly: false
};
let toastTimer;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function displayedFindings(act) {
  const findings = impactFocusedFindings(act, state.impact);
  if (!state.language) return findings;
  return findings.filter((finding) =>
    finding.variants.some((variant) => variant.language === state.language)
  );
}
function displayedFindingTitle(finding) {
  return focusedFindingTitle(finding, state.language);
}
function displayedImpactFamilies(act) {
  const families = impactFamilies(act);
  return families.filter((family) =>
    (!state.language || family.languages.includes(state.language)) &&
    (!state.impact || (state.impact === 'unrated'
      ? family.impact_level === null : family.impact_level === state.impact))
  );
}
function issueMember(family, preferredId = null) {
  return family?.members.find((member) => member.id === preferredId &&
    (!state.language || member.variants.some((variant) => variant.language === state.language))) ||
    family?.members.find((member) =>
      !state.language || member.variants.some((variant) => variant.language === state.language)) || null;
}
function focusedLanguage(act = state.act) {
  return focusLanguageIndex(act).find((language) => language.code === state.language) || null;
}
function focusedEmptyState(act, language) {
  const name = language.name;
  if (language.availability === 'unavailable')
    return {
      title: `${name} source unavailable`,
      message: language.reason || 'No official expression is available for this source version.',
      summary: `${name} source unavailable`
    };
  if (language.availability === 'failed')
    return {
      title: `${name} source retrieval failed`,
      message: language.reason || 'The official expression could not be preserved for this snapshot.',
      summary: `${name} source retrieval failed`
    };
  const title = `No differences identified for ${name}`;
  if (language.coverageIncomplete)
    return {
      title,
      message: 'No supported finding has been published for this language. The archived source has incomplete language coverage; check Source archive.',
      summary: `No ${name} findings published · source incomplete`
    };
  if (language.reviewState === 'complete')
    return {
      title,
      message: 'No supported difference in meaning was identified for this language in the completed review. This does not establish equivalence.',
      summary: `No ${name} findings · review complete`
    };
  const reviewState = {
    partial: ['The review is partial', 'partial review'],
    analyzing: ['The review is in progress', 'review in progress'],
    failed: ['The review was interrupted', 'review interrupted'],
    imported: ['The review has not started', 'review pending']
  }[act.status] || ['The review is incomplete', 'review incomplete'];
  return {
    title,
    message: `No supported finding has been published for this language. ${reviewState[0]}; check Review coverage.`,
    summary: `No ${name} findings published · ${reviewState[1]}`
  };
}
// Finding groups have a canonical ID plus aliases for older shared links.
function updateSelectionHash() {
  const hash = selectionHash(state);
  if (location.hash.slice(1) !== hash)
    history.pushState(null, '', `${location.pathname}${location.search}#${hash}`);
}
function changeSelection(act, finding = null, { scroll = false, issue = null, issueFindingId = null, view = 'text' } = {}) {
  const trigger = document.activeElement;
  const navigationLabel = ['Previous finding', 'Next finding', 'Previous issue', 'Next issue'].includes(
    trigger?.getAttribute('aria-label')
  )
    ? trigger.getAttribute('aria-label')
    : null;
  const fromComparison = Boolean(trigger?.closest('#comparison'));
  const fromLibrary = Boolean(trigger?.classList.contains('legislation-item'));
  const fromPassage = Boolean(trigger?.classList.contains('passage-highlight'));
  const changedAct = state.act?.id !== act?.id;
  const priorIssueId = state.issue?.id;
  state.act = act;
  state.view = view;
  state.issue = issue;
  state.issueFindingId = issueFindingId;
  if (changedAct) {
    state.highlightsOnly = false;
    if (state.language && !focusedLanguage(act)) state.language = null;
  }
  if (
    finding &&
    state.language &&
    !finding.variants.some((variant) => variant.language === state.language)
  )
    state.language = null;
  const changedFinding = state.finding?.id !== finding?.id || priorIssueId !== issue?.id;
  state.finding = finding;
  if ($('#focus-language-select')) $('#focus-language-select').value = state.language || '';
  if ($('#focus-impact-select')) $('#focus-impact-select').value = state.impact || '';
  updateSelectionHash();
  renderLibrary();
  if (changedAct) renderAct();
  else {
    renderToolbar();
    renderComparison();
    markSelectedHighlight();
  }
  if (changedFinding) $('#comparison').scrollTop = 0;
  if (fromLibrary) {
    $('#act-picker').open = false;
    $('#act-picker-label').focus({ preventScroll: true });
  }
  if (fromComparison || fromPassage) {
    const heading = $('#comparison .finding-detail > h2, #comparison .comparison-intro > h2, #review-status h2');
    if (heading) heading.tabIndex = -1;
    const navigation = navigationLabel
      ? $(`#comparison button[aria-label="${navigationLabel}"]:not(:disabled)`)
      : null;
    (navigation || heading)?.focus({ preventScroll: true });
  }
  if (changedAct) $('#reader').scrollTop = 0;
  if ((scroll || changedAct) && finding)
    requestAnimationFrame(() =>
      scrollToFinding(finding, { behavior: changedAct ? 'auto' : 'smooth' })
    );
  $('#selection-status').textContent = issue
    ? `${issue.title}. Potential impact and language evidence updated.`
    : finding
    ? `${finding.title}. Language comparison updated.`
    : `${act?.short_title || act?.title || 'Collection'} selected.`;
}
function changeImpactSelection(family, preferredId = null, { scroll = true } = {}) {
  const member = issueMember(family, preferredId);
  if (!member) return;
  const finding = displayedFindings(state.act).find((group) => group.aliases.includes(member.id));
  changeSelection(state.act, finding, {
    scroll,
    view: 'impact',
    issue: family,
    issueFindingId: member.id
  });
}
function reconcileFocusedSelection() {
  const visibleFindings = displayedFindings(state.act);
  if (state.view === 'impact') {
    const family = displayedImpactFamilies(state.act).find((item) => item.id === state.issue?.id);
    if (family) {
      const member = issueMember(family, state.issueFindingId);
      state.issue = family;
      state.issueFindingId = member?.id || null;
      state.finding = visibleFindings.find((group) =>
        group.aliases.includes(member?.id)) || null;
    } else {
      state.issue = null;
      state.issueFindingId = null;
      state.finding = null;
    }
  } else {
    if (state.finding)
      state.finding = visibleFindings.find((finding) =>
        state.finding.aliases.some((id) => finding.aliases.includes(id))) || visibleFindings[0] || null;
  }
  if (!visibleFindings.length) state.highlightsOnly = false;
  return visibleFindings;
}
function renderFocusChange() {
  updateSelectionHash();
  renderLibrary();
  renderAct();
  $('#comparison').scrollTop = 0;
  if (state.finding) scrollToFinding(state.finding);
}
function changeLanguage(code) {
  const languages = focusLanguageIndex(state.act);
  if (code && !languages.some((language) => language.code === code)) return;
  state.language = code;
  const visibleFindings = reconcileFocusedSelection();
  renderFocusChange();
  $('#focus-language-select')?.focus({ preventScroll: true });
  const selected = languages.find((language) => language.code === code);
  $('#selection-status').textContent = selected
    ? `${selected.name}: ${plural(visibleFindings.length, 'comparison group')} shown.`
    : 'Findings in all languages shown.';
}
function changeImpact(level) {
  if (level && !['high', 'moderate', 'limited', 'unrated'].includes(level)) return;
  state.impact = level;
  const visibleFindings = reconcileFocusedSelection();
  renderFocusChange();
  const control = $('#focus-impact-select');
  const disclosure = control?.closest('details');
  if (disclosure) disclosure.open = true;
  control?.focus({ preventScroll: true });
  $('#selection-status').textContent = level
    ? `${impactFocusLabel(level)}: ${plural(visibleFindings.length, 'comparison group')} shown.`
    : 'Findings at all impact levels, including those without an assigned rating, shown.';
}
function scrollToFinding(finding, { behavior = 'smooth', onlyIfOutside = false, sourceOnly = false } = {}) {
  const reader = $('#reader');
  const passage = document.getElementById(`passage-${finding.passage_id}`);
  const highlight = [...(passage?.querySelectorAll('.passage-highlight') || [])].find((item) =>
    item.dataset.findings.split(',').includes(finding.id)
  );
  const desktop = window.matchMedia('(min-width: 901px)').matches;
  if (highlight) {
    const bounds = reader.getBoundingClientRect();
    const quote = highlight.getBoundingClientRect();
    if (onlyIfOutside && quote.top >= bounds.top && quote.bottom <= bounds.bottom) return;
    reader.style.removeProperty('--finding-scroll-space');
    const top = reader.scrollTop + highlight.getBoundingClientRect().top - bounds.top -
      Math.min(120, reader.clientHeight / 4);
    // A quote near the end needs enough trailing room to sit beside its
    // comparison, rather than being clamped to the bottom of the source pane.
    const space = Math.max(0, top - (reader.scrollHeight - reader.clientHeight));
    if (space) reader.style.setProperty('--finding-scroll-space', `${Math.ceil(space)}px`);
    // Scroll only the source pane, with context above the first exact occurrence.
    // scrollIntoView can also move the page and the fixed pane toolbars.
    reader.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior
    });
  }
  if ((!highlight || !desktop) && !onlyIfOutside && !sourceOnly)
    (
      $('#comparison .finding-detail > h2, #comparison .comparison-intro > h2') || $('#comparison')
    ).scrollIntoView({ behavior: 'auto', block: 'start' });
}
function markSelectedHighlight() {
  if (!state.finding) $('#reader').style.removeProperty('--finding-scroll-space');
  document.querySelectorAll('.passage-highlight').forEach((highlight) => {
    const active = highlight.dataset.findings.split(',').includes(state.finding?.id);
    highlight.classList.toggle('selected', active);
    if (active) highlight.setAttribute('aria-current', 'true');
    else highlight.removeAttribute('aria-current');
  });
  document
    .querySelectorAll('.passage-anchor')
    .forEach((anchor) =>
      anchor.setAttribute('aria-pressed', String(anchor.dataset.finding === state.finding?.id))
    );
}
function renderLibrary() {
  const container = $('#legislation-list');
  container.replaceChildren();
  const query = state.query.toLocaleLowerCase();
  const filtered = state.legislation.filter((act) =>
    [act.title, act.short_title, act.celex, act.subject]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  );
  if (!filtered.length) {
    append(
      container,
      node(
        'p',
        'library-empty',
        state.legislation.length
          ? 'No legislation matches this view.'
          : 'The collection is awaiting its first source import.'
      )
    );
    if (state.query)
      append(
        container,
        button('Clear search', 'text-button', () => {
          state.query = '';
          $('#search').value = '';
          renderLibrary();
          $('#search').focus();
        })
      );
  }
  filtered.forEach((act) => {
    const findings = displayedFindings(act);
    const focus = focusedLanguage(act);
    let summary;
    if (state.impact && state.language && !focus)
      summary = `${state.language.toUpperCase()} not listed for this act`;
    else if (state.impact)
      summary = findings.length
        ? `${plural(findings.length, 'comparison group')} · ${impactFocusLabel(state.impact)}${focus ? ` · ${focus.name}` : ''}`
        : `No findings match ${impactFocusLabel(state.impact).toLowerCase()}${focus ? ` · ${focus.name}` : ''}`;
    else if (state.language)
      summary = focus
        ? findings.length
          ? `${focus.name} · ${plural(findings.length, 'comparison group')}`
          : focusedEmptyState(act, focus).summary
        : `${focusedLanguage()?.name || state.language.toUpperCase()} not listed for this act`;
    else
      summary = findings.length
        ? plural(findings.length, 'comparison group')
        : act.status === 'complete'
          ? 'Review complete · no differences identified'
          : act.status === 'partial'
            ? 'Partially reviewed'
            : act.status === 'analyzing'
              ? 'Review in progress'
              : act.status === 'failed'
                ? 'Review interrupted'
                : 'Awaiting analysis';
    const item = button('', `legislation-item${act.id === state.act?.id ? ' selected' : ''}`, () =>
      changeSelection(act)
    );
    item.setAttribute('aria-current', act.id === state.act?.id ? 'true' : 'false');
    const introduction = actIntroduction(act);
    append(item, node('span', 'legislation-name', introduction.title));
    append(
      item,
      node('span', 'legislation-item-bottom', `${introduction.reference} · ${summary}`)
    );
    container.append(item);
  });
}
function renderAct() {
  const act = state.act;
  const heading = $('#document-heading');
  heading.replaceChildren();
  $('#act-picker-label').textContent = act ? actIntroduction(act).reference : 'Choose legislation';
  if (!act) {
    renderEmptyCollection();
    return;
  }
  const introduction = actIntroduction(act);
  const summary = actSummary(act);
  document.title = `${introduction.title} · EU Translation Inconsistencies`;
  const identity = node('div', 'document-identity');
  append(
    identity,
    node('h1', 'document-subject', introduction.title),
    renderSourceVersion(act, 'document-meta'),
    renderSourceScope(act)
  );
  const reviewLabel = act.status === 'partial' && summary.percentage !== null
    ? `Review in progress · ${summary.percentage}% of comparisons checked` : summary.reviewLabel;
  const reviewStatus = node('span', `document-review-state status-${summary.fullyReviewed ? 'complete' : act.status === 'complete' ? 'partial' : act.status}`, reviewLabel);
  reviewStatus.title = 'Completion applies to this text version and available source scope. Each comparison checks one English passage against one other language version.';
  append(heading, identity, reviewStatus);
  renderToolbar();
  renderReader();
  renderComparison();
}
function renderFocusControls(act) {
  const controls = node('div', 'comparison-filters');
  const focus = node('label', 'focus-language-control');
  const select = node('select', 'focus-language-select');
  select.id = 'focus-language-select';
  select.setAttribute('aria-label', 'Focus language');
  select.setAttribute('aria-describedby', 'language-count-note');
  const availableFindings = impactFocusedFindings(act, state.impact);
  const languages = focusLanguageIndex(act).map(language => ({
    ...language, count: findingCounts(availableFindings, language.code).findings
  }));
  append(select, node('option', '', `All languages (${findingCounts(availableFindings).findings})`));
  select.options[0].value = '';
  languages.forEach((language) => {
    const suffix = language.availability === 'unavailable'
      ? ' · source unavailable'
      : language.availability === 'failed'
        ? ' · source retrieval failed'
        : language.coverageIncomplete
          ? ' · incomplete source'
          : language.reviewState === 'complete'
            ? ' · review complete'
            : language.reviewState === 'pending'
              ? ' · review pending'
            : language.reviewState === 'incomplete'
              ? ' · review incomplete'
              : ' · check coverage';
    const option = node('option', '', `${language.name} (${language.count})${suffix}`);
    option.value = language.code;
    select.append(option);
  });
  select.value = state.language || '';
  select.disabled = !languages.length;
  select.addEventListener('change', () => changeLanguage(select.value || null));
  append(focus, node('span', 'focus-language-label', 'Language'), select);
  const impactFocus = node('label', 'focus-impact-control');
  const impactSelect = node('select', 'focus-impact-select');
  impactSelect.id = 'focus-impact-select';
  impactSelect.setAttribute('aria-label', 'Focus impact');
  impactSelect.setAttribute('aria-describedby', 'impact-focus-note');
  const impactCount = (level) => findingCounts(impactFocusedFindings(act, level), state.language).findings;
  for (const [value, label] of [
    ['', 'All differences'],
    ['high', impactDisplayLabel('high')],
    ['moderate', impactDisplayLabel('moderate')],
    ['limited', impactDisplayLabel('limited')],
    ['unrated', impactDisplayLabel('unrated')]
  ]) {
    const option = node('option', '', `${label} (${impactCount(value || null)})`);
    option.value = value;
    impactSelect.append(option);
  }
  impactSelect.value = state.impact || '';
  impactSelect.addEventListener('change', () => changeImpact(impactSelect.value || null));
  append(impactFocus, node('span', 'focus-impact-label', 'Impact'), impactSelect);
  const hasRatings = impactFamilies(act).length > 0;
  const filters = append(node('div', 'focus-controls'), focus);
  if (hasRatings || state.impact) filters.append(impactFocus);
  else {
    const options = node('details', 'impact-filter-options');
    append(options, node('summary', '', 'Impact options'),
      append(node('div', 'impact-filter-body'), impactFocus,
        button('Potential impact index', 'text-button', () => changeSelection(act, null, { view: 'impact' }))));
    filters.append(options);
  }
  const languageCountNote = node('p', 'filter-count-note', 'Both menus count language-specific findings matching the other filter.');
  languageCountNote.id = 'language-count-note';
  append(
    controls,
    filters,
    languageCountNote,
    node('span', 'visually-hidden', 'No impact rating yet means no level has been assigned. An issue explanation may exist. It does not mean limited impact.')
  );
  controls.lastChild.id = 'impact-focus-note';
  if (!hasRatings && groupedFindings(act).length)
    append(controls, node('p', 'impact-pending-note', 'No impact rating yet'));
  return controls;
}
function renderToolbar() {
  const toolbar = $('#reader-toolbar');
  toolbar.replaceChildren();
  toolbar.hidden = !state.act;
  if (!state.act) return;
  const findings = displayedFindings(state.act);
  const left = node('div', 'toolbar-left');
  append(
    left,
    node('span', 'language-monogram', 'EN'),
    node('span', 'toolbar-title', 'English text')
  );
  const right = node('div', 'toolbar-right');
  if (findings.length) {
    const toggle = button(
      state.highlightsOnly ? 'Show full text' : 'Highlights only',
      'highlight-toggle',
      () => {
        state.highlightsOnly = !state.highlightsOnly;
        renderToolbar();
        renderReader();
        $('.highlight-toggle').focus({ preventScroll: true });
        if (state.finding)
          requestAnimationFrame(() => scrollToFinding(state.finding, { behavior: 'auto', sourceOnly: true }));
      }
    );
    toggle.setAttribute('aria-pressed', String(state.highlightsOnly));
    append(right, toggle);
  }
  append(toolbar, left, right);
}
// Lay out rows using offsets into the unchanged source. Highlight boundaries and
// list markers may divide a text node, but must never rewrite its characters.
function renderReader() {
  const reader = $('#reader');
  reader.style.removeProperty('--finding-scroll-space');
  reader.replaceChildren();
  const act = state.act;
  if (!act) return;
  const findings = displayedFindings(act);
  const passages = Array.isArray(act.passages) ? act.passages : [];
  if (!passages.length)
    append(
      reader,
      node(
        'p',
        'reader-no-text',
        'The English text is not yet available in this snapshot. Follow the official source link above to read the legislation.'
      )
    );
  passages.forEach((passage) => {
    const related = findings.filter((finding) => finding.passage_id === passage.id);
    if (state.highlightsOnly && !related.length) return;
    const section = node('section', 'passage');
    section.id = `passage-${passage.id}`;
    if (related.length) {
      const anchors = node('div', 'passage-anchors');
      related.forEach((finding) => {
        const number = String(findings.findIndex((item) => item.id === finding.id) + 1).padStart(
          2,
          '0'
        );
        const marker = button(
          number,
          'passage-anchor',
          () => changeSelection(act, finding, { scroll: true }),
          `Read finding ${number}: ${displayedFindingTitle(finding)}`
        );
        marker.dataset.finding = finding.id;
        marker.setAttribute('aria-pressed', String(finding.id === state.finding?.id));
        anchors.append(marker);
      });
      section.append(anchors);
    }
    const text = passage.text || '';
    const rows = passageRows(text, passage.label);
    if (rows[0]?.kind !== 'heading') {
      const label = node('div', 'passage-label');
      append(label, node('h3', '', passage.label || 'Passage'));
      section.append(label);
    }
    let offset = 0;
    const segments = highlightedSegments(text, related).map((segment) => {
      const positioned = { ...segment, start: offset, end: offset + segment.text.length };
      offset = positioned.end;
      return positioned;
    });
    const appendSourceRange = (parent, start, end) => {
      for (const segment of segments) {
        if (segment.end <= start) continue;
        if (segment.start >= end) break;
        const slice = text.slice(Math.max(start, segment.start), Math.min(end, segment.end));
        if (!segment.ids.length || !slice.trim()) {
          parent.append(document.createTextNode(slice));
          continue;
        }
        const first = related.find((finding) => finding.id === segment.ids[0]);
        const params = new URLSearchParams({ act: act.id, finding: first.id });
        if (state.language) params.set('lang', state.language);
        if (state.impact) params.set('impact', state.impact);
        const highlight = node('a', 'passage-highlight', slice);
        highlight.href = `#${params}`;
        highlight.addEventListener('click', (event) => {
          event.preventDefault();
          changeSelection(act, first, { scroll: !window.matchMedia('(min-width: 901px)').matches });
        });
        highlight.setAttribute(
          'aria-label',
          `${slice}. Read finding: ${displayedFindingTitle(first)}${segment.ids.length > 1 ? `; ${segment.ids.length} findings share this wording` : ''}`
        );
        highlight.dataset.findings = segment.ids.join(',');
        highlight.setAttribute('aria-controls', 'comparison');
        parent.append(highlight);
      }
    };
    const body = node('div', 'passage-text');
    rows.forEach((row) => {
      const line = node(row.kind === 'heading' ? 'h3' : 'p', `source-line source-${row.kind}`);
      if (row.markerEnd != null) {
        const marker = node('span', 'source-marker');
        const content = node('span', 'source-content');
        appendSourceRange(marker, row.start, row.markerEnd);
        appendSourceRange(content, row.markerEnd, row.end);
        append(line, marker, content);
      } else appendSourceRange(line, row.start, row.end);
      body.append(line);
    });
    append(section, body);
    reader.append(section);
  });
  markSelectedHighlight();
}
function impactFocusLabel(level) {
  return impactDisplayLabel(level);
}
function impactIssueLabel(family) {
  return family.review_state === 'needs_review'
    ? 'Impact under review'
    : impactDisplayLabel(family.impact_level);
}
function impactLanguageNames(family) {
  const names = new Map((state.act.languages || []).map(language => [language.code, language.name]));
  return family.languages.map(code => names.get(code) || code.toUpperCase()).join(' · ');
}
function assessmentStateLabel(family) {
  return { provisional: 'Provisional AI assessment', needs_review: 'Assessment under review', confirmed: 'Confirmed assessment' }[family.review_state];
}
function renderImpactMarker(family, { showTitle = false } = {}) {
  const heading = node('div', 'impact-summary-heading impact-marker');
  if (showTitle) append(heading, node('strong', '', family.title));
  append(heading, node('span', 'impact-level', impactIssueLabel(family)));
  append(heading, node('span', 'impact-assessment-meta', `${impactLanguageNames(family)} · ${assessmentStateLabel(family)}`));
  return heading;
}
function renderImpactSummary(family, { select = false, memberId = null, showTitle = true } = {}) {
  const block = node('section', 'impact-summary');
  if (showTitle) append(block, node('h3', 'impact-issue-title', family.title));
  append(block, node('p', 'impact-assessment-meta', `${impactLanguageNames(family)} · ${assessmentStateLabel(family)}`));
  if (family.confidence) append(block, node('p', 'impact-confidence', `Confidence in the proposed legal effect: ${family.confidence}`));
  const reasonLabel = family.review_state === 'needs_review'
    ? 'Why the impact is under review'
    : `Why this is rated ${family.impact_level}`;
  append(
    block,
    node('h4', 'impact-section-heading', 'Potential impact if this reading prevails'),
    node('p', 'impact-effect', family.effect),
    node('h4', 'impact-section-heading', reasonLabel)
  );
  if (family.legal_anchor) append(block, node('p', 'impact-rule', `Affected rule: ${family.legal_anchor}`));
  if (family.rationale) append(block, node('p', 'impact-rationale', family.rationale));
  if (family.uncertainty) append(
    block,
    node('h4', 'impact-section-heading', 'Assumptions and uncertainty'),
    node('p', 'impact-uncertainty', family.uncertainty)
  );
  const explanation = node('details', 'impact-explanation');
  append(explanation, node('summary', '', 'Assessment details'));
  const review = [
    family.review_state === 'needs_review' ? 'No impact level assigned; context review needed' : '',
    family.assessed_at ? `Assessed ${prettyDate(family.assessed_at)}` : '',
    family.rubric_version ? `Method ${family.rubric_version}` : ''
  ].filter(Boolean).join(' · ');
  if (review) append(explanation, node('p', 'impact-review-meta', review));
  block.append(explanation);
  if (select)
    append(block, button('See this issue and its evidence →', 'impact-open', () =>
      changeImpactSelection(family, memberId)));
  return block;
}
function renderImpactIndex(panel, act) {
  const families = displayedImpactFamilies(act);
  const intro = node('div', 'comparison-intro');
  append(intro, node('h2', '', 'Potential impact'));
  if (!families.length) {
    const focusedMessage = state.impact === 'unrated'
      ? displayedFindings(act).length
        ? 'This focus shows findings without an assigned impact level. An issue explanation may still be under review.'
        : 'No findings without an assigned impact level match this focus. Check Review coverage; this does not mean limited impact.'
      : state.impact
        ? `No ${impactFocusLabel(state.impact).toLowerCase()} assessment matches this focus. An empty result does not establish limited impact.`
        : state.language && impactFamilies(act).length
          ? 'No impact assessment is linked to this language. This does not mean its findings have no impact.'
          : 'No impact assessment is available for this act yet. This does not mean its findings have no impact.';
    append(
      intro,
      node('p', '', focusedMessage)
    );
    if (state.impact === 'unrated' && displayedFindings(act).length)
      append(intro, button('Browse these findings in text order →', 'text-button', () =>
        changeSelection(act)));
    panel.append(intro);
    return;
  }
  append(
    intro,
    node('p', '', 'Potential impact describes how much the legal outcome could change if an interpretation were accepted. Issues under review have no rating. Confidence describes support for the proposed legal effect, separately from impact size.')
  );
  const guide = node('details', 'impact-scale-guide');
  append(guide, node('summary', '', 'How ratings work'));
  const scale = node('ul');
  append(
    scale,
    append(node('li'), node('strong', '', 'High potential impact: '), 'Substantial outcome for a broad class, several rules, or a serious consequence under one rule, with evidence of reach or consequence.'),
    append(node('li'), node('strong', '', 'Moderate: '), 'Plausible changed outcome for an identifiable group under a specific rule.'),
    append(node('li'), node('strong', '', 'Limited: '), 'Changed outcome confined to an ancillary detail with limited practical consequence.')
  );
  guide.append(scale);
  intro.append(guide);
  panel.append(intro);
  const list = node('div', 'impact-index');
  const languageNames = new Map((act.languages || []).map((language) => [language.code, language.name]));
  families.forEach((family) => {
    const row = button('', 'impact-index-item', () => changeImpactSelection(family));
    const top = node('span', 'impact-index-top');
    append(top, node('strong', '', family.title), node('span', 'impact-level', impactIssueLabel(family)));
    const names = family.languages.map((code) => languageNames.get(code) || code.toUpperCase());
    append(
      row,
      top,
      node('span', 'impact-index-effect', family.effect),
      node('span', 'impact-index-languages', `${names.join(' · ')} · ${assessmentStateLabel(family)}`)
    );
    list.append(row);
  });
  panel.append(list);
}
function renderFindingIntro(act, findings) {
  const intro = node('div', 'comparison-intro');
  const language = focusedLanguage(act);
  const empty = language ? focusedEmptyState(act, language) : null;
  const hasFindingsBeforeImpact = groupedFindings(act).some((finding) =>
    !state.language || finding.variants.some((variant) => variant.language === state.language)
  );
  const emptyFromImpact = Boolean(state.impact && !findings.length && hasFindingsBeforeImpact);
  let title;
  let message;
  if (findings.length) {
    title = state.impact
      ? `${language ? `${language.name} · ` : ''}${impactFocusLabel(state.impact)} · differences in meaning`
      : language ? `${language.name} · differences in meaning` : 'Differences in meaning';
    message = 'Select a finding to compare language versions.';
  } else if (emptyFromImpact) {
    title = 'No differences match these filters';
    message = `${state.impact === 'unrated'
      ? `No finding${language ? ` for ${language.name}` : ''} lacks an assigned impact level.`
      : `No finding${language ? ` for ${language.name}` : ''} has a ${impactFocusLabel(state.impact).toLowerCase()} assessment.`} An empty result does not establish limited impact or equivalence.${empty && language.coverageIncomplete ? ` ${empty.message}` : ''}`;
  } else {
    title = empty?.title || {
      complete: 'No differences identified',
      failed: 'Review interrupted',
      partial: 'Partial review',
      analyzing: 'Review in progress'
    }[act.status] || 'Review pending';
    message = empty?.message || (act.status === 'complete'
      ? 'No supported difference in meaning was identified in the completed review. This does not establish equivalence across languages.'
      : act.status === 'partial'
        ? 'This is a partial review. No supported findings have been published for the text reviewed so far.'
        : act.status === 'failed'
          ? 'The analysis was interrupted; no complete comparison is claimed.'
          : 'The source texts are archived. Findings will appear after review.');
  }
  append(intro, node('h2', '', title));
  if (findings.length) {
    const counts = findingCounts(findings, state.language);
    append(intro, node('p', 'comparison-counts', `${plural(counts.findings, 'difference in meaning', 'differences in meaning')}, shown in ${plural(counts.groups, 'comparison group')}`),
      node('p', 'comparison-count-guide', 'Each language-specific finding counts once. Findings quoting the same English wording in the same passage appear together.'),
      node('p', 'comparison-review-note', 'AI-reviewed findings are provisional and do not establish that a language version is legally wrong.'));
  } else append(intro, node('p', '', message));
  return intro;
}
function renderComparison() {
  const panel = $('#comparison');
  const notice = $('#review-status');
  panel.replaceChildren();
  notice.replaceChildren();
  notice.hidden = true;
  $('#reading-workspace').classList.remove('is-compact');
  const act = state.act;
  if (!act) return;
  const findings = displayedFindings(act);
  const selected = state.finding;
  if (!findings.length && state.view === 'text') {
    const intro = renderFindingIntro(act, findings);
    intro.className = 'review-status-copy';
    intro.querySelector('h2').id = 'review-status-title';
    const tools = append(node('div', 'review-status-tools'),
      renderReviewSources(act)
    );
    append(notice, renderFocusControls(act), intro, tools);
    notice.hidden = false;
    $('#reading-workspace').classList.add('is-compact');
    return;
  }
  // In detail view the back link and pager occupy the same row as the source
  // toolbar. The index retains both comparison modes without stacking bars.
  if (!selected) {
    const switcher = node('div', 'comparison-view-switch');
    switcher.setAttribute('aria-label', 'Browse comparisons');
    const textView = button('Text order', 'comparison-view-button', () =>
      changeSelection(act));
    const impactView = button('Potential impact', 'comparison-view-button', () =>
      changeSelection(act, null, { view: 'impact' }));
    textView.setAttribute('aria-pressed', String(state.view !== 'impact'));
    impactView.setAttribute('aria-pressed', String(state.view === 'impact'));
    append(switcher, textView);
    if (impactFamilies(act).length || state.view === 'impact') append(switcher, impactView);
    panel.append(switcher);
    panel.append(renderFocusControls(act));
  }
  if (state.view === 'impact' && !state.issue) {
    renderImpactIndex(panel, act);
  } else if (!selected) {
    panel.append(renderFindingIntro(act, findings));
    if (findings.length) {
      const list = node('div', 'findings-index');
      findings.forEach((finding, index) => {
        const item = button('', 'finding-index-item', () =>
          changeSelection(act, finding, { scroll: true })
        );
        const matchingVariants = state.language
          ? finding.variants.filter((variant) => variant.language === state.language)
          : finding.variants;
        const title = displayedFindingTitle(finding);
        const languages = [...new Set(matchingVariants.map(variant => variant.language_name || variant.language))];
        const passage = act.passages.find(passage => passage.id === finding.passage_id);
        const context = [passage?.label, languages.join(', ')].filter(Boolean).join(' · ');
        append(
          item,
          node('span', 'finding-index-number', String(index + 1).padStart(2, '0')),
          append(node('span'), node('strong', '', title), node('small', '', context))
        );
        list.append(item);
      });
      panel.append(list);
    }
  } else {
    const sequence = state.issue ? displayedImpactFamilies(act) : findings;
    const index = sequence.findIndex((item) => item.id === (state.issue?.id || selected.id));
    const navigation = node('div', 'finding-navigation');
    const back = button(
      '←',
      'icon-button',
      () => state.issue
        ? changeImpactSelection(sequence[index - 1])
        : changeSelection(act, findings[index - 1], { scroll: true }),
      state.issue ? 'Previous issue' : 'Previous finding'
    );
    const next = button(
      '→',
      'icon-button',
      () => state.issue
        ? changeImpactSelection(sequence[index + 1])
        : changeSelection(act, findings[index + 1], { scroll: true }),
      state.issue ? 'Next issue' : 'Next finding'
    );
    back.disabled = index <= 0;
    next.disabled = index >= sequence.length - 1;
    append(
      navigation,
      button(state.issue ? '← Potential impact' : '← Differences', 'text-button', () =>
        changeSelection(act, null, { view: state.issue ? 'impact' : 'text' })),
      append(node('div', 'finding-navigation-actions'),
        button('Copy link', 'text-button copy-finding-link', async () => {
          try {
            const url = new URL(location.href);
            url.hash = selectionHash(state);
            await navigator.clipboard.writeText(url.href);
            toast(state.issue ? 'Issue link copied' : 'Finding link copied');
          } catch {
            toast('Copy the address from your browser to share this comparison.');
          }
        }, state.issue ? 'Copy link to this issue' : 'Copy link to this finding'),
        append(node('div', 'finding-pager'), back,
          node('span', '', `${index + 1} / ${sequence.length}`), next))
    );
    panel.append(navigation);
    panel.append(renderFocusControls(act));
    const detail = node('div', 'finding-detail');
    const variants = selected.variants.filter((variant) =>
      (!state.language || variant.language === state.language) &&
      (!state.issue || state.issue.finding_ids.includes(variant.finding_id))
    );
    const detailTitle = displayedFindingTitle(selected);
    const detailExplanation =
      state.language && variants.length === 1
        ? variants[0].explanation || selected.explanation
        : selected.explanation;
    append(detail, node('h2', '', state.issue?.title || detailTitle));
    append(detail, node('p', 'comparison-review-note', 'AI-reviewed findings are provisional. English is the reading reference; all official language versions have equal authority.'));
    const familiesHere = state.issue ? [state.issue] : displayedImpactFamilies(act).filter((family) =>
      family.members.some((member) => selected.aliases.includes(member.id) &&
        (!state.language || member.variants.some((variant) => variant.language === state.language)))
    );
    if (familiesHere.length) append(detail, node('p', 'impact-definition', 'Potential impact describes how much the legal outcome could change if this interpretation were accepted.'));
    const markers = familiesHere.length > 1 ? node('details', 'comparison-impact-markers') : detail;
    if (familiesHere.length > 1) {
      const levels = [...new Set(familiesHere.map(impactIssueLabel))].join(' / ');
      append(markers, node('summary', '', `${levels} · ${plural(familiesHere.length, 'impact assessment')}`));
      append(detail, markers);
    }
    familiesHere.forEach((family) => markers.append(renderImpactMarker(family, {
      showTitle: !state.issue && (familiesHere.length > 1 || family.title !== detailTitle)
    })));
    if (state.issue) {
      const locations = [...new Map(state.issue.members
        .filter((member) => !state.language || member.variants.some((variant) => variant.language === state.language))
        .map((member) => {
          const group = findings.find((item) => item.aliases.includes(member.id));
          return [group?.id, { member, group }];
        })
        .filter(([id]) => id)).values()];
      if (locations.length > 1) {
        const locationNav = node('div', 'issue-locations');
        append(locationNav, node('span', 'small-heading', 'Evidence locations'));
        locations.forEach(({ member, group }, locationIndex) => {
          const choice = button(
            `${locationIndex + 1}. ${act.passages.find((passage) => passage.id === member.passage_id)?.label || 'Passage'}`,
            'issue-location-button',
            () => changeImpactSelection(state.issue, member.id)
          );
          choice.setAttribute('aria-pressed', String(group.id === selected.id));
          locationNav.append(choice);
        });
        detail.append(locationNav);
      }
      append(detail, node('p', 'issue-evidence-intro', `Language evidence at this English passage · ${plural(variants.length, 'comparison')}`));
    }
    const passage = act.passages.find((item) => item.id === selected.passage_id);
    const occurrences = sourceOccurrences(passage?.text || '', selected.english_quote).length;
    if (occurrences > 1)
      append(
        detail,
        node(
          'p',
          'repeated-wording-note',
          `This wording occurs ${occurrences} times in this passage; see the explanation for the affected context.`
        )
      );
    const overlaps = overlappingFindings(act, selected, findings);
    let relatedDisclosure;
    if (overlaps.length > 1) {
      const disclosure = node('details', 'overlap-disclosure');
      append(disclosure, node('summary', '', `Related findings (${overlaps.length})`));
      const choices = node('div', 'overlap-choices');
      overlaps.forEach((finding) => {
        const choice = button(finding.title, 'finding-choice', () => changeSelection(act, finding, { scroll: true }));
        choice.setAttribute('aria-pressed', String(finding.id === selected.id));
        append(choices, choice);
      });
      append(disclosure, choices);
      relatedDisclosure = disclosure;
    }
    append(detail, node('p', 'wording-note', 'Underlining shows wording differences between the two English texts. The explanation below each quotation describes their significance.'));
    variants.forEach((variant) => {
      const card = node('article', 'variant-card');
      const top = node('div', 'variant-title');
      append(
        top,
        append(
          node('div', 'variant-language'),
          node('span', 'language-monogram', (variant.language || '?').toUpperCase()),
          node('h3', '', variant.language_name || variant.language)
        ),
        externalLink(
          'EUR-Lex ↗',
          variant.source_url,
          'source-link',
          `Read the official ${variant.language_name || variant.language} source`
        )
      );
      const quote = node('blockquote', 'original-quote evidence-quote', variant.quote);
      quote.lang = variant.language || '';
      const variantTitle =
        variant.finding_title && variant.finding_title !== detailTitle
          ? node('h4', 'variant-finding-title', variant.finding_title)
          : null;
      const originalExcerpt = append(node('section', 'quote-excerpt original-excerpt'),
        node('div', 'translation-label', `Official ${variant.language_name || variant.language} text`), quote);
      const wording = comparedWording(selected.english_quote, variant.translation);
      const englishExcerpt = append(node('section', 'quote-excerpt english-reference'),
        node('div', 'translation-label', 'Official English text · reading reference'),
        wordingQuote(wording.english, 'english-reference-quote'));
      const translatedExcerpt = append(
        node('section', 'quote-excerpt'),
        node('div', 'translation-label', `English translation of the ${variant.language_name || variant.language} text — AI-generated`),
        wordingQuote(wording.translation, 'translated-quote')
      );
      append(card, top, variantTitle, englishExcerpt, translatedExcerpt, originalExcerpt);
      append(
        card,
        append(
          node('div', 'difference-explanation'),
          node('span', '', 'What differs in meaning'),
          explanationParagraph(variant.explanation || detailExplanation, {
            act: act.id, finding: variant.finding_id || selected.id,
            language: variant.language, quote: variant.quote, translation: variant.translation
          })
        )
      );
      detail.append(card);
    });
    familiesHere.forEach((family) => {
      const memberId = family.finding_ids.find((id) => selected.aliases.includes(id) &&
        (!state.language || family.members.find((member) => member.id === id)?.variants.some(
          (variant) => variant.language === state.language))) || null;
      detail.append(renderImpactSummary(family, {
        select: !state.issue,
        memberId,
        showTitle: !state.issue && (familiesHere.length > 1 || family.title !== detailTitle)
      }));
    });
    append(detail, relatedDisclosure);
    append(
      detail,
      node(
        'p',
        'interpretation-note',
        'A finding describes a difference in meaning; it does not establish that a language version is legally wrong.'
      )
    );
    panel.append(detail);
  }
  const review = state.issue
    ? state.issue.members.find(member => member.id === state.issueFindingId)?.review
    : selected?.review;
  append(panel, renderReviewSources(act, { review }));
}
function renderEmptyCollection(error) {
  $('#reader-toolbar').hidden = true;
  $('#document-heading').replaceChildren();
  $('#comparison').replaceChildren();
  $('#review-status').replaceChildren();
  $('#review-status').hidden = true;
  $('#reading-workspace').classList.remove('is-compact');
  const empty = node('div', 'collection-empty');
  append(
    empty,
    node('h2', '', error ? 'Collection unavailable' : 'No legislation yet'),
    node('p', '', error || 'Source texts and reviewed findings will appear here when available.')
  );
  if (error) append(empty, button('Try again', 'official-button', loadCatalogue));
  $('#reader').replaceChildren(empty);
}
async function loadCatalogue() {
  try {
    const response = await fetch('./data/catalogue.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`The collection could not be loaded (${response.status}).`);
    const catalogue = await response.json();
    state.legislation = catalogueLegislation(catalogue);
    const selected = selectedFromHash(location.hash, state.legislation);
    state.act = selected.act;
    state.finding = selected.finding;
    state.language = selected.language;
    state.impact = selected.impact;
    state.view = selected.view;
    state.issue = selected.issue;
    state.issueFindingId = selected.issueFindingId;
    renderLibrary();
    renderAct();
    $('#reader').scrollTop = 0;
    if (state.finding)
      requestAnimationFrame(() => scrollToFinding(state.finding, { behavior: 'auto' }));
  } catch (error) {
    $('#legislation-list').replaceChildren(
      node('p', 'library-empty', 'The collection could not be loaded.')
    );
    renderEmptyCollection(
      error.message === 'Failed to fetch'
        ? 'Please check your connection and try again.'
        : error.message
    );
  }
}
$('#search').addEventListener('input', (event) => {
  state.query = event.target.value;
  renderLibrary();
});
$('#method-button').addEventListener('click', () => $('#method-dialog').showModal());
$('#close-method').addEventListener('click', () => $('#method-dialog').close());
document.addEventListener('click', (event) => {
  $('#review-status').querySelectorAll('details[open]').forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const disclosure = document.activeElement?.closest('#review-status details[open]');
  if (disclosure) {
    disclosure.open = false;
    disclosure.querySelector('summary').focus({ preventScroll: true });
  }
});
$('#method-dialog').addEventListener('click', (event) => {
  if (event.target === $('#method-dialog')) {
    const bounds = event.target.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      event.target.close();
  }
});
window.addEventListener('popstate', () => {
  const selected = selectedFromHash(location.hash, state.legislation);
  const changedAct = state.act?.id !== selected.act?.id;
  state.act = selected.act;
  state.finding = selected.finding;
  state.language = selected.language;
  state.impact = selected.impact;
  state.view = selected.view;
  state.issue = selected.issue;
  state.issueFindingId = selected.issueFindingId;
  state.highlightsOnly = false;
  renderLibrary();
  renderAct();
  if (changedAct) $('#reader').scrollTop = 0;
  if (state.finding)
    requestAnimationFrame(() => scrollToFinding(state.finding, { behavior: 'auto' }));
});
let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (state.finding && window.matchMedia('(min-width: 901px)').matches)
      scrollToFinding(state.finding, { behavior: 'auto', onlyIfOutside: true });
  });
});
loadCatalogue();
