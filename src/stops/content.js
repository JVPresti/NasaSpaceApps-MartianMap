/**
 * Pure helpers for the science stop card (#66): which stops have something to
 * show, which image goes on the card, and the Walk mode arrival tracker that
 * opens the card once per stop.
 *
 * Plain JavaScript, no React and no three.js.
 */
import { arrivedStop } from '../data/stops.js';

/**
 * True when the stop has a title, at least one sentence and one credited image.
 * The card renders nothing for any other stop, and logs nothing either.
 * @param {object|null|undefined} stop an entry of stops.json
 */
export function stopHasContent(stop) {
  if (!stop || typeof stop.name !== 'string' || !stop.name) return false;
  const hasText = Array.isArray(stop.text) && stop.text.some((s) => typeof s?.sentence === 'string' && s.sentence.trim());
  return hasText && cardImage(stop) !== null;
}

/**
 * The image the card shows. Walk mode prefers the image marked
 * `reference_match` (Cheyava Falls), so the player can compare it with the
 * rock in front of them. Images without a file or a credit are skipped,
 * because the credit must always be visible.
 * @param {object} stop
 * @param {{preferReference?: boolean}} [options]
 * @returns {object|null}
 */
export function cardImage(stop, { preferReference = false } = {}) {
  const images = (Array.isArray(stop?.images) ? stop.images : []).filter((i) => i?.file && i?.credit);
  if (images.length === 0) return null;
  if (preferReference) return images.find((i) => i.reference_match === true) ?? images[0];
  return images[0];
}

/** Text for the image's source tag, for example "DATA · Mastcam-Z · Perseverance · sol 1217". */
export function imageSource(image) {
  const label = image.label || [image.camera, image.sol != null ? `sol ${image.sol}` : null].filter(Boolean).join(' · ');
  return label ? `${image.tag} · ${label}` : image.tag;
}

/**
 * Walk mode arrival: `update` returns a stop the first time the position comes
 * within that stop's arrival radius (2 m for both stops, from stops.json) and
 * null on every later call, so the card opens once per stop per session.
 * Stops without content never open a card.
 */
export function createArrivalTracker() {
  const shown = new Set();
  return {
    /**
     * @param {Array<object>} stops
     * @param {{x: number|null, z: number|null}} position the player position from the store
     * @returns {object|null}
     */
    update(stops, position) {
      if (!Array.isArray(stops) || stops.length === 0) return null;
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
      const stop = arrivedStop(stops, position);
      if (!stop || shown.has(stop.id) || !stopHasContent(stop)) return null;
      shown.add(stop.id);
      return stop;
    },
    /** Ids of the stops whose card has opened. */
    shown: () => [...shown],
  };
}
