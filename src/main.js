// Boot: canvas, input, the fixed-step loop, asset loading, then the first scene.
import { screen } from './engine/screen.js';
import { input } from './engine/input.js';
import { touch } from './ui/touch.js';
import { R, sheets } from './engine/gfx.js';
import { assets, loadImage, loadAll } from './engine/assets.js';
import { initFont } from './engine/font.js';
import { G } from './game.js';
import { LoadingScene } from './ui/loading.js';
import { TitleScene } from './ui/title.js';
import { buildSheets } from './engine/sheets.js';
import { music } from './engine/music.js';
import { ambient } from './engine/ambient.js';
import { loadSettings } from './engine/settings.js';
import { newGame } from './story/state.js';
import { Overworld } from './world/overworld.js';
import { MAPS } from './world/maps/index.js';
import { ENEMIES } from './data/enemies.js';
import { openShop } from './ui/shop.js';
import { hasSave, loadGame, SAVE_OLD } from './engine/save.js';
import { openSettings } from './ui/settings.js';
import { credits } from './ui/ending.js';
import { currentDialogue, say, ask } from './story/dialogue.js';
import { runScript } from './story/script.js';
import * as story from './story/chapter1.js';
import { audio } from './engine/audio.js';

const params = new URLSearchParams(location.search);
G.params = params;
G.debug = params.has('debug') || params.has('test');
G.settings = loadSettings();

screen.init(document.getElementById('game'), document.getElementById('stage'));
input.init();
// The touch pad takes its own room in the page grid, so it goes up before the first
// frame: the picture is then sized for the space it actually has (F40).
touch.init(document.getElementById('shell'));

// The pointer hides after two seconds of stillness and comes back the moment it moves.
// index.html carries the rule; this decides when it applies.
let cursorTimer = 0;
function wakeCursor() {
  document.body.classList.remove('hide-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
}
window.addEventListener('pointermove', wakeCursor);
wakeCursor();

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

// What a frame costs (Step 50). Two clock reads a frame is nothing next to the work
// they measure, so this stays on in the real game rather than hiding behind a flag:
// the number a test reports is then the number the game actually runs at.
const cost = { frames: 0, update: 0, render: 0, worst: 0, since: performance.now() };

function tick() {
  input.update(STEP);
  // F toggles fullscreen (F22). The settings row reads the browser back rather than
  // storing a flag, so the key and the row can never disagree.
  if (input.pressed('fullscreen')) screen.setFullscreen(!screen.isFullscreen());
  G.update(STEP);
  if (G.state?.stats) G.state.stats.playMs += STEP * 1000;
}

function draw() {
  R.begin();
  G.render();
  R.end();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  const t0 = performance.now();
  while (acc >= STEP && n < 5) {
    tick();
    acc -= STEP;
    n++;
  }
  if (n >= 5) acc = 0;
  const t1 = performance.now();
  draw();
  const t2 = performance.now();
  cost.frames++;
  cost.update += t1 - t0;
  cost.render += t2 - t1;
  if (t2 - t0 > cost.worst) cost.worst = t2 - t0;
}

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});
requestAnimationFrame(frame);

// Analysers tapped off the mix, so a test can tell silence from sound - and can tell
// the music apart from the ambience, which share the master bus.
const analysers = new Map();
function measureLevel(node) {
  const tap = node ?? audio.master;
  if (!audio.ctx || !tap) return 0;
  try {
    let an = analysers.get(tap);
    if (!an) {
      an = audio.ctx.createAnalyser();
      an.fftSize = 2048;
      tap.connect(an);
      analysers.set(tap, an);
    }
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  } catch {
    return 0;
  }
}

const round = (n) => Math.round(n * 1000) / 1000;

if (G.debug) {
  window.__sunrune = {
    G,
    world: null,
    step(frames = 1) {
      for (let i = 0; i < frames; i++) tick();
      draw();
    },
    state: () => G.state,
    dialogue: () => currentDialogue(),
    // Jump straight to a spot, so tests don't have to walk there.
    teleport(map, tx, ty) {
      const world = window.__sunrune.world;
      if (!world) return false;
      const pos = { x: tx * 16 + 8, y: ty * 16 + 14 };
      if (map && map !== world.mapId) world.load(map, null, pos);
      else {
        world.player.x = pos.x;
        world.player.y = pos.y;
        world.camera.follow(world.player, true);
      }
      return true;
    },
    player: () => {
      const p = window.__sunrune.world?.player;
      return p ? { x: p.x, y: p.y, map: window.__sunrune.world.mapId, facing: p.facing } : null;
    },
    scenes: () => G.stack.map((s) => s.constructor.name),
    // Frame cost in milliseconds, averaged since the last reset. Pass true to start a
    // fresh window: a figure averaged over the loading screen and a map's first frame
    // says nothing about how the canyon runs once it is up.
    perf(reset = false) {
      const n = Math.max(1, cost.frames);
      const out = {
        frames: cost.frames,
        update: round(cost.update / n),
        render: round(cost.render / n),
        total: round((cost.update + cost.render) / n),
        worst: round(cost.worst),
        fps: Math.round(cost.frames / Math.max(0.001, (performance.now() - cost.since) / 1000)),
      };
      if (reset) {
        cost.frames = 0;
        cost.update = 0;
        cost.render = 0;
        cost.worst = 0;
        cost.since = performance.now();
      }
      return out;
    },
    audio: () => ({
      ctx: audio.ctx?.state ?? 'none',
      ready: audio.ready,
      buffers: Object.keys(audio.buffers).length,
      song: music.name,
      scape: ambient.name,
      // Measured off the buses, so a test can tell silence from sound.
      level: round(measureLevel()),
      musicLevel: round(measureLevel(audio.musicGain)),
      ambientLevel: round(measureLevel(audio.ambientGain)),
    }),
    // Scaling and letterbox, so a test can check them at a real window size.
    screen: () => ({
      scale: screen.scale,
      ox: screen.ox,
      oy: screen.oy,
      w: screen.canvas.width,
      h: screen.canvas.height,
      fullscreen: screen.isFullscreen(),
      cursorHidden: document.body.classList.contains('hide-cursor'),
    }),
    // The touch pad: whether it is up, which way round it laid itself out, and where its
    // controls are on screen - so a test can prove no button overlaps the picture and
    // can tap one without guessing at coordinates (F40).
    touch: () => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el || !el.getClientRects().length) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        on: touch.on,
        device: input.device,
        orientation: document.body.classList.contains('pad-landscape') ? 'landscape'
          : document.body.classList.contains('pad-portrait') ? 'portrait' : 'none',
        hintShown: !!document.querySelector('.hint')?.getClientRects().length,
        stage: box('#stage'),
        dpad: box('.dpad'),
        face: box('.face'),
        start: box('.pill[data-act="menu"]'),
        canvas: box('#game'),
      };
    },
    // What ambient life is actually alive right now. A screenshot cannot tell the
    // difference between "nothing spawned" and "spawned but too faint to see".
    ambient: () => {
      const a = window.__sunrune.world?.ambient;
      if (!a) return null;
      return {
        weeds: a.weeds.length,
        flies: a.flies.length,
        streaks: a.streaks.length,
        motes: a.motes.length,
        drips: a.drips.length,
        patches: a.patches.length,
      };
    },
    // How many particles the battle is drawing right now, so a test can tell "emitted
    // but invisible" from "never emitted at all".
    parts: () => {
      const b = G.stack.find((sc) => sc.constructor.name === 'BattleScene');
      return b?.particles?.list?.length ?? null;
    },
    // Which tiles Pip could stand on, asked of the game's own collision test so it
    // counts fences, props and standing actors - not just the tile grid. Read only:
    // blocked() changes nothing. The playthrough bot paths with this instead of being
    // fed hand-written waypoints.
    grid: () => {
      const w = window.__sunrune.world;
      if (!w) return null;
      const { built } = w;
      const walk = [];
      for (let ty = 0; ty < built.h; ty++) {
        for (let tx = 0; tx < built.w; tx++) {
          walk.push(w.blocked(w.player, tx * 16 + 8, ty * 16 + 14) ? 0 : 1);
        }
      }
      return { w: built.w, h: built.h, walk };
    },
    // True when the player has control: no cutscene, no dialogue, no transition.
    ready() {
      const w = window.__sunrune.world;
      return !!w && w.busy === 0 && !w.transitioning && G.stack.length === 1 && G.stack[0] === w;
    },
    actors() {
      const w = window.__sunrune.world;
      if (!w) return null;
      return {
        actors: w.actors.map((a) => `${a.constructor.name}:${a.id}@${Math.round(a.x)},${Math.round(a.y)}${a.mode ? `:${a.mode}` : ''}`),
        objects: w.objects.map((o) => `${o.constructor.name}:${o.id ?? '-'}`),
        interactables: w.interactables.map((i) => `${i.kind}:${i.id ?? '-'}`),
        target: w.target ? `${w.target.kind}:${w.target.id ?? '-'}` : null,
      };
    },
    battle() {
      const b = G.stack.find((s) => s.constructor.name === 'BattleScene');
      if (!b) return null;
      return {
        phase: b.phase === 'defeat' ? 'defeat' : b.menu ? 'command' : 'round',
        msg: b.msgText,
        party: b.party.map((p) => `${p.name} ${Math.ceil(p.shown)}/${p.maxHp}${p.flat ? ' FLAT' : ''}`),
        foes: b.foes.map((f) => `${f.name} ${f.hp}/${f.maxHp}${f.gone ? ' GONE' : ''}`),
        levelUp: !!b.levelUp,
        result: b.result ?? null,
      };
    },
  };
}

function domError(file) {
  document.body.innerHTML =
    `<div class="msg"><p>Couldn't load <b>${file}</b>.</p><p>Run the game with <b>npm start</b> (or Play.bat on Windows) so its files are served over http.</p></div>`;
}

async function boot() {
  let ui;
  try {
    ui = await loadImage('assets/ui.png');
  } catch {
    domError('assets/ui.png');
    return;
  }
  sheets.ui = ui;
  initFont(ui);
  const loading = G.push(new LoadingScene());
  try {
    await loadAll((p) => (loading.progress = p));
  } catch (err) {
    loading.error = err.file ?? String(err);
    console.error(err);
    return;
  }
  Object.assign(sheets, assets.img);
  buildSheets();
  audio.init();

  const which = params.get('debug');
  if (which === 'tiles' || which === 'map') {
    const { TilesScene } = await import('./debug/tiles.js');
    G.replace(TilesScene.forParam());
    return;
  }
  if (which === 'specimen') {
    const { SpecimenScene } = await import('./debug/specimen.js');
    G.replace(new SpecimenScene());
    return;
  }
  if (params.has('battle')) {
    const { BattleScene } = await import('./battle/battle.js');
    const { makeMember } = await import('./story/state.js');
    G.state = newGame();
    const lv = Number(params.get('lv') ?? 1);
    G.state.party = [makeMember('pip', lv)];
    if (params.has('party2')) G.state.party.push(makeMember('biscuit', lv));
    G.state.items = { cactus_candy: 2, fizzy_dew: 1, dust_bomb: 1 };
    const ids = params.get('battle').split(',');
    audio.music(ids.some((id) => ENEMIES[id]?.boss) ? 'boss' : 'battle');
    G.replace(new BattleScene({ enemies: ids, onEnd: () => showTitle() }));
    return;
  }
  // ?scene=finale jumps straight to the ending, for checking it without beating the boss.
  if (params.get('scene') === 'finale') {
    const { makeMember } = await import('./story/state.js');
    G.state = newGame();
    G.state.party.push(makeMember('biscuit', 4));
    G.state.party[0].lv = 4;
    G.state.stats = { playMs: 11 * 60 * 1000 + 42 * 1000, battlesWon: 9, chests: 7, secrets: 1 };
    G.state.keyItems = { sunrune: 1, satchel: 1, rune_compass: 1 };
    G.state.flags = { biscuit_joined: true, boss_done: true };
    const world = new Overworld();
    G.replace(world);
    if (window.__sunrune) window.__sunrune.world = world;
    world.load('dunmere', 'gate');
    runScript(world, (g) => story.finale(g));
    return;
  }
  // ?scene=shop opens Tilly's counter on its own, with money to spend.
  if (params.get('scene') === 'shop') {
    G.state = newGame();
    // Enough to reach the stack limit, so a test can prove the full-satchel refusal
    // and not just the one about money.
    G.state.dollars = 200;
    const world = new Overworld();
    G.replace(world);
    if (window.__sunrune) window.__sunrune.world = world;
    world.load('dunmere', 'gate');
    openShop();
    return;
  }
  if (which === 'world' || params.has('map')) {
    // Pulled in here like the other debug routes do, rather than at the top: the real
    // game path only needs newGame.
    const { makeMember } = await import('./story/state.js');
    startGame(params.get('map') ?? 'house', params.get('spawn'), (st) => {
      // ?lv= and ?party2 let a map be tested the way it is actually reached: the canyon,
      // for one, only opens once Biscuit has joined, so testing it with Pip on her own
      // is a harder game than anybody will ever play.
      const lv = Number(params.get('lv') ?? 0);
      if (lv > 0) st.party[0] = makeMember('pip', lv);
      if (params.has('party2')) {
        st.party.push(makeMember('biscuit', st.party[0].lv));
        st.flags.biscuit_joined = true;
      }
    });
    return;
  }
  showTitle();
}

G.toTitle = () => showTitle();

function showTitle() {
  audio.music('title');
  audio.ambient('title');
  G.replace(
    new TitleScene({
      hasSave: hasSave(),
      onChoose: async (what) => {
        if (what === 'new') {
          // Starting again will write over the one save slot the next time the player
          // writes home, so ask first. "Not now" goes last: Esc is then the safe answer.
          if (hasSave()) {
            const pick = await ask(null, 'Starting again will write over your letter home. Are you sure?', [
              'Yes, start again',
              'Not now',
            ]);
            if (pick !== 0) return;
          }
          // Leave the title the way the game arrives: on a fade, not a cut. The intro
          // opens on black anyway, so this hands straight over to it.
          await G.fade(1, 0.4, '#000000');
          startGame(null);
        }
        if (what === 'continue') await continueGame();
        if (what === 'settings') openSettings();
        if (what === 'credits') credits();
      },
    }),
  );
}

// Continue: read the one save slot and put Pip back where the letter was written.
async function continueGame() {
  const res = loadGame();
  if (res.error) {
    // An old version and one that won't parse get the same line, and neither deletes
    // the save - it is the player's, not ours.
    say(null, SAVE_OLD);
    return;
  }
  await G.fade(1, 0.4, '#000000');
  G.state = res.state;
  const world = new Overworld();
  G.replace(world);
  if (window.__sunrune) window.__sunrune.world = world;
  world.load(G.state.map, null, { x: G.state.x, y: G.state.y, facing: G.state.facing });
  // Up from black rather than straight on, the same way the intro hands over.
  await G.fade(0, 0.55);
  world.showBanner();
}

function startGame(mapId, spawn, setup) {
  G.state = newGame();
  // Anything the caller needs in place before the map builds - a follower, say, is made
  // from a flag at load time, so setting it afterwards would be too late.
  setup?.(G.state);
  const world = new Overworld();
  G.replace(world);
  if (window.__sunrune) window.__sunrune.world = world;
  if (mapId) {
    world.load(mapId, spawn ?? Object.keys(MAPS[mapId].spawns)[0]);
    world.showBanner();
    return;
  }
  // New Game: the opening runs before the player has control.
  world.load('dunmere', 'gate');
  runScript(world, (g) => story.intro(g));
}

boot();
