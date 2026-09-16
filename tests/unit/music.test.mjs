// The songs are hand-typed patterns, so a typo is easy and silent: a bar with seven
// steps instead of eight would drift the whole track. These checks are the same idea as
// the map test - catch the typo here rather than by ear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../../src/data/music.js';

const NOTE = /^([a-g])([#b]?)(\d)$/;
const DRUM = /^[ksh]$/;
const TRACKS = ['p1', 'p2', 'bass', 'drums'];

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
    for (const track of ['p1', 'p2', 'bass']) {
      bars(song, track).forEach((bar, i) => {
        for (const tok of bar.split(/\s+/).filter(Boolean)) {
          if (tok === '.' || tok === '-') continue;
          assert.match(tok, NOTE, `${name}.${track} bar ${i} token "${tok}"`);
          const octave = Number(NOTE.exec(tok)[3]);
          assert.ok(octave >= 1 && octave <= 6, `${name}.${track} octave ${octave} out of range`);
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
    'title', 'town', 'canyon', 'hollow', 'battle', 'boss',
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
  for (const name of ['title', 'town', 'canyon', 'hollow', 'battle', 'boss', 'victory']) {
    assert.ok(!SONGS[name].once, `${name} should loop`);
  }
});
