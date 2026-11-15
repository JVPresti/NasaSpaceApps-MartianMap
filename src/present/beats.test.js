import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEATS, GLOBAL_30, PLACES, captionsOf, sequence, wordCount } from './beats.js';
import { fill, lookup, resolvePlace, trackNumber } from './data.js';

const plan = JSON.parse(readFileSync(new URL('../../public/present/plan.json', import.meta.url), 'utf8'));
const data = { ...plan, zone: { ...plan.zone, margin: 1, area: 1 } };
const TAGS = new Set(['DATA', 'DERIVED', 'SIM']);
// The creative brief bans these words on screen (#291).
const BANNED = /revolutionary|groundbreaking|cutting-edge|next-generation|immersive|seamless|powerful|innovative|final frontier|one small step|imagine a world|introducing|future of exploration|ai-powered|and beyond/i;

function texts(beat) {
  const out = [];
  for (const c of captionsOf(beat)) { out.push(c.en); if (c.es) out.push(c.es); }
  for (const chip of beat.chips || []) if (chip.text) out.push(chip.text.en, chip.text.es);
  if (beat.source) out.push(beat.source.en, beat.source.es);
  if (beat.cta) out.push(beat.cta.en, beat.cta.es);
  if (beat.list) { out.push(beat.list.title.en, beat.list.title.es, beat.list.note); for (const l of beat.list.lines) out.push(l.en, l.es); }
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
            expect(fill(t, data), `${b.id}: ${t}`).not.toMatch(/\?|undefined|NaN/);
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
    expect(sequence('global30')).toHaveLength(GLOBAL_30.length);   // every cut finds the beat it borrows
  });

  it('ends the full presentation on the live hand-off', () => {
    expect(BEATS.at(-1).cta?.en).toBeTruthy();
  });

  it('answers the judge\'s questions in order: the danger, what we do, the app, how we know', () => {
    const order = ['open', 'plan', 'zone', 'radiation', 'demo', 'sources', 'credits'].map((id) => BEATS.findIndex((b) => b.id === id));
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

describe('the presentation story', () => {
  const all = (b) => texts(b);

  it('uses no em or en dash anywhere on screen', () => {
    for (const b of BEATS) for (const t of all(b)) expect(t, b.id).not.toMatch(/[\u2013\u2014]/);
  });

  it('ends on the sources; the hand-over to the live app only comes with ?live=1', () => {
    expect(sequence('full').map((b) => b.id).slice(-2)).toEqual(['sources', 'credits']);
    const live = sequence('full', { live: true });
    expect(live.map((b) => b.id).slice(-3)).toEqual(['sources', 'credits', 'live']);
    expect(live.at(-1).cta).toBeTruthy();
  });

  it('plays the recorded demo between the radiation beat and the sources', () => {
    const ids = sequence('full').map((b) => b.id);
    expect(ids.indexOf('demo')).toBe(ids.indexOf('radiation') + 1);
    expect(ids.indexOf('sources')).toBe(ids.indexOf('demo') + 1);
    const demo = BEATS.find((b) => b.id === 'demo');
    expect(demo.video.src).toMatch(/\.mp4$/);
    expect(captionsOf(demo).length).toBeGreaterThan(0);   // the fallback if the file fails
  });

  it('fits the 3:40 talk: 3:10 to 3:40 on autoplay, the rest for clicks and pauses', () => {
    const total = sequence('full').reduce((a, b) => a + b.duration, 0);
    expect(total).toBeGreaterThanOrEqual(190);
    expect(total).toBeLessThanOrEqual(220);
  });

  it('states the danger in the first beat', () => {
    const open = sequence('full')[0];
    expect(captionsOf(open)[0].en).toMatch(/nobody can come and get you/);
    expect(open.start).toBeTruthy();   // one fall from orbit
  });

  it('uses the app\'s radiation figures: 29.9 µGy/h peak, 10 µGy/h background', () => {
    const texts = BEATS.flatMap((b) => (b.chips || []).flatMap((c) => [c.big, c.text?.en]));
    expect(texts.join(' ')).toContain('29.9 µGy/h');
    expect(texts.join(' ')).not.toMatch(/\{rad\.peak\}|\b26 µGy/);
  });

  it('lists every source the presentation shows, each line tagged', () => {
    const list = BEATS.find((b) => b.id === 'credits').list;
    const text = list.lines.map((l) => l.en).join('\n');
    for (const name of ['Viking MDIM 2.1', 'THEMIS day IR', 'CTX', 'JEZ_hirise_soc_006', 'Mars Trek', 'RAD', 'DONKI', 'τ 8', '3 km', 'MEDA', 'suited walking tests', 'xEVA', 'Apollo 17']) expect(text).toContain(name);
    for (const l of list.lines) { expect(TAGS.has(l.tag), l.en).toBe(true); expect(l.es, l.en).toBeTruthy(); }
  });

  it('names the six team members and no email', () => {
    const note = BEATS.find((b) => b.id === 'credits').list.note;
    expect(note.split(' · ')).toEqual(['Teresa Rivas Gómez', 'Andrea Rivas Gómez', 'Fernando Haro Calvo', 'Jorge Antonio Vazquez Guzmán', 'Antonio Ramos Gonzalez', 'Brayan Iván Pérez Ventura']);
    expect(note).not.toMatch(/@/);
  });

  it('says the zone comes from the planner', () => {
    const zone = BEATS.find((b) => b.id === 'zone');
    expect(zone.source.en).toMatch(/planner/);
    expect(zone.source.en).not.toMatch(/Not in the walk HUD/);   // the demo video shows the zone in the app (#335)
  });
});

describe('the demo video files', () => {
  const demo = BEATS.find((b) => b.id === 'demo');
  const file = (name) => new URL(`../../public/present/${name}`, import.meta.url);
  it('exist, under the 20 MB budget (Cloudflare caps a static file at 25 MiB)', async () => {
    const { statSync } = await import('node:fs');
    for (const name of [demo.video.src, demo.video.srcEs, demo.video.poster]) {
      expect(statSync(file(name)).size, name).toBeLessThan(20 * 1024 * 1024);
    }
  });
});
