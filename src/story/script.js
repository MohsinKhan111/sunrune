// Cutscenes and interactions as async functions (F9). Each command returns a promise the
// game loop resolves. Controls are off while a script runs, and always come back.
import { G } from '../game.js';
import { say, ask } from './dialogue.js';
import { audio } from '../engine/audio.js';
import { DIRS } from '../world/entity.js';
import { card, narrate } from '../ui/card.js';
import * as S from './state.js';

export function runScript(world, fn) {
  world.busy++;
  const api = makeApi(world);
  return (async () => {
    try {
      return await fn(api);
    } catch (err) {
      console.error('script failed', err);
      return undefined;
    } finally {
      world.busy = Math.max(0, world.busy - 1);
    }
  })();
}

export function makeApi(world) {
  const find = (who) => {
    if (!who) return null;
    if (typeof who !== 'string') return who;
    if (who === 'pip') return world.player;
    return world.actors.find((a) => a.id === who) ?? null;
  };
  const api = {
    world,
    get state() {
      return G.state;
    },
    find,
    say: (who, str, o) => say(who, str, o),
    ask: (who, str, choices, o) => ask(who, str, choices, o),
    wait: (sec) => G.wait(sec),
    walk: (who, tx, ty, o) => world.scriptWalk(find(who), tx, ty, o),
    face(who, dir) {
      const a = find(who);
      if (!a) return;
      if (DIRS[dir]) a.face(dir);
      else {
        const b = find(dir);
        if (b) a.faceToward(b.x, b.y);
      }
    },
    faceEach(a, b) {
      api.face(a, b);
      api.face(b, a);
    },
    emote(who, kind, sec = 1.1) {
      const a = find(who);
      a?.showEmote(kind, sec);
      if (kind === '!') audio.sfx('alert');
      return G.wait(sec * 0.75);
    },
    hop(who, h = 6, dur = 0.3) {
      find(who)?.hop(h, dur);
      audio.sfx('hop');
      return G.wait(dur);
    },
    pose(who, pose) {
      const a = find(who);
      if (a) a.pose = pose;
    },
    pan: (tx, ty, sec = 1) => world.camera.panTo(tx * 16 + 8, ty * 16 + 8, sec),
    follow: (who = 'pip') => world.camera.follow(find(who)),
    shake: (px, sec) => world.camera.shake(px, sec),
    fade: (to, sec = 0.4, color = '#000000') => G.fade(to, sec, color),
    bars: (on) => world.setBars(on),
    sfx: (name) => audio.sfx(name),
    music: (name) => audio.music(name),
    flag: (name) => S.flag(G.state, name),
    setFlag: (name, v = true) => S.setFlag(G.state, name, v),
    toast: (str) => world.toast(str),
    battle: (group, opts) => world.runBattle(group, opts),
    goto: (map, spawn) => world.changeMap(map, spawn),
    load: (map, spawn) => world.load(map, spawn),
    tint: (color, alpha) => world.setTint(color, alpha),
    card: (title, sub, dur) => card(title, sub, dur),
    narrate: (lines, dur) => narrate(lines, dur),
    objective(str) {
      G.state.objective = str;
      world.toast(`New objective: ${str}`);
    },
    spawn: (def) => world.spawnNpc(def),
    remove: (id) => world.removeActor(id),
  };
  return api;
}
