/** Pure reader rules shared by browser views and publication checks.
 * Grouping changes presentation only; source quotes and finding aliases survive.
 */
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
  const add = (language, availability) => {
    const code = language?.code;
    if (typeof code !== 'string' || !/^[a-z]{2}$/.test(code) || code === 'en') return;
    languages.set(code, {
      code,
      name: language.name || code.toUpperCase(),
      availability,
      coverageIncomplete: Boolean(language.coverage_incomplete),
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
        variants: finding.variants.map((variant) => ({ ...variant, finding_title: finding.title }))
      });
    else {
      const group = groups.get(key);
      group.aliases.push(finding.id);
      group.variants.push(
        ...finding.variants.map((variant) => ({ ...variant, finding_title: finding.title }))
      );
      if (!group.titles.includes(finding.title)) group.titles.push(finding.title);
      if (group.titles.length > 1) group.title = `${group.titles[0]}, and related differences`;
      if (group.explanation !== finding.explanation)
        group.explanation =
          'The language versions below contain independently reviewed potential differences. Each explanation describes its possible effect.';
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
  return [...groups.values()].sort(
    (a, b) => passageOrder.get(a.passage_id) - passageOrder.get(b.passage_id)
  );
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

export function overlappingFindings(act, selected) {
  const passage = (act?.passages || []).find((item) => item.id === selected.passage_id);
  if (!passage) return [];
  const selectedRanges = sourceOccurrences(passage.text, selected.english_quote);
  return groupedFindings(act).filter(
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
export function selectionHash({ act, finding, language }) {
  const params = new URLSearchParams();
  if (act) params.set('act', act.id);
  if (finding) params.set('finding', finding.id);
  if (language) params.set('lang', language);
  return params.toString();
}

export function selectedFromHash(hash, legislation) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const act = legislation.find((item) => item.id === params.get('act')) || legislation[0] || null;
  let finding = act
    ? groupedFindings(act).find((item) => item.aliases.includes(params.get('finding'))) || null
    : null;
  const requestedLanguage = params.get('lang');
  const language =
    act && focusLanguageIndex(act).some((item) => item.code === requestedLanguage)
      ? requestedLanguage
      : null;
  if (finding && language && !finding.variants.some((variant) => variant.language === language))
    finding = null;
  return { act, finding, language };
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
