// The suit dosimeter (#72): Geiger-style clicks whose rate follows the dose rate (dosimeterRate in audioRules.js), so a
// solar particle event is heard building and fading. Clicks come at random times, as particle hits do (a Poisson process),
// scheduled a little ahead on the audio clock. One short click buffer is made once and replayed.

const CLICK_S = 0.004;
const CLICK_GAIN = 0.22;
const AHEAD_S = 0.12;   // schedule this far ahead of the audio clock

export function createDosimeter(ctx, out) {
  const click = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * CLICK_S), ctx.sampleRate), d = click.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length / 5));
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = CLICK_GAIN;
  hp.connect(g); g.connect(out);

  let next = 0;
  return {
    /** @param {number} rate clicks per second; 0 is silent */
    update(rate) {
      const now = ctx.currentTime;
      if (!(rate > 0)) { next = 0; return; }
      // start, or catch up after a pause; a click planned long ago for a much lower rate is redrawn for the new one
      if (next < now || next - now > AHEAD_S + 2 / rate) next = now + -Math.log(1 - Math.random()) / rate;
      while (next < now + AHEAD_S) {
        const src = ctx.createBufferSource();
        src.buffer = click; src.playbackRate.value = 0.8 + Math.random() * 0.4;
        src.connect(hp); src.start(next);
        next += -Math.log(1 - Math.random()) / rate;
      }
    },
  };
}
