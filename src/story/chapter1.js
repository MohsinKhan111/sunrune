// SUNRUNE Chapter 1: Return to Sender. Who is where, what they say, and what happens.
// Step 28 fills in the full story; this is the first playable slice.
import { G } from '../game.js';
import { flag, setFlag, addItem, giveKey, takeKey, hasKey, addDollars, restoreParty, itemCount, makeMember } from './state.js';
import { ITEMS, KEY_ITEMS } from '../data/items.js';
import { R } from '../engine/gfx.js';
import { VW } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { letter, ending } from '../ui/ending.js';
import { openShop } from '../ui/shop.js';
import { saveGame, markCleared, SAVE_FAILED } from '../engine/save.js';

// The overworld asks story.openMenu when Esc is pressed, and only while the player has
// control - so the pause menu can never open over a cutscene.
export { openMenu } from '../ui/menu.js';

// Townsfolk for a map, depending on how far the story has got.
export function npcs(mapId, st) {
  const list = [];
  if (mapId === 'house') {
    list.push({ id: 'nana', x: 5, y: 4, facing: 'right', behavior: 'fixed' });
  }
  if (mapId === 'post') {
    list.push({ id: 'tilly', x: 3, y: 4, facing: 'down', behavior: 'fixed' });
  }
  if (mapId === 'dunmere' && flag(st, 'finale')) {
    // Everyone gathers at the Gate for the finale.
    return [
      { id: 'mayor', x: 20, y: 13, behavior: 'fixed', facing: 'up' },
      { id: 'tilly', x: 24, y: 13, behavior: 'fixed', facing: 'up' },
      { id: 'juniper', x: 25, y: 12, behavior: 'fixed', facing: 'left' },
      { id: 'dot', x: 19, y: 14, behavior: 'fixed', facing: 'up' },
      { id: 'dash', x: 18, y: 14, behavior: 'fixed', facing: 'up' },
      { id: 'moss', x: 26, y: 14, behavior: 'fixed', facing: 'up' },
      { id: 'lute', x: 17, y: 13, behavior: 'fixed', facing: 'right' },
      { id: 'barley', x: 23, y: 14, behavior: 'fixed', facing: 'up' },
    ];
  }
  if (mapId === 'dunmere' && !flag(st, 'intro_running')) {
    list.push({ id: 'mayor', x: 19, y: 15, behavior: 'wander', radius: 1.2 });
    list.push({ id: 'juniper', x: 25, y: 12, behavior: 'stand', facing: 'left' });
    list.push({ id: 'dot', x: 13, y: 16, behavior: 'wander', radius: 2 });
    list.push({ id: 'dash', x: 15, y: 17, behavior: 'wander', radius: 2 });
    list.push({ id: 'moss', x: 9, y: 18, behavior: 'stand', facing: 'down' });
    list.push({ id: 'lute', x: 17, y: 11, behavior: 'stand', facing: 'right' });
    if (!flag(st, 'biscuit_joined')) list.push({ id: 'biscuit', x: 33, y: 23, behavior: 'stand', facing: 'right' });
    if (!flag(st, 'biscuit_joined')) list.push({ id: 'barley', x: 41, y: 14, behavior: 'stand', facing: 'left' });
  }
  if (mapId === 'canyon') {
    list.push({ id: 'pemberton', x: 26, y: 15, behavior: 'stand', facing: 'down' });
  }
  return list;
}

// Enemies walking a map. Beaten ones stay gone (the world checks the calmed flag).
export function enemies(mapId, st) {
  const list = [];
  if (mapId === 'dunmere' && !flag(st, 'biscuit_joined')) {
    list.push({ id: 'e1', kind: 'glimmerslug', x: 35, y: 23, radius: 1, script: 'tutorial' });
  }
  if (mapId === 'canyon') {
    list.push({ id: 'e2', kind: 'glimmerslug', x: 11, y: 27, radius: 1.5, group: ['glimmerslug', 'glimmerslug'] });
    list.push({ id: 'e3', kind: 'dune_moth', x: 10, y: 14, radius: 3 });
    list.push({ id: 'e4', kind: 'dune_moth', x: 52, y: 12, radius: 1.5, group: ['dune_moth', 'dune_moth'] });
    list.push({ id: 'e5', kind: 'glimmerslug', x: 28, y: 18, radius: 3, group: ['glimmerslug', 'dune_moth'] });
    list.push({ id: 'e6', kind: 'cinder_imp', x: 30, y: 30, radius: 1, group: ['cinder_imp', 'cinder_imp'], script: 'twins', still: true });
  }
  if (mapId === 'hollow') {
    list.push({ id: 'e7', kind: 'cinder_imp', x: 8, y: 17, radius: 2, group: ['cinder_imp', 'dune_moth'] });
    list.push({ id: 'e8', kind: 'glimmerslug', x: 26, y: 19, radius: 2, group: ['glimmerslug', 'glimmerslug', 'glimmerslug'] });
  }
  return list;
}

const LINES = {
  nana: ['{hero}! The sun has been up for ages.', 'Off you go. The Post Office is just east of the plaza.'],
  tilly: ["There's my new runner!"],
  mayor: ['The Gate went quiet last night. Quiet! In Dunmere!'],
  juniper: ['Sunlight does not just vanish, little one. Something took it.'],
  dot: ["The Gate stopped singing! Dash says it's broken. I say it's shy."],
  dash: ["It's not shy, Dot. Gates can't be shy. ...Can they?"],
  moss: ['My cactus garden is full of slugs. Crystal ones. Since last night.'],
  lute: ["I came all this way for the Gate's hum. Best harmony in Amberlong. ♪"],
  biscuit: ['{hero}! Did you hear the Gate? Or... not hear it?'],
  barley: ['Nobody goes to the canyon alone. By order of me.'],
  pemberton: ['Lost. Completely lost. Have been since Tuesday.', "Take this. I've been carrying it for luck and it has not worked."],
};

// The opening: the night the Gate went quiet (F4).
export async function intro(g) {
  const st = G.state;
  setFlag(st, 'intro_running');
  g.world.load('dunmere', 'gate');
  g.world.setTint('#616bba', 0.55);
  g.bars(true);
  g.world.player.visible = false;
  await g.fade(1, 0, '#000000');
  await g.narrate([
    'In the desert of Amberlong, every town keeps a Gate.',
    'Every Gate holds a Sunrune.',
    'And as long as the runes hum...',
    '...the Dust sleeps.',
  ]);
  g.music('intro');
  await g.fade(0, 1.2);
  await g.pan(22, 11, 2.2);
  const stranger = g.spawn({ id: 'stranger', x: 22, y: 16, behavior: 'fixed', facing: 'up' });
  await g.wait(0.4);
  await g.walk(stranger, 22, 13, { speed: 26 });
  await g.wait(0.5);
  await g.say(null, 'Such a pretty little song.', { name: '???' });
  await g.emote(stranger, '!', 0.7);
  g.sfx('flash');
  await g.fade(1, 0.25, '#ffffff');
  setFlag(st, 'intro_running', false);
  // Put the Gate out directly. Rebuilding the map here would delete the Stranger.
  const gate = g.world.objects.find((o) => o.id === 'dunmere_gate');
  if (gate) gate.active = false;
  await g.fade(0, 0.6);
  g.music(null);
  await g.say(null, 'The hum stops. The portal goes dark.');
  await g.say(null, 'Sweet dreams, Dunmere.', { name: '???' });
  await g.walk(stranger, 22, 17, { speed: 34 });
  g.remove('stranger');
  await g.wait(0.4);
  await g.fade(1, 0.8);
  await g.card('CHAPTER 1', 'Return to Sender');
  g.world.setTint(null);
  g.bars(false);
  g.world.player.visible = true;
  g.world.load('house', 'bed');
  await wakeUp(g);
}

// Pip wakes up late on her first day.
async function wakeUp(g) {
  const pip = g.world.player;
  pip.pose = 'flat';
  pip.facing = 'right';
  await g.fade(0, 0.8);
  g.music('town');
  await g.wait(0.6);
  await g.say('nana', '{hero}. {hero}! The sun has been up for AGES.');
  pip.pose = null;
  g.sfx('hop');
  pip.hop(8, 0.35);
  await g.wait(0.4);
  const blanket = g.world.objects.find((o) => o.id === 'blanket');
  if (blanket) blanket.visible = false;
  await g.walk(pip, 8.5, 5, { speed: 60 });
  await g.say('nana', "Today is your first day at the Post, and you're sleeping like a cactus.");
  await g.say('nana', 'Also... did you notice? It is quiet. Too quiet.');
  await g.say('nana', 'The Gate stopped humming last night. Nobody in this town slept.');
  await g.say('nana', 'Go and see Tilly at the Post Office. And take your satchel!');
  setObjective(g.world, 'satchel');
}

export async function talk(g, id) {
  if (SCENES[id]) return SCENES[id](g);
  for (const line of LINES[id] ?? ['...']) await g.say(id, line);
  if (id === 'pemberton' && !flag(G.state, 'pemberton_gift')) {
    setFlag(G.state, 'pemberton_gift');
    if (addItem(G.state, 'dust_bomb', 1)) {
      g.sfx('item');
      await g.say(null, '{hero} got a Dust Bomb!');
    }
  }
}

// Characters with a scene rather than a line or two.
const SCENES = {
  async tilly(g) {
    const st = G.state;
    if (hasKey(st, 'rune_compass')) {
      await g.say('tilly', 'Go on then. Biscuit is out the back. Probably on fire.');
      await tillyShop(g);
      return;
    }
    await g.say('tilly', "There's my new runner! Bad timing, hon. No Gate, no mail.");
    await g.say('tilly', 'BUT. This came through last night, right before the Gate went dark.');
    await g.say('tilly', "It's addressed to you. And it says it's FROM you.");
    await g.say(null, 'Stamped across the front in red: {c:red}RETURN TO SENDER{/c}.');
    await g.say('tilly', 'Did you post yourself a present? That is adorable. Or worrying.');
    g.sfx('item');
    g.music('item');
    giveKey(st, 'rune_compass');
    await g.say(null, '{hero} got the {c:gold}Rune Compass{/c}!');
    await g.say(null, 'Its needle swings east, toward Glass Canyon.');
    await g.say(null, 'There is a note, in your own handwriting:');
    await g.say(null, '"You\'ll need this. Go to the Hollow. Take Biscuit. Don\'t be late. - P."');
    await g.say('tilly', "...I'd take Biscuit, hon.");
    await tillyShop(g);
    // The objective banner comes after the counter closes: it lives for three seconds
    // and was drawing straight over the shop's title.
    setObjective(g.world, 'biscuit');
  },
};

// Tilly keeps a little stock behind the counter (F15). "Not now" goes last on purpose:
// backing out of a question with Esc picks the last choice.
async function tillyShop(g) {
  const pick = await g.ask('tilly', 'Want to stock up while you are here?', ['Show me', 'Not now']);
  if (pick !== 0) return;
  await openShop();
  await g.say('tilly', 'Mind how you go, hon.');
}

// Post Terminals are the save points (F17): writing home stores the game and puts the
// whole party back on their feet. "Not now" goes last, so Esc backs out harmlessly.
async function writeHome(g) {
  const pick = await g.ask(null, 'Write a letter home? (This saves your game.)', ['Yes', 'Not now']);
  if (pick !== 0) return;
  restoreParty(G.state);
  if (!saveGame(G.state, g.world)) {
    await g.say(null, SAVE_FAILED);
    return;
  }
  g.sfx('item');
  await g.say(null, 'Nana will keep this letter safe.');
}

const TEXTS = {
  sign_gate: 'THE GATE OF DUNMERE. Please do not lick the portal.',
  sign_post: 'DUNMERE POST OFFICE. We deliver! (Usually.)',
  sign_town: 'DUNMERE — Oasis Town. Population: cozy.',
  sign_canyon: '→ GLASS CANYON',
  mayor_door: "It's locked. A note says: \"At the plaza. Panicking. — The Mayor\"",
  workshop_door: "Biscuit's workshop. It smells like engine oil and toast.",
  sign_canyon_east: '← DUNMERE · GLASS CANYON →',
  sign_hollow: 'THE HOLLOW. Sealed by the Sun. Bring three shards.',
  sign_pads: 'Carved into the rock: "First the sun wakes. Then it burns. Then it rests."',
};

export async function interact(g, it) {
  if (it.kind === 'sign' || it.kind === 'text') {
    await g.say(null, TEXTS[it.id] ?? '...');
  } else if (it.kind === 'terminal') {
    await writeHome(g);
  } else if (it.kind === 'chest') {
    await openChest(g, it.target);
  } else if (it.kind === 'pickup') {
    setFlag(G.state, `took:${it.id}`);
    it.target.taken = true;
    giveKey(G.state, it.id);
    g.sfx('item');
    g.music('item');
    await g.say(null, `{hero} got the ${KEY_ITEMS[it.id].name}!`);
    if (it.id === 'satchel') setObjective(g.world, 'tilly');
  } else if (it.kind === 'gate') {
    await g.say(null, flag(G.state, 'gate_active') ? 'The Gate hums warmly.' : 'The portal is dark and silent.');
  } else if (it.kind === 'blocker' && it.id === 'yard_gate') {
    if (!hasKey(G.state, 'chain_key')) {
      await g.say(null, 'The gate is chained shut. The padlock is older than the fence.');
      return;
    }
    takeKey(G.state, 'chain_key');
    setFlag(G.state, 'unlocked:yard_gate');
    g.world.removeObject('yard_gate');
    g.sfx('unlock');
    await g.say(null, 'The Chain Key turns. The gate swings open with a groan.');
  } else if (it.kind === 'action' && it.id === 'hollow_door') {
    await hollowDoor(g);
  }
}

async function hollowDoor(g) {
  if (flag(G.state, 'hollow_open')) {
    await g.goto('hollow', 'entry');
    return;
  }
  const shards = G.state.keyItems.sun_shard ?? 0;
  if (shards < 3) {
    await g.say(null, `A golden door with three empty sockets. You have {c:gold}${shards} of 3{/c} Sun Shards.`);
    return;
  }
  await g.say(null, 'The three Sun Shards float out of the satchel and settle into the sockets.');
  g.sfx('rumble');
  g.shake(3, 1);
  await g.wait(1);
  takeKey(G.state, 'sun_shard', 3);
  setFlag(G.state, 'hollow_open');
  await g.say(null, 'The door grinds open. Cold air breathes out of the dark.');
  await g.goto('hollow', 'entry');
}

async function openChest(g, chest) {
  if (chest.open) {
    await g.say(null, 'Empty. Someone got here first.');
    return;
  }
  const c = chest.def.contents ?? {};
  const items = Object.entries(c.items ?? {});
  for (const [id, n] of items) {
    if (itemCount(G.state, id) + n > 9) {
      await g.say(null, `Your satchel's too full for another ${ITEMS[id].name}.`);
      return;
    }
  }
  chest.open = true;
  chest.popT = 0.25;
  setFlag(G.state, `chest:${chest.id}`);
  G.state.stats.chests++;
  if (chest.def.secret) G.state.stats.secrets++;
  g.sfx('chest');
  // A burst out of the lid, so opening one feels like an event (F7).
  for (let i = 0; i < 12; i++) {
    g.world.particles.add({
      x: chest.x + 8,
      y: chest.y + 6,
      vx: (Math.random() - 0.5) * 46,
      vy: -26 - Math.random() * 34,
      ay: 90,
      life: 0.5 + Math.random() * 0.4,
      size: Math.random() < 0.3 ? 2 : 1,
      color: Math.random() < 0.5 ? C.gold : C.butter,
    });
  }
  for (const [id, n] of items) {
    addItem(G.state, id, n);
    await g.say(null, `{hero} got ${n > 1 ? `${n} ` : 'a '}${ITEMS[id].name}!`);
  }
  for (const id of c.keys ?? []) {
    giveKey(G.state, id);
    await g.say(null, `{hero} got the ${KEY_ITEMS[id].name}!`);
    if (id === 'sun_shard') shardProgress(g);
  }
  if (c.dollars) {
    addDollars(G.state, c.dollars);
    await g.say(null, `{hero} found ${c.dollars} sand dollars!`);
  }
}

// Touching an enemy that has its own scene.
export async function encounter(g, enemy) {
  // The third Sun Shard: the imps are sitting on it (DATA.md). Without this the door
  // to the Hollow could never open in a normal game - only two shards are in chests.
  if (enemy.def.script === 'twins') {
    await g.say(null, 'Two cinder imps are squabbling over something small and bright.');
    await g.say('biscuit', "That's a Sun Shard! They're using it as a warm rock!");
    const result = await g.battle(enemy.group, { canRun: false });
    if (!result.won) return;
    setFlag(G.state, `calmed:canyon:${enemy.id}`);
    g.world.removeActor(enemy.id);
    g.sfx('item');
    g.music('item');
    giveKey(G.state, 'sun_shard');
    await g.say(null, '{hero} got a {c:gold}Sun Shard{/c}!');
    await g.say('biscuit', 'One to go. I can hear the door humming from here.');
    shardProgress(g);
    return;
  }
  if (enemy.def.script === 'tutorial') {
    const biscuit = g.find('biscuit');
    if (biscuit) {
      biscuit.scripted = true;
      biscuit.faceToward(enemy.x, enemy.y);
    }
    await g.say('biscuit', "{hero}! It came out of the cactus patch and it won't leave!");
    await g.say('biscuit', 'Hit it with something! Your satchel! Anything!');
    const result = await g.battle(enemy.group, { canRun: false, tutorial: true });
    if (biscuit) biscuit.scripted = false;
    if (result.won) {
      setFlag(G.state, `calmed:dunmere:${enemy.id}`);
      g.world.removeActor(enemy.id);
      await g.say('biscuit', 'You SAVED my prototype! And my face. Mostly the prototype.');
      await g.say('biscuit', "Right. I'm coming with you. No arguments. I've already packed.");
      g.sfx('levelup');
      G.state.party.push(makeMember('biscuit', G.state.party[0].lv));
      setFlag(G.state, 'biscuit_joined');
      g.world.removeActor('biscuit');
      g.world.addFollower('biscuit');
      await g.say(null, 'Biscuit joined the party!');
      await g.say('biscuit', 'Here, take the Cork Blaster. It shoots corks. Mostly corks.');
      setObjective(g.world, 'canyon');
    }
  }
}

export function canExit(world, t) {
  if (t.to === 'canyon' && !flag(G.state, 'biscuit_joined')) return false;
  return true;
}

const PAD_ORDER = ['pad_rise', 'pad_sun', 'pad_moon'];

export async function trigger(g, id) {
  if (id.startsWith('pad_')) return padStep(g, id);
  if (id === 'boss_room') return bossRoom(g);
  return undefined;
}

// Sunrise, then sun, then moon. Wrong order puts them all out again.
async function padStep(g, id) {
  const w = g.world;
  if (flag(G.state, 'pads_done')) return;
  const pads = w.objects.filter((o) => o instanceof Object && o.constructor.name === 'Pad');
  const pad = pads.find((p) => p.id === id);
  if (!pad || pad.lit) return;
  w.padSeq = w.padSeq ?? [];
  if (id === PAD_ORDER[w.padSeq.length]) {
    pad.lit = true;
    w.padSeq.push(id);
    g.sfx('chime');
    if (w.padSeq.length === PAD_ORDER.length) {
      setFlag(G.state, 'pads_done');
      g.sfx('rumble');
      g.shake(3, 0.9);
      await g.wait(0.6);
      w.removeObject('pad_door');
      await g.say(null, 'The three pads hum together. To the north, the door grinds open.');
    }
    return;
  }
  g.sfx('error');
  for (const p of pads) {
    p.lit = false;
    p.wrong = 1;
  }
  w.padSeq = [];
  w.padMistakes = (w.padMistakes ?? 0) + 1;
  if (w.padMistakes === 2 && w.follower) await g.say('biscuit', 'Sunrise, noon, moon. Like a day! ...Probably.');
}

async function bossRoom(g) {
  if (flag(G.state, 'boss_done')) return;
  g.world.toast(saveGame(G.state, g.world) ? 'Checkpoint saved.' : SAVE_FAILED);
  await g.wait(0.4);
  await g.say('biscuit', 'Is that... a monster? Asleep? Should we tiptoe?');
  await g.say(null, 'WHO. DISTURBS. MY NAP.', { name: 'Grumblejaw' });
  await g.say(null, "Oh. Hello. Sorry. I'm grumpy. I ate a rock that hums and now I can't sleep.", { name: 'Grumblejaw' });
  await g.say('biscuit', 'He ATE the Sunrune?!');
  await g.say(null, 'The hood-lady said it was a snack. It was NOT a snack. ...But it is MY snack now. GRAAAH!', { name: 'Grumblejaw' });
  const result = await g.battle(['grumblejaw'], { canRun: false });
  if (!result.won) return;
  setFlag(G.state, 'boss_done');
  g.sfx('item');
  g.music('item');
  giveKey(G.state, 'sunrune');
  await g.say(null, 'Grumblejaw hiccups. Something small and golden bounces across the floor.', { name: null });
  await g.say(null, '{hero} got the {c:gold}Sunrune{/c}!');
  setObjective(g.world, 'home');
  await g.say(null, "...Oh. That's better. My tummy's quiet. Sorry for trying to eat you. Mostly sorry.", { name: 'Grumblejaw' });
  await g.say(null, 'Well, well. The little courier.', { name: '???' });
  await g.say(null, 'You found my snack. How thoughtful. Deliver it, then. Deliver it home.', { name: '???' });
  await g.say(null, 'See what it brings back.', { name: '???' });
  await g.say('biscuit', 'Okay. That was the creepiest customer I have ever met.');
  await g.say(null, 'I know a shortcut. Hold on to your ears.', { name: 'Grumblejaw' });
  await g.fade(1, 0.8, '#ffffff');
  await g.wait(0.6);
  await finale(g);
}

// Dunmere at sunset: the Sunrune goes home, and the post catches up with Pip (F20).
export async function finale(g) {
  const st = G.state;
  setFlag(st, 'finale');
  g.world.load('dunmere', 'gate');
  g.world.setTint('#f78d68', 0.25);
  g.bars(true);
  await g.fade(0, 1.2);
  g.music('ending');
  await g.say('mayor', '{hero}! Biscuit! Is that—');
  await g.say('juniper', 'Bring it here, little one. Quickly now.');
  await g.walk('pip', 22, 12, { speed: 52 });
  g.face('pip', 'up');
  await g.hop('pip', 7, 0.4);
  g.sfx('item');
  takeKey(st, 'sunrune');
  setFlag(st, 'gate_active');
  const gate = g.world.objects.find((o) => o.id === 'dunmere_gate');
  if (gate) {
    gate.active = true;
    gate.burst = 1.4;
  }
  g.shake(2, 0.6);
  await g.fade(1, 0.15, '#ffffff');
  await g.fade(0, 0.9);
  await g.say(null, 'The Sunrune settles into the Gate. A low, warm hum rolls back across Dunmere.');
  for (const id of ['mayor', 'dot', 'dash', 'lute', 'tilly']) g.find(id)?.hop(7, 0.4);
  g.sfx('levelup');
  await g.say('mayor', 'The hum! Our Gate is singing again!');
  await g.say('dot', 'SEE? It was just shy!');
  await g.say('dash', '...');
  await g.wait(0.4);
  g.sfx('door');
  await g.say(null, 'Something small and white drops out of the portal and lands at your feet.');
  await g.say('tilly', 'Mail! First delivery through the new Gate! Who is it for?');
  await g.say('tilly', "...It's for you, {hero}. Again.");
  await letter([
    'Dear {hero},',
    "If you're reading this, you got the rune back.",
    'Good.',
    'Now listen: there are eight more Gates, and the',
    'hooded stranger has been to all of them.',
    "Don't trust the Sun.",
    '- {hero}',
    'P.S. Tell Biscuit his eyebrows grow back.',
  ]);
  await g.say('biscuit', 'WHAT happens to my eyebrows?!');
  setFlag(st, 'chapter_done');
  g.objective('Chapter 1 complete');
  await g.fade(1, 1.4, '#ffffff');
  // If storage is blocked, the star simply won't appear on the title.
  markCleared();
  g.world.setTint(null);
  g.bars(false);
  // Push the ending first, then lift the white over it, so the chapter card blooms out
  // of the flash. Fading back in afterwards left the whole sequence - card, stats and
  // credits - playing behind an opaque white screen.
  const done = ending(st);
  await g.fade(0, 0.9);
  await done;
  G.toTitle?.();
}

// Until saving exists (step 37), a defeat puts the party back on their feet.
// ---- objectives and the compass needle (F10, F15) ----

// The chapter's objectives in order. `map` and `find` are only for the needle: it looks
// the target up in the live world rather than from a table of coordinates, so moving
// something on a map can't leave the needle pointing at nothing.
const OBJECTIVES = {
  satchel: { text: 'Take your satchel', map: 'house', find: (w) => inter(w, 'satchel') },
  tilly: { text: 'Visit Tilly at the Post Office', map: 'post', find: (w) => actor(w, 'tilly') },
  biscuit: { text: 'Find Biscuit', map: 'dunmere', find: (w) => actor(w, 'biscuit') },
  canyon: { text: 'Head east to Glass Canyon', map: 'canyon' },
  shards: {
    text: () => `Collect the Sun Shards (${G.state.keyItems.sun_shard ?? 0}/3)`,
    map: 'canyon',
    find: shardTarget,
  },
  hollow: { text: 'Enter the Hollow', map: 'canyon', find: (w) => inter(w, 'hollow_door') },
  sunrune: { text: 'Find the Sunrune', map: 'hollow', find: (w) => inter(w, 'pad_door') },
  home: { text: 'Bring the Sunrune home', map: 'dunmere', find: (w) => inter(w, 'dunmere_gate') },
};

// Which way to walk to reach another map. The four maps make a simple chain:
// house/post - dunmere - canyon - hollow.
const TOWARD = {
  house: { dunmere: 'dunmere', post: 'dunmere', canyon: 'dunmere', hollow: 'dunmere' },
  post: { dunmere: 'dunmere', house: 'dunmere', canyon: 'dunmere', hollow: 'dunmere' },
  dunmere: { house: 'house', post: 'post', canyon: 'canyon', hollow: 'canyon' },
  canyon: { hollow: 'hollow', dunmere: 'dunmere', house: 'dunmere', post: 'dunmere' },
  hollow: { canyon: 'canyon', dunmere: 'canyon', house: 'canyon', post: 'canyon' },
};

const middle = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function inter(world, id) {
  const found = world.interactables.find((t) => t.id === id || t.target?.id === id);
  return found ? middle(found.box) : null;
}

function actor(world, id) {
  const found = world.actors.find((a) => a.id === id);
  return found ? { x: found.x, y: found.y } : null;
}

// Point at a shard that is still out there: an unopened chest, or the imps sitting on
// the third one.
function shardTarget(world) {
  const chest = world.interactables.find(
    (t) => t.kind === 'chest' && !t.target?.open && String(t.target?.id ?? '').includes('shard'),
  );
  if (chest) return middle(chest.box);
  return actor(world, 'e6');
}

function objectiveText(id) {
  const o = OBJECTIVES[id];
  if (!o) return '';
  return typeof o.text === 'function' ? o.text() : o.text;
}

function setObjective(world, id) {
  G.state.objectiveId = id;
  G.state.objective = objectiveText(id);
  world.toast(`New objective: ${G.state.objective}`);
}

// Keeps the shard count honest, and moves on once all three are in the satchel.
function shardProgress(g) {
  if (G.state.objectiveId !== 'shards') return;
  const n = G.state.keyItems.sun_shard ?? 0;
  setObjective(g.world, n >= 3 ? 'hollow' : 'shards');
}

function needleTarget(world) {
  const o = OBJECTIVES[G.state.objectiveId];
  if (!o) return null;
  if (o.map === world.mapId) {
    const here = o.find?.(world);
    if (here) return here;
  }
  const hop = TOWARD[world.mapId]?.[o.map];
  if (!hop) return null;
  // The Hollow is behind a door you open, not an exit you walk through.
  if (hop === 'hollow') return inter(world, 'hollow_door');
  const exit = world.triggers.find((t) => t.kind === 'exit' && t.to === hop);
  return exit ? middle(exit.box) : null;
}

// A small gold needle in the corner, once Pip has the compass. The HUD stays this
// minimal on purpose: a needle and short toasts, nothing else.
export function renderHud(world) {
  if (!hasKey(G.state, 'rune_compass')) return;
  const target = needleTarget(world);
  if (!target) return;
  const p = world.player;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  const cx = VW - 15;
  const cy = 15;
  R.rect(cx - 1, cy - 1, 2, 2, C.ink);
  for (let i = 1; i <= 5; i++) {
    const x = Math.round(cx + Math.cos(angle) * i * 1.7);
    const y = Math.round(cy + Math.sin(angle) * i * 1.7);
    R.rect(x, y, 1, 1, i >= 4 ? C.gold : C.amber);
  }
}

// Arriving somewhere is what moves these two on.
export function onEnter(world, to) {
  const st = G.state;
  if (to === 'canyon' && st.objectiveId === 'canyon') setObjective(world, 'shards');
  if (to === 'hollow' && st.objectiveId !== 'home') setObjective(world, 'sunrune');
}

export async function onDefeat(world) {
  restoreParty(G.state);
  world.toast('Nana patched everyone up.');
}

export async function missingMap(g) {
  await g.say(null, "The path ahead isn't open yet.");
}
