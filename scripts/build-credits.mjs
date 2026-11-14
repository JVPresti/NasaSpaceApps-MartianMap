// Build public/data/credits.json and docs/credits.md.
//
// Usage: npm run credits
//
// 1. Reads every provenance block in public/data/*.json (except credits.json).
// 2. Groups the blocks by URL. A URL claimed by an entry in
//    scripts/credits-sources.mjs (`match`) joins that entry; any other URL
//    becomes its own entry with defaults from its blocks.
// 3. Adds the hand-written entries (models, textures, libraries, terrain).
// 4. Reads the "What is real and what is not" section of
//    docs/marswalk-assets/README.md for the statement.
// 5. Writes both files. The output has no dates, so two runs give the same bytes.
//
// Blocks with no URL are team assumptions or project text. They credit nobody
// and are skipped.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHALLENGE_RESOURCES, CURATED, KINDS, KIND_RULES, MISSION_NAMES } from './credits-sources.mjs';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

export const CREDITS_JSON = 'public/data/credits.json';
export const CREDITS_MD = 'docs/credits.md';
const DATA_DIR = 'public/data';
const README = 'docs/marswalk-assets/README.md';

const REQUIRED = ['id', 'name', 'kind', 'provider', 'credit_line', 'license', 'url', 'used_in'];

/** Every provenance block in a parsed JSON file, with a readable path to its owner. */
export function collectProvenance(json, file) {
  const out = [];
  const label = (item, i) => item?.id ?? item?.name ?? item?.file ?? i;
  const walk = (node, path, owner) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${label(item, i)}]`, owner));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'provenance') {
        const blocks = Array.isArray(value) ? value : [value];
        for (const block of blocks) if (block && typeof block === 'object') out.push({ file, path, block, owner: node });
      } else {
        walk(value, path ? `${path}.${key}` : key, node);
      }
    }
  };
  walk(json, '', null);
  return out;
}

/** Files in public/data that can carry provenance, sorted. */
export function dataFiles() {
  return readdirSync(root(DATA_DIR))
    .filter((f) => f.endsWith('.json') && f !== 'credits.json')
    .sort();
}

export function readAllProvenance() {
  return dataFiles().flatMap((f) => collectProvenance(JSON.parse(readFileSync(root(`${DATA_DIR}/${f}`), 'utf8')), f));
}

const isOwnWork = (b) => /calculation|Project value/i.test(b.license ?? '') || /^Marswalk team/i.test(b.reference ?? '');

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

function kindFor(uses) {
  for (const use of uses) {
    for (const [pattern, kind] of KIND_RULES) if (pattern.test(use)) return kind;
  }
  throw new Error(
    `No kind for a source used in ${uses[0]}. Add a KIND_RULES pattern or a CURATED entry in scripts/credits-sources.mjs.`,
  );
}

/** One entry from provenance blocks that no curated entry claims. */
function defaultEntry(url, items) {
  const sourceBlocks = items.map((i) => i.block).filter((b) => !isOwnWork(b));
  const blocks = sourceBlocks.length ? sourceBlocks : items.map((i) => i.block);
  const reference = mostCommon(blocks.map((b) => b.reference).sort((a, b) => b.length - a.length).slice(0, 1));
  const ownerCredit = mostCommon(items.map((i) => i.owner?.credit));
  return {
    id: slug(reference ?? url),
    name: reference ?? url,
    kind: kindFor(items.map((i) => `${i.file}:${i.path}`)),
    mission: mostCommon(blocks.map((b) => b.mission)),
    instrument: mostCommon(blocks.map((b) => b.instrument)),
    credit_line: ownerCredit ?? reference ?? url,
    url,
  };
}

/** The merged, sorted credits object. */
export function buildCredits() {
  const provenance = readAllProvenance().filter((p) => p.block.url);
  const byUrl = new Map();
  for (const p of provenance) {
    if (!byUrl.has(p.block.url)) byUrl.set(p.block.url, []);
    byUrl.get(p.block.url).push(p);
  }

  const claimed = new Map();
  for (const entry of CURATED) for (const url of entry.match ?? []) claimed.set(url, entry.id);

  const groups = new Map(CURATED.map((e) => [e.id, { curated: e, items: [] }]));
  for (const [url, items] of byUrl) {
    const id = claimed.get(url);
    if (id) groups.get(id).items.push(...items);
    else {
      const auto = defaultEntry(url, items);
      let unique = auto.id;
      for (let n = 2; groups.has(unique); n++) unique = `${auto.id}-${n}`;
      groups.set(unique, { curated: { ...auto, id: unique, match: [url], origin: 'provenance' }, items });
    }
  }

  const kindOrder = new Map(KINDS.map((k, i) => [k.id, i]));
  const entries = [];
  for (const { curated, items } of groups.values()) {
    const blocks = items.map((i) => i.block);
    const sourceBlocks = blocks.filter((b) => !isOwnWork(b));
    const pick = sourceBlocks.length ? sourceBlocks : blocks;
    const sourceUrls = uniqueSorted([...(curated.match ?? []), ...blocks.map((b) => b.url)]);
    const usedIn = uniqueSorted([...(curated.used_in ?? []), ...items.map((i) => `${DATA_DIR}/${i.file}: ${i.path}`)]);
    const entry = {
      id: curated.id,
      name: curated.name,
      kind: curated.kind,
      provider:
        curated.provider ??
        curated.mission ??
        mostCommon(pick.map((b) => b.mission)) ??
        (/nasa\.gov|lpi\.usra/.test(curated.url ?? sourceUrls[0]) ? 'NASA' : 'Published paper'),
      mission: curated.mission ?? null,
      instrument: curated.instrument ?? null,
      credit_line: curated.credit_line,
      citation: curated.citation ?? null,
      license: curated.license ?? mostCommon(pick.map((b) => b.license)),
      license_url: curated.license_url ?? null,
      url: curated.url ?? sourceUrls[0],
      source_urls: sourceUrls,
      data_urls: uniqueSorted([...(curated.data_urls ?? []), ...blocks.map((b) => b.data_url)]),
      used_in: usedIn,
      origin: curated.origin ?? (items.length ? 'provenance' : 'manual'),
    };
    if (curated.match?.length && !items.length) {
      throw new Error(`${entry.id} matches ${curated.match.join(', ')} but no data file cites it. Remove the entry or fix the URL.`);
    }
    if (!kindOrder.has(entry.kind)) throw new Error(`${entry.id}: unknown kind ${entry.kind}`);
    for (const key of REQUIRED) {
      const v = entry[key];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) throw new Error(`${entry.id}: missing ${key}`);
    }
    entries.push(entry);
  }
  entries.sort((a, b) => kindOrder.get(a.kind) - kindOrder.get(b.kind) || a.id.localeCompare(b.id));

  return {
    schema_version: 1,
    title: 'Marswalk credits and NASA sources',
    description:
      'Every dataset, image, paper, document, 3D model, texture and library the app uses, with the credit line each source asks for. Generated by npm run credits (scripts/build-credits.mjs) from the provenance blocks in public/data/*.json and the hand-written list in scripts/credits-sources.mjs. Do not edit by hand.',
    statement: readStatement(),
    kinds: KINDS,
    challenge_resources: CHALLENGE_RESOURCES.map((r) => ({
      name: r.name,
      url: r.url,
      used: r.used,
      pending: r.pending ?? null,
    })),
    entries,
  };
}

/** The "What is real and what is not" bullets of the assets README. */
export function readStatement() {
  const text = readFileSync(root(README), 'utf8');
  const match = text.match(/## What is real and what is not[^\n]*\n([\s\S]*?)\n## /);
  if (!match) throw new Error(`${README} has no "What is real and what is not" section`);
  const bullets = [];
  for (const line of match[1].split('\n')) {
    if (line.startsWith('- ')) bullets.push(line.slice(2).trim());
    else if (line.trim() && bullets.length) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  const take = (prefix) => {
    const b = bullets.find((x) => x.startsWith(prefix));
    if (!b) throw new Error(`${README}: no "${prefix}" bullet`);
    return b.slice(prefix.length).trim();
  };
  const real = take('Real:');
  const artistic = take('Artistic:');
  const modelled = take('Modelled / estimated:');
  const notes = bullets.filter((b) => !/^(Real|Artistic|Modelled \/ estimated):/.test(b));
  return {
    source: README,
    real,
    artistic,
    modelled,
    notes,
    data_tags:
      'Every number on screen carries a tag: DATA (measured by a mission or stated in a NASA document), DERIVED (calculated by us from DATA) or SIM (our assumption or a game choice). Published observations are historical, not current conditions. RAD measured radiation in Gale crater, not in Jezero.',
  };
}

const cell = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

/** Mission and instrument list for the submission form, from the entries. */
export function missionList(entries) {
  const missions = new Map();
  for (const e of entries) {
    if (!e.mission) continue;
    const name = e.mission in MISSION_NAMES ? MISSION_NAMES[e.mission] : e.mission;
    if (!name) continue;
    if (!missions.has(name)) missions.set(name, new Set());
    for (const i of (e.instrument ?? '').split(/,\s*/)) if (i) missions.get(name).add(i);
  }
  return [...missions]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, set]) => (set.size ? `${name}: ${[...set].sort().join(', ')}` : name));
}

export function renderMarkdown(credits) {
  const { statement, entries, kinds } = credits;
  const out = [];
  out.push('# Credits and NASA sources', '');
  out.push(
    'Generated by `npm run credits` from the same data as `public/data/credits.json`. Do not edit by hand: change the provenance blocks in `public/data/*.json` or the list in `scripts/credits-sources.mjs`, then run the script.',
    '',
  );
  out.push('## What is real, artistic and modelled', '');
  out.push(`- Real: ${statement.real}`);
  out.push(`- Artistic: ${statement.artistic}`);
  out.push(`- Modelled or estimated: ${statement.modelled}`);
  for (const n of statement.notes) out.push(`- ${n}`);
  out.push(`- ${statement.data_tags}`, '');
  out.push(`Source: \`${statement.source}\`.`, '');

  for (const kind of kinds) {
    const list = entries.filter((e) => e.kind === kind.id);
    if (!list.length) continue;
    out.push(`## ${kind.label}`, '');
    out.push('| Source | Credit | Licence | Used in |', '|---|---|---|---|');
    for (const e of list) {
      const licence = e.license_url ? `${cell(e.license)} ([terms](${e.license_url}))` : cell(e.license);
      out.push(`| [${cell(e.name)}](${e.url}) | ${cell(e.credit_line)} | ${licence} | ${cell(e.used_in.join('; '))} |`);
    }
    out.push('');
  }

  out.push('## Submission form: NASA data and resources used', '');
  out.push('Paste the block below into the Space Apps form. It is generated from the same list.', '');
  out.push('```text', ...submissionText(credits), '```', '');
  return `${out.join('\n')}`;
}

export function submissionText(credits) {
  const { entries, challenge_resources: resources } = credits;
  const used = resources.filter((r) => r.used);
  const lines = [];
  lines.push('NASA data and resources used');
  lines.push('');
  lines.push('Space Apps challenge resources:');
  for (const r of used) lines.push(`- ${r.name} (${r.url}): ${r.used}.`);
  lines.push('');
  lines.push('NASA data products:');
  for (const e of entries.filter((x) => x.kind === 'terrain_imagery' && x.mission)) {
    lines.push(`- ${e.name}. Credit: ${e.credit_line}. ${e.url}`);
  }
  for (const e of entries.filter((x) => x.kind === 'surface_images' && /Photojournal|raw images/.test(x.provider))) {
    lines.push(`- ${e.name}. Credit: ${e.credit_line}. ${e.url}`);
  }
  lines.push('- NASA CCMC DONKI space weather records for the 10 September 2017 solar event.');
  lines.push('');
  lines.push('NASA missions and instruments behind the numbers and images:');
  for (const m of missionList(entries)) lines.push(`- ${m}`);
  lines.push('');
  const docs = entries.filter((e) => e.source_urls.some((u) => /ntrs\.nasa\.gov|nasa\.gov\/wp-content|pds-geosciences|hq\.nasa\.gov|lpi\.usra/.test(u)));
  lines.push('NASA technical documents:');
  for (const e of docs) lines.push(`- ${e.name}`);
  lines.push('');
  lines.push('NASA 3D models: ' + entries.filter((e) => e.provider === 'NASA 3D Resources').map((e) => e.name).join('; ') + '.');
  lines.push('');
  lines.push(
    `Peer-reviewed papers on Mars measurements: ${entries
      .filter((e) => e.url.startsWith('https://doi.org/10.') && !e.url.startsWith('https://doi.org/10.5066') && e.mission)
      .map((e) => `${e.credit_line.split(',')[0]} et al. ${e.credit_line.match(/\b(19|20)\d\d\b/)?.[0] ?? ''}`)
      .join('; ')}.`,
  );
  const notUsed = resources.filter((r) => !r.used);
  if (notUsed.length) {
    lines.push('');
    lines.push(
      `Not used: ${notUsed.map((r) => (r.pending ? `${r.name} (planned: ${r.pending})` : r.name)).join('; ')}.`,
    );
  }
  return lines;
}

function main() {
  const credits = buildCredits();
  writeFileSync(root(CREDITS_JSON), `${JSON.stringify(credits, null, 2)}\n`);
  writeFileSync(root(CREDITS_MD), renderMarkdown(credits));
  console.log(`Wrote ${CREDITS_JSON} (${credits.entries.length} entries) and ${CREDITS_MD}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
