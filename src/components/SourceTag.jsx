import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { provenance as appRegistry, describeEntry, textAlternative } from '../data/provenance.js';
import { MAP_CHROME, chromeRects, placePopup, rectIn } from '../plan/popupPlacement.js';
import { useMissionStore } from '../state/store.js';
import './SourceTag.css';

// Source tag (#62): says next to a value whether it was measured (DATA), computed by us (DERIVED) or simulated
// (SIM), and where it comes from. The provenance comes from src/data/provenance.js; the store's sources[path]
// entry, written by whoever writes the value, overrides the tag and label for the current sample.

const TEXT = { label: (e) => e.label, short: (e) => e.short, tag: (e) => e.tag };
const TIP_WIDTH = 360, GAP = 6, MARGIN = 8, CLOSE_MS = 150;

// The details render in a portal on document.body with fixed coordinates, so a scrolling panel
// (overflow: auto) cannot clip them. They open below the tag, or above it when there is no room.
function placeTip(anchor) {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(TIP_WIDTH, window.innerWidth - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - w - MARGIN));
  const below = r.bottom + GAP;
  return below < window.innerHeight * 0.6 ? { left, top: below, maxWidth: w } : { left, bottom: window.innerHeight - r.top + GAP, maxWidth: w };
}

// On the mission table map the details follow the map's popup rules (#380): inside the map, beside the tag, or beside
// the legend card that holds it, and clear of the map's caption, legend and rover key.
function placeOnMap(anchor, tip) {
  const map = anchor.closest('.table-map');
  if (!map) return null;
  const origin = map.getBoundingClientRect();
  const card = anchor.closest(MAP_CHROME);
  const p = placePopup({
    anchor: rectIn(origin, card ?? anchor),
    size: { width: tip.offsetWidth, height: tip.offsetHeight },
    box: { width: map.clientWidth, height: map.clientHeight },
    avoid: chromeRects(map, origin, anchor),
  });
  return { left: origin.left + p.left, top: origin.top + p.top };
}

function Details({ entry, style, anchor, onEnter, onLeave }) {
  const ref = useRef(null);
  const [onMap, setOnMap] = useState(null);
  const inMap = Boolean(anchor?.closest('.table-map'));
  useLayoutEffect(() => {
    if (!inMap || !ref.current) return;
    const map = anchor.closest('.table-map');
    ref.current.style.maxWidth = `${Math.min(TIP_WIDTH, map.clientWidth - 2 * MARGIN)}px`;
    setOnMap(placeOnMap(anchor, ref.current));
  }, [anchor, inMap, entry]);
  const placed = !inMap ? style : onMap ? { left: onMap.left, top: onMap.top, maxWidth: style.maxWidth } : { ...style, visibility: 'hidden' };
  return createPortal(
    <div className="source-tag-tip" ref={ref} style={placed} aria-hidden="true" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <dl>
        {describeEntry(entry).map(([k, v, href]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{href ? <a href={href} target="_blank" rel="noreferrer" tabIndex={-1}>{v}</a> : v}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body,
  );
}

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
  const [tip, setTip] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const closeTimer = useRef(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
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

  const open = (e) => { clearTimeout(closeTimer.current); setAnchor(e.currentTarget); setTip(placeTip(e.currentTarget)); };
  const closeSoon = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setTip(null), CLOSE_MS); };
  const keep = () => clearTimeout(closeTimer.current);
  const close = () => { clearTimeout(closeTimer.current); setTip(null); };
  const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
  return (
    <span
      className={classes + ' source-tag-interactive'} data-tag={entry.tag} tabIndex={0} aria-describedby={id}
      onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={close} onKeyDown={onKeyDown}
    >
      <span aria-hidden="true">{text}</span>
      <span id={id} className="source-tag-sr">{alt}</span>
      {tip && <Details entry={entry} style={tip} anchor={anchor} onEnter={keep} onLeave={closeSoon} />}
    </span>
  );
}
