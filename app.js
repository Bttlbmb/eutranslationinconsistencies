/** Reader controller: selection, browser history and the two reading panes.
 * Build checks verify the evidence; rendering still treats every string as text.
 */
import {
  catalogueLegislation,
  focusLanguageIndex,
  groupedFindings,
  highlightedSegments,
  passageRows,
  sourceOccurrences,
  overlappingFindings,
  selectedFromHash,
  selectionHash,
  completionMessage
} from './model.js';
import {
  node,
  append,
  button,
  externalLink,
  prettyDate,
  plural,
  renderCoverage,
  renderArchives
} from './view.js';

const $ = (selector) => document.querySelector(selector);
const state = {
  legislation: [],
  act: null,
  finding: null,
  language: null,
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
  const findings = groupedFindings(act);
  if (!state.language) return findings;
  return findings.filter((finding) =>
    finding.variants.some((variant) => variant.language === state.language)
  );
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
  const title = `No ${name} findings`;
  if (language.coverageIncomplete)
    return {
      title,
      message: 'No supported finding has been published for this language. The archived source has incomplete language coverage; check Source archive below.',
      summary: `No ${name} findings published · source incomplete`
    };
  if (act.status === 'complete')
    return {
      title,
      message: 'No supported substantial difference was found for this language in the completed review. This does not establish equivalence.',
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
    message: `No supported finding has been published for this language. ${reviewState[0]}; check Review coverage below.`,
    summary: `No ${name} findings published · ${reviewState[1]}`
  };
}
// Finding groups have a canonical ID plus aliases for older shared links.
function updateSelectionHash() {
  const hash = selectionHash(state);
  if (location.hash.slice(1) !== hash)
    history.pushState(null, '', `${location.pathname}${location.search}#${hash}`);
}
function changeSelection(act, finding = null, { scroll = false } = {}) {
  const trigger = document.activeElement;
  const navigationLabel = ['Previous finding', 'Next finding'].includes(
    trigger?.getAttribute('aria-label')
  )
    ? trigger.getAttribute('aria-label')
    : null;
  const fromComparison = Boolean(trigger?.closest('#comparison'));
  const fromLibrary = Boolean(trigger?.classList.contains('legislation-item'));
  const fromPassage = Boolean(trigger?.classList.contains('passage-highlight'));
  const changedAct = state.act?.id !== act?.id;
  state.act = act;
  if (changedAct) {
    state.highlightsOnly = false;
    if (state.language && !focusedLanguage(act)) state.language = null;
    if (!finding) finding = displayedFindings(act)[0] || null;
  }
  if (
    finding &&
    state.language &&
    !finding.variants.some((variant) => variant.language === state.language)
  )
    state.language = null;
  const changedFinding = state.finding?.id !== finding?.id;
  state.finding = finding;
  if ($('#focus-language-select')) $('#focus-language-select').value = state.language || '';
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
    const heading = $('#comparison .finding-detail > h2, #comparison .comparison-intro > h2');
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
  $('#selection-status').textContent = finding
    ? `${finding.title}. Language comparison updated.`
    : `${act?.short_title || act?.title || 'Collection'} selected.`;
}
function changeLanguage(code) {
  const languages = focusLanguageIndex(state.act);
  if (code && !languages.some((language) => language.code === code)) return;
  state.language = code;
  const visibleFindings = displayedFindings(state.act);
  if (!state.finding || !visibleFindings.some((finding) => finding.id === state.finding.id))
    state.finding = visibleFindings[0] || null;
  if (!visibleFindings.length) state.highlightsOnly = false;
  updateSelectionHash();
  renderLibrary();
  renderToolbar();
  renderReader();
  renderComparison();
  $('#comparison').scrollTop = 0;
  if (state.finding) scrollToFinding(state.finding);
  $('#focus-language-select')?.focus({ preventScroll: true });
  const selected = languages.find((language) => language.code === code);
  $('#selection-status').textContent = selected
    ? `${selected.name}: ${plural(visibleFindings.length, 'finding')} shown.`
    : 'Findings in all languages shown.';
}
function scrollToFinding(finding, { behavior = 'smooth' } = {}) {
  const highlight = [...document.querySelectorAll('.passage-highlight')].find((item) =>
    item.dataset.findings.split(',').includes(finding.id)
  );
  if (highlight && window.matchMedia('(min-width: 901px)').matches)
    highlight.scrollIntoView({ behavior, block: 'center' });
  else
    (
      $('#comparison .finding-detail > h2, #comparison .comparison-intro > h2') || $('#comparison')
    ).scrollIntoView({ behavior: 'auto', block: 'start' });
}
function markSelectedHighlight() {
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
    if (state.language)
      summary = focus
        ? findings.length
          ? plural(findings.length, `${focus.name} finding`)
          : focusedEmptyState(act, focus).summary
        : `${focusedLanguage()?.name || state.language.toUpperCase()} not listed for this act`;
    else
      summary = findings.length
        ? plural(findings.length, 'finding')
        : act.status === 'complete'
          ? 'Review complete · no findings'
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
    append(item, node('span', 'legislation-name', act.short_title || act.title));
    append(
      item,
      node('span', 'legislation-item-bottom', summary)
    );
    container.append(item);
  });
}
function renderAct() {
  const act = state.act;
  const heading = $('#document-heading');
  heading.replaceChildren();
  $('#act-picker-label').textContent = act?.short_title || act?.title || 'Choose legislation';
  if (!act) {
    renderEmptyCollection();
    return;
  }
  document.title = 'EU Translation Inconsistencies';
  append(
    heading,
    node(
      'span',
      'document-meta',
      `${act.version_label || 'Source version'}${act.version ? ` · ${prettyDate(act.version)}` : ''}`
    )
  );
  const focus = node('label', 'focus-language-control');
  const select = node('select', 'focus-language-select');
  select.id = 'focus-language-select';
  select.setAttribute('aria-label', 'Focus language');
  append(select, node('option', '', 'All languages'));
  select.options[0].value = '';
  focusLanguageIndex(act).forEach((language) => {
    const suffix =
      language.availability === 'unavailable'
        ? ' · unavailable'
        : language.availability === 'failed'
          ? ' · retrieval failed'
          : language.coverageIncomplete
            ? ' · incomplete source'
            : '';
    const option = node('option', '', `${language.name}${suffix}`);
    option.value = language.code;
    select.append(option);
  });
  select.value = state.language || '';
  select.addEventListener('change', () => changeLanguage(select.value || null));
  append(focus, node('span', 'focus-language-label', 'Focus language'), select);
  heading.append(focus);
  const details = node('details', 'act-details');
  const detailBody = node('div', 'act-details-body');
  append(
    detailBody,
    node('strong', '', act.title),
    node(
      'p',
      `status-label status-${act.status || 'imported'}`,
      completionMessage(act, groupedFindings(act))
    ),
    externalLink('View on EUR-Lex ↗', act.source_url, 'source-link')
  );
  append(details, node('summary', '', 'Act details'), detailBody);
  append(heading, details);
  renderToolbar();
  renderReader();
  renderComparison();
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
  append(right, node('span', 'finding-count', plural(findings.length, 'finding')));
  if (findings.length) {
    const toggle = button(
      state.highlightsOnly ? 'Show full text' : 'Highlights only',
      'highlight-toggle',
      () => {
        state.highlightsOnly = !state.highlightsOnly;
        renderToolbar();
        renderReader();
        $('.highlight-toggle').focus({ preventScroll: true });
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
          () => changeSelection(act, finding),
          `Read finding ${number}: ${finding.title}`
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
        const highlight = node('a', 'passage-highlight', slice);
        highlight.href = `#${params}`;
        highlight.addEventListener('click', (event) => {
          event.preventDefault();
          changeSelection(act, first, { scroll: !window.matchMedia('(min-width: 901px)').matches });
        });
        highlight.setAttribute(
          'aria-label',
          `${slice}. Read finding: ${first.title}${segment.ids.length > 1 ? `; ${segment.ids.length} findings share this wording` : ''}`
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
function renderComparison() {
  const panel = $('#comparison');
  panel.replaceChildren();
  const act = state.act;
  if (!act) return;
  const findings = displayedFindings(act);
  const selected = state.finding;
  if (!selected) {
    const intro = node('div', 'comparison-intro');
    const selectedLanguage = focusedLanguage(act);
    const emptyState = selectedLanguage ? focusedEmptyState(act, selectedLanguage) : null;
    const title = findings.length
      ? selectedLanguage ? `${selectedLanguage.name} findings` : 'Findings'
      : emptyState?.title || (act.status === 'complete' ? 'No findings' : act.status === 'failed' ? 'Review interrupted' : 'Review pending');
    append(intro, node('h2', '', title));
    const message = findings.length
      ? 'Select a finding to compare language versions.'
      : emptyState?.message || (act.status === 'complete'
        ? 'No supported substantial difference was found in the completed review. This does not establish equivalence across languages.'
        : act.status === 'partial'
          ? 'This is a partial review. No supported findings have been published for the text reviewed so far.'
          : act.status === 'failed'
            ? 'The analysis was interrupted; no complete comparison is claimed.'
            : 'The source texts are archived. Findings will appear after review.');
    append(intro, node('p', '', message));
    panel.append(intro);
    if (findings.length) {
      const list = node('div', 'findings-index');
      findings.forEach((finding, index) => {
        const item = button('', 'finding-index-item', () =>
          changeSelection(act, finding, { scroll: true })
        );
        const matchingVariants = state.language
          ? finding.variants.filter((variant) => variant.language === state.language)
          : finding.variants;
        const title =
          state.language && matchingVariants.length === 1
            ? matchingVariants[0].finding_title || finding.title
            : finding.title;
        const context = state.language
          ? plural(matchingVariants.length, 'difference')
          : plural(new Set(matchingVariants.map((variant) => variant.language)).size, 'language');
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
    const index = findings.findIndex((finding) => finding.id === selected.id);
    const navigation = node('div', 'finding-navigation');
    const back = button(
      '←',
      'icon-button',
      () => changeSelection(act, findings[index - 1], { scroll: true }),
      'Previous finding'
    );
    const next = button(
      '→',
      'icon-button',
      () => changeSelection(act, findings[index + 1], { scroll: true }),
      'Next finding'
    );
    back.disabled = index <= 0;
    next.disabled = index >= findings.length - 1;
    append(
      navigation,
      button('← Findings', 'text-button', () => changeSelection(act)),
      append(
        node('div', 'finding-pager'),
        back,
        node('span', '', `${index + 1} / ${findings.length}`),
        next
      )
    );
    panel.append(navigation);
    const detail = node('div', 'finding-detail');
    const variants = state.language
      ? selected.variants.filter((variant) => variant.language === state.language)
      : selected.variants;
    const detailTitle =
      state.language && variants.length === 1
        ? variants[0].finding_title || selected.title
        : selected.title;
    const detailExplanation =
      state.language && variants.length === 1
        ? variants[0].explanation || selected.explanation
        : selected.explanation;
    append(detail, node('h2', '', detailTitle));
    const anchor = node('details', 'english-anchor');
    const englishQuote = node('blockquote', 'evidence-quote', selected.english_quote);
    englishQuote.lang = 'en';
    append(anchor, node('summary', '', 'English passage'), englishQuote);
    const passage = act.passages.find((item) => item.id === selected.passage_id);
    const occurrences = sourceOccurrences(passage?.text || '', selected.english_quote).length;
    if (occurrences > 1)
      append(
        anchor,
        node(
          'p',
          'repeated-wording-note',
          `This wording occurs ${occurrences} times in this passage; see the explanation for the affected context.`
        )
      );
    const visibleIds = new Set(findings.map((finding) => finding.id));
    const overlaps = overlappingFindings(act, selected).filter((finding) =>
      visibleIds.has(finding.id)
    );
    let relatedDisclosure;
    if (overlaps.length > 1) {
      const disclosure = node('details', 'overlap-disclosure');
      append(disclosure, node('summary', '', `Related findings (${overlaps.length})`));
      const choices = node('div', 'overlap-choices');
      overlaps.forEach((finding) => {
        const choice = button(finding.title, 'finding-choice', () => changeSelection(act, finding));
        choice.setAttribute('aria-pressed', String(finding.id === selected.id));
        append(choices, choice);
      });
      append(disclosure, choices);
      relatedDisclosure = disclosure;
    }
    variants.forEach((variant) => {
      const card = node('article', 'variant-card');
      const top = node('div', 'variant-title');
      append(
        top,
        append(
          node('div', 'variant-language'),
          node('span', 'language-monogram', (variant.language || '?').toUpperCase()),
          node('h3', '', `${variant.language_name || variant.language} · original wording`)
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
      const originalExcerpt = append(node('section', 'quote-excerpt'), top, quote);
      const translation = node(
        'blockquote',
        'translated-quote evidence-quote',
        variant.translation
      );
      translation.lang = 'en';
      const translatedExcerpt = append(
        node('section', 'quote-excerpt'),
        node('div', 'translation-label', 'English translation'),
        translation
      );
      append(card, variantTitle, originalExcerpt, translatedExcerpt);
      append(
        card,
        append(
          node('div', 'difference-explanation'),
          node('span', '', 'EXPLANATION'),
          node('p', '', variant.explanation || detailExplanation)
        )
      );
      detail.append(card);
    });
    append(detail, anchor, relatedDisclosure);
    const review = node('div', 'review-note');
    append(
      review,
      node(
        'strong',
        '',
        selected.review?.reviewed_at
          ? `Reviewed ${prettyDate(selected.review.reviewed_at)}`
          : 'Reviewed finding'
      )
    );
    const method = node('details', 'review-method');
    append(
      method,
      node('summary', '', 'Review method'),
      node('p', '', selected.review?.method || 'Independent model analysis with evidence review')
    );
    if (selected.review?.models?.length)
      append(method, node('p', '', `Models: ${selected.review.models.join(' · ')}`));
    append(review, method);
    append(
      review,
      button('Copy link to this finding ↗', 'text-button', async () => {
        try {
          const url = new URL(location.href);
          url.hash = selectionHash(state);
          await navigator.clipboard.writeText(url.href);
          toast('Finding link copied');
        } catch {
          toast('Copy the address from your browser to share this finding.');
        }
      })
    );
    append(
      detail,
      review,
      node(
        'p',
        'interpretation-note',
        'Potential difference in meaning; all official language versions have equal authority.'
      )
    );
    panel.append(detail);
  }
  append(panel, renderCoverage(act), renderArchives(act));
}
function renderEmptyCollection(error) {
  $('#reader-toolbar').hidden = true;
  $('#document-heading').replaceChildren();
  $('#comparison').replaceChildren();
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
    if (!state.finding && state.act) state.finding = displayedFindings(state.act)[0] || null;
    renderLibrary();
    renderAct();
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
  state.act = selected.act;
  state.finding = selected.finding;
  state.language = selected.language;
  if (!state.finding && state.language && state.act)
    state.finding = displayedFindings(state.act)[0] || null;
  state.highlightsOnly = false;
  renderLibrary();
  renderAct();
  if (state.finding)
    requestAnimationFrame(() => scrollToFinding(state.finding, { behavior: 'auto' }));
});
loadCatalogue();
