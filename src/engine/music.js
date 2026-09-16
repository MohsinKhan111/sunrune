// Chiptune sequencer turned soft (F19, D9, D34): a warm electric-piano, a mellow lead,
// a round bass, brushed drums and a pad, scheduled ahead on the audio clock. Songs are
// step patterns in src/data/music.js.
//
// What makes it read as lo-fi rather than as a chip:
//   - swing, so the off-beats lay back instead of landing on the grid
//   - seventh and ninth chords, which is a question for the songs, not for this file
//   - the whole bus rolled off above ~2.4 kHz and under ~70 Hz: warmth is mostly what
//     you take away
//   - a slow wobble on a short delay, which is what tape does to pitch
//   - an eighth-note echo at low level, for room
//   - vinyl crackle underneath, quiet enough to be felt rather than heard
import { audio } from './audio.js';
import { SONGS } from '../data/music.js';

const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const LOOKAHEAD = 0.25;
// How far the off-beat eighths lay back, as a fraction of a step. 0 is a drum machine.
const SWING = 0.22;

function freq(token) {
  const m = /^([a-g])([#b]?)(\d)$/.exec(token);
  if (!m) return null;
  const semi = SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + semi;
  return 440 * 2 ** ((midi - 69) / 12);
}

// A step may hold a chord: "c4+e4+g4+b4" is played as four notes at once. Sevenths and
// ninths are most of what separates this from the fairground it used to sound like.
const notesOf = (token) => token.split('+').filter(Boolean);

// Instruments. `gain` is per note, and a chord divides it between its notes so a
// four-note voicing doesn't come out four times louder than the melody.
const VOICES = {
  pad: { kind: 'pad', gain: 0.042 },
  p2: { kind: 'keys', gain: 0.085 },
  p1: { kind: 'lead', gain: 0.075 },
  bass: { kind: 'bass', gain: 0.14 },
  drums: { kind: 'drums', gain: 0.09 },
};

// Partial, relative level, and detune in cents. Two voices a few cents apart beat
// against each other slowly, which is the whole trick behind a warm pad.
const TONES = {
  keys: { type: 'sine', partials: [[1, 1, 0], [2, 0.3, 4], [3, 0.1, -4]], attack: 0.006, hold: 0.25, cutoff: 3200 },
  lead: { type: 'triangle', partials: [[1, 1, -5], [1, 0.55, 6]], attack: 0.03, hold: 0.7, cutoff: 2000 },
  pad: { type: 'triangle', partials: [[1, 1, -8], [1, 0.7, 9], [2, 0.18, 0]], attack: 0.45, hold: 0.7, cutoff: 1100 },
  bass: { type: 'triangle', partials: [[1, 1, 0], [0.5, 0.45, 0]], attack: 0.012, hold: 0.85, cutoff: 420 },
};

export const music = {
  name: null,
  song: null,
  gain: null,
  step: 0,
  nextTime: 0,
  timer: null,
  resumeName: null,
  bus: null,
  crackle: null,

  play(name) {
    if (name === this.name) return;
    const song = name ? SONGS[name] : null;
    this.stop();
    this.name = name ?? null;
    if (!audio.ctx || !song) return;
    try {
      this.song = song;
      this.step = 0;
      this.buildBus();
      this.gain.gain.exponentialRampToValueAtTime(1, audio.ctx.currentTime + 0.6);
      this.nextTime = audio.ctx.currentTime + 0.06;
      this.timer = setInterval(() => this.tick(), 25);
    } catch {
      this.song = null;
    }
  },

  // Everything every note passes through on its way out. Built per song and thrown away
  // with it, so a song that ends leaves no nodes running.
  buildBus() {
    const ctx = audio.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;

    // Warmth is mostly subtraction: the top taken off, and the very bottom too so the
    // bass stays round instead of rumbling.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    tone.Q.value = 0.6;
    const body = ctx.createBiquadFilter();
    body.type = 'highpass';
    body.frequency.value = 70;

    // Tape wobble: a few milliseconds of delay, wandering slowly. Too small to hear as
    // an echo, just enough to stop every note landing at exactly the same pitch.
    const wow = ctx.createDelay(0.05);
    wow.delayTime.value = 0.008;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.37;
    lfoGain.gain.value = 0.0022;
    lfo.connect(lfoGain);
    lfoGain.connect(wow.delayTime);
    lfo.start();

    this.gain.connect(tone);
    tone.connect(body);
    body.connect(wow);
    wow.connect(audio.musicGain);

    // An eighth-note echo, darkened each time round so it dissolves rather than piling up.
    const send = ctx.createGain();
    send.gain.value = 0.17;
    const echo = ctx.createDelay(1.2);
    echo.delayTime.value = Math.min(1.2, (60 / this.song.bpm) * 0.75);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.26;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1500;
    body.connect(send);
    send.connect(echo);
    echo.connect(echoTone);
    echoTone.connect(feedback);
    feedback.connect(echo);
    echoTone.connect(audio.musicGain);

    this.bus = { tone, body, wow, lfo, send, echo, feedback, echoTone };
    this.startCrackle();
  },

  // Vinyl surface noise. Quiet enough that it reads as the recording rather than as a
  // sound in its own right, and it rides the music volume like everything else here.
  startCrackle() {
    const ctx = audio.ctx;
    if (!audio.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    src.loop = true;
    // Band-limited, not just brightened: left as a plain highpass it was the highest
    // thing in the mix, and on a sparse track like the Hollow's it was most of what the
    // spectrum had in it. Vinyl noise belongs under the music, not over it.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.value = 0.005;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(audio.musicGain);
    src.start();
    this.crackle = { src, hp, lp, g };
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
    const bus = this.bus;
    const crackle = this.crackle;
    if (g && audio.ctx) {
      try {
        const t = audio.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        if (crackle) {
          crackle.g.gain.setValueAtTime(crackle.g.gain.value, t);
          crackle.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        }
        // Long enough for the echo's tail to run out before its nodes go.
        setTimeout(() => this.teardown(g, bus, crackle), 1600);
      } catch {
        this.teardown(g, bus, crackle);
      }
    }
    this.gain = null;
    this.bus = null;
    this.crackle = null;
    this.song = null;
    this.name = null;
  },

  teardown(g, bus, crackle) {
    const safely = (fn) => {
      try {
        fn();
      } catch {
        // A node that is already gone is not worth an exception.
      }
    };
    safely(() => g.disconnect());
    if (bus) {
      safely(() => bus.lfo.stop());
      for (const node of Object.values(bus)) safely(() => node.disconnect());
    }
    if (crackle) {
      safely(() => crackle.src.stop());
      for (const node of Object.values(crackle)) safely(() => node.disconnect());
    }
  },

  tick() {
    const ctx = audio.ctx;
    if (!ctx || !this.song) return;
    const stepDur = 60 / this.song.bpm / 2;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      // Odd steps are the off-beats. Pushing them late is the difference between a
      // groove and a metronome, and it is the one thing a step grid cannot express.
      const swing = this.step % 2 ? stepDur * SWING : 0;
      this.scheduleStep(this.step, this.nextTime + swing, stepDur);
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
      if (voice.kind === 'drums') this.drum(tok, time, voice.gain);
      else {
        // A chord shares one voice's worth of level between its notes.
        const notes = notesOf(tok);
        const share = voice.gain / Math.sqrt(Math.max(1, notes.length));
        for (const n of notes) this.note(n, time, length * stepDur * 0.94, voice.kind, share);
      }
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

  // One note on one instrument: a few detuned partials through a filter, with an
  // envelope soft enough at both ends that nothing clicks.
  note(token, time, dur, kind, level) {
    const f = freq(token);
    const ctx = audio.ctx;
    const tone = TONES[kind];
    if (!f || !ctx || !this.gain || !tone) return;
    try {
      const out = ctx.createGain();
      const attack = Math.min(tone.attack, dur * 0.4);
      const hold = Math.max(attack + 0.01, dur * tone.hold);
      out.gain.setValueAtTime(0.0001, time);
      out.gain.exponentialRampToValueAtTime(level, time + attack);
      out.gain.setValueAtTime(level, time + hold);
      out.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      // Track the note, so a high melody is not dulled to nothing and a low one has no
      // hiss to lose. Held to the instrument's own ceiling either way.
      filter.frequency.value = Math.min(tone.cutoff, Math.max(300, f * 7));
      filter.Q.value = 0.7;

      const oscs = [];
      for (const [mult, amp, cents] of tone.partials) {
        const osc = ctx.createOscillator();
        osc.type = tone.type;
        osc.frequency.value = f * mult;
        osc.detune.value = cents;
        const pg = ctx.createGain();
        pg.gain.value = amp;
        osc.connect(pg);
        pg.connect(filter);
        osc.start(time);
        osc.stop(time + dur + 0.08);
        oscs.push(osc);
      }
      filter.connect(out);
      out.connect(this.gain);
    } catch {
      // A dropped note is not worth breaking the song for.
    }
  },

  // Brushed rather than chipped: the kick rounder and lower, the snare more body than
  // hiss, the hats quiet. `r` is a rim click and `o` an open hat.
  drum(kind, time, level) {
    const ctx = audio.ctx;
    if (!ctx || !this.gain) return;
    try {
      if (kind === 'k') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115, time);
        osc.frequency.exponentialRampToValueAtTime(42, time + 0.1);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level * 1.9, time + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
        osc.connect(g);
        g.connect(this.gain);
        osc.start(time);
        osc.stop(time + 0.22);
        return;
      }
      if (!audio.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = audio.noise;
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      let dur = 0.05;
      let amp = level * 0.45;
      if (kind === 's') {
        filter.type = 'bandpass';
        filter.frequency.value = 1250;
        filter.Q.value = 0.8;
        dur = 0.16;
        amp = level * 0.85;
        // A little tuned body under the noise, which is what a brush on a head sounds
        // like and a plain noise burst never does.
        const body = ctx.createOscillator();
        const bg = ctx.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(220, time);
        body.frequency.exponentialRampToValueAtTime(150, time + 0.08);
        bg.gain.setValueAtTime(level * 0.5, time);
        bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
        body.connect(bg);
        bg.connect(this.gain);
        body.start(time);
        body.stop(time + 0.12);
      } else if (kind === 'r') {
        filter.type = 'bandpass';
        filter.frequency.value = 2400;
        filter.Q.value = 3;
        dur = 0.05;
        amp = level * 0.7;
      } else if (kind === 'o') {
        filter.type = 'highpass';
        filter.frequency.value = 6500;
        dur = 0.22;
        amp = level * 0.3;
      } else {
        filter.type = 'highpass';
        filter.frequency.value = 6000;
        dur = 0.04;
        amp = level * 0.22;
      }
      g.gain.setValueAtTime(amp, time);
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
