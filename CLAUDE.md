# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in any modern browser — no build step, no server, no dependencies.

```bash
start index.html   # Windows
```

## Git & GitHub Workflow

Every meaningful change must be committed with a clean message and pushed:

```bash
git add <specific-files>
git commit -m "short summary

- bullet detail if needed"
git push
```

Remote: `https://github.com/lotantamary/pixel-assault` (private), branch `master`.

## Architecture

The entire game lives in two files:

- **`index.html`** — canvas shell only. Sets up the `#gameCanvas` element and loads `game.js`.
- **`game.js`** — everything else, structured in clearly commented sections (top to bottom):

| Section | What it does |
|---|---|
| Canvas Setup | Fixed 800×600 logical resolution; CSS scales to viewport |
| Input System | `keys{}` for keyboard, `mouse{}` for position + button state |
| Sprite System | `SPRITES` (2D palette-index arrays) + `PALETTES` (color maps); rendered via `ctx.fillRect` per pixel at `PIXEL_SIZE=4` |
| Game State | Single `game` object: `{state, level, score, highScore, loopCount, ...}` |
| Level Definitions | `LEVELS[]` — 5 hand-crafted spawn queues of `{type, delay}` entries |
| Enemy Config | `ENEMY_DEFS` — stats for `grunt`, `brute`, `shooter` |
| Game Entities | `createPlayer()`, `spawnEnemy()`, `spawnBullet()`, `spawnParticle()` factories |
| Update functions | `updatePlayer`, `tryShoot`, `updateSpawning`, `updateEnemies`, `updateBullets`, `updateParticles`, `checkCollisions`, `checkLevelClear` |
| Render functions | `renderBackground`, `renderPickups`, `renderEnemies`, `renderPlayer`, `renderGun`, `renderBullets`, `renderParticles`, `renderHUD`, plus full-screen renderers for each game state |
| Game Loop | `requestAnimationFrame` loop; `dt` capped at 50ms |

### State Machine

```
'menu' → 'playing' → 'levelTransition' (3s) → 'playing'
                   ↓
               'gameOver' → 'menu'
```

State is stored in `game.state`. `handleEnter()` and `handleClick()` drive transitions from menu/game-over screens.

### Coordinate System

All gameplay uses **logical pixels** (800×600). Mouse coordinates are converted from CSS pixels using `getBoundingClientRect` + a scale factor derived from the canvas's rendered vs logical size. Never use raw `clientX/Y` for gameplay logic.

### Spawning

`spawnQueue` is a shallow-copied array of `{type, delay}` entries built by `buildSpawnQueue()` at the start of each level. `updateSpawning` advances a `spawnTimer` (in ms) and shifts entries off the front when their delay is reached. Level clear is detected when `spawnQueue.length === 0 && enemies.length === 0`.

### Adding a New Enemy Type

1. Add a sprite 2D array to `SPRITES` and a palette to `PALETTES`.
2. Add an entry to `ENEMY_DEFS` with `{hp, speed, radius, contactDmg, score, palette, sprite}`.
3. Add AI behaviour inside the `if (e.type === ...)` block in `updateEnemies`.
4. Add a death color in the `deathColors` map inside `checkCollisions`.
5. Add the type to one or more `LEVELS[n].spawnQueue` entries.

### Adding a New Level

Append an object to `LEVELS`:
```js
{ label: 'Level N — Name', spawnQueue: [{type, delay}, ...] }
```
The game loops back through `LEVELS` after level 5 using `(game.level - 1) % LEVELS.length`, scaling enemy HP via `game.loopCount`.

### Persistence

`game.highScore` is read from and written to `localStorage` under the key `pixelAssaultHigh`.
