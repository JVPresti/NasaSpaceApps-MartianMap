import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JOG_SPEED, WALK_SPEED } from './view.js';

const hazards = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'),
);

describe('walking speed', () => {
  it('matches mobility.speed.flat and mobility.speed.jog in hazards.json', () => {
    expect(WALK_SPEED).toBe(hazards.values['mobility.speed.flat'].value);
    expect(JOG_SPEED).toBe(hazards.values['mobility.speed.jog'].value);
  });

  it('stays inside the speeds the walking O2 model was fitted to', () => {
    const [, fastestTested] = hazards.values['mobility.speed.mars_suited_tested'].value;
    expect(JOG_SPEED).toBeLessThanOrEqual(fastestTested);
  });
});
