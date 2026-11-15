import { describe, expect, it } from 'vitest';
import { MAX_PARTNER_SOURCES, createPartnerSlots } from './partnerSlots.js';
import { createScriptedPartner, createStaticPartner } from './partnerSource.js';

describe('partner slots', () => {
  it('draws the base source alone, with no extras', () => {
    const slots = createPartnerSlots(), scripted = createScriptedPartner();
    slots.setBase(scripted);
    expect(slots.main()).toBe(scripted);
    expect(slots.extras()).toEqual([]);
  });

  it('a list replaces the base: the first is the full partner, the rest extra suits', () => {
    const slots = createPartnerSlots(), scripted = createScriptedPartner();
    const a = createStaticPartner({ id: 'a' }), b = createStaticPartner({ id: 'b' }), c = createStaticPartner({ id: 'c' });
    slots.setBase(scripted);
    slots.setList([a, b, c]);
    expect(slots.main()).toBe(a);
    expect(slots.extras()).toEqual([b, c]);
    slots.setList([]);
    expect(slots.main()).toBe(scripted);
  });

  it('resetting the base keeps the list (a restart at the airlock while online)', () => {
    const slots = createPartnerSlots(), a = createStaticPartner({ id: 'a' });
    slots.setList([a]);
    slots.setBase(createScriptedPartner());
    expect(slots.main()).toBe(a);
  });

  it('refuses more than three sources and things that are not sources', () => {
    const slots = createPartnerSlots();
    expect(MAX_PARTNER_SOURCES).toBe(3);
    expect(() => slots.setList(Array.from({ length: 4 }, () => createStaticPartner()))).toThrow(/at most 3/);
    expect(() => slots.setList([{}])).toThrow(/partner sources/);
    slots.setList(null);
    expect(slots.list).toEqual([]);
  });
});
