// How enemies pick moves. Pure, so the balance test can use it.
import { ENEMIES } from '../data/enemies.js';

export function weightedMove(moves, rng) {
  const total = moves.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [move, w] of moves) {
    r -= w;
    if (r < 0) return move;
  }
  return moves[moves.length - 1][0];
}

// A random party member who isn't knocked flat.
export function pickTarget(party, rng) {
  const alive = party.filter((m) => !m.flat);
  return alive.length ? alive[Math.floor(rng() * alive.length)] : null;
}

// Grumblejaw's pattern (DATA.md "Grumblejaw's script").
export class GrumbleBrain {
  constructor() {
    this.step = 0;
    this.raged = false;
    this.justRaged = false;
    this.napDue = false;
    this.napUsed = false;
    this.burpNext = false;
    this.asleep = false;
  }

  // Call after he takes damage.
  onHp(hp, max) {
    if (!this.raged && hp <= max * 0.5) {
      this.raged = true;
      this.justRaged = true;
      this.step = 0;
    }
    if (!this.napUsed && hp <= max * 0.25) this.napDue = true;
  }

  next(rng) {
    if (this.asleep) {
      this.asleep = false;
      return 'wake';
    }
    if (this.burpNext) {
      this.burpNext = false;
      return 'rune_burp';
    }
    if (this.napDue) {
      this.napDue = false;
      this.napUsed = true;
      this.asleep = true;
      return 'grumpy_nap';
    }
    let move;
    if (!this.raged) {
      move = ['chomp', 'tail_sweep', 'belly_rumble'][this.step % 3];
    } else {
      move = this.step % 2 === 0 ? (rng() < 0.5 ? 'chomp' : 'tail_sweep') : 'belly_rumble';
    }
    this.step++;
    if (move === 'belly_rumble') this.burpNext = true;
    return move;
  }
}

export function makeBrain(enemyId) {
  return ENEMIES[enemyId].script === 'grumblejaw' ? new GrumbleBrain() : null;
}

export function chooseMove(enemyId, brain, rng) {
  if (brain) return brain.next(rng);
  return weightedMove(ENEMIES[enemyId].moves, rng);
}
