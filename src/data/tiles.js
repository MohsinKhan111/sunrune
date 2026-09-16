// Tile catalog for tiles.png (index = row × 18 + column). Checked by zooming the sheet
// and printing pixel maps (PROGRESS.md notes, step 5).

export const SAND = 64;
export const SAND_SPECKS = 65;
export const SAND_BLOBS = 194;
export const SAND_PURPLE = 130;
export const SAND_TEAL = 135;
export const VOID = 140;

// Raised plateaus. Top row tiles have transparent bumps along their top edge.
// rUp/lUp: side edges whose top joins a wider row above (concave corner).
// inNE/inNW: inside corners (only the diagonal above is outside).
export const PLATEAU = {
  P: { tl: 0, t: 1, tr: 2, rUp: 3, lUp: 4, l: 18, c: 19, r: 20, inNE: 21, inNW: 22, lipL: 36, lip: 37, lipR: 38 },
  T: { tl: 5, t: 6, tr: 7, rUp: 8, lUp: 9, l: 23, c: 24, r: 25, inNE: 26, inNW: 27, lipL: 41, lip: 42, lipR: 43 },
  G: { tl: 10, t: 11, tr: 12, rUp: 13, lUp: 14, l: 28, c: 29, r: 30, inNE: 31, inNW: 32, lipL: 46, lip: 47, lipR: 48 },
};

// Dirt cliff rows under a plateau's lip. No outline at the bottom.
export const CLIFF = [
  { l: 54, c: 55, r: 56 },
  { l: 72, c: 73, r: 74 },
];

// Flat ground patches on sand. inSE = sand bite in the tile's bottom-right, etc.
export const PATCH = {
  p: { tl: 90, t: 91, tr: 92, l: 108, c: 109, r: 110, bl: 126, b: 127, br: 128, inSE: 93, inSW: 94, inNE: 111, inNW: 112, alt: 129 },
  t: { tl: 95, t: 96, tr: 97, l: 113, c: 114, r: 115, bl: 131, b: 132, br: 133, inSE: 98, inSW: 99, inNE: 116, inNW: 117, alt: 134 },
  ',': { tl: 154, t: 155, tr: 156, l: 172, c: 173, r: 174, bl: 190, b: 191, br: 192, inSE: 157, inSW: 158, inNE: 175, inNW: 176, alt: 193 },
  '=': { tl: 100, t: 101, tr: 102, l: 118, c: 119, r: 120, bl: 136, b: 137, br: 138 },
};

// Metal buildings: roof rows, then wall rows (top band, middle, base).
export const BUILDING = {
  roofTL: 15, roofT: 16, roofTR: 17,
  roofL: 33, roofC: 34, roofR: 35,
  wallTL: 51, wallT: 52, wallTR: 53,
  wallL: 69, wallC: 70, wallR: 71,
  baseL: 87, baseC: 88, baseR: 89,
};

// Doors placed on a building's wall, bottom-aligned. Rows top → bottom.
export const DOORS = {
  red: [[208]],
  open: [[209]],
  doorway: [[210]],
  double: [[211, 212], [229, 230]],
  shutter: [[150, 151], [168, 169], [186, 187]],
  arch: [[152, 153], [170, 171]],
  golden: [[188, 189], [206, 207]],
  dark: [[204, 205]],
};

// The Gate: fence enclosure with the portal (124) in the middle.
export const GATE = [[105, 106, 107], [123, 124, 125], [141, 142, 143]];
export const PORTAL = 124;
export const SMALL_PORTAL = 196;

export const CAVE = { one: [77], two: [78, 79] };

export const PAD = [[103, 104], [121, 122]];

// Fences. Horizontal runs pick end pieces automatically.
export const FENCE = {
  wood: { left: 161, mid: 142, post: 106, right: 159, tl: 105, tr: 107, bl: 141, br: 143, sideL: 123, sideR: 125 },
  chain: { left: 233, mid: 214, post: 232, right: 231, tl: 177, tr: 179, bl: 213, br: 215, sideL: 195, sideR: 197 },
};

export const CHEST = { orange: [216, 217], gold: [218, 219] };
export const TERMINAL = 224;
export const SIGN = { red: 49, green: 50 };
export const KEY_TILE = { silver: 198, red: 201 };
export const SMALL = { coin: 225, note: 226, button: 227, button2: 228 };

// Props: tiles are rows top → bottom; the bottom row sits on the prop's tile.
// box: solid area in pixels relative to the bottom-left tile's top-left [x, y, w, h].
// tall: drawn sorted with characters. sway: grass that moves.
export const PROPS = {
  T: { tiles: [[62], [80]], box: [4, 9, 8, 6], tall: true },
  Y: { tiles: [[57], [75]], box: [5, 9, 7, 6], tall: true },
  L: { tiles: [[68], [86]], box: [5, 10, 6, 5], tall: true },
  K: { tiles: [[66, 67], [84, 85]], box: [2, 4, 28, 11], tall: true },
  C: { tiles: [[63]], box: [3, 6, 10, 9] },
  c: { tiles: [[81]], box: [4, 8, 8, 7] },
  R: { tiles: [[76]], box: [1, 6, 14, 9] },
  o: { tiles: [[58]], box: null },
  '^': { tiles: [[82]], box: [4, 8, 8, 7] },
  A: { tiles: [[83]], box: [3, 5, 10, 10] },
  b: { tiles: [[202]], box: [3, 5, 10, 10] },
  B: { tiles: [[203]], box: [3, 5, 10, 10] },
  x: { tiles: [[220]], box: [1, 3, 14, 12] },
  X: { tiles: [[221]], box: [1, 3, 14, 12] },
  e: { tiles: [[222]], box: [1, 3, 14, 12] },
  l: { tiles: [[223]], box: [1, 1, 14, 14] },
  h: { tiles: [[40]], box: [0, 1, 16, 14] },
  H: { tiles: [[45]], box: [0, 1, 16, 14] },
  g: { tiles: [[39]], box: null, sway: true },
  v: { tiles: [[44]], box: null, sway: true },
};

// Fence characters in the props layer.
export const FENCE_CHARS = {
  '-': { set: 'wood', dir: 'h' },
  '|': { set: 'wood', dir: 'vl' },
  '!': { set: 'wood', dir: 'vr' },
  _: { set: 'chain', dir: 'h' },
  ':': { set: 'chain', dir: 'vl' },
  ';': { set: 'chain', dir: 'vr' },
};
