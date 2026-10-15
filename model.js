/** Pure reader rules shared by browser views and publication checks.
 * Grouping changes presentation only; source quotes and finding aliases survive.
 */
import { explanationGlosses } from './explanation-glosses.js';

const glossesByVariant = new Map();
for (const gloss of explanationGlosses) {
  const key = JSON.stringify([gloss.act, gloss.finding, gloss.language]);
  if (!glossesByVariant.has(key)) glossesByVariant.set(key, []);
  glossesByVariant.get(key).push(gloss);
}

/** Add English reading aids without altering any character of the reviewed explanation. */
export function explanationSegments(explanation, { act, finding, language, quote, translation }) {
  const original = String(explanation || '');
  const entries = glossesByVariant.get(JSON.stringify([act, finding, language])) || [];
  const available = entries.filter(entry => {
    if (!quote?.normalize('NFC').toLowerCase().includes(entry.phrase.normalize('NFC').toLowerCase()) || !translation) return false;
    let cursor = 0;
    for (const part of entry.english) {
      const index = translation.indexOf(part, cursor);
      if (index < 0) return false;
      cursor = index + part.length;
    }
    return true;
  });
  const byPhrase = new Map(available.map(entry => [entry.phrase, entry]));
  const segments = [];
  const seen = new Set();
  const quoted = /[“„«]([^”»“]+)[”»“]|‘([^’]+)’|"([^"\n]+)"|(?<![\p{L}\p{N}])'([^'\n]+)'(?![\p{L}\p{N}])/gu;
  let cursor = 0;
  for (const match of original.matchAll(quoted)) {
    const phrase = (match[1] || match[2] || match[3] || match[4]).trim();
    const entry = byPhrase.get(phrase);
    if (!entry || seen.has(phrase)) continue;
    seen.add(phrase);
    const end = match.index + match[0].length;
    const after = original.slice(end);
    // Existing inline explanations and parenthetical translations already do this job.
    if (/^\s*[,;:]?\s*(?:meaning|which means|i\.e\.|that is)\b/iu.test(after)) continue;
    const parenthetical = after.match(/^\s*\(([^)]*)\)/u)?.[1];
    if (parenthetical && entry.english.every(part => parenthetical.includes(part))) continue;
    segments.push({ text: original.slice(cursor, end), gloss: false });
    segments.push({ text: ` (“${entry.english.join(' … ')}”)`, gloss: true });
    cursor = end;
  }
  if (cursor < original.length || !segments.length)
    segments.push({ text: original.slice(cursor), gloss: false });
  return segments;
}

export function catalogueLegislation(catalogue) {
  if (catalogue?.schema_version !== 1 || !Array.isArray(catalogue.legislation)) {
    throw new Error('This collection uses an unsupported format.');
  }
  return catalogue.legislation.filter(
    (act) => act && typeof act.id === 'string' && typeof act.title === 'string'
  );
}

export function publicFindings(act) {
  const passages = Array.isArray(act?.passages) ? act.passages : [];
  return (Array.isArray(act?.findings) ? act.findings : []).filter(
    (finding) =>
      finding?.status === 'agent_reviewed' &&
      typeof finding.id === 'string' &&
      Array.isArray(finding.variants) &&
      finding.variants.length > 0 &&
      passages.some(
        (passage) =>
          passage?.id === finding.passage_id &&
          typeof passage.text === 'string' &&
          typeof finding.english_quote === 'string' &&
          finding.english_quote.length > 0 &&
          passage.text.includes(finding.english_quote)
      )
  );
}

/** Reader-facing source labels; retain the exact source metadata in the export. */
export function sourceVersionInfo(act) {
  const consolidated = /consolidated/i.test(act.version_label || '');
  const original = /original act/i.test(act.version_label || '');
  const notes = (act.notes || []).filter(note => typeof note === 'string').join(' ');
  const limitations = [];
  if (/later consolidated[\s\S]*outside this review/i.test(notes))
    limitations.push('Review covers the original publication. Later amendments or corrections may not be reflected.');
  return {
    label: consolidated ? 'Consolidated version as of' : original ? 'Original publication' : act.version_label || 'Source version',
    explanation: consolidated
      ? 'A combined text incorporating amendments up to the stated date. The authentic legal acts are published in the Official Journal.'
      : original ? 'The text as originally published in the Official Journal.' : '',
    limitations
  };
}

/** Count non-English targets separately from the archived English reference. */
export function targetReviewCoverage(act) {
  const coverage = act.coverage || {};
  const english = Number((act.languages || []).some(language => language.code === 'en'));
  const total = Math.max(0, (coverage.total_languages || 0) - english);
  const reviewed = Array.isArray(coverage.reviewed_language_codes)
    ? new Set(coverage.reviewed_language_codes.filter(code => code !== 'en')).size
    : Math.max(0, (coverage.reviewed_languages || 0) - english);
  return { reviewed: Math.min(reviewed, total), total, english: Boolean(english) };
}

function sharedQuoteTitle(act, group) {
  const label = act.passages.find(passage => passage.id === group.passage_id)?.label || 'Shared wording';
  const quote = group.english_quote.trim().replace(/\s+/g, ' ');
  const excerpt = quote.length > 90 ? `${quote.slice(0, 90).replace(/\s+\S*$/, '')}…` : quote;
  return `${label}: “${excerpt}”`;
}

/** Languages with publishable substantial findings, counted by finding record. */
export function substantialLanguageIndex(act) {
  const archivedNames = new Map(
    (act?.languages || []).map((language) => [language.code, language.name])
  );
  const languages = new Map();
  for (const finding of publicFindings(act)) {
    if (finding.severity !== 'substantial') continue;
    const seen = new Set();
    for (const variant of finding.variants) {
      const code = variant?.language;
      if (typeof code !== 'string' || !/^[a-z]{2}$/.test(code) || seen.has(code)) continue;
      seen.add(code);
      if (!languages.has(code))
        languages.set(code, {
          code,
          name: variant.language_name || archivedNames.get(code) || code.toUpperCase(),
          count: 0,
          findingIds: []
        });
      const language = languages.get(code);
      language.count += 1;
      language.findingIds.push(finding.id);
    }
  }
  return [...languages.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Every language the act accounts for, including zero findings and missing sources. */
export function focusLanguageIndex(act) {
  const languages = new Map();
  const reviewedCodes = Array.isArray(act?.coverage?.reviewed_language_codes)
    ? new Set(act.coverage.reviewed_language_codes) : null;
  const add = (language, availability) => {
    const code = language?.code;
    if (typeof code !== 'string' || !/^[a-z]{2}$/.test(code) || code === 'en') return;
    languages.set(code, {
      code,
      name: language.name || code.toUpperCase(),
      availability,
      coverageIncomplete: Boolean(language.coverage_incomplete),
      reviewState: availability !== 'archived' || language.coverage_incomplete
        ? 'unavailable'
        : reviewedCodes
          ? reviewedCodes.has(code) ? 'complete' : act?.status === 'imported' ? 'pending' : 'incomplete'
          : act?.status === 'complete' ? 'complete' : 'unknown',
      reason: language.reason || ''
    });
  };
  for (const language of act?.languages || []) add(language, 'archived');
  for (const language of act?.unavailable_languages || []) add(language, 'unavailable');
  for (const language of act?.failed_languages || []) add(language, 'failed');
  // Public variants always have an archive; this also supports minimal test data.
  for (const language of substantialLanguageIndex(act))
    if (!languages.has(language.code))
      add({ code: language.code, name: language.name }, 'archived');
  return [...languages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Present each English anchor once while preserving every reviewed language record. */
export function groupedFindings(act) {
  const groups = new Map();
  for (const finding of publicFindings(act)) {
    const key = JSON.stringify([finding.passage_id, finding.english_quote]);
    if (!groups.has(key))
      groups.set(key, {
        ...finding,
        aliases: [finding.id],
        titles: [finding.title],
        variants: finding.variants.map((variant) => ({ ...variant, finding_id: finding.id, finding_title: finding.title }))
      });
    else {
      const group = groups.get(key);
      group.aliases.push(finding.id);
      group.variants.push(
        ...finding.variants.map((variant) => ({ ...variant, finding_id: finding.id, finding_title: finding.title }))
      );
      if (!group.titles.includes(finding.title)) group.titles.push(finding.title);
      if (group.explanation !== finding.explanation)
        group.explanation =
          'The language versions below contain independently reviewed differences in meaning. Each explanation describes the interpretation and its effect.';
      if (group.category !== finding.category) group.category = 'meaning';
      group.review = {
        ...group.review,
        models: [...new Set([...(group.review?.models || []), ...(finding.review?.models || [])])],
        reviewed_at: [group.review?.reviewed_at, finding.review?.reviewed_at]
          .filter(Boolean)
          .sort()
          .at(-1)
      };
    }
  }
  const passageOrder = new Map((act?.passages || []).map((passage, index) => [passage.id, index]));
  return [...groups.values()].map(group => {
    if (group.aliases.length > 1 || new Set(group.variants.map(variant => variant.language)).size > 1)
      group.title = sharedQuoteTitle(act, group);
    return group;
  }).sort(
    (a, b) => passageOrder.get(a.passage_id) - passageOrder.get(b.passage_id)
  );
}

/** Name a shared quote from the visible language's own findings. */
export function focusedFindingTitle(finding, language = null) {
  if (!language) return finding.title;
  const titles = [...new Set(finding.variants
    .filter((variant) => variant.language === language)
    .map((variant) => variant.finding_title)
    .filter(Boolean))];
  if (titles.length === 1) return titles[0];
  if (titles.length > 1) return `${titles.length} differences in meaning in this language`;
  return finding.title;
}

/** Count display groups and distinct published records within a language focus. */
export function findingCounts(groups, language = null) {
  const matching = groups.filter(group => !language || group.variants.some(v => v.language === language));
  const ids = new Set(matching.flatMap(group => group.variants
    .filter(variant => !language || variant.language === language)
    .map(variant => variant.finding_id || group.id)));
  return { groups: matching.length, findings: ids.size };
}

/** Mechanical wording comparison only. Preserve every character, including whitespace.
 * Mark unmatched tokens; this never assigns legal significance or an impact rating.
 */
export function comparedWording(english, translation) {
  const tokenize = text => [...text.matchAll(/\s+|[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*|[^\s]/gu)]
    .map(match => ({ text: match[0], key: match[0].toLocaleLowerCase('en-GB'), space: /^\s+$/.test(match[0]) }));
  const left = tokenize(english);
  const right = tokenize(translation);
  const a = left.filter(token => !token.space);
  const b = right.filter(token => !token.space);
  const unchanged = new Set();
  if (a.length * b.length <= 120000) {
    const width = b.length + 1;
    const scores = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        scores[i * width + j] = a[i].key === b[j].key
          ? scores[(i + 1) * width + j + 1] + 1
          : Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i].key === b[j].key) {
        unchanged.add(a[i++]);
        unchanged.add(b[j++]);
      } else if (scores[(i + 1) * width + j] >= scores[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    // Bound memory and work for unusually long quotations; retain exact common ends.
    let start = 0;
    while (start < Math.min(a.length, b.length) && a[start].key === b[start].key) {
      unchanged.add(a[start]);
      unchanged.add(b[start++]);
    }
    let i = a.length - 1;
    let j = b.length - 1;
    while (i >= start && j >= start && a[i].key === b[j].key) {
      unchanged.add(a[i--]);
      unchanged.add(b[j--]);
    }
  }
  const segments = tokens => {
    const result = [];
    for (const token of tokens) {
      const changed = !token.space && !unchanged.has(token);
      if (result.at(-1)?.changed === changed) result.at(-1).text += token.text;
      else result.push({ text: token.text, changed });
    }
    return result;
  };
  return { english: segments(left), translation: segments(right) };
}

// The public label is derived from a current impact assessment, never from the
// finding's `substantial` publication threshold. `unrated` is a filter state,
// not an impact level stored in an assessment.
const impactLabels = Object.freeze({
  high: 'High',
  moderate: 'Medium',
  limited: 'Low',
  unrated: 'No impact rating yet'
});

export function impactDisplayLabel(level) {
  if (level === null) return 'Impact under review';
  return impactLabels[level] || '';
}

/** Published impact is keyed to semantic issues and original finding IDs, not quote groups. */
export function impactFamilies(act) {
  const findings = new Map(publicFindings(act).map((finding) => [finding.id, finding]));
  const seen = new Set();
  const order = { high: 0, moderate: 1, limited: 2 };
  return (Array.isArray(act?.impact_families) ? act.impact_families : [])
    .filter((family) => {
      if (
        !family ||
        typeof family.id !== 'string' ||
        !family.id ||
        seen.has(family.id) ||
        !['confirmed', 'provisional', 'needs_review'].includes(family.review_state) ||
        (family.review_state === 'needs_review'
          ? family.impact_level !== null
          : !Object.hasOwn(order, family.impact_level)) ||
        typeof family.title !== 'string' ||
        typeof family.effect !== 'string' ||
        !Array.isArray(family.finding_ids) ||
        !family.finding_ids.length ||
        !family.finding_ids.every((id) => findings.has(id))
      ) return false;
      seen.add(family.id);
      return true;
    })
    .map((family) => {
      const members = family.finding_ids.map((id) => findings.get(id));
      const languages = [...new Set(members.flatMap((finding) =>
        finding.variants.map((variant) => variant.language)
      ))];
      return { ...family, members, languages };
    })
    .sort((a, b) => (order[a.impact_level] ?? 3) - (order[b.impact_level] ?? 3) || a.title.localeCompare(b.title));
}

/** Filter original records before quote grouping so mixed-rating quotes stay honest. */
export function impactFocusedFindings(act, impact = null) {
  if (!impact) return groupedFindings(act);
  if (!['high', 'moderate', 'limited', 'unrated'].includes(impact)) return groupedFindings(act);
  const levels = new Map(impactFamilies(act).filter((family) => family.impact_level).flatMap((family) =>
    family.finding_ids.map((id) => [id, family.impact_level])
  ));
  const findings = publicFindings(act).filter((finding) => impact === 'unrated'
    ? !levels.has(finding.id)
    : levels.get(finding.id) === impact);
  return groupedFindings({ ...act, findings });
}

export function sourceOccurrences(text, quote) {
  if (!quote) return [];
  const matches = [];
  let start = text.indexOf(quote);
  while (start >= 0) {
    matches.push({ start, end: start + quote.length });
    start = text.indexOf(quote, start + quote.length);
  }
  return matches;
}

export function overlappingFindings(act, selected, candidates = groupedFindings(act)) {
  const passage = (act?.passages || []).find((item) => item.id === selected.passage_id);
  if (!passage) return [];
  const selectedRanges = sourceOccurrences(passage.text, selected.english_quote);
  return candidates.filter(
    (finding) =>
      finding.passage_id === selected.passage_id &&
      sourceOccurrences(passage.text, finding.english_quote).some((range) =>
        selectedRanges.some(
          (selectedRange) => range.start < selectedRange.end && range.end > selectedRange.start
        )
      )
  );
}

export function highlightedSegments(text, findings) {
  const intervals = findings.flatMap((finding) =>
    sourceOccurrences(text, finding.english_quote).map((range) => ({ ...range, id: finding.id }))
  );
  const bounds = [
    ...new Set([0, text.length, ...intervals.flatMap((range) => [range.start, range.end])])
  ].sort((a, b) => a - b);
  return bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1];
    const segmentText = text.slice(start, end);
    return {
      text: segmentText,
      ids: segmentText.trim()
        ? intervals
            .filter((range) => range.start <= start && range.end >= end)
            .map((range) => range.id)
        : []
    };
  });
}

/** Visual rows over exact source offsets. No source characters are rewritten. */
export function passageRows(text, label = '') {
  const lines = [];
  for (let start = 0; start < text.length; ) {
    const newline = text.indexOf('\n', start);
    const contentEnd = newline < 0 ? text.length : newline;
    const end = newline < 0 ? text.length : newline + 1;
    lines.push({ start, contentEnd, end, value: text.slice(start, contentEnd) });
    start = end;
  }
  const rows = [];
  const kindOf = (value, index) => {
    if (!value.trim()) return 'blank';
    if (index === 0 && label === value.trim() && /^Article\s+\d/i.test(label)) return 'heading';
    if (
      index === 1 &&
      rows[0]?.kind === 'heading' &&
      value.length < 100 &&
      !/[.:;!?]$/.test(value.trim())
    )
      return 'subtitle';
    if (/^[A-Z][A-Z\d\s,./()[\]–—-]*$/.test(value.trim()) && value.trim().length < 100) {
      if (label === 'Document context') return 'context-heading';
      if (label.startsWith('Annex ')) return 'annex-heading';
    }
    if (/^\d+[a-z]{0,3}\.\s+\S/i.test(value)) return 'clause';
    if (
      /^\((?:[a-z]{1,3}|\d{1,3})\)\s+\S/i.test(value) ||
      /^\d+\)\s+\S/.test(value) ||
      /^—\s+\S/.test(value)
    )
      return 'point';
    return 'paragraph';
  };
  const isMarkerLine = (value) =>
    /^(?:\((?:[a-z]{1,3}|\d{1,3})\)|\d+[a-z]{0,3}[.)]|—)\s*$/i.test(value);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (
      isMarkerLine(line.value) &&
      index + 1 < lines.length &&
      lines[index + 1].value.trim() &&
      !isMarkerLine(lines[index + 1].value)
    ) {
      const next = lines[++index];
      rows.push({
        kind: /^\d+[a-z]{0,3}\.$/i.test(line.value.trim()) ? 'clause' : 'point',
        start: line.start,
        markerEnd: line.end,
        contentEnd: next.contentEnd,
        end: next.end
      });
      continue;
    }
    // The archive flattens some official list grids into one line. Break only
    // a clear sequence of list items, keeping every character at its offset.
    const candidates = [...line.value.matchAll(/(?:[:;]) (?=(\([a-z]\)|\d+\))\s)/g)].map(
      (match) => ({ start: line.start + match.index + match[0].length, marker: match[1] })
    );
    const ordered = candidates.filter(
      ({ marker }) => /^\([a-z]\)$/.test(marker) || /^\d+\)$/.test(marker)
    );
    const first = ordered[0]?.marker;
    const second = ordered[1]?.marker;
    const sequence =
      first &&
      second &&
      ((/^\([a-z]\)$/.test(first) &&
        second === `(${String.fromCharCode(first.charCodeAt(1) + 1)})`) ||
        (/^\d+\)$/.test(first) && Number(second.slice(0, -1)) === Number(first.slice(0, -1)) + 1));
    const cuts = sequence ? ordered.map((item) => item.start) : [];
    const starts = [line.start, ...cuts];
    starts.forEach((start, partIndex) => {
      const contentEnd = starts[partIndex + 1] ?? line.contentEnd;
      const value = text.slice(start, contentEnd);
      const marker = value.match(/^(?:\((?:[a-z]{1,3}|\d{1,3})\)|\d+[a-z]{0,3}[.)]|—)\s+/i);
      rows.push({
        kind: partIndex ? 'point' : kindOf(value, index),
        start,
        markerEnd: marker ? start + marker[0].length : null,
        contentEnd,
        end: partIndex === starts.length - 1 ? line.end : contentEnd
      });
    });
  }
  return rows;
}

export function officialURL(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !(url.hostname === 'europa.eu' || url.hostname.endsWith('.europa.eu'))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function archiveURL(value) {
  if (
    typeof value !== 'string' ||
    !/^texts\/[A-Za-z0-9_./-]+\.txt$/.test(value) ||
    value.split('/').includes('..')
  )
    return null;
  return `./data/${value}`;
}

/** Use the current selection even when the initial page URL has no finding hash. */
export function selectionHash({ act, finding, language, impact, view, issue, issueFindingId }) {
  const params = new URLSearchParams();
  if (act) params.set('act', act.id);
  if (finding) params.set('finding', issue && issueFindingId ? issueFindingId : finding.id);
  if (language) params.set('lang', language);
  if (impact) params.set('impact', impact);
  if (view === 'impact') params.set('view', 'impact');
  if (view === 'impact' && issue) params.set('issue', issue.id);
  return params.toString();
}

export function selectedFromHash(hash, legislation) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const act = legislation.find((item) => item.id === params.get('act')) || legislation[0] || null;
  const requestedImpact = params.get('impact');
  const impact = ['high', 'moderate', 'limited', 'unrated'].includes(requestedImpact)
    ? requestedImpact
    : null;
  let finding = act
    ? impactFocusedFindings(act, impact).find((item) => item.aliases.includes(params.get('finding'))) || null
    : null;
  const requestedLanguage = params.get('lang');
  const language =
    act && focusLanguageIndex(act).some((item) => item.code === requestedLanguage)
      ? requestedLanguage
      : null;
  if (finding && language && !finding.variants.some((variant) => variant.language === language))
    finding = null;
  const view = params.get('view') === 'impact' ? 'impact' : 'text';
  let issue = view === 'impact' && act
    ? impactFamilies(act).find((family) => family.id === params.get('issue') &&
      (!impact || (impact === 'unrated' ? family.impact_level === null : family.impact_level === impact))) || null
    : null;
  let issueFindingId = null;
  if (issue) {
    const eligible = issue.members.filter((member) =>
      !language || member.variants.some((variant) => variant.language === language)
    );
    if (!eligible.length) issue = null;
    else {
      const requested = eligible.find((member) => member.id === params.get('finding')) || eligible[0];
      issueFindingId = requested.id;
      finding = impactFocusedFindings(act, impact).find((group) => group.aliases.includes(requested.id)) || null;
    }
  }
  if (view === 'impact' && !issue) finding = null;
  return { act, finding, language, impact, view, issue, issueFindingId };
}

export function completionMessage(act, findings) {
  const coverage = act.coverage || {};
  const reviewed = Number(coverage.reviewed_units) || 0;
  const total = Number(coverage.total_units) || 0;
  if (act.status === 'complete')
    return findings.length
      ? 'Review complete'
      : 'No supported differences found in the completed review';
  if (act.status === 'analyzing') return 'Analysis in progress';
  if (act.status === 'partial') return `Partial review · ${reviewed} of ${total} units checked`;
  if (act.status === 'failed') return 'Analysis interrupted';
  return 'Source archived · analysis pending';
}
