// Loading bar and load-error screen (F1).
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { D } from '../engine/palette.js';
import { bigText, text } from '../engine/font.js';

export class LoadingScene {
  constructor() {
    this.opaque = true;
    this.blocksUpdate = true;
    this.progress = 0;
    this.shown = 0;
    this.error = null;
  }

  update(dt) {
    this.shown += (this.progress - this.shown) * Math.min(1, dt * 12);
  }

  render() {
    R.fill(D.letterbox);
    if (this.error) {
      text(`Couldn't load ${this.error}.`, VW / 2, VH / 2 - 10, { align: 'center', color: 'gold' });
      text('Make sure you started the game with Play.bat.', VW / 2, VH / 2 + 4, { align: 'center' });
      return;
    }
    const x = Math.round(VW / 2 - 32);
    const y = Math.round(VH / 2 - 8);
    for (let i = 0; i < 4; i++) R.ui(121 + i, x + i * 16, y);
    const w = Math.round(64 * this.shown);
    if (w > 0) {
      const ctx = R.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(R.dx(x), R.dy(y), R.dx(x + w) - R.dx(x), R.dy(y + 16) - R.dy(y));
      ctx.clip();
      for (let i = 0; i < 4; i++) R.ui(139 + i, x + i * 16, y);
      ctx.restore();
    }
    bigText('LOADING', VW / 2, y + 20, { align: 'center', style: 2 });
  }
}
