// Enemies and their moves. Source of truth: DATA.md "The main thing: enemies".
// sprite: row in enemies.png. bg: battle background preset.
export const ENEMIES = {
  glimmerslug: {
    name: 'Glimmerslug', sprite: 0, lv: 1, hp: 16, atk: 6, def: 2, spd: 3, exp: 5, dollars: 3,
    moves: [['ooze', 70], ['glint', 30]], drop: ['cactus_candy', 0.2], bg: 'teal',
  },
  dune_moth: {
    name: 'Dune Moth', sprite: 1, lv: 2, hp: 20, atk: 8, def: 2, spd: 10, exp: 8, dollars: 5,
    moves: [['dive', 60], ['dust_flurry', 40]], drop: ['fizzy_dew', 0.15], bg: 'amber', flies: true,
  },
  cinder_imp: {
    name: 'Cinder Imp', sprite: 2, lv: 3, hp: 26, atk: 10, def: 4, spd: 6, exp: 12, dollars: 8,
    moves: [['headbutt', 55], ['ember_toss', 25], ['giggle', 20]], drop: ['dust_bomb', 0.15], bg: 'ember',
  },
  grumblejaw: {
    name: 'Grumblejaw', sprite: 3, lv: 6, hp: 190, atk: 12, def: 5, spd: 4, exp: 60, dollars: 50,
    boss: true, script: 'grumblejaw', bg: 'boss',
  },
};

// target: one | all | none | self. {name} = the enemy, {target} = who it hits.
export const MOVES = {
  ooze: { target: 'one', power: 1.0, text: '{name} oozes at {target}!' },
  glint: { target: 'one', power: 0.8, text: '{name} flashes its crystals at {target}!' },
  dive: { target: 'one', power: 1.0, text: '{name} dive-bombs {target}!' },
  dust_flurry: { target: 'all', power: 0.6, text: '{name} kicks up a flurry of dust!' },
  headbutt: { target: 'one', power: 1.2, text: '{name} headbutts {target}! Hot!' },
  ember_toss: { target: 'all', power: 0.8, text: '{name} tosses embers everywhere!' },
  giggle: { target: 'none', power: 0, text: "{name} giggled. It's contagious. Nothing happened." },
  chomp: { target: 'one', power: 1.0, text: '{name} chomps at {target}!' },
  tail_sweep: { target: 'all', power: 0.7, text: '{name} sweeps his big tail!' },
  belly_rumble: { target: 'none', power: 0, text: "{name}'s belly hums like a choir..." },
  rune_burp: { target: 'all', power: 1.6, text: 'RUNE BURP!' },
  grumpy_nap: { target: 'self', heal: 20, text: '{name} curled up for a grumpy nap. Zzz...' },
  wake: { target: 'none', power: 0, text: '{name} wakes up, grumpier than ever!' },
};
