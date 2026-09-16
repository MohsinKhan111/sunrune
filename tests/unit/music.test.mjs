// The songs are hand-typed patterns, so a typo is easy and silent: a bar with seven
// steps instead of eight would drift the whole track. These checks are the same idea as
// the map test - catch the typo here rather than by ear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../../src/data/music.js';

const NOTE = /^([a-g])([#b]?)(\d)$/;
const DRUM = /^[kshro]$/;
const TRACKS = ['pad', 'p1', 'p2', 'bass', 'drums'];
const PITCHED = ['pad', 'p1', 'p2', 'bass'];
// A step may hold a chord: "c4+e4+g4" is three notes at once (D34).
const notesOf = (token) => token.split('+').filter(Boolean);

function bars(song, track) {
  return song.tracks[track] ?? [];
}

test('every song has the fields the sequencer reads', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    assert.ok(song.bpm >= 40 && song.bpm <= 200, `${name} bpm out of range`);
    assert.ok(Number.isInteger(song.bars) && song.bars > 0, `${name} bars`);
    for (const track of Object.keys(song.tracks)) {
      assert.ok(TRACKS.includes(track), `${name} has unknown track ${track}`);
    }
  }
});

test('every bar is exactly 8 steps', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    for (const track of TRACKS) {
      bars(song, track).forEach((bar, i) => {
        const tokens = bar.split(/\s+/).filter(Boolean);
        assert.equal(tokens.length, 8, `${name}.${track} bar ${i} has ${tokens.length} steps`);
      });
    }
  }
});

test('every pitched token is a real note', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    for (const track of PITCHED) {
      bars(song, track).forEach((bar, i) => {
        for (const tok of bar.split(/\s+/).filter(Boolean)) {
          if (tok === '.' || tok === '-') continue;
          for (const note of notesOf(tok)) {
            assert.match(note, NOTE, `${name}.${track} bar ${i} token "${tok}"`);
            const octave = Number(NOTE.exec(note)[3]);
            assert.ok(octave >= 1 && octave <= 6, `${name}.${track} octave ${octave} out of range`);
          }
        }
      });
    }
  }
});

test('drum tokens are kick, snare or hat', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    bars(song, 'drums').forEach((bar, i) => {
      for (const tok of bar.split(/\s+/).filter(Boolean)) {
        if (tok === '.' || tok === '-') continue;
        assert.match(tok, DRUM, `${name}.drums bar ${i} token "${tok}"`);
      }
    });
  }
});

test('a bar never opens on a hold, which would have nothing to sustain', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    for (const track of TRACKS) {
      const list = bars(song, track);
      list.forEach((bar, i) => {
        if (i === 0) return;
        const first = bar.split(/\s+/).filter(Boolean)[0];
        if (first !== '-') return;
        // A hold at the start of a bar is fine so long as the previous bar ended on a note.
        const prev = list[i - 1].split(/\s+/).filter(Boolean);
        assert.notEqual(prev[7], '.', `${name}.${track} bar ${i} holds a rest`);
      });
    }
  }
});

test('the songs the game asks for by name all exist', () => {
  // These names are the ones passed to audio.music() around the game.
  const used = [
    'title', 'town', 'home', 'post', 'canyon', 'hollow', 'battle', 'boss',
    'ending', 'intro', 'victory', 'levelup', 'lose', 'item', 'chapter',
  ];
  for (const name of used) assert.ok(SONGS[name], `missing song "${name}"`);
});

test('the triangle bass stays below C4, so it never crosses the melody', () => {
  const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const C4 = 60;
  for (const [name, song] of Object.entries(SONGS)) {
    bars(song, 'bass').forEach((bar, i) => {
      for (const tok of bar.split(/\s+/).filter(Boolean)) {
        if (tok === '.' || tok === '-') continue;
        const [, letter, accidental, octave] = NOTE.exec(tok);
        const midi = 12 * (Number(octave) + 1) + SEMITONE[letter]
          + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
        assert.ok(midi < C4, `${name}.bass bar ${i} plays ${tok}, at or above C4`);
      }
    });
  }
});

test('the flourishes end instead of looping', () => {
  // levelup ducks the victory theme and hands it back; lose leaves silence behind for
  // the defeat screen. Victory itself loops, because the results can run a long time.
  for (const name of ['levelup', 'lose', 'item', 'chapter']) {
    assert.equal(SONGS[name].once, true, `${name} should be a one-shot`);
  }
  for (const name of ['title', 'town', 'home', 'post', 'canyon', 'hollow', 'battle', 'boss', 'victory']) {
    assert.ok(!SONGS[name].once, `${name} should loop`);
  }
});

test('the places you can stand in all sound different from each other', () => {
  // Indoors and outdoors were the same theme until the user pointed it out. A theme per
  // place is only worth having if the themes are actually distinct, so this compares the
  // thing a listener would notice first: the key, the tempo and the bass line.
  const places = ['town', 'home', 'post', 'canyon', 'hollow'];
  const seen = new Map();
  for (const name of places) {
    const song = SONGS[name];
    const signature = `${song.bpm}|${bars(song, 'bass').join('|')}`;
    assert.ok(!seen.has(signature), `${name} and ${seen.get(signature)} are the same piece of music`);
    seen.set(signature, name);
  }
});

test('an area theme is long enough not to feel like a loop', () => {
  // Eight bars at these tempos is around half a minute before it comes round again.
  for (const name of ['title', 'town', 'home', 'post', 'canyon', 'hollow', 'battle', 'boss', 'ending']) {
    const song = SONGS[name];
    const seconds = (song.bars * 4 * 60) / song.bpm;
    assert.ok(seconds >= 20, `${name} loops every ${seconds.toFixed(1)}s`);
  }
});

test('the area themes are chill, and the fights are not', () => {
  for (const name of ['title', 'home', 'hollow', 'canyon', 'town', 'post', 'ending']) {
    assert.ok(SONGS[name].bpm <= 90, `${name} runs at ${SONGS[name].bpm} bpm`);
  }
  for (const name of ['battle', 'boss']) {
    assert.ok(SONGS[name].bpm >= 90, `${name} runs at ${SONGS[name].bpm} bpm`);
  }
});

test('a chord is a chord, not a pile of notes', () => {
  // Four is a seventh; more than that and the voicing is muddy at this register, and the
  // sequencer would be dividing one voice's level too many ways to be heard.
  for (const [name, song] of Object.entries(SONGS)) {
    for (const track of PITCHED) {
      bars(song, track).forEach((bar, i) => {
        for (const tok of bar.split(/\s+/).filter(Boolean)) {
          if (tok === '.' || tok === '-') continue;
          const n = notesOf(tok).length;
          assert.ok(n <= 4, `${name}.${track} bar ${i} stacks ${n} notes`);
          if (track === 'bass') assert.equal(n, 1, `${name}.bass bar ${i} plays a chord`);
        }
      });
    }
  }
});
