import { useId, useSyncExternalStore } from 'react';
import { provenance as appRegistry, describeEntry, textAlternative } from '../data/provenance.js';
import { useMissionStore } from '../state/store.js';
import './SourceTag.css';

// Source tag (#62): says next to a value whether it was measured (DATA), computed by us (DERIVED) or simulated
// (SIM), and where it comes from. The provenance comes from src/data/provenance.js; the store's sources[path]
// entry, written by whoever writes the value, overrides the tag and label for the current sample.

const TEXT = { label: (e) => e.label, short: (e) => e.short, tag: (e) => e.tag };

/**
 * @param {{
 *   path: string,
 *   variant?: 'label' | 'short' | 'tag',
 *   interactive?: boolean,
 *   requireSource?: boolean,
 *   source?: { tag: string, label?: string, source?: string } | null,
 *   className?: string | ((tag: string) => string),
 *   registry?: ReturnType<typeof import('../data/provenance.js').createProvenanceRegistry>,
 * }} props
 *   path: store path of the value, for example 'environment.tempC'.
 *   variant: 'label' "MEDA · Perseverance · sol 1187" (default), 'short' "MEDA · Perseverance", 'tag' "DATA".
 *   interactive: details on hover and keyboard focus (default). Off where the pointer never reaches, such as the
 *     helmet HUD; the full text then goes to the title and to screen readers.
 *   requireSource: render nothing until the store has sources[path], so a placeholder value shows no tag.
 *   source: a live entry to use instead of the store's sources[path], for a value computed outside the store.
 *   className: replaces the default chip style with the caller's own classes. A function gets the lowercase tag.
 */
export default function SourceTag({ path, variant = 'label', interactive = true, requireSource = false, source, className, registry = appRegistry }) {
  const stored = useMissionStore((s) => s.sources[path]);
  const live = source === undefined ? stored : source;
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion);
  const id = useId();
  const entry = registry.resolve(path, live);
  if (!entry || (requireSource && !live)) return null;

  const tag = entry.tag.toLowerCase();
  const text = (TEXT[variant] ?? TEXT.label)(entry);
  const own = typeof className === 'function' ? className(tag) : className;
  const classes = ['source-tag', `source-tag-${tag}`, own ?? 'source-tag-chip'].join(' ');
  const alt = textAlternative(entry);

  if (!interactive) {
    return (
      <span className={classes} data-tag={entry.tag} title={entry.source ?? entry.label}>
        <span aria-hidden="true">{text}</span>
        <span className="source-tag-sr">{alt}</span>
      </span>
    );
  }

  const onKeyDown = (e) => { if (e.key === 'Escape' && e.currentTarget.contains(document.activeElement)) document.activeElement.blur(); };
  return (
    <span className={classes + ' source-tag-interactive'} data-tag={entry.tag} tabIndex={0} aria-describedby={id} onKeyDown={onKeyDown}>
      <span aria-hidden="true">{text}</span>
      <span id={id} className="source-tag-sr">{alt}</span>
      <span className="source-tag-tip" aria-hidden="true">
        <dl>
          {describeEntry(entry).map(([k, v, href]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{href ? <a href={href} target="_blank" rel="noreferrer" tabIndex={-1}>{v}</a> : v}</dd>
            </div>
          ))}
        </dl>
      </span>
    </span>
  );
}
