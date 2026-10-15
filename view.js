/** Stateless view helpers and source panels. All source wording uses textContent.
 * Navigation and selected-finding state stay in app.js; evidence rules stay in model.js.
 */
import { officialURL, archiveURL, explanationSegments } from './model.js?v=2';

export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}
export function append(parent, ...children) {
  children.filter(Boolean).forEach((child) => parent.append(child));
  return parent;
}
export function button(text, className, handler, label) {
  const element = node('button', className, text);
  element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  if (handler) element.addEventListener('click', handler);
  return element;
}
export function externalLink(
  text,
  value,
  className = 'source-link',
  accessibleLabel = text.replace(' ↗', '')
) {
  const url = officialURL(value);
  if (!url) return null;
  const link = node('a', className, text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${accessibleLabel} (opens a new tab)`);
  return link;
}
export function prettyDate(value, fallback = 'Not recorded') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(date);
}
export function plural(count, singular, many = `${singular}s`) {
  return `${count} ${count === 1 ? singular : many}`;
}
export function wordingQuote(segments, className = '') {
  const quote = node('blockquote', `evidence-quote ${className}`.trim());
  quote.lang = 'en';
  for (const segment of segments)
    quote.append(segment.changed
      ? node('mark', 'wording-change', segment.text)
      : document.createTextNode(segment.text));
  return quote;
}

export function explanationParagraph(explanation, context) {
  const paragraph = node('p');
  for (const segment of explanationSegments(explanation, context)) {
    paragraph.append(segment.gloss
      ? node('span', 'explanation-gloss', segment.text)
      : document.createTextNode(segment.text));
  }
  return paragraph;
}

/** Keep complete supporting evidence reachable through a single disclosure. */
export function renderReviewSources(act, { review } = {}) {
  const details = node('details', 'review-sources');
  append(details, node('summary', '', review?.reviewed_at
    ? `Review and sources · reviewed ${prettyDate(review.reviewed_at)}`
    : 'Review and sources'));
  const body = node('div', 'review-sources-body');
  append(body,
    node('h3', 'small-heading', 'SOURCE VERSION'),
    node('p', 'formal-act-title', act.title),
    node('p', '', `${act.version_label || 'Source version'}${act.version ? ` · ${prettyDate(act.version)}` : ''}`),
    externalLink('View act on EUR-Lex ↗', act.source_url),
    renderCoverage(act),
    renderArchives(act));
  if (review) {
    const method = node('details', 'review-method');
    append(method, node('summary', '', 'Review method'),
      node('p', '', review.method || 'Independent model analysis with evidence review'));
    if (review.models?.length) append(method, node('p', '', `Models: ${review.models.join(' · ')}`));
    append(body, method);
  }
  const guide = node('details', 'review-reading-guide');
  append(guide, node('summary', '', 'Reading guide'),
    node('p', '', 'Language findings are published finding records. Grouped comparisons combine records with the same English quotation in the same source passage; a group may contain several distinct issues.'),
    node('p', '', 'Underlining marks differences in wording between the English reference and a translation into English. It is a reading aid, not an assessment of legal significance or impact.'),
    node('p', '', 'No impact rating yet means no level has been assigned. An issue explanation may exist. It does not mean limited impact.'));
  append(body, guide);
  append(details, body);
  return details;
}
export function renderCoverage(act, { compact = false } = {}) {
  const coverage = act.coverage || {};
  const reviewed = Number(coverage.reviewed_units) || 0;
  const total = Number(coverage.total_units) || 0;
  const wrapper = node(compact ? 'details' : 'div', `coverage-card${compact ? ' coverage-disclosure' : ''}`);
  if (compact)
    append(wrapper, node('summary', '', total
      ? `Review coverage · ${reviewed} / ${total}`
      : 'Review coverage · not started'));
  const content = compact ? node('div', 'coverage-body') : wrapper;
  if (compact) wrapper.append(content);
  append(
    content,
    compact ? null : node('h3', 'small-heading', 'REVIEW COVERAGE'),
    node(
      'p',
      '',
      total
        ? `${reviewed} of ${total} comparison units reviewed`
        : 'No comparison units reviewed yet'
    )
  );
  if (coverage.total_languages)
    append(
      content,
      node(
        'p',
        'coverage-languages',
        `${coverage.reviewed_languages || 0} of ${coverage.total_languages} languages fully reviewed`
      )
    );
  if (Array.isArray(coverage.reviewed_language_codes) && coverage.reviewed_language_codes.length) {
    const names = new Map((act.languages || []).map((language) => [language.code, language.name]));
    append(content, node('p', 'coverage-languages',
      `Completed target languages: ${coverage.reviewed_language_codes.map((code) => names.get(code) || code.toUpperCase()).join(', ')}`));
  }
  const incompleteLanguages = (act.languages || []).filter(
    (language) => language.coverage_incomplete
  );
  if (incompleteLanguages.length)
    append(
      content,
      node(
        'p',
        'source-coverage-warning',
        `${incompleteLanguages.map((language) => language.name || language.code).join(', ')}: the archived source contains incomplete language coverage. See the source archive notes below.`
      )
    );
  if (act.notes?.length) {
    const notes = node('details', 'source-notes');
    append(notes, node('summary', '', 'Analysis notes'));
    act.notes.forEach((note) =>
      append(
        notes,
        node('p', '', typeof note === 'string' ? note : note.message || JSON.stringify(note))
      )
    );
    content.append(notes);
  }
  return wrapper;
}
export function renderArchives(act) {
  const details = node('details', 'archives');
  const content = node('div', 'archive-body');
  append(
    details,
    node('summary', '', `Source archive · ${plural((act.languages || []).length, 'language')}`)
  );
  if (act.retrieved_at)
    append(
      content,
      node(
        'p',
        '',
        `Retrieved ${prettyDate(act.retrieved_at)}. Plain-text copies of the analyzed version.`
      )
    );
  const list = node('div', 'archive-list');
  (act.languages || []).forEach((language) => {
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
    append(
      links,
      externalLink(
        'EUR-Lex ↗',
        language.source_url,
        'source-link',
        `Read ${language.name || language.code} on EUR-Lex`
      )
    );
    append(line, links);
    list.append(line);
    if (language.coverage_incomplete || language.notes?.length)
      append(
        list,
        node(
          'p',
          'archive-language-note',
          (language.notes || []).join(' ') ||
            'The official source contains incomplete language coverage.'
        )
      );
  });
  append(content, list);
  if (act.failed_languages?.length) {
    append(content, node('h4', 'small-heading', 'SOURCE RETRIEVAL INCOMPLETE'));
    act.failed_languages.forEach((language) =>
      append(
        content,
        node(
          'p',
          'unavailable-language',
          `${language.name || language.code}: ${language.reason || 'The official source could not be retrieved for this snapshot.'}`
        )
      )
    );
  }
  if (act.unavailable_languages?.length) {
    append(content, node('h4', 'small-heading', 'UNAVAILABLE IN THIS SNAPSHOT'));
    act.unavailable_languages.forEach((language) =>
      append(
        content,
        node(
          'p',
          'unavailable-language',
          `${language.name || language.code}: ${language.reason || 'No source available'}`
        )
      )
    );
  }
  details.append(content);
  return details;
}
