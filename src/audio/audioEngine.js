// The suit audio engine (#72): one AudioContext, made on the first user gesture as browsers require, a master volume
// and the sound parts (suit.js, cues.js). Every sound is synthesised, so nothing is downloaded.
// The context is suspended while muted or while the tab is hidden: then the audio thread does no work at all.
import { createCues } from './cues.js';
import { createSuitSounds } from './suit.js';

const NOISE_S = 2;

/** Two seconds of white noise, made once and shared by every noise sound. */
function makeNoise(ctx) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_S), ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * @param {{ AudioContextClass?: typeof AudioContext }} [options]
 */
export function createAudioEngine({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null, master = null, suit = null, cues = null;
  let settings = { muted: false, volume: 0.7 }, hidden = false;

  function applyState() {
    if (!ctx) return;
    master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.05);
    const want = settings.muted || hidden ? 'suspended' : 'running';
    if (want === 'suspended' && ctx.state === 'running') ctx.suspend();
    if (want === 'running' && ctx.state === 'suspended') ctx.resume();
  }

  return {
    /** True once the context exists and plays. */
    get running() { return !!ctx && ctx.state === 'running'; },
    /** Call from a user gesture (click or key). Does nothing the second time or without Web Audio. */
    start() {
      if (ctx || !AudioContextClass) return;
      ctx = new AudioContextClass();
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const noise = makeNoise(ctx);
      suit = createSuitSounds(ctx, master, noise);
      cues = createCues(ctx, master, noise);
      applyState();
    },
    /** @param {{ muted: boolean, volume: number }} s */
    setSettings(s) { settings = s; applyState(); },
    /** @param {boolean} h the tab is hidden */
    setHidden(h) { hidden = !!h; applyState(); },
    update(s) { if (this.running) suit.update(s); },
    step() { if (this.running) cues.step(); },
    alert(level) { if (this.running) cues.alert(level); },
    radio(cue, delay) { if (this.running) cues.radio(cue, delay); },
    dispose() { if (ctx) ctx.close(); ctx = null; },
  };
}
