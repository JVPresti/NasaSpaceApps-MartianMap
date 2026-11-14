/**
 * Pure helpers for the science stop card (#66): which stops have something to
 * show, which image goes on the card, and the Walk mode arrival tracker that
 * opens the card once per stop.
 *
 * Plain JavaScript, no React and no three.js.
 */
import { stopForWaypoint } from '../data/stops.js';
import { provenance } from '../data/provenance.js';

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

/** Registry paths for the card's source tags (src/components/SourceTag.jsx). */
export const stopPaths = {
  title: (stop) => `stops.${stop.id}.title`,
  sentence: (stop, index) => `stops.${stop.id}.text.${index}`,
  image: (stop, image) => `stops.${stop.id}.image.${image.image_id}`,
};

/** SourceTag's text alternative ends each field with a period, so the source lines carry none. */
const noStop = (text) => String(text ?? '').trim().replace(/\.$/, '');

/** Registry fields from one stops.json provenance block (public/data/README.md). */
function fromBlock(p) {
  if (!p) return {};
  const text = (v) => (v ? noStop(v) : v);
  return {
    mission: p.mission, instrument: p.instrument, site: p.site, solOrDate: p.sol_or_date,
    reference: text(p.reference), link: p.url, dataLink: p.data_url, note: text(p.note),
  };
}

/**
 * Provenance registry entries for every tag the card shows: the title, each sentence and each image.
 * The blocks come from stops.json, so the tag's details name the NASA release, the camera and the sol.
 * @param {Array<object>} stops
 * @returns {Record<string, object>}
 */
export function stopProvenance(stops) {
  const entries = {};
  for (const stop of stops) {
    const firstData = stop.text.find((s) => s.tag === stop.title_tag) ?? stop.text[0];
    if (stop.title_tag) {
      entries[stopPaths.title(stop)] = {
        ...fromBlock(firstData?.provenance?.[0]),
        tag: stop.title_tag, label: stop.title_tag, source: noStop(`${stop.name}: ${stop.summary ?? firstData?.sentence}`),
      };
    }
    stop.text.forEach((s, i) => {
      const blocks = s.provenance ?? [];
      entries[stopPaths.sentence(stop, i)] = {
        ...fromBlock(blocks[0]),
        reference: blocks.map((b) => noStop(b.reference)).join('; ') || null,
        tag: s.tag, label: s.tag, source: noStop(s.sentence),
      };
    });
    for (const image of stop.images ?? []) {
      if (!image?.image_id || !image?.tag) continue;
      entries[stopPaths.image(stop, image)] = {
        ...fromBlock(image.provenance),
        tag: image.tag,
        label: image.label || [image.camera, image.sol != null ? `sol ${image.sol}` : null].filter(Boolean).join(' · ') || image.tag,
        source: `${noStop(image.caption ?? image.alt)}. Credit: ${noStop(image.credit)}`,
        link: image.page_url ?? image.provenance?.url ?? null,
      };
    }
  }
  return entries;
}

/** Add the stops' entries to the provenance registry, so every SourceTag on the card resolves. */
export function registerStops(stops, registry = provenance) {
  registry.define(stopProvenance(stops));
  return registry;
}

/**
 * Walk mode arrival. The waypoint runner (src/sim/waypointRunner.js, #139) appends each waypoint the astronaut
 * reaches to `route.visited`, using a 2 m radius at science targets. `update` returns the stop of the first visited
 * waypoint whose card has not opened yet, and null after that, so the card opens once per stop per session. A
 * re-plan empties `route.visited`; the tracker keeps its own list, so revisiting a stop opens nothing.
 * Waypoints without a stop, and stops without content, never open a card.
 */
export function createArrivalTracker() {
  const shown = new Set();
  return {
    /**
     * @param {Array<object>} stops
     * @param {Array<string>} visited `route.visited` from the mission store
     * @returns {object|null}
     */
    update(stops, visited) {
      if (!Array.isArray(stops) || !Array.isArray(visited)) return null;
      for (const name of visited) {
        const stop = stopForWaypoint(stops, name);
        if (!stop || shown.has(stop.id) || !stopHasContent(stop)) continue;
        shown.add(stop.id);
        return stop;
      }
      return null;
    },
    /** Ids of the stops whose card has opened. */
    shown: () => [...shown],
  };
}
