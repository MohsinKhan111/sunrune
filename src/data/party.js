// Party stats, growth, EXP and skills. Source of truth: DATA.md "Party".
export const EXP_TABLE = [0, 12, 35, 70, 120, 190]; // total EXP needed for LV 1..6
export const MAX_LV = 6;

export const MEMBERS = {
  pip: {
    name: 'Pip',
    base: { hp: 38, sp: 10, atk: 7, def: 4, spd: 7 },
    grow: { hp: 8, sp: 3, atk: 2, def: 1, spd: 1 },
    skills: [
      ['pounce', 1],
      ['lick_wounds', 2],
      ['sunburst', 4],
    ],
    attack: 'satchel',
  },
  biscuit: {
    name: 'Biscuit',
    base: { hp: 32, sp: 14, atk: 6, def: 3, spd: 6 },
    grow: { hp: 7, sp: 4, atk: 2, def: 1, spd: 1 },
    skills: [
      ['wrench_toss', 1],
      ['patch_kit', 1],
      ['spark_coil', 3],
    ],
    attack: 'blaster',
  },
};

// target: enemy | enemies | self | ally
export const SKILLS = {
  pounce: { name: 'Pounce', sp: 3, target: 'enemy', power: 1.8, desc: 'A big leaping swipe at one enemy.' },
  lick_wounds: { name: 'Lick Wounds', sp: 4, target: 'self', heal: 30, desc: 'Pip tidies herself up. Heals 30 HP.' },
  sunburst: { name: 'Sunburst', sp: 7, target: 'enemies', power: 1.3, desc: 'A flash of sunlight hits every enemy.' },
  wrench_toss: { name: 'Wrench Toss', sp: 3, target: 'enemy', power: 1.6, desc: 'A spinning wrench. Never misses.' },
  patch_kit: { name: 'Patch Kit', sp: 4, target: 'ally', heal: 35, desc: 'Heals one friend for 35 HP.' },
  spark_coil: { name: 'Spark Coil', sp: 6, target: 'enemies', power: 1.0, stun: 0.35, desc: 'Zaps every enemy. Might stun them.' },
};
