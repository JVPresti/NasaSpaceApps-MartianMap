import { useMissionStore } from '../state/store.js';
import { visorAlertLevel } from '../hud/visorAlert.js';
import bezel from '../assets/ui/visor_bezel.webp';
import ring from '../assets/ui/visor_ring.webp';
import './visorFrame.css';

/**
 * Helmet visor frame with alert rings (#28). The bezel is the art from the visor mockup with its centre keyed out;
 * the ring is a soft mask made from the same image and sized the same way, so both line up at any aspect ratio.
 * The ring colour follows the most severe active alert in the store (src/hud/visorAlert.js).
 * App renders it under the HUD, so it never covers HUD text, and it never takes the pointer.
 * `settings.visorFrame` (V in Walk) hides it for screenshots.
 */
export default function VisorFrame() {
  const on = useMissionStore((s) => s.settings.visorFrame);
  const level = useMissionStore((s) => visorAlertLevel(s.alerts));
  if (!on) return null;
  return (
    <div className="visor-frame" data-alert={level} aria-hidden="true">
      <div className="visor-ring">
        <div className="visor-ring-glow" style={{ '--visor-ring-mask': `url(${ring})` }} />
      </div>
      <div className="visor-bezel" style={{ backgroundImage: `url(${bezel})` }} />
    </div>
  );
}
