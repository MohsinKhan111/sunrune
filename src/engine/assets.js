// Loads the art and sounds from assets/. Nothing comes from the internet (RULES).
export const IMAGES = {
  tiles: 'assets/tiles.png',
  ui: 'assets/ui.png',
  chars: 'assets/chars.png',
  enemies: 'assets/enemies.png',
  weapons: 'assets/weapons.png',
};

// Only the sounds the game actually plays. Everything here is downloaded and decoded
// before the loading bar finishes, so an unused one costs a player real time for nothing
// - the pack ships 40 and the game uses 22. A unit test keeps this list and the SFX map
// in step, in both directions.
export const SOUNDS = [
  'coin-a', 'coin-b', 'coin-c',
  'error-a', 'error-c',
  'explosion-a', 'explosion-b', 'explosion-c',
  'fall-a', 'fall-b',
  'hurt-a', 'hurt-b', 'hurt-c', 'hurt-d',
  'jump-a', 'jump-b', 'jump-e',
  'lose-a',
  'move-c',
  'select-a',
  'shoot-c', 'shoot-f',
];

export const assets = { img: {}, snd: {} };

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Object.assign(new Error(`Couldn't load ${src}`), { file: src }));
    img.src = src;
  });
}

async function loadSound(name) {
  const file = `assets/sfx/${name}.ogg`;
  let res;
  try {
    res = await fetch(file);
  } catch {
    throw Object.assign(new Error(`Couldn't load ${file}`), { file });
  }
  if (!res.ok) throw Object.assign(new Error(`Couldn't load ${file}`), { file });
  return res.arrayBuffer();
}

// Loads everything; onProgress(0..1). Rejects with an error whose .file names what failed.
export async function loadAll(onProgress = () => {}) {
  const jobs = [
    ...Object.entries(IMAGES).map(([key, src]) => async () => {
      assets.img[key] = await loadImage(src);
    }),
    ...SOUNDS.map((name) => async () => {
      assets.snd[name] = await loadSound(name);
    }),
  ];
  let done = 0;
  onProgress(0);
  await Promise.all(
    jobs.map(async (job) => {
      await job();
      done++;
      onProgress(done / jobs.length);
    }),
  );
}
