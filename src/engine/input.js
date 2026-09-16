// Keyboard, gamepad and the touch pad → actions (F21, F40). Nothing else reads raw keys.
// All three feed the same four actions, so a scene never asks what is being played on.
const KEYS = {
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  KeyZ: ['confirm'],
  Space: ['confirm'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  KeyX: ['cancel'],
  Escape: ['cancel', 'menu'],
  Backspace: ['cancel'],
  ShiftLeft: ['run'],
  ShiftRight: ['run'],
  KeyF: ['fullscreen'],
};
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab']);

// Standard gamepad mapping.
const PAD_BUTTONS = { 0: 'confirm', 1: 'cancel', 2: 'run', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DEAD = 0.35;
const REPEAT_FIRST = 0.35;
const REPEAT_NEXT = 0.09;

// What a prompt calls each action, per device. The touch pad's letters match the ones
// printed on its buttons, so "press A to talk" names something the thumb can see.
const LABELS = {
  keyboard: { confirm: 'Z', cancel: 'X', run: 'Shift', menu: 'Esc' },
  gamepad: { confirm: 'A', cancel: 'B', run: 'X', menu: 'Start' },
  touch: { confirm: 'A', cancel: 'B', run: 'X', menu: 'Start' },
};

const keysDown = new Set();
let padDown = new Set();
const touchDown = new Set();
let queuedPress = new Set();
let queuedRelease = new Set();
let pressed = new Set();
let released = new Set();
const holdTime = {};
const repeatFire = new Set();

export const input = {
  device: 'keyboard',
  anyKeyQueued: false,
  anyKey: false,

  init() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.device = 'keyboard';
      this.anyKeyQueued = true;
      keysDown.add(e.code);
      for (const a of KEYS[e.code] ?? []) queuedPress.add(a);
    });
    window.addEventListener('keyup', (e) => {
      keysDown.delete(e.code);
      for (const a of KEYS[e.code] ?? []) if (!this.held(a)) queuedRelease.add(a);
    });
    window.addEventListener('blur', () => this.clear());
  },

  heldByKeys(action) {
    for (const code of keysDown) if (KEYS[code]?.includes(action)) return true;
    return false;
  },

  // A button on the touch pad went down or came up (F40). The pad calls this and nothing
  // else: it holds no state of its own, so a finger lifted off-screen can't get stuck on.
  touch(action, down) {
    if (down) {
      if (touchDown.has(action)) return;
      touchDown.add(action);
      queuedPress.add(action);
      this.device = 'touch';
      this.anyKeyQueued = true;
      return;
    }
    if (!touchDown.delete(action)) return;
    if (!this.held(action)) queuedRelease.add(action);
  },

  clear() {
    keysDown.clear();
    padDown = new Set();
    touchDown.clear();
    queuedPress.clear();
    queuedRelease.clear();
    pressed.clear();
    released.clear();
  },

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed && PAD_BUTTONS[i]) now.add(PAD_BUTTONS[i]);
      });
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -DEAD) now.add('left');
      if (ax > DEAD) now.add('right');
      if (ay < -DEAD) now.add('up');
      if (ay > DEAD) now.add('down');
      break;
    }
    for (const a of now) {
      if (!padDown.has(a)) {
        queuedPress.add(a);
        this.device = 'gamepad';
        this.anyKeyQueued = true;
      }
    }
    for (const a of padDown) {
      if (!now.has(a) && !this.heldByKeys(a) && !touchDown.has(a)) queuedRelease.add(a);
    }
    padDown = now;
  },

  // Called once per fixed update, before the game updates.
  update(dt) {
    this.pollPad();
    pressed = queuedPress;
    released = queuedRelease;
    queuedPress = new Set();
    queuedRelease = new Set();
    this.anyKey = this.anyKeyQueued;
    this.anyKeyQueued = false;
    repeatFire.clear();
    for (const a of ['up', 'down', 'left', 'right', 'confirm', 'cancel']) {
      if (pressed.has(a)) {
        holdTime[a] = 0;
        repeatFire.add(a);
      } else if (this.held(a)) {
        const before = holdTime[a] ?? 0;
        const after = before + dt;
        holdTime[a] = after;
        if (after >= REPEAT_FIRST) {
          const n0 = Math.floor((before - REPEAT_FIRST) / REPEAT_NEXT);
          const n1 = Math.floor((after - REPEAT_FIRST) / REPEAT_NEXT);
          if (before < REPEAT_FIRST || n1 > n0) repeatFire.add(a);
        }
      } else {
        holdTime[a] = 0;
      }
    }
  },

  held(a) {
    return this.heldByKeys(a) || padDown.has(a) || touchDown.has(a);
  },
  pressed(a) {
    return pressed.has(a);
  },
  released(a) {
    return released.has(a);
  },
  // Pressed, or held long enough to auto-repeat (menus).
  repeat(a) {
    return repeatFire.has(a);
  },
  // Stop this update's presses from reaching anything else.
  consume(a) {
    if (a) pressed.delete(a);
    else pressed.clear();
  },

  // Movement direction from held keys: { x, y } with components -1, 0 or 1.
  dir() {
    return {
      x: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
      y: (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0),
    };
  },

  // Label for a prompt on the device last used.
  label(action) {
    return (LABELS[this.device] ?? LABELS.keyboard)[action] ?? action;
  },
};
