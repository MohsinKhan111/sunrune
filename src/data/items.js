// Items and key items. Source of truth: DATA.md "Items".
export const MAX_STACK = 9;
export const MAX_DOLLARS = 9999;
export const START_DOLLARS = 20;

// use: heal | sp | revive | bomb · target: ally | flat | enemies
export const ITEMS = {
  cactus_candy: { name: 'Cactus Candy', price: 8, use: 'heal', amount: 30, target: 'ally', desc: 'Sweet, and only a little prickly. Heals 30 HP.' },
  fizzy_dew: { name: 'Fizzy Dew', price: 14, use: 'sp', amount: 10, target: 'ally', desc: 'Bubbly desert soda. Restores 10 SP.' },
  sun_tea: { name: 'Sun Tea', price: 30, use: 'revive', target: 'flat', desc: 'Gets a knocked-flat friend back up with half their HP.' },
  dust_bomb: { name: 'Dust Bomb', price: 18, use: 'bomb', amount: 20, target: 'enemies', battleOnly: true, desc: 'Hits every enemy for 20. Very sneezy.' },
  prickly_pie: { name: 'Prickly Pear Pie', price: 0, use: 'heal', amount: 90, target: 'ally', desc: 'A whole pie, somehow still warm. Heals 90 HP.' },
};

export const KEY_ITEMS = {
  satchel: { name: 'Courier Satchel', desc: "Pip's first-day satchel. Room for everything." },
  rune_compass: { name: 'Rune Compass', desc: 'Its needle points wherever you need to be.' },
  chain_key: { name: 'Chain Key', desc: 'Opens the gate of the old mining yard.' },
  sun_shard: { name: 'Sun Shard', desc: "A warm sliver of stone. The Hollow's door needs three." },
  sunrune: { name: 'Sunrune', desc: "Dunmere's rune. Slightly sticky." },
  letter: { name: 'Letter', desc: 'From Pip. To Pip. Stamped RETURN TO SENDER.' },
};

export const SHOP = ['cactus_candy', 'fizzy_dew', 'sun_tea', 'dust_bomb'];
