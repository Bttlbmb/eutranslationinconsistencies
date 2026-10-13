/** Stateless view helpers and source panels. All source wording uses textContent.
 * Navigation and selected-finding state stay in app.js; evidence rules stay in model.js.
 */
import { officialURL, archiveURL } from './model.js';

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
export function renderCoverage(act) {
  const coverage = act.coverage || {};
  const reviewed = Number(coverage.reviewed_units) || 0;
  const total = Number(coverage.total_units) || 0;
  const wrapper = node('div', 'coverage-card');
  append(
    wrapper,
    node('h3', 'small-heading', 'REVIEW COVERAGE'),
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
      wrapper,
      node(
        'p',
        'coverage-languages',
        `${coverage.reviewed_languages || 0} of ${coverage.total_languages} languages fully reviewed`
      )
    );
  const incompleteLanguages = (act.languages || []).filter(
    (language) => language.coverage_incomplete
  );
  if (incompleteLanguages.length)
    append(
      wrapper,
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
    wrapper.append(notes);
  }
  return wrapper;
}
export function renderArchives(act) {
  const details = node('details', 'archives');
  append(
    details,
    node('summary', '', `Source archive · ${plural((act.languages || []).length, 'language')}`)
  );
  if (act.retrieved_at)
    append(
      details,
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
  append(details, list);
  if (act.failed_languages?.length) {
    append(details, node('h4', 'small-heading', 'SOURCE RETRIEVAL INCOMPLETE'));
    act.failed_languages.forEach((language) =>
      append(
        details,
        node(
          'p',
          'unavailable-language',
          `${language.name || language.code}: ${language.reason || 'The official source could not be retrieved for this snapshot.'}`
        )
      )
    );
  }
  if (act.unavailable_languages?.length) {
    append(details, node('h4', 'small-heading', 'UNAVAILABLE IN THIS SNAPSHOT'));
    act.unavailable_languages.forEach((language) =>
      append(
        details,
        node(
          'p',
          'unavailable-language',
          `${language.name || language.code}: ${language.reason || 'No source available'}`
        )
      )
    );
  }
  return details;
}
