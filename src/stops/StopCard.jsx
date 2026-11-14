// Science stop card (#66): title, short text, a Perseverance image with its credit always visible, and a source tag.
// Plan mode shows every sentence, because reading belongs in Plan mode (docs/IMPLEMENTATION_PLAN.md 3.3). Walk mode
// shows the one-line summary and, at Cheyava Falls, the reference-match image beside the view (3.4, scenario 1).
import { imageUrl } from '../data/stops.js';
import { cardImage, imageSource, stopHasContent } from './content.js';
import './stopCard.css';

/**
 * DATA, DERIVED or SIM. Plain text until #62's SourceTag component merges; swap this for it then.
 * @param {{ tag: string, title?: string, children?: import('react').ReactNode }} props
 */
function Tag({ tag, title, children }) {
  return (
    <span className={'stop-tag stop-tag-' + String(tag).toLowerCase()} title={title}>
      {children ?? tag}
    </span>
  );
}

function StopImage({ image, reference }) {
  return (
    <figure className="stop-figure">
      <div className="stop-image-frame">
        <img src={imageUrl(image)} alt={image.alt} width={image.width_px} height={image.height_px} />
        {reference && <span className="stop-match">Reference match</span>}
      </div>
      <figcaption>
        <span className="stop-credit">Image: {image.credit}</span>
        <Tag tag={image.tag} title={image.caption}>
          {image.page_url ? (
            <a href={image.page_url} target="_blank" rel="noreferrer">{imageSource(image)}</a>
          ) : imageSource(image)}
        </Tag>
      </figcaption>
    </figure>
  );
}

/**
 * @param {{ stop: object | null, variant?: 'plan' | 'walk', onClose?: () => void }} props
 */
export default function StopCard({ stop, variant = 'plan', onClose }) {
  if (!stopHasContent(stop)) return null;
  const walk = variant === 'walk';
  const image = cardImage(stop, { preferReference: walk });
  const reference = walk && image.reference_match === true;
  const radius = stop.arrival_radius?.value;

  return (
    <aside className={`stop-card stop-card-${variant}${reference ? ' stop-card-reference' : ''}`} aria-label={`Science stop: ${stop.name}`}>
      <header className="stop-head">
        <p className="stop-kicker">
          {walk ? `Science stop · arrived${radius ? ` within ${radius} m` : ''}` : `Science stop · ${stop.waypoint}`}
        </p>
        <h2>
          {stop.name}
          {stop.title_tag && <Tag tag={stop.title_tag} />}
        </h2>
        {onClose && (
          <button type="button" className="stop-close" onClick={onClose} aria-label={`Close ${stop.name} card`}>
            {walk && <kbd>Enter</kbd>}
            <span aria-hidden="true">×</span>
          </button>
        )}
      </header>

      <StopImage image={image} reference={reference} />

      {walk ? (
        <p className="stop-summary">{stop.summary || stop.text[0].sentence}</p>
      ) : (
        <>
          {stop.summary && <p className="stop-summary">{stop.summary}</p>}
          <ul className="stop-text">
            {stop.text.map((s) => (
              <li key={s.sentence}>
                <Tag tag={s.tag} title={s.provenance?.map((p) => p.reference).join('\n')} />
                <span>{s.sentence}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
