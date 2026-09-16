// ?debug=tiles - a test map with every tricky tile combination.
// ?debug=map&map=dunmere - any real map. Arrows pan. &cam=x,y starts at tile x,y.
// &solid=1 shows collision.
import { R, sheets, makeCanvas } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { input } from '../engine/input.js';
import { text } from '../engine/font.js';
import { art } from '../engine/sheets.js';
import { G } from '../game.js';
import { buildMap, renderGround, TILE } from '../world/map.js';
import { MAPS } from '../world/maps/index.js';
import { CHEST, TERMINAL, PAD } from '../data/tiles.js';

const TEST = {
  id: 'test',
  ground: [
    '.......................................................',
    '..PPPPPPPP.....PPPP.....TTTTTTT.....GGGGGG.............',
    '..PPPPPPPP.....PPPP.....TTTTTTT.....GGGGGG.............',
    '..PPPPPPPP.....PPPPPPPP.TTTTTTT.....GGGGGG.............',
    '..PPPPPPPP.....PPPPPPPP.TTTTTTT.....GGGGGG.............',
    '..PPPP.........PPPPPPPP.TTTTTTT.....GGGGGG.............',
    '..PPPP.........PPPPPPPP.............GGGGGG.............',
    '..PPPP.................................................',
    '.......................................................',
    '...pppppp.....tttttt....,,,,,,,.....======.............',
    '...pppppp.....tttttt....,,,,,,,.....======.............',
    '...pp..pp.....tt..tt....,,,..,,.....======.............',
    '...pp..pp.....tttttt....,,,,,,,.....======.............',
    '...pppppp.....tttttt....,,,,,,,........................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
    '.......................................................',
  ],
  props: [],
  objects: [
    { type: 'building', x: 32, y: 14, w: 5, roof: 2, wall: 2, door: { dx: 2, kind: 'red', to: 'x', spawn: 'y' } },
    { type: 'gate', x: 24, y: 16 },
    { type: 'cave', x: 28, y: 5, w: 1, to: 'x', spawn: 'y' },
  ],
};

export class TilesScene {
  constructor(def = TEST) {
    this.opaque = true;
    this.def = def;
    this.map = buildMap(def);
    this.canvas = renderGround(this.map, sheets.tiles, makeCanvas);
    const cam = (G.params.get('cam') ?? '0,0').split(',').map(Number);
    this.cx = cam[0] * TILE;
    this.cy = cam[1] * TILE;
  }

  static forParam() {
    const id = G.params.get('map');
    return new TilesScene(id && MAPS[id] ? MAPS[id] : TEST);
  }

  update(dt) {
    const d = input.dir();
    this.cx += d.x * 200 * dt;
    this.cy += d.y * 200 * dt;
  }

  render() {
    R.fill('#000');
    const ox = Math.round(this.cx);
    const oy = Math.round(this.cy);
    R.img(this.canvas, ox, oy, VW, VH, 0, 0);
    for (const s of this.map.sway) R.tile(s.tile, s.x - ox, s.y - oy);
    for (const o of this.def.objects ?? []) {
      if (o.type === 'deco' && art[o.art]) R.pic(art[o.art], o.x * 16 - ox, o.y * 16 - oy);
      if (o.type === 'chest') R.tile(CHEST[o.color ?? 'orange'][0], o.x * 16 - ox, o.y * 16 - oy);
      if (o.type === 'terminal') R.tile(TERMINAL, o.x * 16 - ox, o.y * 16 - oy);
      if (o.type === 'gate') R.tile(124, (o.x + 1) * 16 - ox, (o.y + 1) * 16 - oy);
      if (o.type === 'pad') {
        PAD.forEach((row, ry) => row.forEach((t, rx) => R.tile(t, (o.x + rx) * 16 - ox, (o.y + ry) * 16 - oy)));
        const g = art[o.glyph];
        if (g) R.pic(g, (o.x + 1) * 16 - g.width / 2 - ox, (o.y + 1) * 16 - g.height / 2 - oy);
      }
      if (o.type === 'blocker') {
        if (o.tiles) o.tiles.forEach((row, ry) => row.forEach((t, rx) => R.tile(t, (o.x + rx) * 16 - ox, (o.y + ry) * 16 - oy)));
        else for (let rx = 0; rx < (o.w ?? 1); rx++) R.tile(o.tile, (o.x + rx) * 16 - ox, o.y * 16 - oy);
        if (o.art && art[o.art]) R.pic(art[o.art], (o.x + (o.w ?? 1) / 2) * 16 - art[o.art].width / 2 - ox, o.y * 16 + 4 - oy);
      }
    }
    const sprites = [...this.map.sprites].sort((a, b) => a.sortY - b.sortY);
    for (const s of sprites) {
      s.tiles.forEach((row, ry) => row.forEach((t, rx) => R.tile(t, s.x + rx * 16 - ox, s.y + ry * 16 - oy)));
    }
    if (G.params.has('solid')) {
      for (let y = 0; y < this.map.h; y++) {
        for (let x = 0; x < this.map.w; x++) {
          if (this.map.solid[y * this.map.w + x]) R.rect(x * 16 - ox, y * 16 - oy, 16, 16, '#ff0000', 0.25);
        }
      }
      for (const r of this.map.rects) R.rect(r.x - ox, r.y - oy, r.w, r.h, '#0000ff', 0.4);
    }
    if (this.map.errors.length) text(this.map.errors[0], 4, 4, { color: 'red' });
  }
}
