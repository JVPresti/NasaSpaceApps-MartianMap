import { t } from '../i18n/index.js';
// Science stop card (#66): title, short text, a Perseverance image with its credit always visible, and a source tag.
// Plan mode shows every sentence, because reading belongs in Plan mode (docs/IMPLEMENTATION_PLAN.md 3.3). Walk mode
// shows the one-line summary and, at Cheyava Falls, the reference-match image beside the view (3.4, scenario 1).
import SourceTag from '../components/SourceTag.jsx';
import { provenance } from '../data/provenance.js';
import { imageUrl } from '../data/stops.js';
import { cardImage, stopHasContent, stopPaths } from './content.js';
import './stopCard.css';
import './stopsMobile.css';

/** id of the Plan mode card, for the waypoint button's aria-controls. */
export const PLAN_CARD_ID = 'science-stop-card';

function StopImage({ stop, image, reference, registry }) {
  return (
    <figure className="stop-figure">
      <div className="stop-image-frame">
        <img src={imageUrl(image)} alt={image.alt} width={image.width_px} height={image.height_px} />
        {reference && <span className="stop-match">{t('ui.reference.match')}</span>}
      </div>
      <figcaption>
        <span className="stop-credit">{t('ui.image')}{image.credit}</span>
        <SourceTag path={stopPaths.image(stop, image)} registry={registry} />
      </figcaption>
    </figure>
  );
}

/**
 * Source tags come from the provenance registry; useStops adds the stops' entries (registerStops in content.js).
 * @param {{ stop: object | null, variant?: 'plan' | 'walk', onClose?: () => void, registry?: object }} props
 */
export default function StopCard({ stop, variant = 'plan', onClose, registry = provenance }) {
  if (!stopHasContent(stop)) return null;
  const walk = variant === 'walk';
  const image = cardImage(stop, { preferReference: walk });
  const reference = walk && image.reference_match === true;
  const radius = stop.arrival_radius?.value;

  return (
    <aside id={walk ? undefined : PLAN_CARD_ID} className={`stop-card stop-card-${variant}${reference ? ' stop-card-reference' : ''}`} aria-label={t('ui.science.stop.p0', { p0: stop.name })}>
      <header className="stop-head">
        <p className="stop-kicker">
          {walk ? t('ui.science.stop.arrived.p0', { p0: radius ? t('within', { radius }) : '' }) : t('stops.waypointTitle', { p0: stop.waypoint })}
        </p>
        <h2>
          {stop.name}
          {stop.title_tag && <SourceTag path={stopPaths.title(stop)} variant="tag" registry={registry} />}
        </h2>
        {onClose && (
          <button type="button" className="stop-close" onClick={onClose} aria-label={t('ui.close.p0.card', { p0: stop.name })}>
            {walk && <kbd>{t('ui.enter')}</kbd>}
            <span aria-hidden="true">×</span>
          </button>
        )}
      </header>

      <StopImage stop={stop} image={image} reference={reference} registry={registry} />

      {walk ? (
        <p className="stop-summary">{stop.summary || stop.text[0].sentence}</p>
      ) : (
        <>
          {stop.summary && <p className="stop-summary">{stop.summary}</p>}
          <ul className="stop-text">
            {stop.text.map((s, i) => (
              <li key={s.sentence}>
                <SourceTag path={stopPaths.sentence(stop, i)} variant="tag" registry={registry} />
                <span>{s.sentence}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
