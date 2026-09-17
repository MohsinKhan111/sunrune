// The pause menu (F18): Items, Party, Journal, Settings, Quit to Title. Opened with Esc
// from the overworld, which only offers it when the player has control - so it can never
// appear over a cutscene or a line of dialogue.
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text } from '../engine/font.js';
import { audio } from '../engine/audio.js';
import { ITEMS, KEY_ITEMS } from '../data/items.js';
import { MEMBERS, SKILLS, MAX_LV } from '../data/party.js';
import { statsAt, expToNext, skillsAt } from '../battle/rules.js';
import { itemCount, removeItem } from '../story/state.js';
import { formatTime } from './ending.js';
import { ease, clamp } from '../engine/ease.js';
import { openSettings } from './settings.js';

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'party', label: 'Party' },
  { id: 'journal', label: 'Journal' },
  { id: 'settings', label: 'Settings' },
  { id: 'quit', label: 'Quit to Title' },
];

const LIST = { x: 8, y: 18, w: 92, h: 122 };
const PANE = { x: 104, y: 18, w: 208, h: 122 };

// Where the menu's attention is. Esc always steps back one.
const TABBING = 0;
const INSIDE = 1;
const TARGETING = 2;
const CONFIRMING = 3;

class MenuScene {
  constructor(world) {
    this.opaque = false;
    this.blocksUpdate = true;
    this.world = world;
    this.level = TABBING;
    this.tab = 0;
    this.itemCursor = 0;
    this.keysTab = false;
    this.partyCursor = 0;
    this.targetCursor = 0;
    this.quitCursor = 1; // "No" first, so a stray Enter never throws the game away
    this.msg = '';
    this.msgT = 0;
    this.t = 0;
  }

  // ---- what's on screen ----

  get satchel() {
    return Object.keys(G.state.items).filter((id) => itemCount(G.state, id) > 0);
  }

  get keyList() {
    return Object.keys(G.state.keyItems);
  }

  get list() {
    return this.keysTab ? this.keyList : this.satchel;
  }

  note(str) {
    this.msg = str;
    this.msgT = 2.6;
  }

  close() {
    audio.sfx('cancel');
    G.pop(this);
  }

  // ---- using an item ----

  // Outside a battle there is no "flat" flag: a knocked-flat friend is simply on 0 HP.
  useItem(id, m) {
    const it = ITEMS[id];
    const max = statsAt(m.id, m.lv);
    const name = MEMBERS[m.id].name;
    const flat = m.hp <= 0;

    if (it.use === 'revive') {
      if (!flat) {
        audio.sfx('error');
        this.note(`${name} is already on their feet.`);
        return false;
      }
      m.hp = Math.floor(max.hp / 2);
      removeItem(G.state, id, 1);
      audio.sfx('heal');
      this.note(`${name} is back up!`);
      return true;
    }

    if (flat) {
      audio.sfx('error');
      this.note(`${name} is out cold. Try a Sun Tea.`);
      return false;
    }

    if (it.use === 'heal') {
      if (m.hp >= max.hp) {
        audio.sfx('error');
        this.note(`${name} is already full up.`);
        return false;
      }
      const before = m.hp;
      m.hp = Math.min(max.hp, m.hp + it.amount);
      removeItem(G.state, id, 1);
      audio.sfx('heal');
      this.note(`${name} got ${m.hp - before} HP back.`);
      return true;
    }

    if (it.use === 'sp') {
      if (m.sp >= max.sp) {
        audio.sfx('error');
        this.note(`${name} has plenty of pep already.`);
        return false;
      }
      const before = m.sp;
      m.sp = Math.min(max.sp, m.sp + it.amount);
      removeItem(G.state, id, 1);
      audio.sfx('heal');
      this.note(`${name} got ${m.sp - before} SP back.`);
      return true;
    }

    // Dust Bombs and anything else that only makes sense mid-fight.
    audio.sfx('error');
    this.note('Better to save that for a scrap.');
    return false;
  }

  // ---- update ----

  update(dt, isTop) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (!isTop) return;

    if (this.level === TABBING) return this.updateTabs();
    if (this.level === TARGETING) return this.updateTarget();
    if (this.level === CONFIRMING) return this.updateQuit();
    return this.updateInside();
  }

  updateTabs() {
    if (input.repeat('down')) {
      this.tab = (this.tab + 1) % TABS.length;
      this.msgT = 0;
      audio.sfx('cursor');
    }
    if (input.repeat('up')) {
      this.tab = (this.tab + TABS.length - 1) % TABS.length;
      this.msgT = 0;
      audio.sfx('cursor');
    }
    if (input.pressed('confirm')) {
      const id = TABS[this.tab].id;
      audio.sfx('confirm');
      if (id === 'quit') {
        this.quitCursor = 1;
        this.level = CONFIRMING;
      } else if (id === 'settings') {
        // Settings is its own panel, shared with the title screen.
        openSettings();
      } else {
        this.level = INSIDE;
        this.itemCursor = 0;
        this.partyCursor = 0;
      }
    }
    if (input.pressed('cancel') || input.pressed('menu')) this.close();
  }

  updateInside() {
    const id = TABS[this.tab].id;
    if (input.pressed('cancel') || input.pressed('menu')) {
      audio.sfx('cancel');
      this.level = TABBING;
      return;
    }

    if (id === 'items') {
      if (input.repeat('left') || input.repeat('right')) {
        this.keysTab = !this.keysTab;
        this.itemCursor = 0;
        // A note belongs to the view it was written for.
        this.msgT = 0;
        audio.sfx('cursor');
      }
      const list = this.list;
      if (list.length) {
        if (input.repeat('down')) {
          this.itemCursor = (this.itemCursor + 1) % list.length;
          audio.sfx('cursor');
        }
        if (input.repeat('up')) {
          this.itemCursor = (this.itemCursor + list.length - 1) % list.length;
          audio.sfx('cursor');
        }
      }
      if (input.pressed('confirm') && !this.keysTab && list.length) {
        audio.sfx('confirm');
        this.targetCursor = 0;
        this.level = TARGETING;
      }
      return;
    }

    if (id === 'party') {
      const n = G.state.party.length;
      if (input.repeat('down')) {
        this.partyCursor = (this.partyCursor + 1) % n;
        audio.sfx('cursor');
      }
      if (input.repeat('up')) {
        this.partyCursor = (this.partyCursor + n - 1) % n;
        audio.sfx('cursor');
      }
    }
  }

  updateTarget() {
    const n = G.state.party.length;
    if (input.repeat('down')) {
      this.targetCursor = (this.targetCursor + 1) % n;
      audio.sfx('cursor');
    }
    if (input.repeat('up')) {
      this.targetCursor = (this.targetCursor + n - 1) % n;
      audio.sfx('cursor');
    }
    if (input.pressed('confirm')) {
      const id = this.list[this.itemCursor];
      if (id) this.useItem(id, G.state.party[this.targetCursor]);
      // The last one may have just been used up.
      this.itemCursor = Math.max(0, Math.min(this.itemCursor, this.list.length - 1));
      this.level = INSIDE;
    }
    if (input.pressed('cancel') || input.pressed('menu')) {
      audio.sfx('cancel');
      this.level = INSIDE;
    }
  }

  updateQuit() {
    if (input.repeat('left') || input.repeat('right') || input.repeat('up') || input.repeat('down')) {
      this.quitCursor = this.quitCursor === 0 ? 1 : 0;
      audio.sfx('cursor');
    }
    if (input.pressed('confirm')) {
      if (this.quitCursor === 0) {
        audio.sfx('confirm');
        G.pop(this);
        G.toTitle?.();
      } else {
        audio.sfx('cancel');
        this.level = TABBING;
      }
    }
    if (input.pressed('cancel') || input.pressed('menu')) {
      audio.sfx('cancel');
      this.level = TABBING;
    }
  }

  // ---- render ----

  render() {
    // Arrives over 0.15 s rather than snapping on (F7).
    const k = ease.outCubic(clamp(this.t / 0.15, 0, 1));
    R.alpha(k, () => {
      R.fill('#000000', 0.6);
      this.renderTabs();
      const id = TABS[this.tab].id;
      R.box(PANE.x, PANE.y, PANE.w, PANE.h, C.ink);
      if (id === 'items') this.renderItems();
      else if (id === 'party') this.renderParty();
      else if (id === 'journal') this.renderJournal();
      else if (id === 'settings') this.renderSettings();
      else this.renderQuit();

      // Bottom strip: how long you've played, and what you're carrying.
      text(formatTime(G.state.stats.playMs), 10, VH - 14, { color: 'mist' });
      text(`${G.state.dollars} sand dollars`, VW - 10, VH - 14, { align: 'right', color: 'gold' });
      if (this.msgT > 0) text(this.msg, VW / 2, VH - 14, { align: 'center', color: 'cream' });
    });
  }

  renderTabs() {
    R.box(LIST.x, LIST.y, LIST.w, LIST.h, C.ink);
    TABS.forEach((tab, i) => {
      const sel = i === this.tab;
      const y = LIST.y + 10 + i * 16;
      // Dim the tab list once the attention has moved into the pane.
      const col = sel ? (this.level === TABBING ? 'gold' : 'cream') : 'white';
      if (sel) text('→', LIST.x + 6, y, { color: col });
      text(tab.label, LIST.x + 18, y, { color: col });
    });
  }

  renderItems() {
    const list = this.list;
    text(this.keysTab ? 'Key items' : 'Satchel', PANE.x + 8, PANE.y + 6, { color: 'gold' });
    text('← →', PANE.x + PANE.w - 10, PANE.y + 6, { align: 'right', color: 'mist' });
    if (!list.length) {
      text(this.keysTab ? 'No key items yet.' : 'Your satchel is empty.', PANE.x + 8, PANE.y + 28, {
        color: 'mist',
      });
      return;
    }
    const shown = list.slice(0, 5);
    shown.forEach((id, i) => {
      const def = this.keysTab ? KEY_ITEMS[id] : ITEMS[id];
      const sel = i === this.itemCursor;
      const y = PANE.y + 22 + i * 13;
      if (sel && this.level !== TABBING) text('→', PANE.x + 6, y, { color: 'gold' });
      text(def.name, PANE.x + 18, y, { color: sel ? 'gold' : 'white' });
      if (!this.keysTab) {
        text(`x${itemCount(G.state, id)}`, PANE.x + PANE.w - 10, y, { align: 'right', color: 'cream' });
      }
    });
    const cur = list[this.itemCursor];
    const def = this.keysTab ? KEY_ITEMS[cur] : ITEMS[cur];
    if (def) {
      wrap(def.desc, 30).forEach((line, i) => {
        text(line, PANE.x + 8, PANE.y + 92 + i * 11, { color: 'mist' });
      });
    }
    if (this.level === TARGETING) this.renderTargets();
  }

  renderTargets() {
    const w = 120;
    const h = 20 + G.state.party.length * 14;
    const x = PANE.x + PANE.w - w - 8;
    const y = PANE.y + 20;
    R.box(x, y, w, h, C.navy);
    text('Give it to...', x + 8, y + 6, { color: 'gold' });
    G.state.party.forEach((m, i) => {
      const max = statsAt(m.id, m.lv);
      const sel = i === this.targetCursor;
      const yy = y + 20 + i * 14;
      if (sel) text('→', x + 6, yy, { color: 'gold' });
      text(MEMBERS[m.id].name, x + 18, yy, { color: sel ? 'gold' : 'white' });
      text(`${m.hp}/${max.hp}`, x + w - 8, yy, {
        align: 'right',
        color: m.hp <= 0 ? 'red' : 'cream',
      });
    });
  }

  renderParty() {
    const m = G.state.party[this.partyCursor];
    if (!m) return;
    const max = statsAt(m.id, m.lv);
    G.state.party.forEach((p, i) => {
      const sel = i === this.partyCursor;
      text(MEMBERS[p.id].name, PANE.x + 10 + i * 64, PANE.y + 6, { color: sel ? 'gold' : 'mist' });
    });
    text(`LV ${m.lv}`, PANE.x + PANE.w - 10, PANE.y + 6, { align: 'right', color: 'gold' });

    const rows = [
      ['HP', `${m.hp} / ${max.hp}`],
      ['SP', `${m.sp} / ${max.sp}`],
      ['ATK', String(max.atk)],
      ['DEF', String(max.def)],
      ['SPD', String(max.spd)],
    ];
    rows.forEach(([label, value], i) => {
      const y = PANE.y + 24 + i * 12;
      text(label, PANE.x + 10, y, { color: 'mist' });
      text(value, PANE.x + 86, y, { align: 'right', color: 'white' });
    });

    // expToNext returns 0 at the cap as well as when a level is due, so ask the level
    // rather than reading anything into the 0.
    const left = expToNext(m.lv, m.exp);
    const exp = m.lv >= MAX_LV ? 'Fully grown' : `${left} EXP to LV ${m.lv + 1}`;
    text(exp, PANE.x + 10, PANE.y + 88, { color: 'cream' });

    text('Skills', PANE.x + 108, PANE.y + 24, { color: 'gold' });
    const learned = skillsAt(m.id, m.lv);
    if (!learned.length) text('None yet', PANE.x + 108, PANE.y + 38, { color: 'mist' });
    learned.slice(0, 4).forEach((id, i) => {
      const sk = SKILLS[id];
      text(sk.name, PANE.x + 108, PANE.y + 38 + i * 12, { color: 'white' });
      text(`${sk.sp} SP`, PANE.x + PANE.w - 10, PANE.y + 38 + i * 12, { align: 'right', color: 'mist' });
    });  }

  renderJournal() {
    text('Chapter 1', PANE.x + 8, PANE.y + 8, { color: 'gold' });
    text('Return to Sender', PANE.x + 8, PANE.y + 22, { color: 'cream' });
    text('Right now', PANE.x + 8, PANE.y + 48, { color: 'gold' });
    const objective = G.state.objective ?? 'Nothing pressing. Have a look around.';
    wrap(objective, 30).forEach((line, i) => {
      text(line, PANE.x + 8, PANE.y + 62 + i * 11, { color: 'white' });
    });
  }

  renderSettings() {
    text('Settings', PANE.x + 8, PANE.y + 8, { color: 'gold' });
    text('Sound, text speed, shake,', PANE.x + 8, PANE.y + 30, { color: 'mist' });
    text('flashing, battle timing and', PANE.x + 8, PANE.y + 41, { color: 'mist' });
    text('fullscreen.', PANE.x + 8, PANE.y + 52, { color: 'mist' });
    text(`Press ${input.label('confirm')} to open.`, PANE.x + 8, PANE.y + 72, { color: 'cream' });
  }

  renderQuit() {
    text('Quit to Title', PANE.x + 8, PANE.y + 8, { color: 'gold' });
    if (this.level !== CONFIRMING) {
      text(`Press ${input.label('confirm')} to go back to`, PANE.x + 8, PANE.y + 30, { color: 'mist' });
      text('the title screen.', PANE.x + 8, PANE.y + 41, { color: 'mist' });
      return;
    }
    text('Give up and go home?', PANE.x + 8, PANE.y + 30, { color: 'white' });
    text('Anything since your last', PANE.x + 8, PANE.y + 50, { color: 'mist' });
    text('letter home will be lost.', PANE.x + 8, PANE.y + 61, { color: 'mist' });
    ['Yes, quit', 'No, keep playing'].forEach((label, i) => {
      const sel = i === this.quitCursor;
      const y = PANE.y + 82 + i * 14;
      if (sel) text('→', PANE.x + 8, y, { color: 'gold' });
      text(label, PANE.x + 20, y, { color: sel ? 'gold' : 'white' });
    });
  }
}

// Descriptions are written as sentences, so break them on words.
function wrap(str, cols) {
  const out = [];
  let line = '';
  for (const word of String(str).split(' ')) {
    if (line && (line + ' ' + word).length > cols) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

export function openMenu(world) {
  G.push(new MenuScene(world));
}
