// Turns a map definition (ASCII terrain, ASCII props, objects) into tile layers, a
// collision grid, solid boxes and tall sprites. buildMap is pure so tests can use it;
// renderGround needs a canvas.
import {
  SAND, SAND_SPECKS, SAND_BLOBS, SAND_PURPLE, SAND_TEAL, VOID,
  PLATEAU, CLIFF, PATCH, BUILDING, DOORS, GATE, CAVE, FENCE, PROPS, FENCE_CHARS, SIGN,
} from '../data/tiles.js';

export const TILE = 16;

// Terrain characters. Plateau and patch letters index PLATEAU / PATCH directly.
const FLOOR = { m: 119, f: 173 };
const SOLID_TERRAIN = new Set(['P', 'T', 'G', '#', 'W', 'x']);

function hash(x, y, salt = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 362437)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildMap(def) {
  const rows = def.ground;
  const h = rows.length;
  const w = rows[0].length;
  const errors = [];
  rows.forEach((r, y) => {
    if (r.length !== w) errors.push(`ground row ${y} is ${r.length} wide, expected ${w}`);
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : rows[y][x] ?? null);
  const idx = (x, y) => y * w + x;

  const ground = new Int16Array(w * h).fill(SAND);
  const over = new Int16Array(w * h).fill(-1);
  const solid = new Uint8Array(w * h);
  const rects = [];
  const sprites = [];
  const sway = [];
  const doors = [];
  const caves = [];
  const gates = [];
  const signs = [];
  const faceRows = def.faceRows ?? 2;

  // Plateau roles, column by column: the bottom rows of each run are the face.
  const role = new Array(w * h).fill(null);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const ch = at(x, y);
      if (!PLATEAU[ch]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 + 1 < h && at(x, y1 + 1) === ch) y1++;
      const len = y1 - y + 1;
      const faces = y1 === h - 1 ? 0 : Math.min(faceRows, len - 1);
      if (y1 !== h - 1 && len - 1 < faceRows) errors.push(`plateau at column ${x} rows ${y}-${y1} is too short for its face`);
      for (let yy = y; yy <= y1; yy++) {
        const k = yy - (y1 - faces + 1);
        role[idx(x, yy)] = k < 0 ? 'top' : k === 0 ? 'lip' : k === 1 ? 'cliff1' : 'cliff2';
      }
      y = y1 + 1;
    }
  }

  const isTop = (x, y, ch) => {
    const c = at(x, y);
    if (c === null) return true;
    return c === ch && role[idx(x, y)] === 'top';
  };
  const inPlateau = (x, y, ch) => {
    const c = at(x, y);
    return c === null || c === ch;
  };
  const same = (x, y, ch) => {
    const c = at(x, y);
    return c === null || c === ch;
  };

  const plateauTile = (x, y, ch) => {
    const s = PLATEAU[ch];
    const r = role[idx(x, y)];
    if (r === 'top') {
      const N = isTop(x, y - 1, ch);
      const E = isTop(x + 1, y, ch);
      const W = isTop(x - 1, y, ch);
      const NE = isTop(x + 1, y - 1, ch);
      const NW = isTop(x - 1, y - 1, ch);
      if (!N && !W) return s.tl;
      if (!N && !E) return s.tr;
      if (!N) return s.t;
      if (!W) return NW ? s.lUp : s.l;
      if (!E) return NE ? s.rUp : s.r;
      if (!NE) return s.inNE;
      if (!NW) return s.inNW;
      return s.c;
    }
    const W = inPlateau(x - 1, y, ch);
    const E = inPlateau(x + 1, y, ch);
    const set = r === 'lip' ? { l: s.lipL, c: s.lip, r: s.lipR } : CLIFF[r === 'cliff1' ? 0 : 1];
    if (!W && E) return set.l;
    if (!E && W) return set.r;
    return set.c;
  };

  const patchTile = (x, y, ch) => {
    const s = PATCH[ch];
    const N = same(x, y - 1, ch);
    const S = same(x, y + 1, ch);
    const E = same(x + 1, y, ch);
    const W = same(x - 1, y, ch);
    if (!N && !W) return s.tl;
    if (!N && !E) return s.tr;
    if (!S && !W) return s.bl;
    if (!S && !E) return s.br;
    if (!N) return s.t;
    if (!S) return s.b;
    if (!W) return s.l;
    if (!E) return s.r;
    if (s.inSE !== undefined) {
      if (!same(x + 1, y + 1, ch)) return s.inSE;
      if (!same(x - 1, y + 1, ch)) return s.inSW;
      if (!same(x + 1, y - 1, ch)) return s.inNE;
      if (!same(x - 1, y - 1, ch)) return s.inNW;
    }
    if (s.alt !== undefined && hash(x, y, 7) < 0.06) return s.alt;
    return s.c;
  };

  const near = (x, y, ch) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === ch) return true;
    return false;
  };

  const sandTile = (x, y) => {
    const r = hash(x, y, 1);
    if (near(x, y, 'p') && r < 0.35) return SAND_PURPLE;
    if (near(x, y, 't') && r < 0.35) return SAND_TEAL;
    if (r < 0.1) return SAND_SPECKS;
    if (r < 0.112) return SAND_BLOBS;
    return SAND;
  };

  const wallTile = (x, y) => {
    const up = at(x, y - 1) === 'W';
    const down = at(x, y + 1) === 'W';
    const W = at(x - 1, y) === 'W';
    const E = at(x + 1, y) === 'W';
    const B = BUILDING;
    const pick = (l, c, r) => (!W ? l : !E ? r : c);
    if (!up) return pick(B.wallTL, B.wallT, B.wallTR);
    if (!down) return pick(B.baseL, B.baseC, B.baseR);
    return pick(B.wallL, B.wallC, B.wallR);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      const i = idx(x, y);
      if (PLATEAU[ch]) ground[i] = plateauTile(x, y, ch);
      else if (PATCH[ch]) ground[i] = patchTile(x, y, ch);
      else if (ch === 'f') ground[i] = hash(x, y, 5) < 0.14 ? 55 : FLOOR.f;
      else if (FLOOR[ch] !== undefined) ground[i] = FLOOR[ch];
      else if (ch === '#') ground[i] = VOID;
      else if (ch === 'W') ground[i] = wallTile(x, y);
      else if (ch === '.' || ch === 'x') ground[i] = sandTile(x, y);
      else errors.push(`unknown ground '${ch}' at ${x},${y}`);
      if (SOLID_TERRAIN.has(ch)) solid[i] = 1;
    }
  }

  // Props layer.
  const props = def.props ?? [];
  props.forEach((r, y) => {
    if (r.length !== w) errors.push(`props row ${y} is ${r.length} wide, expected ${w}`);
  });
  const pat = (x, y) => (x < 0 || y < 0 || y >= props.length || x >= w ? ' ' : props[y][x] ?? ' ');
  for (let y = 0; y < props.length; y++) {
    for (let x = 0; x < w; x++) {
      const ch = pat(x, y);
      if (ch === ' ' || ch === '.') continue;
      const fc = FENCE_CHARS[ch];
      if (fc) {
        const f = FENCE[fc.set];
        let t;
        if (fc.dir === 'vl') t = f.sideL;
        else if (fc.dir === 'vr') t = f.sideR;
        else {
          const isH = (c) => FENCE_CHARS[c]?.set === fc.set && FENCE_CHARS[c].dir === 'h';
          const isV = (c) => FENCE_CHARS[c]?.set === fc.set && FENCE_CHARS[c].dir !== 'h';
          const left = !isH(pat(x - 1, y));
          const right = !isH(pat(x + 1, y));
          const below = isV(pat(x, y + 1));
          const above = isV(pat(x, y - 1));
          if (left) t = below ? f.tl : above ? f.bl : f.left;
          else if (right) t = below ? f.tr : above ? f.br : f.right;
          else t = x % 3 === 0 ? f.post : f.mid;
        }
        over[idx(x, y)] = t;
        solid[idx(x, y)] = 1;
        continue;
      }
      const p = PROPS[ch];
      if (!p) {
        errors.push(`unknown prop '${ch}' at ${x},${y}`);
        continue;
      }
      const tw = p.tiles[0].length;
      const th = p.tiles.length;
      const px = x * TILE;
      const py = (y - th + 1) * TILE;
      if (p.box) rects.push({ x: px + p.box[0], y: y * TILE + p.box[1], w: p.box[2], h: p.box[3], prop: ch });
      if (p.sway) sway.push({ tile: p.tiles[0][0], x: px, y: py, phase: hash(x, y, 3) * Math.PI * 2 });
      else if (p.tall) sprites.push({ tiles: p.tiles, x: px, y: py, sortY: (y + 1) * TILE - 1 });
      else {
        for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) over[idx(x + tx, y - th + 1 + ty)] = p.tiles[ty][tx];
      }
    }
  }

  // Objects that are part of the ground picture.
  for (const o of def.objects ?? []) {
    if (o.type === 'building') {
      const B = BUILDING;
      const total = o.roof + o.wall;
      for (let ry = 0; ry < total; ry++) {
        for (let rx = 0; rx < o.w; rx++) {
          const pick = (l, c, r) => (rx === 0 ? l : rx === o.w - 1 ? r : c);
          let t;
          if (ry === 0) t = pick(B.roofTL, B.roofT, B.roofTR);
          else if (ry < o.roof) t = pick(B.roofL, B.roofC, B.roofR);
          else if (ry === o.roof) t = pick(B.wallTL, B.wallT, B.wallTR);
          else if (ry === total - 1) t = pick(B.baseL, B.baseC, B.baseR);
          else t = pick(B.wallL, B.wallC, B.wallR);
          const gx = o.x + rx;
          const gy = o.y + ry;
          if (at(gx, gy) === null) {
            errors.push(`building at ${o.x},${o.y} runs off the map`);
            continue;
          }
          over[idx(gx, gy)] = t;
          solid[idx(gx, gy)] = 1;
        }
      }
      for (const d of [].concat(o.door ?? [], o.decor ?? [])) {
        const shape = DOORS[d.kind];
        const dh = shape.length;
        const dw = shape[0].length;
        const top = o.y + total - dh;
        for (let ry = 0; ry < dh; ry++) for (let rx = 0; rx < dw; rx++) over[idx(o.x + d.dx + rx, top + ry)] = shape[ry][rx];
        const dy = o.y + total - 1;
        if (d.to) for (let rx = 0; rx < dw; rx++) solid[idx(o.x + d.dx + rx, dy)] = 0;
        if (d.to || d.text) doors.push({ x: o.x + d.dx, y: dy, w: dw, to: d.to ?? null, spawn: d.spawn ?? null, text: d.text ?? null });
      }
    } else if (o.type === 'gate') {
      for (let ry = 0; ry < 3; ry++) {
        for (let rx = 0; rx < 3; rx++) {
          const i = idx(o.x + rx, o.y + ry);
          if (!(rx === 1 && ry === 1)) over[i] = GATE[ry][rx];
          solid[i] = 1;
        }
      }
      gates.push({ x: o.x, y: o.y, id: o.id ?? 'gate' });
    } else if (o.type === 'cave') {
      const shape = o.w === 2 ? CAVE.two : CAVE.one;
      shape.forEach((t, rx) => {
        over[idx(o.x + rx, o.y)] = t;
        solid[idx(o.x + rx, o.y)] = 0;
      });
      caves.push({ x: o.x, y: o.y, w: shape.length, to: o.to, spawn: o.spawn });
    } else if (o.type === 'sign') {
      over[idx(o.x, o.y)] = SIGN[o.style ?? 'green'];
      rects.push({ x: o.x * TILE + 3, y: o.y * TILE + 8, w: 10, h: 7, prop: 'sign' });
      signs.push(o);
    } else if (o.type === 'tiles') {
      o.tiles.forEach((row, ry) =>
        row.forEach((t, rx) => {
          if (t < 0) return;
          over[idx(o.x + rx, o.y + ry)] = t;
          if (o.solid) solid[idx(o.x + rx, o.y + ry)] = 1;
        }),
      );
    }
  }

  return { id: def.id, w, h, ground, over, solid, rects, sprites, sway, doors, caves, gates, signs, errors, def };
}

// Paints the ground and static objects into one canvas at 1×.
export function renderGround(built, tilesImage, makeCanvas) {
  const c = makeCanvas(built.w * TILE, built.h * TILE);
  const x = c.getContext('2d');
  const draw = (t, cx, cy) => {
    x.drawImage(tilesImage, (t % 18) * TILE, Math.floor(t / 18) * TILE, TILE, TILE, cx * TILE, cy * TILE, TILE, TILE);
  };
  for (let cy = 0; cy < built.h; cy++) {
    for (let cx = 0; cx < built.w; cx++) {
      const i = cy * built.w + cx;
      draw(SAND, cx, cy);
      draw(built.ground[i], cx, cy);
      if (built.over[i] >= 0) draw(built.over[i], cx, cy);
    }
  }
  return c;
}

// Is the pixel (px, py) blocked by the tile grid?
export function tileSolidAt(built, px, py) {
  const cx = Math.floor(px / TILE);
  const cy = Math.floor(py / TILE);
  if (cx < 0 || cy < 0 || cx >= built.w || cy >= built.h) return true;
  return built.solid[cy * built.w + cx] === 1;
}
