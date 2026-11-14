// Navigation line of the helmet HUD (#21): how the position estimate was obtained, how far off it may be and how old
// the last fix is, for example 'NAV · terrain fix · ±0.4 m · 3 min ago'. Past NAV_FIX_LIMIT_M it turns amber and asks
// the astronaut to stop for a terrain fix. The text changes at most once a minute or when the estimate changes.
import { useShallow } from 'zustand/react/shallow';
import { useMissionStore } from '../state/store.js';
import { formatNavLine, navFixPrompt } from './format.js';

/** @param {{ children?: import('react').ReactNode }} props children: the source tag of navigation.errorM */
export default function NavLine({ children }) {
  const { line, prompt } = useMissionStore(useShallow((s) => ({
    line: formatNavLine(s.navigation, s.mission.elapsedSec),
    prompt: navFixPrompt(s.navigation.errorM),
  })));
  return (
    <section className={'hud-panel hud-nav' + (prompt ? ' hud-caution' : '')} aria-label="Navigation">
      <div className="hud-nav-line"><span>{line}</span>{children}</div>
      {prompt && <div className="hud-nav-prompt" role="alert">{prompt}</div>}
    </section>
  );
}
