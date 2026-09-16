// Drawing in game pixels. Positions may be fractional (smooth motion); every image is
// drawn with nearest-neighbour scaling so pixels stay crisp.
import { screen, VW, VH } from './screen.js';
import { C, D } from './palette.js';

export const sheets = {};
const NO = {};
let ctx = null;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

// Copy of (part of) an image with colours swapped. map: { '#rrggbb': '#rrggbb' } or a function.
export function recolor(image, map, sx = 0, sy = 0, sw = image.width, sh = image.height) {
  const c = makeCanvas(sw, sh);
  const x = c.getContext('2d');
  x.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = x.getImageData(0, 0, sw, sh);
  const px = data.data;
  const fn = typeof map === 'function' ? map : (hex) => map[hex];
  const cache = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let out = cache.get(key);
    if (out === undefined) {
      const hex = `#${key.toString(16).padStart(6, '0')}`;
      const to = fn(hex);
      out = to ? parseInt(to.slice(1), 16) : -1;
      cache.set(key, out);
    }
    if (out >= 0) {
      px[i] = (out >> 16) & 255;
      px[i + 1] = (out >> 8) & 255;
      px[i + 2] = out & 255;
    }
  }
  x.putImageData(data, 0, 0);
  return c;
}

// The pack draws a fat white halo around every character and enemy. This drops it,
// one sprite cell at a time: flood in from the cell's edge through transparent and
// white pixels and clear what it reaches, so only white outside the sprite's ink
// outline goes. White sealed inside the sprite (eye glints, Juniper's fur) stays.
export function dropHalo(image, cw, ch) {
  const c = makeCanvas(image.width, image.height);
  const x = c.getContext('2d');
  x.drawImage(image, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const stack = [];
  for (let cy = 0; cy + ch <= c.height; cy += ch) {
    for (let cx = 0; cx + cw <= c.width; cx += cw) {
      const seen = new Uint8Array(cw * ch);
      stack.length = 0;
      for (let i = 0; i < cw; i++) stack.push(i, 0, i, ch - 1);
      for (let j = 0; j < ch; j++) stack.push(0, j, cw - 1, j);
      while (stack.length) {
        const py = stack.pop();
        const pxx = stack.pop();
        if (pxx < 0 || py < 0 || pxx >= cw || py >= ch) continue;
        const seat = py * cw + pxx;
        if (seen[seat]) continue;
        const i = ((cy + py) * c.width + cx + pxx) * 4;
        const open = px[i + 3] === 0 || (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255);
        if (!open) continue;
        seen[seat] = 1;
        px[i + 3] = 0;
        stack.push(pxx + 1, py, pxx - 1, py, pxx, py + 1, pxx, py - 1);
      }
    }
  }
  x.putImageData(data, 0, 0);
  return c;
}

// Every opaque pixel becomes one colour (hit flashes, silhouettes).
export function solid(image, color) {
  const c = makeCanvas(image.width, image.height);
  const x = c.getContext('2d');
  x.drawImage(image, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const ellipseCache = new Map();
function ellipseCanvas(w, h, color) {
  const key = `${w}x${h}${color}`;
  let c = ellipseCache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    const x = c.getContext('2d');
    x.fillStyle = color;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = (px + 0.5 - w / 2) / (w / 2);
        const dy = (py + 0.5 - h / 2) / (h / 2);
        if (dx * dx + dy * dy <= 1) x.fillRect(px, py, 1, 1);
      }
    }
    ellipseCache.set(key, c);
  }
  return c;
}

export const R = {
  get ctx() {
    return ctx;
  },

  begin() {
    ctx = screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = D.letterbox;
    ctx.fillRect(0, 0, screen.canvas.width, screen.canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(screen.ox, screen.oy, Math.round(VW * screen.scale), Math.round(VH * screen.scale));
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
  },

  end() {
    ctx.restore();
  },

  // Game pixel → device pixel.
  dx(x) {
    return screen.ox + Math.round(x * screen.scale);
  },
  dy(y) {
    return screen.oy + Math.round(y * screen.scale);
  },

  alpha(a, fn) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;
    fn();
    ctx.globalAlpha = prev;
  },

  rect(x, y, w, h, color, alpha = 1) {
    const x0 = this.dx(x);
    const y0 = this.dy(y);
    const x1 = this.dx(x + w);
    const y1 = this.dy(y + h);
    if (x1 <= x0 || y1 <= y0) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = prev;
  },

  fill(color, alpha = 1) {
    this.rect(0, 0, VW, VH, color, alpha);
  },

  // o: { flip, scale, scaleX, scaleY, px, py (pivot for scaling, sprite pixels), alpha }
  img(image, sx, sy, sw, sh, x, y, o = NO) {
    const s = screen.scale;
    const kx = o.scaleX ?? o.scale ?? 1;
    const ky = o.scaleY ?? o.scale ?? 1;
    let left = x;
    let top = y;
    if (kx !== 1 || ky !== 1) {
      const px = o.px ?? 0;
      const py = o.py ?? 0;
      left = x + px * (1 - kx);
      top = y + py * (1 - ky);
    }
    const dx = screen.ox + Math.round(left * s);
    const dy = screen.oy + Math.round(top * s);
    const dw = Math.round(sw * kx * s);
    const dh = Math.round(sh * ky * s);
    if (dw <= 0 || dh <= 0) return;
    const prev = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = prev * o.alpha;
    if (o.flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.globalAlpha = prev;
  },

  // Whole image or canvas at (x, y).
  pic(image, x, y, o) {
    this.img(image, 0, 0, image.width, image.height, x, y, o);
  },

  // 16×16 tile from tiles.png (18 per row).
  tile(i, x, y, o) {
    this.img(sheets.tiles, (i % 18) * 16, Math.floor(i / 18) * 16, 16, 16, x, y, o);
  },

  // 16×16 tile from ui.png (18 per row).
  ui(i, x, y, o) {
    this.img(sheets.ui, (i % 18) * 16, Math.floor(i / 18) * 16, 16, 16, x, y, o);
  },

  // 24×24 frame from a character sheet (4 per row).
  sprite(sheet, frame, x, y, o) {
    this.img(sheet, (frame % 4) * 24, Math.floor(frame / 4) * 24, 24, 24, x, y, o);
  },

  // 24×24 weapon or crosshair from weapons.png (10 per row).
  weapon(i, x, y, o) {
    this.img(sheets.weapons, (i % 10) * 24, Math.floor(i / 10) * 24, 24, 24, x, y, o);
  },

  // The pack-style panel drawn in pack colours: white outer line, steel line, fill.
  box(x, y, w, h, fill = C.ink, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    this.rect(x + 1, y, w - 2, h, C.white, alpha);
    this.rect(x, y + 1, w, h - 2, C.white, alpha);
    this.rect(x + 1, y + 1, w - 2, h - 2, C.steel, alpha);
    this.rect(x + 2, y + 2, w - 4, h - 4, fill, alpha);
  },

  // A small flat tag: fill with a 1 px ink line and notched corners.
  tag(x, y, w, h, fill = C.red, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    this.rect(x + 1, y, w - 2, h, C.ink, alpha);
    this.rect(x, y + 1, w, h - 2, C.ink, alpha);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill, alpha);
  },

  shadow(cx, cy, w, h, alpha = 0.35) {
    this.pic(ellipseCanvas(w, h, C.ink), cx - w / 2, cy - h / 2, { alpha });
  },

  ellipse(cx, cy, w, h, color, alpha = 1) {
    this.pic(ellipseCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), color), cx - w / 2, cy - h / 2, { alpha });
  },
};
