import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEATS, GLOBAL_30, PLACES, captionsOf, sequence, wordCount } from './beats.js';
import { fill, lookup, resolvePlace, trackNumber } from './data.js';

const plan = JSON.parse(readFileSync(new URL('../../public/present/plan.json', import.meta.url), 'utf8'));
const data = { ...plan, zone: { ...plan.zone, margin: 1 } };
const TAGS = new Set(['DATA', 'DERIVED', 'SIM']);
// The creative brief bans these words on screen (#291).
const BANNED = /revolutionary|groundbreaking|cutting-edge|next-generation|immersive|seamless|powerful|innovative|final frontier|one small step|imagine a world|introducing|future of exploration|ai-powered|and beyond/i;

function texts(beat) {
  const out = [];
  for (const c of captionsOf(beat)) { out.push(c.en); if (c.es) out.push(c.es); }
  for (const chip of beat.chips || []) if (chip.text) out.push(chip.text.en, chip.text.es);
  if (beat.source) out.push(beat.source.en, beat.source.es);
  if (beat.cta) out.push(beat.cta.en, beat.cta.es);
  return out.filter((t) => t != null);
}

describe('presentation beats', () => {
  for (const name of ['full', 'global30']) {
    const beats = sequence(name);
    describe(name, () => {
      it('has unique ids and positive durations', () => {
        expect(new Set(beats.map((b) => b.id)).size).toBe(beats.length);
        for (const b of beats) expect(b.duration).toBeGreaterThan(0);
      });

      it('keeps every caption to 8 words, in both languages', () => {
        for (const b of beats) for (const c of captionsOf(b)) {
          expect(wordCount(c.en), `${b.id}: ${c.en}`).toBeLessThanOrEqual(8);
          if (c.es) expect(wordCount(c.es), `${b.id}: ${c.es}`).toBeLessThanOrEqual(8);
        }
      });

      it('gives every caption both languages in the full presentation', () => {
        if (name !== 'full') return;
        for (const b of beats) for (const c of captionsOf(b)) expect(c.es, b.id).toBeTruthy();
      });

      it('uses no banned word and no em dash', () => {
        for (const b of beats) for (const t of texts(b)) {
          expect(t, b.id).not.toMatch(BANNED);
          expect(t, b.id).not.toContain('—');
        }
      });

      it('tags every number pinned to the scene, and every source line', () => {
        for (const b of beats) {
          for (const chip of b.chips || []) expect(TAGS.has(chip.tag), `${b.id} chip`).toBe(true);
          if (b.source) expect(TAGS.has(b.source.tag), `${b.id} source`).toBe(true);
        }
      });

      it('fills every number from plan.json', () => {
        for (const b of beats) for (const chip of b.chips || []) {
          for (const t of [chip.big, chip.text?.en, chip.text?.es]) {
            if (!t) continue;
            expect(fill(t, data), `${b.id}: ${t}`).not.toMatch(/–|undefined|NaN/);
          }
        }
      });

      it('points every label and shot at a known place', () => {
        for (const b of beats) {
          const target = b.shot.target;
          expect(typeof target === 'object' || resolvePlace(target, plan, 0), `${b.id} shot`).toBeTruthy();
          for (const chip of b.chips || []) expect(resolvePlace(chip.at, plan, 0), `${b.id} chip at ${chip.at}`).toBeTruthy();
        }
      });

      it('keeps tracks inside the beat and resolves their numbers', () => {
        for (const b of beats) for (const [k, track] of Object.entries(b.tracks || {})) {
          const segs = Array.isArray(track[0]) ? track : [track];
          for (const tr of segs) {
            expect(tr, `${b.id}.${k}`).toHaveLength(4);
            expect(Number.isFinite(trackNumber(tr[0], plan)) && Number.isFinite(trackNumber(tr[1], plan)), `${b.id}.${k}`).toBe(true);
            expect(tr[2]).toBeLessThanOrEqual(tr[3]);
            expect(tr[3], `${b.id}.${k} ends after the beat`).toBeLessThanOrEqual(b.duration);
            if (k === 'zone') expect(Math.max(tr[0], tr[1])).toBeLessThan(plan.zone.frames.length);
          }
        }
      });
    });
  }

  it('fits the global video in 30 s', () => {
    const total = sequence('global30').reduce((a, b) => a + b.duration, 0);
    expect(total).toBeLessThanOrEqual(29.5);   // the submission's hard limit is 30 s; keep half a second of room
    expect(GLOBAL_30.every((c) => BEATS.some((b) => b.id === (c.from || c.id)))).toBe(true);
  });

  it('ends the full presentation on the live hand-off', () => {
    expect(BEATS.at(-1).cta?.en).toBeTruthy();
  });

  it('answers the judge\'s questions in order: where, why there, danger, what we do, how we know, live', () => {
    const order = ['jezero', 'cheyava', 'danger', 'zone', 'sources', 'live'].map((id) => BEATS.findIndex((b) => b.id === id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('reads leg numbers that match the route totals', () => {
    const sum = plan.legs.reduce((a, l) => a + l.distanceM, 0);
    expect(Math.abs(sum - plan.totals.distanceM)).toBeLessThanOrEqual(plan.legs.length);
    expect(lookup(plan, 'constants.reserveMin')).toBe(30);
    expect(lookup(plan, 'constants.evaMaxH')).toBe(8);
    expect(PLACES.hab.x).toBeCloseTo(plan.hab.x, 1);
  });
});
