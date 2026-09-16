// Small pixel props the pack doesn't have, drawn in its palette and style: ink outline,
// flat colour, one highlight (DESIGN.md "Custom props"). '.' is transparent.
import { C } from '../engine/palette.js';

const KEY = {
  '#': C.ink, k: C.dusk, g: C.steel, G: C.mist, w: C.white, S: C.cream, s: C.sand, d: C.dirt,
  c: C.clay, r: C.rust, R: C.red, b: C.brick, o: C.salmon, y: C.gold, a: C.amber, u: C.butter,
  p: C.purple, l: C.lilac, v: C.violet, t: C.teal, m: C.mint, e: C.sea, B: C.blue, n: C.navy, P: C.plum,
};

const SRC = {
  bed: [
    '.##############.',
    '#dddddddddddddd#',
    '#dccccccccccccd#',
    '#d############d#',
    '#d#wwwwwwwwww#d#',
    '#d#wGGGGGGGGw#d#',
    '#d#wwwwwwwwww#d#',
    '#d############d#',
    '#d#RRRRRRRRRR#d#',
    '#d#RooooooRRR#d#',
    '#d#RRRRRRRRRR#d#',
    '#d#RRRRRRRRRR#d#',
    '#d#RRbRRRRbRR#d#',
    '#d#RRRRRRRRRR#d#',
    '#d#bbbbbbbbbb#d#',
    '#d############d#',
    '#dddddddddddddd#',
    '#cccccccccccccc#',
    '.##############.',
  ],
  table: [
    '.##############.',
    '#ssssssssssssss#',
    '#dddddddddddddd#',
    '#dddddddddddddd#',
    '#dddddddddddddd#',
    '#dddddddddddddd#',
    '#dddddddddddddd#',
    '#cccccccccccccc#',
    '.##############.',
    '.#r#........#r#.',
    '.#r#........#r#.',
    '.###........###.',
  ],
  satchel: [
    '...######...',
    '..##....##..',
    '..#......#..',
    '############',
    '#dddddddddd#',
    '#dccccccccd#',
    '#dcddyyddcd#',
    '#dcddyyddcd#',
    '#dddddddddd#',
    '############',
  ],
  tumbleweed: [
    '....####....',
    '..##dccd##..',
    '.#dc#dd#cd#.',
    '.#c#dccd#c#.',
    '#dcdd##ddcd#',
    '#c#dc##cd#c#',
    '#d#cd##dc#d#',
    '#dcdd##ddcd#',
    '.#c#dccd#c#.',
    '.#dc#dd#cd#.',
    '..##dccd##..',
    '....####....',
  ],
  butterfly0: [
    '.l...l.',
    'lll#lll',
    '.ll#ll.',
    '..l#l..',
  ],
  butterfly1: [
    '..l.l..',
    '..l#l..',
    '...#...',
    '...#...',
  ],
  envelope: [
    '##########',
    '#SwwwwwwS#',
    '#wSwwwwSw#',
    '#wwSwwSww#',
    '#wwwRRwww#',
    '#wwwwwwww#',
    '##########',
  ],
  padlock: [
    '..###..',
    '.#g.g#.',
    '.#g.g#.',
    '#######',
    '#yyyyy#',
    '#yy#yy#',
    '#yaaay#',
    '#######',
  ],
  sunrune: [
    '.....#.....',
    '....#u#....',
    '...#uuy#...',
    '..#uuyyy#..',
    '.#uuy#yyy#.',
    '#uuy###yya#',
    '#uyy###yaa#',
    '.#yy#yyaa#.',
    '..#yyyaa#..',
    '...#yaa#...',
    '....#a#....',
    '.....#.....',
  ],
  shard: [
    '...#...',
    '..#u#..',
    '..#uy#.',
    '.#uyy#.',
    '.#uyya#',
    '#uyyaa#',
    '#yyaa#.',
    '.#aa#..',
    '..##...',
  ],
  glyphSun: [
    '....y....',
    '.y.....y.',
    '...yyy...',
    '..yyyyy..',
    'y.yyyyy.y',
    '..yyyyy..',
    '...yyy...',
    '.y.....y.',
    '....y....',
  ],
  glyphRise: [
    '....y....',
    '.y.....y.',
    '...yyy...',
    '..yyyyy..',
    'y.yyyyy.y',
    '.........',
    'yyyyyyyyy',
    '.........',
    '..yyyyy..',
  ],
  glyphMoon: [
    '...yyyy..',
    '..yy.....',
    '.yy......',
    '.yy......',
    '.yy......',
    '.yy......',
    '.yy......',
    '..yy.....',
    '...yyyy..',
  ],
  coin: [
    '.###.',
    '#uyy#',
    '#yya#',
    '#yaa#',
    '.###.',
  ],
};

function rug(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edgeX = x === 0 || x === w - 1;
      const edgeY = y === 0 || y === h - 1;
      if (edgeX && edgeY) row += '.';
      else if (edgeX || edgeY) row += '#';
      else if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3) row += 't';
      else if (x === 3 || y === 3 || x === w - 4 || y === h - 4) row += 'e';
      else {
        const dx = Math.abs(((x - 4) % 8) - 3.5);
        const dy = Math.abs(y - h / 2 + 0.5);
        const d = dx + dy;
        row += d <= 1.5 ? 'R' : d <= 3 ? 'o' : 'S';
      }
    }
    rows.push(row);
  }
  return rows;
}
SRC.rug = rug(32, 16);

// A bed seen from above, headboard on the left, 32×20. The blanket is also its own
// picture so it can be drawn over someone lying in the bed.
function bed(blanketOnly) {
  const w = 32;
  const h = 20;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edgeX = x === 0 || x === w - 1;
      const edgeY = y === 0 || y === h - 1;
      let c;
      if (edgeX && edgeY) c = '.';
      else if (edgeX || edgeY) c = '#';
      else if (x <= 3) c = x === 3 ? 'c' : 'd';
      else if (x === 4) c = '#';
      else if (x >= 13) {
        if (x === 13) c = '#';
        else if (x === w - 2) c = 'c';
        else if (y <= 2) c = 'o';
        else if (y >= h - 3) c = 'b';
        else c = (x + y) % 7 === 0 ? 'o' : 'R';
      } else if (x >= 6 && x <= 11 && y >= 4 && y <= 15) {
        c = x === 6 || x === 11 || y === 4 || y === 15 ? 'G' : 'w';
      } else c = 'w';
      if (blanketOnly && (x < 13 || edgeY || x === w - 1)) c = edgeY && x >= 13 && !edgeX ? '#' : x === w - 1 && !edgeY ? '#' : '.';
      row += c;
    }
    rows.push(row);
  }
  return rows;
}
SRC.bed = bed(false);
SRC.blanket = bed(true);

export function paint(rows, makeCanvas, key = KEY) {
  const c = makeCanvas(rows[0].length, rows.length);
  const x = c.getContext('2d');
  rows.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) {
      const col = key[row[px]];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(px, py, 1, 1);
    }
  });
  return c;
}

export const ART_NAMES = Object.keys(SRC);

export function buildArt(makeCanvas) {
  const out = {};
  for (const [name, rows] of Object.entries(SRC)) out[name] = paint(rows, makeCanvas);
  // Butterfly colour variants.
  for (const [suffix, col] of [['Salmon', C.salmon], ['Mint', C.mint], ['Butter', C.butter]]) {
    const k = { ...KEY, l: col };
    out[`butterfly0${suffix}`] = paint(SRC.butterfly0, makeCanvas, k);
    out[`butterfly1${suffix}`] = paint(SRC.butterfly1, makeCanvas, k);
  }
  return out;
}

export { SRC as ART_SRC };
