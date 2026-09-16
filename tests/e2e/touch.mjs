// The touch pad in a real browser, on a real touchscreen (F40). Playwright is given a
// phone-shaped window with a coarse pointer and a dense screen, and the checks press the
// pad the way a thumb does - through Chrome's own touch input, not by calling the game.
//
// Two promises are worth a browser rather than a unit test. One: no control ever sits on
// the picture, in either orientation, which is a question about boxes on a page. Two: a
// player can get out of anything with a thumb, which is a question about the game.
import assert from 'node:assert/strict';

const game = (page, fn) => page.evaluate(fn);
const pad = (page) => game(page, () => window.__sunrune.touch());
const scenes = (page) => game(page, () => window.__sunrune.scenes());
const where = (page) => game(page, () => window.__sunrune.player());

const PHONE_UP = { touch: true, width: 390, height: 844, dpr: 3 };
const PHONE_OVER = { touch: true, width: 844, height: 390, dpr: 3 };
const TABLET_UP = { touch: true, width: 820, height: 1180, dpr: 2 };

// Chrome's own touch input, so the pad is driven by the same pointer events a finger
// makes - including the hold, which is the whole point of a direction pad and which
// tap() cannot do.
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    async down(x, y) {
      await send('touchStart', [{ x: Math.round(x), y: Math.round(y), id: 1 }]);
    },
    async moveTo(x, y) {
      await send('touchMove', [{ x: Math.round(x), y: Math.round(y), id: 1 }]);
    },
    async up() {
      await send('touchEnd', []);
    },
    async hold(x, y, ms) {
      await this.down(x, y);
      await page.waitForTimeout(ms);
      await this.up();
      await page.waitForTimeout(140);
    },
    async tap(x, y) {
      await this.hold(x, y, 70);
    },
  };
}

const mid = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

// Where each face button sits inside the diamond, as a fraction of the cluster box.
const FACE_AT = {
  a: [0.785, 0.5],
  b: [0.5, 0.785],
  x: [0.215, 0.5],
  y: [0.5, 0.215],
};
const faceButton = (box, which) => ({
  x: box.x + box.w * FACE_AT[which][0],
  y: box.y + box.h * FACE_AT[which][1],
});

// The arms of the cross, a little in from each end so the press is unambiguous.
const armOf = (box, dir) => {
  const c = mid(box);
  const reach = box.w * 0.38;
  if (dir === 'left') return { x: c.x - reach, y: c.y };
  if (dir === 'right') return { x: c.x + reach, y: c.y };
  if (dir === 'up') return { x: c.x, y: c.y - reach };
  return { x: c.x, y: c.y + reach };
};

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Every control, against the picture. The whole layout exists to make this true.
function assertNothingOnThePicture(info, label) {
  for (const name of ['dpad', 'face', 'start']) {
    const box = info[name];
    if (!box) continue;
    assert.ok(!overlaps(box, info.stage), `${label}: the ${name} sits on the picture`);
  }
}

// Presses A until the player has control, for the cutscenes a check has to get past.
async function settle(page, f, limit = 20000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return;
    const info = await pad(page);
    const a = faceButton(info.face, 'a');
    await f.tap(a.x, a.y);
  }
  throw new Error('never got control of the game');
}

export const touchpad = [
  {
    // A phone held upright: the pad takes the bottom of the page and the picture takes
    // the top, and the tip says what turning the phone would get you.
    name: 'a-phone-upright-gets-a-pad-under-the-picture',
    query: 'map=house&test=1',
    open: PHONE_UP,
    async run({ page, shot }) {
      const info = await pad(page);
      assert.equal(info.on, true, 'no pad on a touchscreen');
      assert.equal(info.orientation, 'portrait');
      assert.equal(info.device, 'touch', 'prompts would name keyboard keys');
      assert.equal(info.hintShown, true, 'no tip about turning the phone');
      assertNothingOnThePicture(info, 'upright');
      // The controls are below the picture, not beside it or over it.
      assert.ok(info.dpad.y > info.stage.y + info.stage.h, 'the cross is not under the picture');
      assert.ok(info.face.y > info.stage.y + info.stage.h, 'the buttons are not under the picture');
      // And the picture still gets a fair share of the window.
      assert.ok(info.stage.h >= 150, `only ${info.stage.h}px of picture`);
      await shot('touch-phone-upright');
    },
  },

  {
    // Turned sideways: the controls move into gutters of their own and the picture takes
    // the middle - wider than it was upright, which is what the tip promised.
    name: 'a-phone-sideways-moves-the-controls-to-the-edges',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page, shot }) {
      const info = await pad(page);
      assert.equal(info.orientation, 'landscape');
      assert.equal(info.hintShown, false, 'the turn-your-phone tip is still up, sideways');
      assertNothingOnThePicture(info, 'sideways');
      // One control each side, with the picture between them.
      assert.ok(info.dpad.x + info.dpad.w <= info.stage.x, 'the cross is not left of the picture');
      assert.ok(info.face.x >= info.stage.x + info.stage.w, 'the buttons are not right of the picture');
      // The promise the tip makes, measured: PHONE_UP and PHONE_OVER are one device.
      assert.ok(
        info.stage.w > PHONE_UP.width,
        `sideways gives ${info.stage.w}px of picture, no better than the ${PHONE_UP.width}px window upright`,
      );
      await shot('touch-phone-sideways');
    },
  },

  {
    // A tablet is the same layout with more room, and its buttons stay in proportion
    // rather than growing until they look like a toy.
    name: 'a-tablet-upright-lays-out-the-same-way',
    query: 'map=house&test=1',
    open: TABLET_UP,
    async run({ page }) {
      const info = await pad(page);
      assert.equal(info.orientation, 'portrait');
      assertNothingOnThePicture(info, 'tablet');
      assert.ok(info.dpad.w <= 200, `a ${info.dpad.w}px cross on a tablet`);
      assert.ok(info.dpad.w >= 120, `a ${info.dpad.w}px cross on a tablet`);
      assert.ok(info.stage.w >= 600, `only ${info.stage.w}px of picture on a tablet`);
    },
  },

  {
    // The cross walks, in the direction pressed, and stops the moment the thumb lifts.
    name: 'the-cross-walks-pip-and-stops-when-the-thumb-lifts',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page }) {
      const f = await finger(page);
      const info = await pad(page);
      const start = await where(page);

      const right = armOf(info.dpad, 'right');
      await f.down(right.x, right.y);
      await page.waitForTimeout(700);
      await f.up();
      await page.waitForTimeout(300);
      const walked = await where(page);
      assert.ok(walked.x > start.x + 8, `holding right moved Pip ${(walked.x - start.x).toFixed(1)}px`);

      // Let go and she stays put: a finger lifted off the pad must not leave a key stuck.
      await page.waitForTimeout(500);
      const settled = await where(page);
      assert.ok(Math.abs(settled.x - walked.x) < 1, 'Pip kept walking after the thumb lifted');

      // And the other way, to prove it is the arm pressed and not just any press.
      const up = armOf(info.dpad, 'up');
      await f.down(up.x, up.y);
      await page.waitForTimeout(600);
      await f.up();
      await page.waitForTimeout(300);
      const north = await where(page);
      assert.ok(north.y < settled.y - 6, `holding up moved Pip ${(settled.y - north.y).toFixed(1)}px`);
    },
  },

  {
    // A thumb rolling across the cross changes direction without being lifted, the way
    // it does on a real pad. Pressed on one arm and slid to another, the game follows.
    name: 'a-thumb-can-roll-from-one-arm-of-the-cross-to-another',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page }) {
      const f = await finger(page);
      const info = await pad(page);
      const from = armOf(info.dpad, 'right');
      const to = armOf(info.dpad, 'up');
      const before = await where(page);

      await f.down(from.x, from.y);
      await page.waitForTimeout(450);
      const afterRight = await where(page);
      await f.moveTo(to.x, to.y);
      await page.waitForTimeout(450);
      await f.up();
      await page.waitForTimeout(250);
      const afterUp = await where(page);

      assert.ok(afterRight.x > before.x + 5, 'the roll never started walking right');
      assert.ok(afterUp.y < afterRight.y - 5, 'rolling onto the up arm did not walk up');
    },
  },

  {
    // Start opens the pause menu, B backs out of it, and neither needs a keyboard.
    name: 'start-opens-the-pause-menu-and-b-closes-it',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page, shot }) {
      const f = await finger(page);
      const info = await pad(page);
      assert.deepEqual(await scenes(page), ['Overworld'], 'the game did not start in the world');

      const start = mid(info.start);
      await f.tap(start.x, start.y);
      await page.waitForTimeout(400);
      assert.deepEqual(await scenes(page), ['Overworld', 'MenuScene'], 'Start did not open the menu');
      await shot('touch-pause-menu');

      const b = faceButton(info.face, 'b');
      await f.tap(b.x, b.y);
      await page.waitForTimeout(400);
      assert.deepEqual(await scenes(page), ['Overworld'], 'B did not close the menu');

      // Y is the second way in, so the menu is never the button a player cannot find.
      const y = faceButton(info.face, 'y');
      await f.tap(y.x, y.y);
      await page.waitForTimeout(400);
      assert.deepEqual(await scenes(page), ['Overworld', 'MenuScene'], 'Y did not open the menu');
      await f.tap(y.x, y.y);
      await page.waitForTimeout(400);
      assert.deepEqual(await scenes(page), ['Overworld'], 'Y did not close the menu again');
    },
  },

  {
    // Nothing a thumb can open is a dead end. Every panel the pause menu leads to is
    // opened and then backed out of with B alone, ending where it started.
    name: 'a-thumb-can-back-out-of-every-panel',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page }) {
      const f = await finger(page);
      const info = await pad(page);
      const b = faceButton(info.face, 'b');
      const a = faceButton(info.face, 'a');
      const start = mid(info.start);
      const down = armOf(info.dpad, 'down');

      for (const tab of [0, 1, 2, 3]) {
        await f.tap(start.x, start.y);
        await page.waitForTimeout(300);
        assert.ok((await scenes(page)).includes('MenuScene'), `tab ${tab}: the menu never opened`);
        for (let i = 0; i < tab; i++) {
          await f.tap(down.x, down.y);
          await page.waitForTimeout(140);
        }
        await f.tap(a.x, a.y);
        await page.waitForTimeout(350);
        // Settings is a panel of its own; the others open inside the menu. Either way B
        // steps back, and B again leaves. A third is spare and must do no harm.
        for (let i = 0; i < 3; i++) {
          await f.tap(b.x, b.y);
          await page.waitForTimeout(280);
        }
        assert.deepEqual(await scenes(page), ['Overworld'], `tab ${tab}: B did not get back to the game`);
      }
    },
  },

  {
    // The last row of the pause menu. Quitting is a real way out on a phone, where there
    // is no window to close, and it asks first so a stray thumb cannot throw a game away.
    name: 'quit-to-title-can-be-reached-and-refused-with-a-thumb',
    query: 'map=house&test=1',
    open: PHONE_OVER,
    async run({ page, shot }) {
      const f = await finger(page);
      const info = await pad(page);
      const a = faceButton(info.face, 'a');
      const b = faceButton(info.face, 'b');
      const start = mid(info.start);
      const down = armOf(info.dpad, 'down');

      const toQuitRow = async () => {
        await f.tap(start.x, start.y);
        await page.waitForTimeout(300);
        for (let i = 0; i < 4; i++) {
          await f.tap(down.x, down.y);
          await page.waitForTimeout(150);
        }
        await f.tap(a.x, a.y);
        await page.waitForTimeout(300);
      };

      // Asked, and refused: B backs out of the question and the game is still there.
      await toQuitRow();
      await shot('touch-quit-asks-first');
      await f.tap(b.x, b.y);
      await page.waitForTimeout(300);
      await f.tap(b.x, b.y);
      await page.waitForTimeout(300);
      assert.deepEqual(await scenes(page), ['Overworld'], 'refusing the quit left the game somewhere else');

      // Asked, and taken: "No" is under the cursor, so up then A is "Yes, quit".
      await toQuitRow();
      const up = armOf(info.dpad, 'up');
      await f.tap(up.x, up.y);
      await page.waitForTimeout(150);
      await f.tap(a.x, a.y);
      await page.waitForTimeout(900);
      assert.deepEqual(await scenes(page), ['TitleScene'], 'quitting did not land on the title');

      // And the title itself answers a thumb, so quitting is not a dead end either.
      await f.tap(start.x, start.y);
      await page.waitForTimeout(500);
      assert.deepEqual(await scenes(page), ['TitleScene'], 'the title went somewhere unexpected');
    },
  },

  {
    // The pad is for thumbs. A desktop window gets the keyboard and no pad at all, and
    // the picture keeps the whole window the way it always did.
    name: 'a-desktop-window-gets-no-pad',
    query: 'map=house&test=1',
    async run({ page }) {
      const info = await pad(page);
      assert.equal(info.on, false, 'a desktop window grew a touch pad');
      assert.equal(info.orientation, 'none');
      assert.equal(info.stage.w, 1280, 'the picture lost room to a pad that is not there');
      assert.equal(info.stage.h, 720);
      const sc = await game(page, () => window.__sunrune.screen());
      assert.equal(sc.scale, Math.floor(sc.scale), `a desktop window went fractional at ×${sc.scale}`);
    },
  },

  {
    // Turning the device mid-game re-lays the page out and leaves the game running.
    name: 'turning-the-device-mid-game-keeps-the-game-going',
    query: 'map=house&test=1',
    open: PHONE_UP,
    async run({ page }) {
      const f = await finger(page);
      await settle(page, f);
      const before = await where(page);

      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(600);
      const over = await pad(page);
      assert.equal(over.orientation, 'landscape');
      assertNothingOnThePicture(over, 'after turning');

      // Still the same game, in the same place, and still walking.
      const after = await where(page);
      assert.equal(after.map, before.map, 'turning the device changed map');
      const arm = armOf(over.dpad, 'right');
      await f.down(arm.x, arm.y);
      await page.waitForTimeout(600);
      await f.up();
      await page.waitForTimeout(250);
      const walked = await where(page);
      assert.ok(walked.x > after.x + 5, 'the cross stopped working after the device turned');

      // And back again.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(600);
      const up = await pad(page);
      assert.equal(up.orientation, 'portrait');
      assertNothingOnThePicture(up, 'after turning back');
    },
  },
];
