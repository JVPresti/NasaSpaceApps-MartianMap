import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { PLAYER_COLORS } from '../engine/crew.js';
import { ROLE, getOnlineController, useOnlineSession } from '../onlineLink.js';
import { useMissionStore } from '../state/store.js';
import { RoomLine } from './JoinPanel.jsx';
import { issueText, onlineIssue, otherRole, roleLabel, swatch } from './onlineText.js';
import './online.css';

/** Replaced, room full or offline, with what the player can do about it. */
export function OnlineIssue() {
  useLanguage();
  const online = useMissionStore((s) => s.online);
  const role = useOnlineSession((s) => s.role);
  const issue = onlineIssue(online, null, role);
  const controller = getOnlineController();
  if (!issue) return null;
  return (
    <div className={'table-panel online-issue issue-' + issue.kind} role={issue.kind === 'offline' ? 'status' : 'alert'}>
      <p className="table-text small">{issueText(issue)}</p>
      {issue.kind === 'replaced' && <p className="table-note">{t('online.replaced.help')}</p>}
      {/* Leave stays available offline too: it drops the seat, so a habitat seat can walk solo without a reload. */}
      <div className="table-actions online-issue-actions">
        {issue.kind === 'offline' ? null : issue.kind === 'replaced' ? (
          <button type="button" className="table-secondary" onClick={() => controller?.joinAsNewPlayer()}>{t('online.newPlayer')}</button>
        ) : (
          <button type="button" className="table-secondary" onClick={() => controller?.switchRole(otherRole(issue.role))}>
            {t('online.joinAs', { role: roleLabel(otherRole(issue.role)) })}
          </button>
        )}
        <button type="button" className="table-secondary" onClick={() => controller?.leave()}>{t('online.leave')}</button>
      </div>
    </div>
  );
}

/** Everyone seated in the room, from the store's `online.crew`. */
export function CrewList({ crew, meId }) {
  if (!crew.length) return <p className="table-note">{t('online.crew.empty')}</p>;
  return (
    <ul className="online-crew">
      {crew.map((member) => (
        <li key={member.id} className={member.id === meId ? 'me' : undefined}>
          <i
            className={member.role === ROLE.HABITAT ? 'online-swatch none' : 'online-swatch'}
            style={member.role === ROLE.HABITAT ? undefined : { background: swatch(PLAYER_COLORS[member.color]) }}
            aria-hidden="true"
          />
          <span className="online-crew-name">{member.name}</span>
          <span className="online-crew-role">{roleLabel(member.role)}</span>
          {member.id === meId && <span className="online-you">{t('online.crew.you')}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The room: code, host, connection, the shared clock and the round trip. */
export function RoomPanel() {
  useLanguage();
  const online = useMissionStore((s) => s.online);
  const shared = useMissionStore((s) => s.mission.sharedStartMs !== null && s.mission.sharedStartMs !== undefined);
  return (
    <div className="table-panel">
      <p className="table-label">{t('online.crew.room')}</p>
      <RoomLine code={online.code} status={online.status} />
      <p className="table-note">{t('online.host.help')}</p>
      <p className="table-note">{shared ? t('online.clock.running') : t('online.clock.waiting')}</p>
      {Number.isFinite(online.rttMs) && <p className="table-note">{t('online.crew.rtt', { ms: Math.round(online.rttMs) })}</p>}
    </div>
  );
}

/**
 * The Crew tab body (#52): left the room and its issues, centre the map, right the crew and the actions.
 * A tab rather than a side section: the room, up to six crew rows and the issue messages do not fit the side columns
 * of the other steps, which are already full, and the habitat seat needs a place of its own at the table.
 */
export function CrewTab({ map, actions }) {
  useLanguage();
  const online = useMissionStore((s) => s.online);
  return (
    <>
      <section className="table-left">
        <h2 className="table-h">{t('online.crew.title')}</h2>
        {online.code === null ? <p className="table-text">{t('online.crew.none')}</p> : <><RoomPanel /><OnlineIssue /></>}
      </section>
      {map}
      <section className="table-right">
        <div className="table-panel table-fill">
          <p className="table-label">{t('online.crew.members')}</p>
          <CrewList crew={online.crew} meId={online.me?.id ?? null} />
        </div>
        {actions}
      </section>
    </>
  );
}
