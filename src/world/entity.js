// Characters in the world. Position is the middle of the feet; the collision box is
// 10×6 at the feet. Sprites face right; flip for left (D5). Life comes from code: step
// bob and squash, breathing, blinking, turning squash, hops.
import { R } from '../engine/gfx.js';
import { charSheet, charBlink, charWhite } from '../engine/sheets.js';
import { rng } from '../engine/rng.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class Actor {
  constructor({ id, char, x = 0, y = 0, facing = 'down' }) {
    this.id = id;
    this.char = char;
    this.sheets = char ? { normal: charSheet[char], blink: charBlink[char], white: charWhite[char] } : null;
    this.invulnT = 0;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 10;
    this.h = 6;
    this.facing = facing;
    this.flip = facing === 'left';
    this.solid = true;
    this.visible = true;
    this.alpha = 1;
    this.pose = null;
    this.moving = false;
    this.running = false;
    this.stepT = 0;
    this.frame = 0;
    this.squashT = 0;
    this.turnT = 0;
    this.breath = rng() * 6.28;
    this.blinkIn = 1 + rng() * 4;
    this.blinkT = 0;
    this.hopT = -1;
    this.hopDur = 0.3;
    this.hopH = 6;
    this.emote = null;
    this.flashT = 0;
    this.sortBias = 0;
    this.onStep = null;
  }

  box(x = this.x, y = this.y) {
    return { x: x - this.w / 2, y: y - this.h, w: this.w, h: this.h };
  }

  face(dir) {
    this.facing = dir;
    if (dir === 'left' && !this.flip) this.turn(true);
    else if (dir === 'right' && this.flip) this.turn(false);
  }

  turn(flip) {
    if (this.flip === flip) return;
    this.flip = flip;
    this.turnT = 0.06;
  }

  faceToward(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) >= Math.abs(dy)) this.face(dx < 0 ? 'left' : 'right');
    else {
      this.facing = dy < 0 ? 'up' : 'down';
      if (Math.abs(dx) > 3) this.turn(dx < 0);
    }
  }

  hop(h = 6, dur = 0.3) {
    this.hopT = 0;
    this.hopDur = dur;
    this.hopH = h;
  }

  showEmote(kind, dur = 1.2) {
    this.emote = { kind, t: 0, dur };
  }

  update(dt) {
    if (this.moving) {
      const interval = this.running ? 0.09 : 0.14;
      this.stepT += dt;
      if (this.stepT >= interval) {
        this.stepT -= interval;
        this.frame ^= 1;
        this.squashT = 0.05;
        this.onStep?.(this);
      }
    } else {
      this.frame = 0;
      this.stepT = 0;
    }
    if (this.squashT > 0) this.squashT -= dt;
    if (this.turnT > 0) this.turnT -= dt;
    this.breath += dt * Math.PI;
    if (this.hopT >= 0) {
      this.hopT += dt;
      if (this.hopT >= this.hopDur) this.hopT = -1;
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.12;
      this.blinkIn = 2 + rng() * 3.5;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    if (this.emote) {
      this.emote.t += dt;
      if (this.emote.t >= this.emote.dur) this.emote = null;
    }
    if (this.flashT > 0) this.flashT -= dt;
    if (this.invulnT > 0) {
      this.invulnT -= dt;
      this.alpha = Math.floor(this.invulnT * 12) % 2 ? 0.4 : 1;
      if (this.invulnT <= 0) this.alpha = 1;
    }
  }

  hopOffset() {
    if (this.hopT < 0) return 0;
    return Math.sin((this.hopT / this.hopDur) * Math.PI) * this.hopH;
  }

  currentFrame() {
    if (this.pose === 'flat') return 3;
    if (this.pose === 'jump' || this.hopT >= 0) return 2;
    return this.moving && this.frame ? 1 : 0;
  }

  draw(ox, oy) {
    if (!this.visible) return;
    const hop = this.hopOffset();
    if (this.pose !== 'flat') R.shadow(this.x - ox, this.y - oy - 1, hop > 0 ? 14 - hop : 14, 4, 0.35 * this.alpha);
    const frame = this.currentFrame();
    let sy = 1;
    let sx = 1;
    if (this.squashT > 0) sy = 0.94;
    else if (!this.moving && !this.pose && hop === 0) sy = 1 + 0.015 * (1 + Math.sin(this.breath));
    if (this.turnT > 0) sx = 0.8 + 0.2 * (1 - this.turnT / 0.06);
    if (!this.sheets) return;
    let sheet = this.sheets.normal;
    if (this.flashT > 0) sheet = this.sheets.white;
    else if (this.blinkT > 0 && frame < 3) sheet = this.sheets.blink;
    R.sprite(sheet, frame, this.x - 12 - ox, this.y - 24 - hop - oy, {
      flip: this.flip,
      scaleX: sx,
      scaleY: sy,
      px: 12,
      py: 24,
      alpha: this.alpha,
    });
  }

  // Where speech bubbles and prompts go.
  headY() {
    return this.y - 26 - this.hopOffset();
  }
}
