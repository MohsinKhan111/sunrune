// Every character: which sprite row, colour swaps (D3), name, and voice pitch for text blips.
// Sprite rows in chars.png: 0 cat, 1 hamster, 2 mouse, 3 rabbit.
// Source colours: cat/hamster fur dirt #dfa988, shade clay #c47c71, belly sand #f3cdac,
// cat flower purple #a386ce. Mouse/rabbit fur steel #999ac4, shade dusk #81759b,
// highlight mist #c3c6e9, belly sand #f3cdac, nose/ears dirt #dfa988.
export const CHARS = {
  pip: { name: 'Pip', row: 0, voice: 1.3, colors: { '#dfa988': '#f78d68', '#c47c71': '#dd674c' } },
  nana: {
    name: 'Nana', row: 0, voice: 0.95,
    colors: { '#dfa988': '#c3c6e9', '#c47c71': '#999ac4', '#f3cdac': '#fbe5c9', '#a386ce': '#ffb84c' },
  },
  moss: {
    name: 'Moss', row: 0, voice: 0.8,
    colors: { '#dfa988': '#615679', '#c47c71': '#47324b', '#f3cdac': '#81759b', '#a386ce': '#7bd8c4' },
  },
  biscuit: { name: 'Biscuit', row: 1, voice: 1.1, colors: {} },
  barley: {
    name: 'Officer Barley', row: 1, voice: 0.7,
    colors: { '#dfa988': '#ffb84c', '#c47c71': '#ec9a1e', '#f3cdac': '#fbe5c9' },
  },
  tilly: { name: 'Tilly', row: 2, voice: 1.35, colors: {} },
  dot: {
    name: 'Dot', row: 2, voice: 1.7,
    colors: { '#999ac4': '#dfa988', '#81759b': '#c47c71', '#c3c6e9': '#f3cdac', '#f3cdac': '#fbe5c9', '#dfa988': '#f78d68' },
  },
  dash: {
    name: 'Dash', row: 2, voice: 1.55,
    colors: { '#999ac4': '#dfa988', '#81759b': '#c47c71', '#c3c6e9': '#f3cdac', '#f3cdac': '#fbe5c9', '#dfa988': '#dd674c' },
  },
  lute: {
    name: 'Lute', row: 2, voice: 1.2,
    colors: { '#999ac4': '#a386ce', '#81759b': '#886daf', '#c3c6e9': '#c4a8ee' },
  },
  mayor: { name: 'Mayor Thistle', row: 3, voice: 0.85, colors: {} },
  juniper: {
    name: 'Juniper', row: 3, voice: 0.65,
    colors: { '#999ac4': '#fbe5c9', '#81759b': '#dfa988', '#c3c6e9': '#ffffff' },
  },
  pemberton: {
    name: 'Pemberton', row: 3, voice: 0.9,
    colors: { '#999ac4': '#dfa988', '#81759b': '#c47c71', '#c3c6e9': '#f3cdac', '#f3cdac': '#fbe5c9' },
  },
  stranger: {
    name: '???', row: 3, voice: 0.55,
    colors: {
      '#999ac4': '#615679', '#81759b': '#47324b', '#c3c6e9': '#81759b',
      '#f3cdac': '#615679', '#dfa988': '#615679', '#ffffff': '#81759b',
    },
  },
};
