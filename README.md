# SUNRUNE

**Chapter 1 — Return to Sender.** A top-down story RPG demo that runs in a browser. About 8–12 minutes, title screen to credits.

**[▶ Play it](https://mohsinkhan111.github.io/sunrune/)** — desktop, phone or tablet.

A hooded stranger walks off with the Sunrune that keeps the Gate lit. Pip, a courier cat with one job, decides that something taken belongs back with its sender.

No engine, no framework, no build step: vanilla JavaScript modules, one canvas, and the Web Audio API.

---

## Controls

**Keyboard** — arrows or WASD to walk, Shift to run, Enter/Z/Space to talk and confirm, X or Esc to go back, Esc for the pause menu, F for fullscreen. Any standard gamepad works too.

**Touch** — a pad appears by itself on a touchscreen: a cross to walk, **A** confirm, **B** back, **X** run, **Y** or **Start** for the pause menu. Turn the device sideways for a bigger picture; the controls move out to the edges.

**In a fight** — press confirm a second time just as your character lands the blow for extra damage, and Guard just before an enemy swings to take less. Settings → Battle timing → Relaxed doubles both windows.

## Saving

Walk up to a Post Terminal — the small orange box — and write a letter home. The game also saves a checkpoint before the boss.

## Running it locally

Needs [Node.js](https://nodejs.org) 20 or newer. There are no runtime dependencies.

```
npm start          # serves on 127.0.0.1:8765 and opens a browser
npm run phone      # also serves to devices on the same local network
```

`Play.bat` does the same as `npm start` on Windows.

Opening `index.html` by double-clicking it will not work — browsers refuse to load JavaScript modules from `file://`.

## Tests

```
npm test           # 89 unit tests, a few seconds
npm run test:e2e   # drives your installed Chrome, about 15 minutes
```

The browser run leaves a screenshot of every check in `tests/screenshots`. It needs Chrome or Edge installed; set `CHROME_PATH` if it is somewhere unusual. To run one suite: `node tests/e2e/run.mjs basics`, or one check: `node tests/e2e/run.mjs bugbash every-door`.

| Suite | Covers |
|---|---|
| `basics` | boot, new game, picking things up, save and reload |
| `touch` | the on-screen pad, driven with real touch events |
| `chapter` | a bot plays the whole chapter, title to credits |
| `bugbash` | doors, map edges, every NPC, menus, defeat |
| `perf` | frame cost in the two busiest scenes |

## Layout

| | |
|---|---|
| `src/engine/` | canvas, input, audio, chiptune sequencer, fonts, drawing |
| `src/world/` | maps, map builder, actors, camera, lighting, ambient life |
| `src/battle/` | the battle system |
| `src/ui/` | title, dialogue, menus, shop, ending, touch pad |
| `src/story/` | Chapter 1: script, dialogue, story flags |
| `src/data/` | characters, enemies, items, party stats, songs |
| `tools/serve.mjs` | static file server, no dependencies, loopback only unless asked otherwise |

## Privacy

The game makes no network requests of its own and has no analytics, accounts or cookies. Saves and settings are kept in the browser's local storage under `sunrune:` keys and never leave the device.

## Credits

Art and sound effects by [Kenney](https://kenney.nl) — Desert Shooter Pack, CC0. See `assets/KENNEY-LICENSE.txt`. The music is synthesized in the browser with the Web Audio API; there are no audio files for it.

Code is MIT licensed — see `LICENSE`.
