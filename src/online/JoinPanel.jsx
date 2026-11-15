import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { ROLE, getOnlineController, normalizeCode, randomRoomCode, useOnlineSession } from '../onlineLink.js';
import { useMissionStore } from '../state/store.js';
import { issueText, onlineIssue, otherRole, roleLabel, seatsLabel, statusLabel } from './onlineText.js';
import './online.css';

const host = () => globalThis.location?.host || '';

/** The room code and the host, so testers on different hosts (a preview and production) notice they never meet. */
export function RoomLine({ code, status }) {
  return (
    <p className="online-room">
      <code>{code}</code>
      <span>{t('online.host', { host: host() })}</span>
      {status && <span className={'online-status status-' + status}><i aria-hidden="true" />{statusLabel(status)}</span>}
    </p>
  );
}

function RoleChoice({ role, seats, full, disabled, onRole }) {
  return (
    <fieldset className="online-roles" disabled={disabled}>
      <legend>{t('online.role')}</legend>
      {[ROLE.SURFACE, ROLE.HABITAT].map((id) => {
        const left = full === id ? 0 : seats[id];
        return (
          <label key={id} className={role === id ? 'online-role on' : 'online-role'}>
            <input type="radio" name="online-role" value={id} checked={role === id} disabled={left === 0} onChange={() => onRole(id)} />
            <span className="online-role-name">{roleLabel(id)}</span>
            <span className="online-role-help">{t(id === ROLE.HABITAT ? 'online.role.habitat.help' : 'online.role.surface.help')}</span>
            <span className={left === 0 ? 'online-role-seats tone-warning' : 'online-role-seats'}>{seatsLabel(id, left)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The join panel (#52): room code, host, name, seat and one main action. It connects only on "Join the room" and
 * calls onStart once the room seats the player, or once it gives up (offline: the game goes on solo).
 */
export function JoinPanel({ busy = false }) {
  const s = useOnlineSession((x) => x);
  const online = useMissionStore((x) => x.online);
  const controller = getOnlineController();
  const issue = onlineIssue(s.joining || s.handle ? online : null, s.full, s.role);
  const roleFull = s.full === s.role;
  const ready = !!s.net && !s.joining && !roleFull && !busy;

  return (
    <form className="online-join" onSubmit={(event) => { event.preventDefault(); if (ready) controller?.join(); }}>
      <p className="online-kicker">{t('online.join.kicker')}</p>
      <RoomLine code={s.code} status={s.handle ? online.status : null} />
      <p className="online-help">{t('online.host.help')}</p>

      {s.loadError ? (
        <p className="dialog-notice" role="alert">{t('online.loadError')}</p>
      ) : (
        <>
          <label className="online-field">
            <span>{t('online.name')}</span>
            <input type="text" value={s.name} maxLength={32} autoComplete="nickname" disabled={!s.net || s.joining} onChange={(event) => controller?.setName(event.target.value)} />
          </label>
          <RoleChoice role={s.role} seats={s.seats} full={s.full} disabled={!s.net || s.joining} onRole={(role) => controller?.setRole(role)} />
        </>
      )}

      {issue && issue.kind !== 'offline' && <p className="dialog-notice" role="alert">{issueText(issue)}</p>}
      {issue?.kind === 'replaced' && <p className="online-help">{t('online.replaced.help')}</p>}

      <div className="start-actions">
        {issue?.kind === 'replaced' ? (
          <button type="button" className="start-primary" data-autofocus="true" onClick={() => controller?.joinAsNewPlayer()}>{t('online.newPlayer')}</button>
        ) : roleFull ? (
          <button type="button" className="start-primary" data-autofocus="true" onClick={() => controller?.switchRole(otherRole(s.role))}>
            {t('online.joinAs', { role: roleLabel(otherRole(s.role)) })}
          </button>
        ) : (
          <button type="submit" className="start-primary" data-autofocus="true" disabled={!ready}>
            {s.joining ? t('online.joining') : s.net || s.loadError ? t('online.join') : t('online.loading')}
          </button>
        )}
        <button type="button" className="ui-button ghost online-wide" onClick={() => controller?.leave()}>{t('online.leave')}</button>
      </div>
    </form>
  );
}

/** "Play online" without a code: type one or make a new one, then the same join panel. */
export function RoomPicker() {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const controller = getOnlineController();
  const code = normalizeCode(text);
  return (
    <form className="online-join" onSubmit={(event) => { event.preventDefault(); setTouched(true); if (code) controller?.openRoom(code); }}>
      <p className="online-kicker">{t('online.play')}</p>
      <label className="online-field">
        <span>{t('online.pick.code')}</span>
        <input
          type="text" className="online-code-input" value={text} maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          data-autofocus="true" aria-describedby="online-pick-help"
          onChange={(event) => setText(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          onBlur={() => setTouched(text.length > 0)}
        />
      </label>
      <p id="online-pick-help" className={touched && !code ? 'online-help tone-warning' : 'online-help'}>{t('online.pick.help')}</p>
      <div className="start-actions">
        <button type="submit" className="start-primary" disabled={!code}>{t('online.pick.open')}</button>
        <button type="button" className="ui-button ghost" onClick={() => controller?.openRoom(randomRoomCode())}>{t('online.pick.create')}</button>
        <button type="button" className="ui-button ghost" onClick={() => controller?.closePicker()}>{t('online.pick.back')}</button>
      </div>
    </form>
  );
}

/**
 * The start screen's online part. `children` are the offline actions. With a room link it shows the join panel
 * instead, and continues into the normal flow (onStart) once the player is in the room. Offline it adds "Play online".
 */
export default function OnlineStart({ busy = false, onStart, children }) {
  useLanguage();
  const view = useOnlineSession((s) => s.view);
  const joined = useOnlineSession((s) => s.joined);
  const joinSeq = useOnlineSession((s) => s.joinSeq);
  const code = useOnlineSession((s) => s.code);
  const badCode = useOnlineSession((s) => s.badCode);
  const status = useMissionStore((s) => s.online.status);
  const controller = getOnlineController();
  // Continue once per join that happens while this screen is up. joinSeq counts joins, so a welcome that lands in the
  // same render as the Join press still counts, and a start screen shown again after a restart does not skip itself.
  const seenSeq = useRef(joinSeq);

  useEffect(() => {
    if (joinSeq > seenSeq.current) { seenSeq.current = joinSeq; onStart?.(); }
  }, [joinSeq, onStart]);

  if (view === 'pick') return <RoomPicker />;
  if (view === 'join' && !joined) return <JoinPanel busy={busy} />;
  return (
    <>
      {view === 'bad' && <p className="dialog-notice" role="alert">{t('online.badCode', { code: badCode })}</p>}
      {view === 'join' && joined && <RoomLine code={code} status={status === 'off' ? null : status} />}
      {children}
      {controller && view !== 'join' && (
        <button type="button" className="ui-button ghost online-play" onClick={() => controller.openPicker()}>{t('online.play')}</button>
      )}
    </>
  );
}
