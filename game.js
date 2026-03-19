// ============================================================
// PIXEL ASSAULT — Complete Browser Top-Down Shooter
// ============================================================

// ============================================================
// FIREBASE CONFIG — replace with your Realtime Database URL
// ============================================================
const FIREBASE_URL = 'https://pixel-assault-leaderboard-default-rtdb.firebaseio.com';
let leaderboard = [];      // [{name, score}] sorted desc, up to 10
let leaderboardLoaded = false;

async function fetchLeaderboard() {
  try {
    const res = await fetch(`${FIREBASE_URL}/scores.json`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) { leaderboard = []; leaderboardLoaded = true; return; }
    leaderboard = Object.values(data).sort((a, b) => b.score - a.score).slice(0, 10);
    leaderboardLoaded = true;
  } catch (e) { leaderboardLoaded = true; /* Firebase not configured or offline */ }
}

async function submitScore(name, score) {
  try {
    await fetch(`${FIREBASE_URL}/scores.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, ts: Date.now() }),
    });
    await fetchLeaderboard();
  } catch (e) { /* silently fail */ }
}

// ============================================================
// CANVAS SETUP
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const LOGICAL_W = 800;
const LOGICAL_H = 600;
const PIXEL_SIZE = 4;

function resizeCanvas() {
  const scaleX = window.innerWidth / LOGICAL_W;
  const scaleY = window.innerHeight / LOGICAL_H;
  const scale = Math.min(scaleX, scaleY);
  canvas.style.width = (LOGICAL_W * scale) + 'px';
  canvas.style.height = (LOGICAL_H * scale) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================
// INPUT SYSTEM
// ============================================================
const keys = {};
const mouse = { x: LOGICAL_W / 2, y: LOGICAL_H / 2, down: false };

document.addEventListener('keydown', e => {
  if (e.target.id === 'nameInput') return;  // let the input handle its own keys
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key === 'Enter') {
    handleEnter();
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    handlePause();
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = LOGICAL_W / rect.width;
  const scaleY = LOGICAL_H / rect.height;
  mouse.x = (e.clientX - rect.left) * scaleX;
  mouse.y = (e.clientY - rect.top) * scaleY;
});
canvas.addEventListener('mousedown', e => {
  mouse.down = true;
  handleClick();
});
canvas.addEventListener('mouseup', () => { mouse.down = false; });

// ============================================================
// TOUCH CONTROLS
// ============================================================
const touchState = {
  left:  { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0 },
  right: { active: false, id: null },
};

function toLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (LOGICAL_W / rect.width),
    y: (clientY - rect.top)  * (LOGICAL_H / rect.height),
  };
}

function handleTouchStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const pos = toLogical(t.clientX, t.clientY);
    if (pos.x < LOGICAL_W / 2) {
      if (!touchState.left.active) {
        touchState.left = { active: true, id: t.identifier, startX: pos.x, startY: pos.y, x: pos.x, y: pos.y };
        handleClick();
      }
    } else {
      if (!touchState.right.active) {
        touchState.right.active = true;
        touchState.right.id = t.identifier;
        mouse.x = pos.x;
        mouse.y = pos.y;
        mouse.down = true;
        handleClick();
      }
    }
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const pos = toLogical(t.clientX, t.clientY);
    if (t.identifier === touchState.left.id) {
      touchState.left.x = pos.x;
      touchState.left.y = pos.y;
    } else if (t.identifier === touchState.right.id) {
      mouse.x = pos.x;
      mouse.y = pos.y;
    }
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.left.id) {
      touchState.left.active = false;
      touchState.left.id = null;
    } else if (t.identifier === touchState.right.id) {
      touchState.right.active = false;
      touchState.right.id = null;
      mouse.down = false;
    }
  }
}

canvas.addEventListener('touchstart',  handleTouchStart, { passive: false });
canvas.addEventListener('touchmove',   handleTouchMove,  { passive: false });
canvas.addEventListener('touchend',    handleTouchEnd,   { passive: false });
canvas.addEventListener('touchcancel', handleTouchEnd,   { passive: false });

// ============================================================
// SPRITE SYSTEM (Procedural Pixel Art)
// ============================================================
// Each sprite: 2D array of palette indices (0 = transparent)
const SPRITES = {
  player: [
    [0,0,0,1,1,1,1,0,0,1,1,1,1,0,0,0],
    [0,0,1,2,2,2,2,1,1,2,2,2,2,1,0,0],
    [0,1,2,2,3,3,2,2,2,2,3,3,2,2,1,0],
    [0,1,2,3,3,3,3,2,2,3,3,3,3,2,1,0],
    [1,2,2,3,1,1,3,2,2,3,1,1,3,2,2,1],
    [1,2,3,3,1,1,3,3,3,3,1,1,3,3,2,1],
    [1,2,3,3,3,3,3,3,3,3,3,3,3,3,2,1],
    [1,2,2,3,3,3,3,3,3,3,3,3,3,2,2,1],
    [0,1,2,2,2,3,3,3,3,3,3,2,2,2,1,0],
    [0,1,2,2,3,3,3,3,3,3,3,3,2,2,1,0],
    [0,0,1,2,2,3,3,3,3,3,3,2,2,1,0,0],
    [0,0,1,2,3,3,2,2,2,2,3,3,2,1,0,0],
    [0,1,2,2,3,2,2,1,1,2,2,3,2,2,1,0],
    [0,1,2,3,3,2,1,0,0,1,2,3,3,2,1,0],
    [0,1,2,3,2,1,0,0,0,0,1,2,3,2,1,0],
    [0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0],
  ],
  grunt: [
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0],
    [1,2,2,3,3,2,2,2,2,2,2,3,3,2,2,1],
    [1,2,3,3,3,3,2,2,2,2,3,3,3,3,2,1],
    [1,2,3,1,1,3,2,2,2,2,3,1,1,3,2,1],
    [1,2,3,1,1,3,3,3,3,3,3,1,1,3,2,1],
    [1,2,2,3,3,3,3,3,3,3,3,3,3,2,2,1],
    [0,1,2,2,3,3,3,3,3,3,3,3,2,2,1,0],
    [0,1,2,2,2,3,3,3,3,3,3,2,2,2,1,0],
    [0,1,2,2,3,3,3,3,3,3,3,3,2,2,1,0],
    [0,0,1,2,2,3,3,3,3,3,3,2,2,1,0,0],
    [0,0,1,2,2,3,2,2,2,2,3,2,2,1,0,0],
    [0,1,2,2,3,2,2,1,1,2,2,3,2,2,1,0],
    [0,1,3,3,2,2,1,0,0,1,2,2,3,3,1,0],
    [0,1,3,2,2,1,0,0,0,0,1,2,2,3,1,0],
    [0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0],
  ],
  brute: [
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,3,3,2,2,2,2,2,2,2,2,3,3,2,1],
    [1,2,3,3,3,3,2,2,2,2,3,3,3,3,2,1],
    [1,2,3,1,1,3,3,2,2,3,3,1,1,3,2,1],
    [1,2,3,1,1,3,3,3,3,3,3,1,1,3,2,1],
    [1,2,2,3,3,3,3,3,3,3,3,3,3,2,2,1],
    [1,2,2,2,3,3,3,3,3,3,3,3,2,2,2,1],
    [1,2,2,2,3,3,3,3,3,3,3,3,2,2,2,1],
    [1,2,2,3,3,3,3,3,3,3,3,3,3,2,2,1],
    [0,1,2,3,3,3,3,3,3,3,3,3,3,2,1,0],
    [0,1,2,3,3,2,2,2,2,2,2,3,3,2,1,0],
    [1,2,2,3,2,2,1,1,1,1,2,2,3,2,2,1],
    [1,2,3,3,2,1,0,0,0,0,1,2,3,3,2,1],
    [1,2,3,2,1,0,0,0,0,0,0,1,2,3,2,1],
    [0,1,1,1,0,0,0,0,0,0,0,0,1,1,1,0],
  ],
  shooter: [
    [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
    [0,1,2,2,3,3,2,2,2,2,3,3,2,2,1,0],
    [0,1,2,3,3,3,3,2,2,3,3,3,3,2,1,0],
    [1,2,2,3,1,1,3,2,2,3,1,1,3,2,2,1],
    [1,2,3,3,1,1,3,3,3,3,1,1,3,3,2,1],
    [1,2,3,3,3,3,3,3,3,3,3,3,3,3,2,1],
    [0,1,2,3,3,3,3,3,3,3,3,3,3,2,1,0],
    [0,1,2,3,3,3,3,3,3,3,3,3,3,2,1,0],
    [0,1,2,2,3,3,3,3,3,3,3,3,2,2,1,0],
    [0,0,1,2,2,3,3,3,3,3,3,2,2,1,0,0],
    [0,0,1,2,3,3,2,2,2,2,3,3,2,1,0,0],
    [0,0,1,2,3,2,2,1,1,2,2,3,2,1,0,0],
    [0,1,2,3,3,2,1,0,0,1,2,3,3,2,1,0],
    [0,1,2,3,2,1,0,0,0,0,1,2,3,2,1,0],
    [0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0],
  ],
  heal: [
    [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,1,1,1,1,1,2,2,2,2,1,1,1,1,1,0],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [0,1,1,1,1,1,2,2,2,2,1,1,1,1,1,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  ],
};

const PALETTES = {
  player:  ['', '#2255AA', '#4488FF', '#88BBFF'],
  grunt:   ['', '#881111', '#CC2222', '#FF4444'],
  brute:   ['', '#994400', '#DD6600', '#FF8833'],
  shooter: ['', '#550088', '#8800CC', '#BB44FF'],
  heal:    ['', '#115511', '#22AA22', '#66FF66'],
};

function drawSprite(ctx, spriteKey, x, y, paletteKey, pixelSize) {
  const data = SPRITES[spriteKey];
  const palette = PALETTES[paletteKey];
  const ps = pixelSize || PIXEL_SIZE;
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < data[row].length; col++) {
      const idx = data[row][col];
      if (idx === 0) continue;
      ctx.fillStyle = palette[idx];
      ctx.fillRect(
        Math.floor(x + col * ps),
        Math.floor(y + row * ps),
        ps, ps
      );
    }
  }
}

// Animated enemy sprite (leg animation — swap last 2 rows)
function drawEnemySprite(ctx, spriteKey, x, y, paletteKey, frame, hitFlash) {
  const data = SPRITES[spriteKey];
  const palette = PALETTES[paletteKey];
  const ps = PIXEL_SIZE;
  const rows = data.length;
  for (let row = 0; row < rows; row++) {
    let srcRow = row;
    // Leg animation: swap rows 14 and 15 on odd frame
    if (frame === 1 && (row === 14 || row === 15)) {
      srcRow = row === 14 ? 15 : 14;
    }
    for (let col = 0; col < data[srcRow].length; col++) {
      const idx = data[srcRow][col];
      if (idx === 0) continue;
      if (hitFlash) {
        ctx.fillStyle = '#FFFFFF';
      } else {
        ctx.fillStyle = palette[idx];
      }
      ctx.fillRect(
        Math.floor(x + col * ps),
        Math.floor(y + row * ps),
        ps, ps
      );
    }
  }
}

// ============================================================
// GAME STATE
// ============================================================
const game = {
  state: 'menu',
  level: 1,
  score: 0,
  highScore: parseInt(localStorage.getItem('pixelAssaultHigh') || '0'),
  transitionTimer: 0,
  blinkTimer: 0,
  blinkVisible: true,
  loopCount: 0,
};

// ============================================================
// LEVEL DEFINITIONS
// ============================================================
const LEVELS = [
  {
    label: 'Level 1 — The Swarm',
    spawnQueue: [
      {type:'grunt', delay:0},
      {type:'grunt', delay:1000},
      {type:'grunt', delay:2000},
      {type:'grunt', delay:3000},
      {type:'grunt', delay:4000},
      {type:'grunt', delay:5000},
      {type:'grunt', delay:6000},
      {type:'grunt', delay:7000},
    ]
  },
  {
    label: 'Level 2 — They Shoot Back',
    spawnQueue: [
      {type:'grunt', delay:0},
      {type:'grunt', delay:800},
      {type:'shooter', delay:1500},
      {type:'grunt', delay:2500},
      {type:'shooter', delay:3000},
      {type:'grunt', delay:4000},
      {type:'shooter', delay:4500},
      {type:'grunt', delay:5500},
      {type:'shooter', delay:6000},
      {type:'grunt', delay:7000},
    ]
  },
  {
    label: 'Level 3 — Brutality',
    spawnQueue: [
      {type:'grunt', delay:0},
      {type:'grunt', delay:500},
      {type:'brute', delay:1500},
      {type:'shooter', delay:2000},
      {type:'grunt', delay:3000},
      {type:'grunt', delay:3500},
      {type:'brute', delay:4500},
      {type:'shooter', delay:5000},
      {type:'shooter', delay:5500},
      {type:'brute', delay:6500},
      {type:'grunt', delay:7000},
      {type:'grunt', delay:7500},
    ]
  },
  {
    label: 'Level 4 — Escalation',
    spawnQueue: [
      {type:'brute', delay:0},
      {type:'shooter', delay:500},
      {type:'shooter', delay:1000},
      {type:'grunt', delay:1500},
      {type:'grunt', delay:2000},
      {type:'brute', delay:2500},
      {type:'shooter', delay:3000},
      {type:'grunt', delay:3500},
      {type:'brute', delay:4000},
      {type:'shooter', delay:4500},
      {type:'grunt', delay:5000},
      {type:'grunt', delay:5500},
      {type:'brute', delay:6000},
    ]
  },
  {
    label: 'Level 5 — Final Wave',
    spawnQueue: [
      {type:'brute', delay:0},
      {type:'brute', delay:500},
      {type:'shooter', delay:1000},
      {type:'shooter', delay:1200},
      {type:'grunt', delay:1500},
      {type:'grunt', delay:2000},
      {type:'grunt', delay:2200},
      {type:'brute', delay:3000},
      {type:'shooter', delay:3500},
      {type:'shooter', delay:4000},
      {type:'brute', delay:4500},
      {type:'grunt', delay:5000},
      {type:'grunt', delay:5200},
      {type:'grunt', delay:5400},
      {type:'brute', delay:6000},
    ]
  },
];

// ============================================================
// ENEMY CONFIG
// ============================================================
const ENEMY_DEFS = {
  grunt:   { hp: 50,  speed: 120, radius: 14, contactDmg: 15, score: 10,  palette: 'grunt',   sprite: 'grunt'   },
  brute:   { hp: 200, speed: 60,  radius: 22, contactDmg: 30, score: 50,  palette: 'brute',   sprite: 'brute'   },
  shooter: { hp: 75,  speed: 80,  radius: 18, contactDmg: 0,  score: 30,  palette: 'shooter', sprite: 'shooter' },
};

// ============================================================
// GAME ENTITIES
// ============================================================
let player, enemies, bullets, particles, pickups;
let spawnQueue, spawnTimer;

function createPlayer() {
  return {
    x: LOGICAL_W / 2,
    y: LOGICAL_H / 2,
    width: 64, height: 64,
    radius: 20,
    speed: 180,
    hp: 100, maxHp: 100,
    angle: 0,
    shootCooldown: 0,
    shootRate: 250,
    invincible: 0,
    bobOffset: 0,
    moving: false,
    // Active bonuses (ms remaining, 0 = inactive)
    bonusRapidFire: 0,   // shoot rate halved
    bonusSpeed: 0,       // speed increased by 80
    bonusShield: 0,      // absorbs next hit
  };
}

function getSpawnPos() {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  const margin = 40;
  if (edge === 0) { x = Math.random() * LOGICAL_W; y = -margin; }
  else if (edge === 1) { x = LOGICAL_W + margin; y = Math.random() * LOGICAL_H; }
  else if (edge === 2) { x = Math.random() * LOGICAL_W; y = LOGICAL_H + margin; }
  else { x = -margin; y = Math.random() * LOGICAL_H; }
  return { x, y };
}

function spawnEnemy(type) {
  const def = ENEMY_DEFS[type];
  const pos = getSpawnPos();
  const hpMult = 1 + (game.loopCount * 0.5);
  return {
    type,
    x: pos.x, y: pos.y,
    radius: def.radius,
    hp: def.hp * hpMult,
    maxHp: def.hp * hpMult,
    speed: def.speed,
    contactDmg: def.contactDmg,
    score: def.score,
    palette: def.palette,
    sprite: def.sprite,
    animFrame: 0,
    animTimer: 0,
    hitFlash: 0,
    shootCooldown: type === 'shooter' ? 2000 + Math.random() * 1000 : 0,
  };
}

function spawnBullet(x, y, vx, vy, fromPlayer) {
  return {
    x, y, vx, vy,
    radius: fromPlayer ? 4 : 5,
    damage: fromPlayer ? 25 : 15,
    life: 2000,
    fromPlayer,
    color: fromPlayer ? '#FFEE00' : '#FF44AA',
  };
}

function spawnParticle(x, y, vx, vy, size, color, life) {
  return { x, y, vx, vy, size, color, life, maxLife: life };
}

// ============================================================
// LEVEL SETUP
// ============================================================
function buildSpawnQueue(levelIndex) {
  const def = LEVELS[levelIndex];
  const speedFactor = 1 - Math.min(game.loopCount * 0.15, 0.5);
  return def.spawnQueue.map(entry => ({
    type: entry.type,
    delay: entry.delay * speedFactor,
  }));
}

function startLevel(lvl) {
  game.level = lvl;
  const idx = (lvl - 1) % LEVELS.length;
  spawnQueue = buildSpawnQueue(idx);
  spawnTimer = 0;
  enemies = [];
  bullets = [];
  particles = [];
  pickups = [];
}

function initGame() {
  player = createPlayer();
  enemies = [];
  bullets = [];
  particles = [];
  pickups = [];
  game.score = 0;
  game.level = 1;
  game.loopCount = 0;
  startLevel(1);
}

// ============================================================
// NAME OVERLAY
// ============================================================
function showNameOverlay() {
  const overlay = document.getElementById('nameOverlay');
  overlay.style.display = 'block';
  const input = document.getElementById('nameInput');
  input.value = '';
  setTimeout(() => input.focus(), 50);
}

function hideNameOverlay() {
  document.getElementById('nameOverlay').style.display = 'none';
}

function doSubmitScore() {
  const name = document.getElementById('nameInput').value.trim() || 'Anonymous';
  hideNameOverlay();
  submitScore(name, game.score);
  game.state = 'menu';
}

document.getElementById('submitBtn').addEventListener('click', doSubmitScore);
document.getElementById('skipBtn').addEventListener('click', () => {
  hideNameOverlay();
  game.state = 'menu';
});

// ============================================================
// INPUT HANDLERS
// ============================================================
function handleEnter() {
  if (game.state === 'menu') {
    game.state = 'playing';
    initGame();
  } else if (game.state === 'enterName') {
    doSubmitScore();
  }
}

function handleClick() {
  if (game.state === 'menu') {
    game.state = 'playing';
    initGame();
  }
}

function handlePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
  } else if (game.state === 'paused') {
    game.state = 'playing';
  }
}

// ============================================================
// COLLISION HELPERS
// ============================================================
function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

function circlesDist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================
// PARTICLES
// ============================================================
function emitMuzzleFlash(x, y, angle) {
  // White flash
  particles.push(spawnParticle(x, y, 0, 0, 10, '#FFFFFF', 80));
  // Yellow sparks
  for (let i = 0; i < 6; i++) {
    const spread = (Math.random() - 0.5) * 1.2;
    const a = angle + spread;
    const speed = 120 + Math.random() * 200;
    particles.push(spawnParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3, '#FFDD00', 200 + Math.random() * 150));
  }
}

function emitBulletHit(x, y) {
  // White flash
  particles.push(spawnParticle(x, y, 0, 0, 8, '#FFFFFF', 80));
  // Red sparks
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 150;
    particles.push(spawnParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3, '#FF4422', 200 + Math.random() * 200));
  }
}

function pickupColor(kind) {
  return { heal: '#66FF66', rapidfire: '#FFDD00', speed: '#44DDFF', shield: '#CC88FF' }[kind] || '#FFFFFF';
}

function emitShieldBreak(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const spd = 80 + Math.random() * 120;
    particles.push(spawnParticle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 4, '#CC88FF', 500));
  }
  particles.push(spawnParticle(x, y, 0, 0, 18, '#FFFFFF', 120));
}

function emitEnemyDeath(x, y, color) {
  const count = 8 + Math.floor(Math.random() * 9);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 60 + Math.random() * 200;
    particles.push(spawnParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3 + Math.random() * 3, color, 400 + Math.random() * 400));
  }
  // Central flash
  particles.push(spawnParticle(x, y, 0, 0, 14, '#FFFFFF', 120));
}

// ============================================================
// UPDATE FUNCTIONS
// ============================================================
function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;

  // Touch joystick
  if (touchState.left.active) {
    const jdx = touchState.left.x - touchState.left.startX;
    const jdy = touchState.left.y - touchState.left.startY;
    const jlen = Math.sqrt(jdx * jdx + jdy * jdy);
    if (jlen > 8) { dx += jdx / jlen; dy += jdy / jlen; }
  }

  player.moving = (dx !== 0 || dy !== 0);

  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

  const effectiveSpeed = player.speed + (player.bonusSpeed > 0 ? 80 : 0);
  player.x = Math.max(player.radius, Math.min(LOGICAL_W - player.radius, player.x + dx * effectiveSpeed * dt));
  player.y = Math.max(player.radius, Math.min(LOGICAL_H - player.radius, player.y + dy * effectiveSpeed * dt));

  // Aiming
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  // Bob offset
  if (player.moving) {
    player.bobOffset = Math.sin(Date.now() / 150) * 2;
  } else {
    player.bobOffset *= 0.85;
  }

  // Invincibility countdown
  if (player.invincible > 0) {
    player.invincible -= dt * 1000;
    if (player.invincible < 0) player.invincible = 0;
  }

  // Shoot cooldown
  if (player.shootCooldown > 0) {
    player.shootCooldown -= dt * 1000;
    if (player.shootCooldown < 0) player.shootCooldown = 0;
  }

  // Bonus timers
  if (player.bonusRapidFire > 0) player.bonusRapidFire = Math.max(0, player.bonusRapidFire - dt * 1000);
  if (player.bonusSpeed > 0)     player.bonusSpeed     = Math.max(0, player.bonusSpeed     - dt * 1000);
  if (player.bonusShield > 0)    player.bonusShield    = Math.max(0, player.bonusShield    - dt * 1000);
}

function tryShoot() {
  const effectiveShootRate = player.bonusRapidFire > 0 ? player.shootRate / 2 : player.shootRate;
  if (mouse.down && player.shootCooldown <= 0) {
    player.shootCooldown = effectiveShootRate;
    // Gun tip offset (32px from center along angle)
    const gunLen = 36;
    const bx = player.x + Math.cos(player.angle) * gunLen;
    const by = player.y + Math.sin(player.angle) * gunLen;
    const speed = 500;
    bullets.push(spawnBullet(bx, by, Math.cos(player.angle) * speed, Math.sin(player.angle) * speed, true));
    emitMuzzleFlash(bx, by, player.angle);
  }
}

function updateSpawning(dt) {
  if (spawnQueue.length === 0) return;
  spawnTimer += dt * 1000;
  while (spawnQueue.length > 0 && spawnTimer >= spawnQueue[0].delay) {
    const entry = spawnQueue.shift();
    enemies.push(spawnEnemy(entry.type));
  }
}

function updateEnemies(dt) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];

    // Animation
    e.animTimer += dt * 1000;
    if (e.animTimer >= 200) {
      e.animTimer = 0;
      e.animFrame = 1 - e.animFrame;
    }

    // Hit flash countdown
    if (e.hitFlash > 0) {
      e.hitFlash -= dt * 1000;
      if (e.hitFlash < 0) e.hitFlash = 0;
    }

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.type === 'grunt') {
      // Direct chase
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;

    } else if (e.type === 'brute') {
      // Chase + separation
      let sx = 0, sy = 0;
      for (let j = 0; j < enemies.length; j++) {
        if (i === j) continue;
        const o = enemies[j];
        const sepDist = circlesDist(e.x, e.y, o.x, o.y);
        const minDist = e.radius + o.radius + 5;
        if (sepDist < minDist && sepDist > 0) {
          sx += (e.x - o.x) / sepDist;
          sy += (e.y - o.y) / sepDist;
        }
      }
      const sepStr = 60;
      e.x += ((dx / dist) * e.speed + sx * sepStr) * dt;
      e.y += ((dy / dist) * e.speed + sy * sepStr) * dt;

    } else if (e.type === 'shooter') {
      // Orbit at ~200px and fire
      const targetDist = 200;
      if (dist > targetDist + 20) {
        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;
      } else if (dist < targetDist - 20) {
        e.x -= (dx / dist) * e.speed * dt;
        e.y -= (dy / dist) * e.speed * dt;
      } else {
        // Orbit: move perpendicular
        const px = -dy / dist;
        const py = dx / dist;
        e.x += px * e.speed * dt;
        e.y += py * e.speed * dt;
      }

      e.shootCooldown -= dt * 1000;
      if (e.shootCooldown <= 0) {
        e.shootCooldown = 2000 + Math.random() * 1000;
        const bDx = player.x - e.x;
        const bDy = player.y - e.y;
        const bDist = Math.sqrt(bDx * bDx + bDy * bDy) || 1;
        const bSpeed = 220;
        bullets.push(spawnBullet(e.x, e.y, (bDx / bDist) * bSpeed, (bDy / bDist) * bSpeed, false));
      }
    }

    // Clamp to canvas
    e.x = Math.max(e.radius, Math.min(LOGICAL_W - e.radius, e.x));
    e.y = Math.max(e.radius, Math.min(LOGICAL_H - e.radius, e.y));
  }

  // Enemy-enemy separation
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const dist = circlesDist(a.x, a.y, b.x, b.y);
      const minDist = a.radius + b.radius;
      if (dist < minDist && dist > 0) {
        const overlap = (minDist - dist) / 2;
        const nx = (a.x - b.x) / dist;
        const ny = (a.y - b.y) / dist;
        a.x += nx * overlap;
        a.y += ny * overlap;
        b.x -= nx * overlap;
        b.y -= ny * overlap;
      }
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt * 1000;
    if (b.life <= 0 || b.x < -50 || b.x > LOGICAL_W + 50 || b.y < -50 || b.y > LOGICAL_H + 50) {
      bullets.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    if (pk.life !== undefined) {
      pk.life -= dt * 1000;
      if (pk.life <= 0) pickups.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt * 1000;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function checkCollisions(dt) {
  // Player bullets vs enemies
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (!b.fromPlayer) continue;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      if (circlesOverlap(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
        emitBulletHit(b.x, b.y);
        e.hp -= b.damage;
        e.hitFlash = 100;
        bullets.splice(bi, 1);
        if (e.hp <= 0) {
          const deathColors = { grunt: '#FF4444', brute: '#FF8833', shooter: '#BB44FF' };
          emitEnemyDeath(e.x, e.y, deathColors[e.type]);
          game.score += e.score;
          enemies.splice(ei, 1);
          // Random bonus drop (25% chance; brutes always drop)
          const dropChance = e.type === 'brute' ? 1.0 : 0.25;
          if (Math.random() < dropChance) {
            const types = ['rapidfire', 'speed', 'shield'];
            const btype = types[Math.floor(Math.random() * types.length)];
            pickups.push({ x: e.x, y: e.y, kind: btype, life: 8000 });
          }
        }
        break;
      }
    }
  }

  // Enemy bullets vs player
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.fromPlayer) continue;
    if (player.invincible > 0) continue;
    if (circlesOverlap(b.x, b.y, b.radius, player.x, player.y, player.radius)) {
      emitBulletHit(b.x, b.y);
      if (player.bonusShield > 0) {
        player.bonusShield = 0;
        emitShieldBreak(player.x, player.y);
      } else {
        player.hp -= b.damage;
      }
      player.invincible = 500;
      bullets.splice(bi, 1);
    }
  }

  // Enemies vs player (contact damage)
  for (const e of enemies) {
    if (circlesOverlap(e.x, e.y, e.radius, player.x, player.y, player.radius)) {
      if (player.invincible <= 0 && e.contactDmg > 0) {
        if (player.bonusShield > 0) {
          player.bonusShield = 0;
          emitShieldBreak(player.x, player.y);
          player.invincible = 800;
        } else {
          player.hp -= e.contactDmg * dt;
          player.invincible = 100;
        }
      }
    }
  }

  // Pickups vs player
  for (let pi = pickups.length - 1; pi >= 0; pi--) {
    const pk = pickups[pi];
    if (circlesOverlap(pk.x, pk.y, 14, player.x, player.y, player.radius)) {
      const col = pickupColor(pk.kind);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 120;
        particles.push(spawnParticle(pk.x, pk.y, Math.cos(a) * spd, Math.sin(a) * spd, 4, col, 450));
      }
      if (pk.kind === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + 25);
      } else if (pk.kind === 'rapidfire') {
        player.bonusRapidFire = 7000;
      } else if (pk.kind === 'speed') {
        player.bonusSpeed = 7000;
      } else if (pk.kind === 'shield') {
        player.bonusShield = 7000;
      }
      pickups.splice(pi, 1);
    }
  }
}

function checkLevelClear() {
  if (spawnQueue.length === 0 && enemies.length === 0 && game.state === 'playing') {
    // Spawn heal pickup at center
    pickups.push({ x: LOGICAL_W / 2, y: LOGICAL_H / 2, sprite: 'heal', palette: 'heal' });

    game.state = 'levelTransition';
    game.transitionTimer = 3000;

    // Check if we completed all 5 levels
    if (game.level >= 5) {
      game.loopCount++;
    }
  }
}

function updateLevelTransition(dt) {
  game.transitionTimer -= dt * 1000;
  if (game.transitionTimer <= 0) {
    const nextLevel = game.level + 1;
    startLevel(nextLevel);
    pickups = [];
    game.state = 'playing';
  }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderBackground() {
  ctx.fillStyle = '#000018';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.strokeStyle = '#001133';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x <= LOGICAL_W; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LOGICAL_H);
    ctx.stroke();
  }
  for (let y = 0; y <= LOGICAL_H; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_W, y);
    ctx.stroke();
  }
}

function renderShadow(x, y, radius) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.8, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderPickups() {
  const t = Date.now() / 500;
  for (const pk of pickups) {
    const bobY = Math.sin(t) * 4;
    const col = pickupColor(pk.kind);
    // Fade out in last 2s
    const alpha = pk.life !== undefined ? Math.min(1, pk.life / 2000) : 1;
    ctx.save();
    ctx.globalAlpha = (0.75 + Math.sin(t * 3) * 0.25) * alpha;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bobY, 14, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    // Inner bright core
    ctx.globalAlpha = (0.9 + Math.sin(t * 3) * 0.1) * alpha;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bobY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Label
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    const labels = { heal: '+HP', rapidfire: 'RFR', speed: 'SPD', shield: 'SHD' };
    ctx.fillText(labels[pk.kind] || '?', pk.x, pk.y + bobY + 3);
    ctx.textAlign = 'left';

    ctx.restore();
  }
}

// Colors per enemy type (outer, mid, core)
const ENEMY_CIRCLE_COLORS = {
  grunt:   ['#881111', '#CC2222', '#FF6666'],
  brute:   ['#883300', '#CC5500', '#FF8844'],
  shooter: ['#550077', '#9900BB', '#DD55FF'],
};

function renderEnemies() {
  for (const e of enemies) {
    renderShadow(e.x, e.y + e.radius * 0.5, e.radius);

    const cols = ENEMY_CIRCLE_COLORS[e.type] || ['#880000', '#CC0000', '#FF4444'];
    const flash = e.hitFlash > 0;

    // Outer ring
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#FFFFFF' : cols[0];
    ctx.fill();

    // Mid ring
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#FFAAAA' : cols[1];
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#FFFFFF' : cols[2];
    ctx.fill();

    // Health bar
    if (e.hp < e.maxHp) {
      const barW = e.radius * 2.2;
      const barH = 4;
      const barX = e.x - barW / 2;
      const barY = e.y - e.radius - 8;
      ctx.fillStyle = '#330000';
      ctx.fillRect(barX, barY, barW, barH);
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#44FF44' : ratio > 0.25 ? '#FFAA00' : '#FF2200';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
  }
}

function renderPlayer() {
  if (player.invincible > 0) {
    const blink = Math.floor(Date.now() / 80) % 2;
    if (blink === 0) return;
  }
  const cy = player.y + player.bobOffset;
  renderShadow(player.x, player.y + player.radius * 0.6, player.radius);

  // Shield ring (outside, pulsing purple)
  if (player.bonusShield > 0) {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 100);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(player.x, cy, player.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#CC88FF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // Outer ring (yellow tint when rapid fire active)
  ctx.beginPath();
  ctx.arc(player.x, cy, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = player.bonusRapidFire > 0 ? '#AA6600' : '#2255AA';
  ctx.fill();

  // Mid ring
  ctx.beginPath();
  ctx.arc(player.x, cy, player.radius * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = player.bonusRapidFire > 0 ? '#FFAA00' : '#4488FF';
  ctx.fill();

  // Bright core (cyan tint when speed active)
  ctx.beginPath();
  ctx.arc(player.x, cy, player.radius * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = player.bonusSpeed > 0 ? '#44FFFF' : '#88BBFF';
  ctx.fill();
}

function renderGun() {
  if (player.invincible > 0) {
    const blink = Math.floor(Date.now() / 80) % 2;
    if (blink === 0) return;
  }
  ctx.save();
  ctx.translate(player.x, player.y + player.bobOffset);
  ctx.rotate(player.angle);

  // Gun body
  ctx.fillStyle = '#334466';
  ctx.fillRect(8, -5, 24, 10);
  // Gun barrel
  ctx.fillStyle = '#4488AA';
  ctx.fillRect(18, -3, 16, 6);
  // Grip
  ctx.fillStyle = '#223355';
  ctx.fillRect(8, 4, 10, 8);

  ctx.restore();
}

function renderBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    // Glow
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    // Bright core
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    const size = p.size * alpha;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderJoystick() {
  if (!touchState.left.active) return;
  const bx = touchState.left.startX;
  const by = touchState.left.startY;
  const dx = touchState.left.x - bx;
  const dy = touchState.left.y - by;
  const len = Math.sqrt(dx * dx + dy * dy);
  const maxR = 45;
  const sx = len > maxR ? bx + (dx / len) * maxR : touchState.left.x;
  const sy = len > maxR ? by + (dy / len) * maxR : touchState.left.y;

  ctx.save();
  // Base ring
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(bx, by, maxR, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Stick
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(sx, sy, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

function renderHUD() {
  // HP bar (bottom-left)
  const barX = 16, barY = LOGICAL_H - 30;
  const barW = 150, barH = 14;
  ctx.fillStyle = '#330000';
  ctx.fillRect(barX, barY, barW, barH);
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  const hpColor = hpRatio > 0.5 ? '#44FF44' : hpRatio > 0.25 ? '#FFAA00' : '#FF2200';
  ctx.fillStyle = hpColor;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '10px monospace';
  ctx.fillText(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, barX + 4, barY + 11);

  // Score (top-right)
  ctx.fillStyle = '#FFEE00';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE: ${game.score}`, LOGICAL_W - 12, 20);
  ctx.textAlign = 'left';

  // Level (top-center)
  ctx.fillStyle = '#88BBFF';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  const lvlIdx = (game.level - 1) % LEVELS.length;
  const lvlLabel = LEVELS[lvlIdx] ? LEVELS[lvlIdx].label : `Level ${game.level}`;
  ctx.fillText(`LEVEL ${game.level}`, LOGICAL_W / 2, 20);
  ctx.fillText(lvlLabel.split('—')[1]?.trim() || '', LOGICAL_W / 2, 36);
  ctx.textAlign = 'left';

  // Enemy count (top-left)
  const remaining = enemies.length + spawnQueue.length;
  ctx.fillStyle = '#FF8888';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`ENEMIES: ${remaining}`, 12, 20);

  // High score
  ctx.fillStyle = '#888888';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`BEST: ${game.highScore}`, LOGICAL_W - 12, 36);
  ctx.textAlign = 'left';

  // Active bonuses (bottom-left, above HP bar)
  const bonuses = [
    { key: 'bonusRapidFire', label: 'RAPID FIRE', color: '#FFDD00' },
    { key: 'bonusSpeed',     label: 'SPEED',      color: '#44DDFF' },
    { key: 'bonusShield',    label: 'SHIELD',      color: '#CC88FF' },
  ];
  let bonusY = LOGICAL_H - 50;
  for (const b of bonuses) {
    const remaining = player[b.key];
    if (remaining <= 0) continue;
    const secs = (remaining / 1000).toFixed(1);
    ctx.fillStyle = b.color;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`${b.label}  ${secs}s`, 16, bonusY);
    bonusY -= 14;
  }

  // Pause hint (bottom-right)
  ctx.fillStyle = '#444466';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('P — pause', LOGICAL_W - 12, LOGICAL_H - 10);
  ctx.textAlign = 'left';
}

function renderMenu() {
  renderBackground();
  ctx.textAlign = 'center';

  // ── Left half (0–390): title + controls ──
  const lx = 195;

  ctx.fillStyle = '#FFEE00';
  ctx.font = 'bold 38px monospace';
  ctx.shadowColor = '#FF8800';
  ctx.shadowBlur = 18;
  ctx.fillText('PIXEL', lx, 110);
  ctx.fillText('ASSAULT', lx, 155);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#88BBFF';
  ctx.font = '13px monospace';
  ctx.fillText('Top-Down Shooter', lx, 185);

  ctx.fillStyle = '#666688';
  ctx.font = '11px monospace';
  ctx.fillText('— CONTROLS —', lx, 230);

  ctx.fillStyle = '#AAAAAA';
  ctx.font = '12px monospace';
  ctx.fillText('WASD / Arrows — Move', lx, 255);
  ctx.fillText('Mouse — Aim', lx, 273);
  ctx.fillText('Left Click — Fire', lx, 291);
  ctx.fillText('P / Esc — Pause', lx, 309);
  ctx.fillText('Survive 5 waves!', lx, 333);

  ctx.fillStyle = '#FFEE00';
  ctx.font = '13px monospace';
  ctx.fillText(`HIGH SCORE: ${game.highScore}`, lx, 375);

  // Blinking prompt
  game.blinkTimer += 16;
  if (game.blinkTimer >= 500) { game.blinkTimer = 0; game.blinkVisible = !game.blinkVisible; }
  if (game.blinkVisible) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('PRESS ENTER TO START', lx, 435);
  }

  // ── Divider ──
  ctx.strokeStyle = '#223366';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(400, 20);
  ctx.lineTo(400, LOGICAL_H - 20);
  ctx.stroke();

  // ── Right half (410–800): leaderboard ──
  const rx = 605;

  ctx.fillStyle = '#FFEE00';
  ctx.font = 'bold 16px monospace';
  ctx.shadowColor = '#AA7700';
  ctx.shadowBlur = 8;
  ctx.fillText('LEADERBOARD', rx, 60);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#554400';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(420, 70);
  ctx.lineTo(790, 70);
  ctx.stroke();

  if (leaderboard.length === 0) {
    ctx.fillStyle = '#555577';
    ctx.font = '13px monospace';
    ctx.fillText(leaderboardLoaded ? 'No scores yet' : 'Loading...', rx, 120);
  } else {
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const y = 98 + i * 44;
      ctx.fillStyle = rankColors[i] || '#CCCCCC';
      ctx.font = `bold ${i < 3 ? 14 : 13}px monospace`;

      // Rank number
      ctx.textAlign = 'right';
      ctx.fillText(`${i + 1}.`, 450, y);

      // Name (truncated to 12 chars)
      ctx.textAlign = 'left';
      ctx.fillText((entry.name || '???').substring(0, 12), 458, y);

      // Score
      ctx.textAlign = 'right';
      ctx.fillText(entry.score.toString(), 790, y);
    }
  }

  ctx.textAlign = 'left';
}

function renderGameOver() {
  renderBackground();

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.fillStyle = '#FF2222';
  ctx.font = 'bold 56px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FF0000';
  ctx.shadowBlur = 25;
  ctx.fillText('GAME OVER', LOGICAL_W / 2, 220);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '22px monospace';
  ctx.fillText(`SCORE: ${game.score}`, LOGICAL_W / 2, 285);

  if (game.score >= game.highScore && game.score > 0) {
    ctx.fillStyle = '#FFEE00';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('NEW HIGH SCORE!', LOGICAL_W / 2, 325);
  } else {
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '16px monospace';
    ctx.fillText(`BEST: ${game.highScore}`, LOGICAL_W / 2, 325);
  }

  ctx.fillStyle = '#88BBFF';
  ctx.font = '14px monospace';
  ctx.fillText(`Reached Level ${game.level}`, LOGICAL_W / 2, 360);

  ctx.textAlign = 'left';
}

function renderLevelTransition() {
  renderBackground();
  renderPickups();
  renderParticles();

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.fillStyle = '#88FFAA';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#00FF44';
  ctx.shadowBlur = 18;
  ctx.fillText('LEVEL COMPLETE!', LOGICAL_W / 2, 230);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#FFEE00';
  ctx.font = '22px monospace';
  ctx.fillText(`SCORE: ${game.score}`, LOGICAL_W / 2, 285);

  const nextLvl = game.level + 1;
  const nextIdx = (nextLvl - 1) % LEVELS.length;
  const nextLabel = LEVELS[nextIdx] ? LEVELS[nextIdx].label : `Level ${nextLvl}`;

  ctx.fillStyle = '#88BBFF';
  ctx.font = '16px monospace';
  ctx.fillText(`Next: ${nextLabel}`, LOGICAL_W / 2, 325);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.fillText('(Grab the health pickup!)', LOGICAL_W / 2, 355);

  const secs = Math.ceil(game.transitionTimer / 1000);
  ctx.fillStyle = '#FFAA44';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(`Starting in ${secs}...`, LOGICAL_W / 2, 410);

  ctx.textAlign = 'left';
}

function renderPaused() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', LOGICAL_W / 2, LOGICAL_H / 2 - 20);

  ctx.fillStyle = '#AAAAAA';
  ctx.font = '16px monospace';
  ctx.fillText('Press P or Escape to resume', LOGICAL_W / 2, LOGICAL_H / 2 + 20);
  ctx.textAlign = 'left';
}

// ============================================================
// GAME LOOP
// ============================================================
let lastTime = 0;
fetchLeaderboard();

function gameLoop(timestamp) {
  let dt = (timestamp - lastTime) / 1000;
  if (dt > 0.05) dt = 0.05; // cap at 50ms
  lastTime = timestamp;

  if (game.state === 'menu') {
    renderMenu();
  } else if (game.state === 'playing') {
    updatePlayer(dt);
    tryShoot();
    updateSpawning(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    checkCollisions(dt);
    checkLevelClear();

    if (player.hp <= 0) {
      if (game.score > game.highScore) {
        game.highScore = game.score;
        localStorage.setItem('pixelAssaultHigh', game.highScore);
      }
      game.state = 'enterName';
      showNameOverlay();
    }

    renderBackground();
    renderPickups();
    renderEnemies();
    renderPlayer();
    renderGun();
    renderBullets();
    renderParticles();
    renderJoystick();
    renderHUD();

  } else if (game.state === 'paused') {
    renderBackground();
    renderPickups();
    renderEnemies();
    renderPlayer();
    renderGun();
    renderBullets();
    renderParticles();
    renderJoystick();
    renderHUD();
    renderPaused();

  } else if (game.state === 'levelTransition') {
    updateLevelTransition(dt);
    updateParticles(dt);
    renderLevelTransition();
  } else if (game.state === 'enterName') {
    renderGameOver();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
