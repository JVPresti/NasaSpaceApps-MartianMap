/**
 * Which partner sources the engine draws (docs/PARTNER.md, "Several partners"). Plain JavaScript.
 *
 * The base source is the one setPartnerSource sets: the scripted partner by default. setPartnerSources([...])
 * sets a list of extra sources (the remote players of #53). While that list is not empty it replaces the
 * base: the first source drives the full partner (case, lamp light, shadow, hatch, collision, boot prints)
 * and the others get a lighter suit each (src/engine/extraPartners.js). An empty list brings the base back,
 * where it left off. Resetting the base (a restart at the airlock) does not touch the list.
 */

/** Remote surface players at most: four surface seats (src/net/protocol.js SEATS) minus this player. */
export const MAX_PARTNER_SOURCES = 3;

export const isPartnerSource = (s) => !!s && typeof s === 'object' && typeof s.update === 'function';

export function createPartnerSlots() {
  let base = null, list = [];
  return {
    /** @param {object | null} source */
    setBase(source) { base = source; },
    /** @param {object[]} sources at most MAX_PARTNER_SOURCES; [] or null clears */
    setList(sources) {
      const next = sources ? [...sources] : [];
      if (next.length > MAX_PARTNER_SOURCES) throw new Error('setPartnerSources: at most ' + MAX_PARTNER_SOURCES + ' sources');
      if (!next.every(isPartnerSource)) throw new Error('setPartnerSources: expected partner sources with update(dt, world)');
      list = next;
    },
    get base() { return base; },
    get list() { return list; },
    /** The source the full partner draws: the first listed one, else the base. */
    main() { return list.length ? list[0] : base; },
    /** The sources drawn as extra suits. */
    extras() { return list.slice(1); },
  };
}
