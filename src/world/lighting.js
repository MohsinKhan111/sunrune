// Lighting (F7): a sheet of darkness with the lights cut out of it, drawn over the world
// and under the UI. Only a map that asks for it (def.light) gets one; the night and
// sunset moods are flat tints the story sets, not light buffers.
import { makeCanvas, R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { D } from '../engine/palette.js';
import { Pad } from './actors.js';

const MOODS = {
  cave: { color: D.cave, alpha: 0.92 },
};

export class Lighting {
  constructor() {
    this.canvas = makeCanvas(VW, VH);
    this.ctx = this.canvas.getContext('2d');
  }

  render(world, ox, oy) {
    const mood = MOODS[world.def?.light];
    if (!mood) return;
    const x = this.ctx;
    const t = world.time;

    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, VW, VH);
    x.globalAlpha = mood.alpha;
    x.fillStyle = mood.color;
    x.fillRect(0, 0, VW, VH);
    x.globalAlpha = 1;

    // Everything from here cuts holes in the darkness rather than painting on it.
    x.globalCompositeOperation = 'destination-out';

    // Pip's lantern, breathing rather than strobing: two slow waves, never more than a
    // few per cent, so it reads as a flame and not a fault.
    const flicker = 1 + Math.sin(t * 7) * 0.03 + Math.sin(t * 3.3) * 0.02;
    this.cut(world.player.x - ox, world.player.y - oy - 8, 56 * flicker);

    // The rune pads, once they are lit.
    for (const o of world.objects) {
      if (o instanceof Pad && o.lit) this.cut(o.x + 16 - ox, o.y + 16 - oy, 24);
    }

    // The teal growth on the cave floor gives off a little light of its own.
    for (const s of world.built.sway) this.cut(s.x + 8 - ox, s.y + 8 - oy, 20);

    x.globalCompositeOperation = 'source-over';

    // Drawn with smoothing on, so the gradients stay soft instead of banding into
    // squares - the one place in the game that isn't nearest-neighbour.
    const g = R.ctx;
    const was = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = true;
    R.pic(this.canvas, 0, 0);
    g.imageSmoothingEnabled = was;
  }

  cut(cx, cy, radius) {
    if (cx < -radius || cx > VW + radius || cy < -radius || cy > VH + radius) return;
    const x = this.ctx;
    const grad = x.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad;
    x.beginPath();
    x.arc(cx, cy, radius, 0, Math.PI * 2);
    x.fill();
  }
}
