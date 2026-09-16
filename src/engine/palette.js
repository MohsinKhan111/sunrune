// The pack's 28 colours (DESIGN.md "Colours"). Tiles, sprites, props and UI use only these.
export const C = {
  ink: '#47324b',
  plum: '#615679',
  dusk: '#81759b',
  steel: '#999ac4',
  mist: '#c3c6e9',
  grey: '#a0a8be',
  white: '#ffffff',
  snow: '#fcfcfc',
  cream: '#fbe5c9',
  sand: '#f3cdac',
  dirt: '#dfa988',
  clay: '#c47c71',
  rust: '#a35b5f',
  lilac: '#c4a8ee',
  purple: '#a386ce',
  violet: '#886daf',
  mint: '#9df8e4',
  teal: '#7bd8c4',
  sea: '#63b8a6',
  salmon: '#f78d68',
  red: '#dd674c',
  brick: '#b94f37',
  butter: '#ffde8c',
  gold: '#ffb84c',
  amber: '#ec9a1e',
  sky: '#a1b6f5',
  blue: '#778fdb',
  navy: '#616bba',
};

// Derived shades, only for overlays and the letterbox (DESIGN.md).
export const D = {
  letterbox: '#17111c',
  cave: '#120c16',
};

export function colour(name) {
  return C[name] ?? D[name] ?? name;
}
