/** Group credit entries by kind, in the order credits.json lists the kinds. Kinds with no entries are dropped. */
export function groupEntries(credits) {
  const kinds = credits?.kinds ?? [];
  const entries = credits?.entries ?? [];
  const known = new Set(kinds.map((k) => k.id));
  const groups = kinds
    .map((kind) => ({ ...kind, entries: entries.filter((e) => e.kind === kind.id) }))
    .filter((g) => g.entries.length);
  const orphans = entries.filter((e) => !known.has(e.kind));
  if (orphans.length) groups.push({ id: 'other', label: 'Other sources', entries: orphans });
  return groups;
}

/** Host name for a link label, for example "doi.org". Falls back to the raw text. */
export function linkHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
