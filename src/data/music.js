// The songs (D9). Each bar is 8 eighth-note steps: a note like 'd4', '-' to hold, '.' to
// rest. Drums use 'k' kick, 's' snare, 'h' hat. Melodies stay in key over simple
// progressions, the triangle bass keeps to chord roots, and levels stay conservative.
export const SONGS = {
  // Title: D major, wistful, no drums.
  title: {
    bpm: 84,
    bars: 4,
    tracks: {
      p1: [
        'f#4 - a4 - d5 - - -',
        'e5 - d5 - a4 - - -',
        'b4 - d5 - f#5 - - -',
        'e5 - - - d5 - - -',
      ],
      p2: [
        'd4 - f#4 - a4 - - -',
        'c#5 - a4 - f#4 - - -',
        'g4 - b4 - d5 - - -',
        'a4 - - - f#4 - - -',
      ],
      bass: [
        'd2 - - - a2 - - -',
        'a2 - - - e2 - - -',
        'g2 - - - d2 - - -',
        'a2 - - - a2 - - -',
      ],
      drums: [],
    },
  },

  // Dunmere: C major, bouncy.
  town: {
    bpm: 112,
    bars: 4,
    tracks: {
      p1: [
        'c5 - e5 g5 e5 - c5 -',
        'd5 - f5 a5 g5 - e5 -',
        'e5 - g5 c6 b5 - g5 -',
        'a5 g5 e5 d5 c5 - - -',
      ],
      p2: [
        'e4 - g4 - c5 - g4 -',
        'f4 - a4 - d5 - a4 -',
        'g4 - c5 - e5 - c5 -',
        'f4 - d4 - e4 - - -',
      ],
      bass: [
        'c2 - c3 - g2 - g3 -',
        'f2 - f3 - c3 - c2 -',
        'c2 - c3 - e2 - e3 -',
        'f2 - g2 - c2 - - -',
      ],
      drums: [
        'k . h . s . h .',
        'k . h . s . h h',
        'k . h . s . h .',
        'k k h . s . h h',
      ],
    },
  },

  // Glass Canyon: A dorian, striding.
  canyon: {
    bpm: 124,
    bars: 4,
    tracks: {
      p1: [
        'a4 - c5 - e5 - d5 -',
        'c5 - b4 - a4 - - -',
        'g4 - b4 - d5 - e5 -',
        'd5 - c5 - a4 - - -',
      ],
      p2: [
        'e4 - a4 - c5 - b4 -',
        'a4 - g4 - e4 - - -',
        'd4 - g4 - b4 - c5 -',
        'b4 - a4 - e4 - - -',
      ],
      bass: [
        'a2 - - a2 e2 - - -',
        'f2 - - f2 c3 - - -',
        'g2 - - g2 d3 - - -',
        'a2 - - e2 a2 - - -',
      ],
      drums: [
        'k . h k s . h .',
        'k . h k s . h h',
        'k . h k s . h .',
        'k k h . s s h .',
      ],
    },
  },

  // The Hollow: E minor, sparse and cold.
  hollow: {
    bpm: 72,
    bars: 4,
    tracks: {
      p1: [
        'e4 - - - b4 - - -',
        'g4 - - - f#4 - - -',
        'e4 - - - a4 - - -',
        'b4 - - - - - - -',
      ],
      p2: [
        '. . . . e5 - - -',
        '. . . . d5 - - -',
        '. . . . c5 - - -',
        '. . . . b4 - - -',
      ],
      bass: [
        'e2 - - - - - - -',
        'c2 - - - - - - -',
        'a2 - - - - - - -',
        'b2 - - - - - - -',
      ],
      drums: [],
    },
  },

  // Scuffle: A minor, fast.
  battle: {
    bpm: 150,
    bars: 4,
    tracks: {
      p1: [
        'a4 a4 c5 - e5 - d5 -',
        'c5 c5 e5 - a5 - g5 -',
        'f5 - e5 - d5 - c5 -',
        'b4 - c5 - e5 - a4 -',
      ],
      p2: [
        'e4 e4 a4 - c5 - b4 -',
        'a4 a4 c5 - e5 - d5 -',
        'd5 - c5 - b4 - a4 -',
        'g4 - a4 - c5 - e4 -',
      ],
      bass: [
        'a2 a2 a2 - e2 - e2 -',
        'f2 f2 f2 - c3 - c3 -',
        'd2 d2 d2 - a2 - a2 -',
        'e2 e2 e2 - e3 - e3 -',
      ],
      drums: [
        'k h s h k h s h',
        'k h s h k h s h',
        'k h s h k h s h',
        'k k s h s s h h',
      ],
    },
  },

  // Grumblejaw: D minor, heavy.
  boss: {
    bpm: 138,
    bars: 4,
    tracks: {
      p1: [
        'd4 - d4 - f4 - g4 -',
        'a4 - - g4 f4 - d4 -',
        'a#4 - a4 - g4 - f4 -',
        'e4 - - - a4 - - -',
      ],
      p2: [
        'a3 - a3 - d4 - d4 -',
        'f4 - - d4 a3 - a3 -',
        'g4 - f4 - d4 - a3 -',
        'c4 - - - e4 - - -',
      ],
      bass: [
        'd2 d2 - d2 d2 - a1 -',
        'd2 d2 - d2 f2 - a2 -',
        'a#1 a#1 - a#1 f2 - f2 -',
        'a1 a1 - a1 a2 - - -',
      ],
      drums: [
        'k k s . k . s k',
        'k k s . k . s k',
        'k k s . k . s k',
        'k k s s k s s s',
      ],
    },
  },

  // Return to Sender: the title theme, warmer and slower.
  ending: {
    bpm: 90,
    bars: 4,
    tracks: {
      p1: [
        'd5 - f#5 - a5 - - -',
        'g5 - f#5 - d5 - - -',
        'e5 - g5 - b5 - - -',
        'a5 - - - f#5 - - -',
      ],
      p2: [
        'a4 - d5 - f#5 - - -',
        'b4 - a4 - f#4 - - -',
        'c#5 - e5 - g5 - - -',
        'f#5 - - - d5 - - -',
      ],
      bass: [
        'd2 - - - a2 - - -',
        'g2 - - - d2 - - -',
        'a2 - - - e2 - - -',
        'd2 - - - d3 - - -',
      ],
      drums: [],
    },
  },

  // The night of the theft: a slow pad, no pulse melody.
  intro: {
    bpm: 60,
    bars: 2,
    tracks: {
      p1: [],
      p2: ['d4 - - - - - - -', 'a3 - - - - - - -'],
      bass: ['d2 - - - - - - -', 'a1 - - - - - - -'],
      drums: [],
    },
  },

  // Victory loops quietly under the results, however long they run.
  victory: {
    bpm: 132,
    bars: 2,
    tracks: {
      p1: ['c5 e5 g5 - c6 - - -', 'g5 - c6 - e6 - - -'],
      p2: ['e4 g4 c5 - e5 - - -', 'c5 - e5 - g5 - - -'],
      bass: ['c2 - g2 - c3 - - -', 'c3 - - - c2 - - -'],
      drums: ['k . s . k . . .', 'k k s . . . . .'],
    },
  },

  // Short flourishes. once: true puts the previous song back afterwards.
  levelup: {
    bpm: 150,
    bars: 1,
    once: true,
    tracks: {
      p1: ['d5 f#5 a5 d6 - - - -'],
      p2: ['a4 d5 f#5 a5 - - - -'],
      bass: ['d2 - d3 - - - - -'],
      drums: [],
    },
  },

  // Something worth keeping just went into the satchel.
  item: {
    bpm: 150,
    bars: 1,
    once: true,
    tracks: {
      p1: ['g5 c6 e6 - - . . .'],
      p2: ['e5 g5 c6 - - . . .'],
      bass: ['c3 - - - - . . .'],
      drums: [],
    },
  },

  // The chapter card: D major, triumphant, over the top of the ending theme.
  chapter: {
    bpm: 100,
    bars: 2,
    once: true,
    tracks: {
      p1: ['d5 - a5 - f#5 - a5 -', 'd6 - - - - - - -'],
      p2: ['a4 - d5 - d5 - f#5 -', 'a5 - - - - - - -'],
      bass: ['d2 - - - a2 - - -', 'd3 - - - - - - -'],
      drums: ['k . . . k . s .', 'k k s . . . . .'],
    },
  },

  lose: {
    bpm: 84,
    bars: 2,
    once: true,
    tracks: {
      p1: ['d5 - c5 - a#4 - a4 -', 'g4 - - - - - - -'],
      p2: ['f4 - e4 - d4 - c4 -', 'd4 - - - - - - -'],
      bass: ['d2 - - - a1 - - -', 'g1 - - - - - - -'],
      drums: [],
    },
  },
};
