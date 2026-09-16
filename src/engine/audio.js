// Sound (F19): the pack's .ogg effects plus a few synthesized ones. Every call is
// guarded, so a browser without Web Audio just plays nothing instead of breaking a scene.
import { assets } from './assets.js';
import { G } from '../game.js';
import { music } from './music.js';
import { ambient } from './ambient.js';

// Names the game asks for → sample choices from the pack. A list means pick one at random.
const SFX = {
  confirm: ['select-a'],
  cursor: ['move-a', 'move-b'],
  cancel: ['move-c'],
  error: ['error-a'],
  hit: ['hurt-a', 'hurt-b'],
  hurt: ['hurt-c', 'hurt-d'],
  shoot: ['shoot-c'],
  skill: ['shoot-f'],
  calm: ['fall-b'],
  fall: ['fall-a'],
  lose: ['lose-a'],
  item: ['coin-b'],
  coin: ['coin-a'],
  chest: ['coin-c'],
  unlock: ['coin-c'],
  levelup: ['coin-d'],
  heal: ['coin-b'],
  hop: ['jump-a', 'jump-b'],
  door: ['jump-e'],
  alert: ['error-c'],
  lock: ['select-a'],
  encounter: ['explosion-c'],
  rumble: ['explosion-a'],
  flash: ['explosion-b'],
  chime: ['coin-a'],
  text: [],
};

export const audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  ambientGain: null,
  buffers: {},
  ready: false,
  noise: null,

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      for (const g of [this.musicGain, this.sfxGain, this.ambientGain]) g.connect(this.master);
      this.setVolumes();
      this.makeNoise();
      this.decodeAll();
      const wake = () => this.unlock();
      window.addEventListener('keydown', wake);
      window.addEventListener('pointerdown', wake);
    } catch {
      this.ctx = null;
    }
  },

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },

  async decodeAll() {
    const jobs = Object.entries(assets.snd).map(async ([name, raw]) => {
      try {
        this.buffers[name] = await this.ctx.decodeAudioData(raw.slice(0));
      } catch {
        // A sample that won't decode simply stays silent.
      }
    });
    await Promise.all(jobs);
    this.ready = true;
  },

  unlock() {
    try {
      if (this.ctx?.state === 'suspended') this.ctx.resume();
    } catch {
      // Nothing to do: the browser will allow it on a later gesture.
    }
  },

  setVolumes() {
    if (!this.ctx) return;
    const s = G.settings ?? { music: 60, sfx: 70 };
    this.musicGain.gain.value = (s.music ?? 60) / 100;
    this.sfxGain.gain.value = (s.sfx ?? 70) / 100;
    this.ambientGain.gain.value = ((s.sfx ?? 70) / 100) * 0.6;
  },

  play(name, { volume = 1, pitch = 1, gain = this.sfxGain } = {}) {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) return null;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      g.connect(gain);
      src.start();
      return src;
    } catch {
      return null;
    }
  },

  sfx(name, opts = {}) {
    if (!this.ctx) return;
    if (name === 'step') return this.step(opts);
    const list = SFX[name];
    if (!list || !list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    const pitch = (opts.pitch ?? 1) * (0.96 + Math.random() * 0.08);
    this.play(pick, { ...opts, pitch });
  },

  // Short square blip for dialogue, pitched per speaker.
  blip(voice = 1) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 380 * voice;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch {
      // Ignore: a missing blip is not worth breaking dialogue for.
    }
  },

  // A footstep: a short burst of filtered noise.
  step({ volume = 1 } = {}) {
    if (!this.ctx || !this.noise) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700 + Math.random() * 300;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05 * volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      src.start(t);
      src.stop(t + 0.08);
    } catch {
      // Ignore.
    }
  },

  // Music (step 34). Short pieces like 'victory' duck the song and put it back.
  music(name) {
    if (!this.ctx) return;
    if (name && ONCE.has(name)) music.jingle(name);
    else music.play(name ?? null);
  },

  stopMusic() {
    music.stop();
  },

  // Ambience (step 35): wind, crickets, drips and the Gate's hum.
  ambient(name) {
    if (!this.ctx) return;
    ambient.set(name ?? null);
  },

  // The Gate's hum, 0 to 1, set from how close Pip is standing.
  hum(level) {
    if (!this.ctx) return;
    ambient.hum(level);
  },
};

const ONCE = new Set(['levelup', 'lose', 'item', 'chapter']);
