// Continuous suit sounds (#72), made in code with the Web Audio API: fans, breathing, the wind outside, the habitat cabin
// and the dosimeter.
//   fans       filtered noise plus a faint motor hum, always on in Walk, a little louder with effort
//   breathing  one breath scheduled at a time on the audio clock: an inhale (brighter) and an exhale (duller) whose
//              rate and depth follow suit.effort (audioRules.js), so a climb is heard as faster, deeper breathing
//   wind       a low rumble on the helmet that follows the wind speed and the storm (windLevel), with slow gusts. Mars air
//              carries little sound, and CO2 absorbs the high frequencies, so it stays low and quiet (audioRules.js header)
//   cabin      inside the habitat the wind fades out and a soft ventilation sound of the pressurised cabin fades in
//              (shelterOf: the cabin, half in the airlock)
//   dosimeter  Geiger-style clicks that follow the dose rate (dosimeter.js)
// All of it goes through one bus that fades out in Plan mode and while paused.
import { breathDepth, breathRate, dosimeterRate, fanLevel, windLevel } from './audioRules.js';
import { createDosimeter } from './dosimeter.js';

const FAN_GAIN = 0.05;
const HUM_GAIN = 0.01;
const BREATH_GAIN = 0.07;
const WIND_GAIN = 0.32;
const GUST = 0.45;     // share of the wind level that comes and goes in gusts
const CABIN_GAIN = 0.05;
const FADE_S = 0.25;   // time constant of the bus and level changes

/** A looping noise source from the shared buffer, started at a random point so layers do not line up. */
export function noiseSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  src.start(0, Math.random() * buffer.duration);
  return src;
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = frequency; f.Q.value = Q;
  return f;
}

function gain(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Connects nodes in a chain and returns the last one. */
export function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

export function createSuitSounds(ctx, out, noise) {
  const bus = chain(gain(ctx, 0), out);

  const fan = gain(ctx, FAN_GAIN);
  chain(noiseSource(ctx, noise), filter(ctx, 'highpass', 90), filter(ctx, 'lowpass', 520), fan, bus);
  const hum = gain(ctx, HUM_GAIN);
  for (const [f, g] of [[118, 1], [236, 0.45]]) {
    const o = ctx.createOscillator(); o.frequency.value = f;
    chain(o, gain(ctx, g), hum); o.start();
  }
  hum.connect(bus);

  const breathTone = filter(ctx, 'bandpass', 900, 0.9), breath = gain(ctx, 0);
  chain(noiseSource(ctx, noise), breathTone, breath, bus);

  const wind = gain(ctx, 0), windTone = filter(ctx, 'lowpass', 220);
  chain(noiseSource(ctx, noise), windTone, filter(ctx, 'lowpass', 260), wind, bus);
  // gusts: two slow, unrelated sines move the wind level and brighten it a little at its peaks
  const gust = gain(ctx, 0);
  for (const [f, g] of [[0.11, 1], [0.27, 0.6]]) {
    const o = ctx.createOscillator(); o.frequency.value = f;
    chain(o, gain(ctx, g), gust); o.start();
  }
  gust.connect(wind.gain);
  const gustTone = gain(ctx, 500);   // up to about 50 Hz brighter at a gust's peak
  gust.connect(gustTone); gustTone.connect(windTone.frequency);

  const cabin = gain(ctx, 0);
  chain(noiseSource(ctx, noise), filter(ctx, 'highpass', 160), filter(ctx, 'lowpass', 1100), cabin, bus);
  const cabinHum = ctx.createOscillator(); cabinHum.frequency.value = 100;
  chain(cabinHum, gain(ctx, 0.12), cabin); cabinHum.start();

  const dosimeter = createDosimeter(ctx, bus);

  let next = 0;

  /** Schedules one breath at time t; returns when the next one starts. */
  function scheduleBreath(t, effort) {
    const period = 60 / breathRate(effort), depth = breathDepth(effort) * BREATH_GAIN;
    const inhale = period * 0.38, exhale = period * 0.47, g = breath.gain, f = breathTone.frequency;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(depth, t + inhale * 0.55);
    g.linearRampToValueAtTime(depth * 0.15, t + inhale);
    g.linearRampToValueAtTime(depth * 0.8, t + inhale + exhale * 0.25);
    g.linearRampToValueAtTime(0, t + inhale + exhale);
    f.setValueAtTime(1500, t);              // inhale: air rushing in, brighter
    f.setValueAtTime(650, t + inhale);      // exhale: duller, into the helmet
    return t + period;
  }

  return {
    /**
     * @param {{ effort: number | null, storm: number, windMs: number | null, doseRateUgyH: number | null, shelter: number, audible: boolean }} s
     */
    update({ effort, storm, windMs, doseRateUgyH, shelter = 0, audible }) {
      const now = ctx.currentTime, outside = 1 - shelter, w = WIND_GAIN * windLevel(windMs, storm) * outside;
      bus.gain.setTargetAtTime(audible ? 1 : 0, now, FADE_S);
      fan.gain.setTargetAtTime(FAN_GAIN * fanLevel(effort), now, FADE_S);
      wind.gain.setTargetAtTime(w * (1 - GUST), now, 1.5);
      gust.gain.setTargetAtTime(w * GUST * 0.6, now, 1.5);
      cabin.gain.setTargetAtTime(CABIN_GAIN * shelter, now, 0.8);
      dosimeter.update(audible ? dosimeterRate(doseRateUgyH) : 0);
      if (next < now) next = now + 0.05;    // first breath, or after the context was suspended
      if (audible && next - now < 0.15) next = scheduleBreath(next, effort);
    },
  };
}
