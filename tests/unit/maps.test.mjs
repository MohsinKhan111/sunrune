import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../../src/world/maps/index.js';
import { buildMap, TILE } from '../../src/world/map.js';

const FACING = new Set(['up', 'down', 'left', 'right']);

// A tile Pip can stand on: not solid, and not mostly covered by a prop's box.
function walkable(built) {
  const ok = new Uint8Array(built.w * built.h);
  for (let y = 0; y < built.h; y++) {
    for (let x = 0; x < built.w; x++) {
      if (built.solid[y * built.w + x]) continue;
      const cx = x * TILE + 8;
      const cy = y * TILE + 12;
      const covered = built.rects.some((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
      ok[y * built.w + x] = covered ? 0 : 1;
    }
  }
  for (const o of built.def.objects ?? []) {
    if (o.type === 'deco' && o.solid) ok[o.y * built.w + o.x] = 0;
    if (o.type === 'chest' || o.type === 'terminal' || o.type === 'npc') ok[o.y * built.w + o.x] = 0;
  }
  return ok;
}

function flood(built, ok, sx, sy) {
  const seen = new Uint8Array(built.w * built.h);
  const q = [[sx, sy]];
  seen[sy * built.w + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= built.w || ny >= built.h) continue;
      const i = ny * built.w + nx;
      if (seen[i] || !ok[i]) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

for (const [id, def] of Object.entries(MAPS)) {
  test(`map ${id}: builds with no errors`, () => {
    assert.equal(def.id, id);
    const built = buildMap(def);
    assert.deepEqual(built.errors, []);
    if (def.props?.length) assert.equal(def.props.length, def.ground.length, 'props rows');
  });

  test(`map ${id}: spawns are on walkable tiles`, () => {
    const built = buildMap(def);
    const ok = walkable(built);
    for (const [name, s] of Object.entries(def.spawns ?? {})) {
      const x = Math.floor(s.x + 0.5);
      const y = Math.floor(s.y);
      assert.ok(FACING.has(s.facing), `${name} facing`);
      assert.ok(ok[y * built.w + x] || ok[y * built.w + Math.floor(s.x)], `spawn ${name} at ${s.x},${s.y} is blocked`);
    }
  });

  test(`map ${id}: doors and exits lead to maps and spawns that exist`, () => {
    const built = buildMap(def);
    const links = [
      ...built.doors.filter((d) => d.to),
      ...built.caves,
      ...(def.objects ?? []).filter((o) => o.type === 'exit'),
    ];
    for (const l of links) {
      if (!MAPS[l.to]) continue; // maps not built yet are checked when they exist
      assert.ok(MAPS[l.to].spawns?.[l.spawn], `${id} → ${l.to}:${l.spawn} missing`);
    }
  });

  test(`map ${id}: everything important can be reached from the first spawn`, () => {
    const built = buildMap(def);
    const ok = walkable(built);
    const first = Object.values(def.spawns)[0];
    const seen = flood(built, ok, Math.floor(first.x + 0.5), Math.floor(first.y));
    const near = (x, y) =>
      [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 0]].some(([dx, dy]) => seen[(y + dy) * built.w + (x + dx)]);
    for (const [name, s] of Object.entries(def.spawns)) {
      assert.ok(near(Math.floor(s.x + 0.5), Math.floor(s.y)), `spawn ${name} unreachable`);
    }
    for (const d of built.doors) assert.ok(near(d.x, d.y + 1) || near(d.x, d.y), `door at ${d.x},${d.y} unreachable`);
    for (const o of def.objects ?? []) {
      if (['chest', 'terminal', 'npc', 'sign', 'exit'].includes(o.type)) {
        assert.ok(near(o.x, o.y), `${o.type} ${o.id ?? ''} at ${o.x},${o.y} unreachable`);
      }
    }
  });
}
