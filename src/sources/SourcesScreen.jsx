import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef, useState } from 'react';
import { groupEntries, linkHost } from './credits.js';
import { loadDataFile } from '../data/dataFiles.js';
import { CREDITS_PATH } from '../data/provenance.js';
import { SOURCES_KEY, closeSources, openSources, useSourcesStore } from './sourcesStore.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import './sources.css';
import './sourcesMobile.css';

// Not bundled. The provenance registry has usually loaded it already, and the shared loader
// returns that copy; a failed load is tried again on the next open.
const loadCredits = () => loadDataFile(CREDITS_PATH);

const STATEMENT = [
  { key: 'real', get label() { return t('ui.real'); } },
  { key: 'artistic', get label() { return t('ui.artistic'); } },
  { key: 'modelled', get label() { return t('ui.modelled'); } },
];

// Plain-text tags until #62 ships the SourceTag component and provenance registry. Swap these spans for it then.
const TAGS = [
  { id: 'data', label: 'DATA', get text() { return t('ui.measured.by.a.mission.or.stated.in.a'); } },
  { id: 'derived', label: 'DERIVED', get text() { return t('ui.calculated.by.us.from.data'); } },
  { id: 'sim', label: 'SIM', get text() { return t('ui.our.assumption.or.a.game.choice'); } },
];

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

/**
 * Keep Tab inside the dialog. A native modal dialog makes the page inert, but Chrome still lets Tab
 * leave for the browser UI at either end, which drops focus on <body>. Wrap from last to first and back.
 */
export function wrapFocus(event, dialog) {
  if (!dialog) return;
  const items = [...dialog.querySelectorAll('button:not([disabled]), a[href]')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

const typingTarget =(el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Mounted once by App. Owns the keyboard shortcut and the credits fetch, and
 * shows the screen while the store says it is open.
 */
export default function SourcesRoot() {
  const open = useSourcesStore((s) => s.open);
  const [state, setState] = useState({ status: 'loading', credits: null });

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== SOURCES_KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingTarget(event.target) || wristOwnsKeys()) return;
      if (useSourcesStore.getState().open) closeSources();
      else openSources();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadCredits()
      .then((credits) => !cancelled && setState({ status: 'ready', credits }))
      .catch(() => !cancelled && setState((s) => ({ ...s, status: 'error' })));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  return <SourcesScreen credits={state.credits} status={state.status} onClose={closeSources} />;
}

/**
 * The sources screen: the real, artistic and modelled statement on top, then
 * every entry of credits.json grouped by kind.
 *
 * @param {{ credits: object | null, status: 'loading' | 'ready' | 'error', onClose: () => void }} props
 */
export function SourcesScreen({ credits, status, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  // Modal dialog: the browser traps focus inside and makes the rest of the page inert.
  // Focus goes to the close button on open and back to the opener on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (dialog && !dialog.open) dialog.showModal?.();
    closeRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const onCancel = (event) => {
    event.preventDefault();
    onClose();
  };

  const onKeyDown = (event) => {
    // Keep walk keys (WASD, arrows) from reaching the engine's window listener while the screen is open.
    event.stopPropagation();
    if (event.key === 'Escape') onCancel(event);
    else if (event.key === 'Tab') wrapFocus(event, dialogRef.current);
    else if (event.code === SOURCES_KEY && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !typingTarget(event.target)) onClose();
  };

  const statement = credits?.statement;
  const groups = groupEntries(credits);
  const resources = credits?.challenge_resources ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="sources"
      aria-labelledby="sources-title"
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <div className="sources-frame">
        <header className="sources-head">
          <div>
            <p className="sources-kicker">
              {t('ui.credits')}{groups.length ? ` · ${t('ui.p0.sources.in.p1.groups', { p0: credits.entries.length, p1: groups.length })}` : ''}
            </p>
            <h2 id="sources-title">{t('ui.sources.188')}</h2>
          </div>
          <button ref={closeRef} type="button" className="sources-close" onClick={onClose} aria-label={t('ui.close.sources')} title={t('ui.close.esc')}>
            {t('ui.close').trim()}
          </button>
        </header>

        <section className="sources-statement" aria-labelledby="sources-statement-title">
          <h3 id="sources-statement-title" className="sources-visually-hidden">{t('ui.what.is.real.what.is.artistic.and.what')}</h3>
          <dl className="sources-truth">
            {STATEMENT.map(({ key, label }) => (
              <div key={key} className={`sources-truth-item sources-truth-${key}`}>
                <dt>{label}</dt>
                <dd>{statement ? sentence(statement[key]) : '…'}</dd>
              </div>
            ))}
          </dl>
          <p className="sources-tags">
            {TAGS.map((tag) => (
              <span key={tag.id} className="sources-tag-item">
                <span className={`sources-tag sources-tag-${tag.id}`}>{tag.label}</span> {tag.text}
              </span>
            ))}
          </p>
        </section>

        <div className="sources-body" tabIndex={-1}>
          {status === 'error' && <p className="sources-status">{t('ui.credits.json.could.not.be.loaded.close.and')}</p>}
          {status === 'loading' && !credits && <p className="sources-status">{t('ui.loading.sources')}</p>}

          {groups.map((group) => (
            <section key={group.id} className="sources-group" aria-labelledby={`sources-${group.id}`}>
              <h3 id={`sources-${group.id}`}>
                {translateText(group.label)} <span>· {group.entries.length}</span>
              </h3>
              <ul className="sources-list">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="sources-entry" data-entry={entry.id}>
                    <h4>{entry.name}</h4>
                    <p className="sources-provider">{entry.provider}</p>
                    <p className="sources-credit">{t('ui.credit.line', { text: entry.credit_line })}</p>
                    <p className="sources-licence">{t('ui.licence.line', { text: entry.license })}</p>
                    <a href={entry.url} target="_blank" rel="noopener noreferrer">
                      {linkHost(entry.url)}
                      <span className="sources-visually-hidden">{t('ui.opens.in.a.new.tab')}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {resources.length > 0 && (
            <section className="sources-group" aria-labelledby="sources-challenge">
              <h3 id="sources-challenge">{t('ui.space.apps.challenge.resources')}</h3>
              <ul className="sources-resources">
                {resources.map((r) => (
                  <li key={r.name}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        {r.name}
                        <span className="sources-visually-hidden">{t('ui.opens.in.a.new.tab')}</span>
                      </a>
                    ) : (
                      <b>{r.name}</b>
                    )}
                    <span>{r.used ? t('used', { text: r.used }) : r.pending ? t('pendingResource', { text: r.pending }) : t('ui.not.used')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {statement?.notes?.length > 0 && (
            <ul className="sources-notes">
              {statement.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
