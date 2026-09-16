// Soundscapes (F19, step 35): wind that gusts, crickets at dusk, drips in the dark and
// the Gate's hum. All synthesized, all under the sound-effects volume, and all guarded -
// a browser that refuses Web Audio just gets a quiet game.
import { audio } from './audio.js';

// The mix per area. `wind` is a level; `crickets` and `drips` are the average seconds
// between one and the next.
const SCAPES = {
  title: { wind: 0.30, crickets: 2.2 },
  town: { wind: 0.22 },
  canyon: { wind: 0.75 },
  indoors: { wind: 0.07 },
  cave: { wind: 0.18, drips: 3.5 },
  night: { wind: 0.25, crickets: 1.6 },
};

export const ambient = {
  name: null,
  timers: [],
  sources: [],
  extra: [],
  wind: null,
  humNode: null,
  humGain: null,
  noise: null,

  // A couple of seconds of noise: long enough that looping it doesn't sound periodic
  // once it's through a lowpass and swelling.
  noiseBuffer() {
    if (this.noise) return this.noise;
    const ctx = audio.ctx;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  },

  set(name) {
    if (name === this.name) return;
    this.stop();
    this.name = name ?? null;
    const scape = SCAPES[name];
    if (!audio.ctx || !scape) return;
    try {
      if (scape.wind) this.startWind(scape.wind);
      if (scape.crickets) this.schedule(() => this.chirp(), scape.crickets);
      if (scape.drips) this.schedule(() => this.drip(), scape.drips);
    } catch {
      this.stop();
    }
  },

  // Repeat something at a loose interval, so it never falls into a rhythm.
  schedule(fn, every) {
    const next = () => {
      try {
        fn();
      } catch {
        // One missed chirp doesn't end the soundscape.
      }
      this.timers.push(setTimeout(next, (every * 0.5 + Math.random() * every) * 1000));
    };
    this.timers.push(setTimeout(next, Math.random() * every * 1000));
  },

  startWind(level) {
    const ctx = audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // A low cutoff throws away most of the noise's energy, so the gain has to be much
    // higher than it looks: measured off the ambient bus, 0.04 here was inaudible.
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = level * 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.ambientGain);
    src.start();
    this.sources.push(src);
    this.extra.push(filter, gain);
    this.wind = { gain, filter, level };
    this.gust();
  },

  // Slow swells, so the wind never sits at one level.
  gust() {
    const w = this.wind;
    if (!w || !audio.ctx) return;
    const t = audio.ctx.currentTime;
    const dur = 3 + Math.random() * 5;
    const peak = w.level * (0.3 + Math.random() * 0.5);
    w.gain.gain.cancelScheduledValues(t);
    w.gain.gain.setValueAtTime(Math.max(0.0001, w.gain.gain.value), t);
    w.gain.gain.linearRampToValueAtTime(peak, t + dur * 0.5);
    w.gain.gain.linearRampToValueAtTime(w.level * 0.22, t + dur);
    w.filter.frequency.setValueAtTime(650 + Math.random() * 700, t);
    this.timers.push(setTimeout(() => this.gust(), dur * 1000));
  },

  // Three quick rasps, the way a cricket actually does it.
  chirp() {
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const pitch = 3700 + Math.random() * 700;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = pitch;
      const at = t + i * 0.055;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.03, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.038);
      osc.connect(g);
      g.connect(audio.ambientGain);
      osc.start(at);
      osc.stop(at + 0.05);
    }
  },

  // A drop falling somewhere further in: pitched down, with an echo behind it.
  drip() {
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = 700 + Math.random() * 900;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.18 + Math.random() * 0.12;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    osc.connect(g);
    g.connect(audio.ambientGain);
    g.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(audio.ambientGain);
    osc.start(t);
    osc.stop(t + 0.16);
    // The echo needs a moment to die away before the nodes go.
    this.timers.push(setTimeout(() => {
      try {
        delay.disconnect();
        fb.disconnect();
      } catch {
        // Already gone.
      }
    }, 3000));
  },

  // The Gate: a low warm drone that swells as Pip gets closer. `level` is 0 to 1.
  hum(level) {
    const ctx = audio.ctx;
    if (!ctx) return;
    if (!this.humNode) {
      if (level <= 0) return;
      try {
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(audio.ambientGain);
        // Two triangles a hair apart: the beating between them is the "singing".
        const voices = [110, 110.6, 220.4].map((f) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          osc.connect(gain);
          osc.start();
          return osc;
        });
        this.humNode = voices;
        this.humGain = gain;
      } catch {
        return;
      }
    }
    // Called every frame from the overworld, so only act on a real change.
    if (Math.abs(level - this.humLevel) < 0.02) return;
    this.humLevel = level;
    try {
      const t = ctx.currentTime;
      const target = Math.max(0.0001, level * 0.12);
      this.humGain.gain.cancelScheduledValues(t);
      this.humGain.gain.setValueAtTime(Math.max(0.0001, this.humGain.gain.value), t);
      this.humGain.gain.exponentialRampToValueAtTime(target, t + 0.4);
    } catch {
      // Leave it wherever it was.
    }
  },

  stopHum() {
    for (const osc of this.humNode ?? []) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    try {
      this.humGain?.disconnect();
    } catch {
      // Already gone.
    }
    this.humNode = null;
    this.humGain = null;
    this.humLevel = 0;
  },

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
    }
    for (const node of this.extra) {
      try {
        node.disconnect();
      } catch {
        // Already gone.
      }
    }
    this.sources = [];
    this.extra = [];
    this.wind = null;
    this.stopHum();
    this.name = null;
  },
};
