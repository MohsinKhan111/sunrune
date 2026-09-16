// Chiptune sequencer (F19, D9): two pulse voices, a triangle bass and noise drums,
// scheduled ahead on the audio clock. Songs are step patterns in src/data/music.js.
import { audio } from './audio.js';
import { SONGS } from '../data/music.js';

const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const LOOKAHEAD = 0.25;

function freq(token) {
  const m = /^([a-g])([#b]?)(\d)$/.exec(token);
  if (!m) return null;
  const semi = SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + semi;
  return 440 * 2 ** ((midi - 69) / 12);
}

// Pulse waves with the duty cycles an 8-bit chip would use.
const waveCache = new Map();
function pulseWave(ctx, duty) {
  if (waveCache.has(duty)) return waveCache.get(duty);
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waveCache.set(duty, wave);
  return wave;
}

const VOICES = {
  p1: { type: 'pulse', duty: 0.5, gain: 0.09 },
  p2: { type: 'pulse', duty: 0.25, gain: 0.06 },
  bass: { type: 'triangle', gain: 0.13 },
  drums: { type: 'noise', gain: 0.09 },
};

export const music = {
  name: null,
  song: null,
  gain: null,
  step: 0,
  nextTime: 0,
  timer: null,
  resumeName: null,

  play(name) {
    if (name === this.name) return;
    const song = name ? SONGS[name] : null;
    this.stop();
    this.name = name ?? null;
    if (!audio.ctx || !song) return;
    try {
      this.song = song;
      this.step = 0;
      this.gain = audio.ctx.createGain();
      this.gain.gain.value = 0.0001;
      this.gain.connect(audio.musicGain);
      this.gain.gain.exponentialRampToValueAtTime(1, audio.ctx.currentTime + 0.5);
      this.nextTime = audio.ctx.currentTime + 0.06;
      this.timer = setInterval(() => this.tick(), 25);
    } catch {
      this.song = null;
    }
  },

  // A short flourish that ducks the song, then puts it back.
  jingle(name) {
    if (!audio.ctx || !SONGS[name]) return;
    const back = this.name;
    this.play(name);
    this.resumeName = back;
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const g = this.gain;
    if (g && audio.ctx) {
      try {
        const t = audio.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        setTimeout(() => g.disconnect(), 500);
      } catch {
        g.disconnect();
      }
    }
    this.gain = null;
    this.song = null;
    this.name = null;
  },

  tick() {
    const ctx = audio.ctx;
    if (!ctx || !this.song) return;
    const stepDur = 60 / this.song.bpm / 2;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
      const total = this.song.bars * 8;
      if (this.song.once && this.step >= total) {
        // The jingle is scheduled to its end, so stop scheduling right now. Leaving the
        // timer running re-entered this branch a tick later, and that second pass - with
        // nothing left to resume - stopped the music for the rest of the session.
        const back = this.resumeName;
        const mine = this.name;
        const at = (this.nextTime - ctx.currentTime) * 1000;
        this.resumeName = null;
        this.song = null;
        clearInterval(this.timer);
        this.timer = null;
        setTimeout(() => {
          if (this.name !== mine) return; // something else took over in the meantime
          this.stop();
          if (back) this.play(back);
        }, at);
        return;
      }
    }
  },

  scheduleStep(step, time, stepDur) {
    const song = this.song;
    const total = song.bars * 8;
    const idx = step % total;
    for (const [track, pattern] of Object.entries(song.tracks)) {
      const voice = VOICES[track];
      if (!voice || !pattern.length) continue;
      const bar = pattern[Math.floor(idx / 8) % pattern.length];
      if (!bar) continue;
      const tokens = bar.split(/\s+/).filter(Boolean);
      const tok = tokens[idx % 8];
      if (!tok || tok === '.' || tok === '-') continue;
      // A note lasts until the next non-sustain step.
      let length = 1;
      for (let i = 1; i < 16; i++) {
        const next = this.tokenAt(song, step + i);
        if (next?.[track] !== '-') break;
        length++;
      }
      if (voice.type === 'noise') this.drum(tok, time, voice.gain);
      else this.note(tok, time, length * stepDur * 0.92, voice);
    }
  },

  tokenAt(song, step) {
    const total = song.bars * 8;
    const idx = step % total;
    const out = {};
    for (const [track, pattern] of Object.entries(song.tracks)) {
      const bar = pattern[Math.floor(idx / 8) % pattern.length];
      out[track] = bar ? (bar.split(/\s+/).filter(Boolean)[idx % 8] ?? '.') : '.';
    }
    return out;
  },

  note(token, time, dur, voice) {
    const f = freq(token);
    const ctx = audio.ctx;
    if (!f || !ctx || !this.gain) return;
    try {
      const osc = ctx.createOscillator();
      if (voice.type === 'pulse') osc.setPeriodicWave(pulseWave(ctx, voice.duty));
      else osc.type = voice.type;
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(voice.gain, time + 0.012);
      // Hold almost to the end of the note: decaying from 60% left audible gaps between
      // notes, which read as silence on the meter and as dead air in a slow track.
      g.gain.setValueAtTime(voice.gain, time + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(this.gain);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    } catch {
      // A dropped note is not worth breaking the song for.
    }
  },

  drum(kind, time, level) {
    const ctx = audio.ctx;
    if (!ctx || !this.gain) return;
    try {
      if (kind === 'k') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.11);
        g.gain.setValueAtTime(level * 1.6, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
        osc.connect(g);
        g.connect(this.gain);
        osc.start(time);
        osc.stop(time + 0.16);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = audio.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = kind === 's' ? 'bandpass' : 'highpass';
      filter.frequency.value = kind === 's' ? 1600 : 7000;
      const g = ctx.createGain();
      const dur = kind === 's' ? 0.12 : 0.045;
      g.gain.setValueAtTime(level * (kind === 's' ? 1.1 : 0.5), time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.gain);
      src.start(time);
      src.stop(time + dur + 0.02);
    } catch {
      // Ignore.
    }
  },
};
