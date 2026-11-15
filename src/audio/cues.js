// Short suit sounds (#72), made in code with the Web Audio API. Each one builds a few nodes, plays and lets them go.
//   step(out)        a footstep as heard inside the suit: a dull thump carried through the boots, with a little grit
//   alert(level)     the caution and warning system: a distinct tone per level (ALERT_TONES in audioRules.js)
//   radio(cue)       the radio: a press-to-talk click and a burst of static through a narrow radio band
//                    ('call': a habitat call with an alert; 'lost': the partner link drops; 'back': it returns)
import { ALERT_TONES } from './audioRules.js';
import { chain } from './suit.js';

const STEP_GAIN = 0.28;
const RADIO_GAIN = 0.16;

export function createCues(ctx, out, noise) {
  // the radio "voice" band, 300 Hz to 3 kHz, as a suit radio passes it
  const radioIn = ctx.createBiquadFilter(), radioTop = ctx.createBiquadFilter();
  radioIn.type = 'highpass'; radioIn.frequency.value = 300;
  radioTop.type = 'lowpass'; radioTop.frequency.value = 3000;
  chain(radioIn, radioTop, out);

  function burst(t, length, dest, peak, attack = 0.004) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = noise;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    chain(src, g, dest);
    src.start(t, Math.random() * (noise.duration - length - 0.1), length + 0.05);
    return g;
  }

  function tone(t, f, length, wave, peak, dest, sweep) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(f, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(f * sweep, t + length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.setValueAtTime(peak, t + length - 0.03);
    g.gain.linearRampToValueAtTime(0, t + length);
    chain(o, g, dest);
    o.start(t); o.stop(t + length + 0.02);
  }

  function click(t) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000; hp.connect(radioIn);
    burst(t, 0.015, hp, RADIO_GAIN * 2.5, 0.001);
  }

  function hiss(t, length) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.2; bp.connect(radioIn);
    burst(t, length, bp, RADIO_GAIN, 0.02);
  }

  return {
    step() {
      const t = ctx.currentTime, lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 240 + Math.random() * 60; lp.connect(out);
      burst(t, 0.16, lp, STEP_GAIN * (0.8 + Math.random() * 0.3));
      tone(t, 58 + Math.random() * 10, 0.09, 'sine', STEP_GAIN * 0.9, out, 0.7);
    },
    /** @param {'info' | 'caution' | 'warning' | 'danger'} level */
    alert(level) {
      const spec = ALERT_TONES[level];
      if (!spec) return;
      const t = ctx.currentTime + 0.02;
      for (const [f, start, length] of spec.notes) tone(t + start, f, length, spec.wave, spec.gain * 0.3, out, spec.sweep);
    },
    /** @param {'call' | 'lost' | 'back'} cue @param {number} [delay] s */
    radio(cue, delay = 0) {
      const t = ctx.currentTime + 0.02 + delay;
      if (cue === 'lost') { hiss(t, 0.7); return; }
      click(t);
      hiss(t + 0.02, cue === 'call' ? 0.32 : 0.14);
      click(t + (cue === 'call' ? 0.36 : 0.18));
    },
  };
}
