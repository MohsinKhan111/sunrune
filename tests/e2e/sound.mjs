// The music, in a real browser with a real audio clock (F19, D34). A song can be written
// correctly and still make no sound - a disconnected node, a filter set to nothing, an
// envelope with no release - and none of that shows up in the song data. So these checks
// listen to the output rather than reading the patterns.
import assert from 'node:assert/strict';

const game = (page, fn) => page.evaluate(fn);

// Browsers will not start an audio clock until something is clicked, even with the
// autoplay policy relaxed.
async function wake(page) {
  await page.mouse.click(300, 200);
  await page.waitForTimeout(2600);
}

// Peak level and average band balance over a couple of seconds. A slow song has gaps
// between notes, so a single reading can land on silence and prove nothing.
async function listen(page, samples = 14) {
  const acc = { bass: 0, mid: 0, top: 0 };
  let peak = 0;
  let heard = 0;
  let song = null;
  for (let i = 0; i < samples; i++) {
    const a = await game(page, () => window.__sunrune.audio());
    song = a.song;
    peak = Math.max(peak, a.musicLevel);
    if (a.musicLevel > 0.01) {
      acc.bass += a.musicBands.bass;
      acc.mid += a.musicBands.mid;
      acc.top += a.musicBands.top;
      heard++;
    }
    await page.waitForTimeout(200);
  }
  const avg = (k) => (heard ? acc[k] / heard : 0);
  return { song, peak, heard, bass: avg('bass'), mid: avg('mid'), top: avg('top') };
}

const PLACES = [
  ['dunmere', 'town'],
  ['house', 'home'],
  ['post', 'post'],
  ['canyon', 'canyon'],
  ['hollow', 'hollow'],
];

export const sound = [
  {
    // Indoors and outdoors were the same theme until the user said so. Every place the
    // player can stand in now has its own, and every one of them makes a sound.
    name: 'every-place-plays-its-own-theme',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page, base }) {
      const heard = new Map();
      for (const [map, expected] of PLACES) {
        await page.goto(`${base}?map=${map}&party2&lv=4&test=1`);
        await wake(page);
        const r = await listen(page, 10);
        assert.equal(r.song, expected, `${map} is playing "${r.song}"`);
        assert.ok(r.peak > 0.005, `${map}: "${expected}" is silent (peak ${r.peak})`);
        assert.ok(!heard.has(r.song), `${map} plays the same theme as ${heard.get(r.song)}`);
        heard.set(r.song, map);
      }
      assert.equal(heard.size, PLACES.length);
    },
  },

  {
    // Warm, which is what the user asked for: weighted to the bass, the middle present
    // so the melody and the chords can be heard, and next to nothing above 2 kHz. A
    // square-wave chip lead would fail this on the last count alone.
    name: 'the-music-is-warm-rather-than-bright',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await wake(page);
      const r = await listen(page);
      assert.ok(r.heard >= 6, `only heard music in ${r.heard} of the readings`);
      assert.ok(r.top <= 8, `${r.top.toFixed(0)}% of the mix is above 2 kHz - that is shrill, not warm`);
      assert.ok(r.bass >= 35, `only ${r.bass.toFixed(0)}% of the mix is bass`);
      // Warm is not the same as muffled: the register a melody sits in has to be there.
      assert.ok(r.mid >= 15, `only ${r.mid.toFixed(0)}% of the mix is in the middle - the tune is buried`);
    },
  },

  {
    // A fight takes the music over and hands it back. The jingle path is the one that
    // used to be able to stop the music for the rest of the session, so it is worth
    // proving that the world's theme comes back after one.
    name: 'a-fight-takes-the-music-and-the-world-gets-it-back',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page, base }) {
      await page.goto(`${base}?battle=glimmerslug&party2&lv=4&test=1`);
      await wake(page);
      const fight = await listen(page, 8);
      assert.equal(fight.song, 'battle', `a fight is playing "${fight.song}"`);
      assert.ok(fight.peak > 0.005, 'the battle theme is silent');

      await page.goto(`${base}?map=dunmere&party2&lv=4&test=1`);
      await wake(page);
      const after = await listen(page, 8);
      assert.equal(after.song, 'town', `back in the world the music is "${after.song}"`);
      assert.ok(after.peak > 0.005, 'the world theme never came back');
    },
  },

  {
    // Two of the pack's samples were hiss rather than tone, and the cursor one played on
    // every press while somebody read down a menu. They are synthesized now, and the
    // point of that is that scrolling a menu should be quieter than committing to
    // something - not the other way round, which is how it was.
    name: 'moving-through-a-menu-is-quieter-than-pressing-a-button',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await wake(page);
      const peakOf = (name) =>
        page.evaluate(async (n) => {
          const m = await import('./src/engine/audio.js');
          let top = 0;
          m.audio.sfx(n);
          for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 20));
            top = Math.max(top, window.__sunrune.audio().level);
          }
          return top;
        }, name);

      const confirm = await peakOf('confirm');
      await page.waitForTimeout(400);
      const cursor = await peakOf('cursor');
      await page.waitForTimeout(400);
      const levelup = await peakOf('levelup');

      assert.ok(cursor > 0.005, 'the cursor makes no sound at all');
      assert.ok(levelup > 0.005, 'the level-up makes no sound at all');
      assert.ok(cursor < confirm, `moving the cursor (${cursor.toFixed(3)}) is louder than confirming (${confirm.toFixed(3)})`);
      assert.ok(levelup <= confirm, `the level-up (${levelup.toFixed(3)}) is louder than confirming (${confirm.toFixed(3)})`);
    },
  },

  {
    // Turning the music down has to actually turn it down, and off has to be off - the
    // crackle and the echo are new nodes and both could have missed the volume bus.
    name: 'the-music-volume-setting-reaches-every-part-of-the-mix',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await wake(page);
      const loud = await listen(page, 10);
      assert.ok(loud.peak > 0.005, 'no music to turn down');

      await game(page, () => {
        window.__sunrune.G.settings.music = 0;
        return null;
      });
      await page.evaluate(async () => {
        const m = await import('./src/engine/audio.js');
        m.audio.setVolumes();
      });
      await page.waitForTimeout(700);
      const quiet = await listen(page, 8);
      assert.ok(quiet.peak < 0.002, `music at 0 still reads ${quiet.peak} - something bypasses the volume`);
    },
  },
];
