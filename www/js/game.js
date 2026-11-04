// Mélo Pop — moteur de jeu « match-3 », tutoriel et interface.
import { getLevel, LEVEL_COUNT, WORLDS } from "./levels.js";
import { Ads } from "./ads.js";
import { Sound } from "./sound.js";
import { FX, PALETTE } from "./fx.js";
import { ICONS } from "./icons.js";

const VERSION = "2.0.0";
const N = 8;
const GLYPHS = ["♪", "♫", "♩", "♬", "♭", "♯"].map((g) => g + "︎");
const RAINBOW = -1;
const MAX_LIVES = 5;
const LIFE_REGEN_MS = 20 * 60e3;

// Durées des animations (ms) : volontairement posées, pour qu'on voie chaque étape.
const T_SWAP = 270, T_POP = 380, T_FALL_BASE = 200, T_FALL_ROW = 60, T_PAUSE = 110;

const $ = (s, root = document) => root.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (r, c) => r * N + c;
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
const today = () => new Date().toISOString().slice(0, 10);

/* ====================================================================== */
/* Sauvegarde                                                             */
/* ====================================================================== */
const SAVE_KEY = "melopop.v1";
const DEFAULT_SAVE = () => ({
  unlocked: 1, stars: {}, best: {}, lives: MAX_LIVES, livesTs: Date.now(),
  sound: true, music: true, haptics: true, boosters: { hammer: 3, shuffle: 2 },
  lastGift: "", tutorialDone: false, intros: {},
});
const save = (() => {
  const d = DEFAULT_SAVE();
  try { Object.assign(d, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* vide */ }
  d.boosters = { hammer: 3, shuffle: 2, ...d.boosters };
  d.intros = d.intros || {};
  return d;
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* stockage indisponible */ } }

function refreshLives() {
  if (save.lives >= MAX_LIVES) { save.livesTs = Date.now(); return; }
  const gained = Math.floor((Date.now() - save.livesTs) / LIFE_REGEN_MS);
  if (gained > 0) {
    save.lives = Math.min(MAX_LIVES, save.lives + gained);
    save.livesTs += gained * LIFE_REGEN_MS;
    persist();
  }
}
function nextLifeIn() {
  const ms = Math.max(0, LIFE_REGEN_MS - (Date.now() - save.livesTs));
  return `${Math.floor(ms / 60e3)}:${String(Math.floor((ms % 60e3) / 1e3)).padStart(2, "0")}`;
}

/* ====================================================================== */
/* État de la partie                                                      */
/* ====================================================================== */
let level = null;
let grid = [];  // grid[r][c] = tuile | null
let ice = [];   // couches de givre restantes par case
let score = 0, shownScore = 0, moves = 0, combo = 0;
let collected = {};
let busy = false, ended = true, extraMovesUsed = false;
let hintTimer = 0, nextId = 1, cell = 40;
let booster = null; // "hammer" quand le marteau est armé
let tut = null;     // état du tutoriel en cours

const boardEl = () => $("#board");

function gemHtml(color, special) {
  const cls = color === RAINBOW ? "rainbow" : "c" + color;
  return `<div class="gem ${cls}${special ? " sp-" + special : ""}"><i>${color === RAINBOW ? "★" : GLYPHS[color]}</i></div>`;
}
function makeTile(color, special = null) {
  const t = { id: nextId++, color, special, el: document.createElement("div") };
  t.el.className = "tile";
  t.el.innerHTML = `<div class="wrap"></div>`;
  renderTile(t);
  boardEl().appendChild(t.el);
  return t;
}
function renderTile(t) {
  t.el.firstChild.innerHTML = gemHtml(t.color, t.special);
}
function place(t, r, c, dur = T_SWAP) {
  t.el.style.transitionDuration = dur + "ms";
  t.el.style.transform = `translate(${c * cell}px, ${r * cell}px)`;
}
function flash(t, cls, ms) {
  t.el.classList.remove(cls);
  void t.el.offsetWidth;
  t.el.classList.add(cls);
  setTimeout(() => t.el.classList.remove(cls), ms);
}
function cellCenter(r, c) {
  const b = boardEl().getBoundingClientRect();
  return [b.left + (c + 0.5) * cell, b.top + (r + 0.5) * cell];
}
function randColor() { return Math.floor(Math.random() * level.colors); }

/* ---------------------------------------------------------------------- */
/* Détection des alignements                                              */
/* ---------------------------------------------------------------------- */
function colorAt(r, c) {
  const t = inside(r, c) && grid[r][c];
  return t ? t.color : null;
}
/** Alignements de 3+ pour une fonction get(r, c) → couleur | null. */
function runsOf(get) {
  const runs = [];
  for (const horiz of [true, false]) {
    for (let a = 0; a < N; a++) {
      let b = 0;
      while (b < N) {
        const col = horiz ? get(a, b) : get(b, a);
        let e = b + 1;
        while (e < N && col !== null && col !== RAINBOW && (horiz ? get(a, e) : get(e, a)) === col) e++;
        if (col !== null && col !== RAINBOW && e - b >= 3) {
          const cells = [];
          for (let i = b; i < e; i++) cells.push(horiz ? [a, i] : [i, a]);
          runs.push({ dir: horiz ? "h" : "v", cells, color: col });
        }
        b = e;
      }
    }
  }
  return runs;
}
const findRuns = () => runsOf(colorAt);

/** Vrai si poser `color` en (r, c) créerait un alignement avec les voisins existants. */
function wouldMatch(get, r, c, color) {
  const same = (rr, cc) => inside(rr, cc) && get(rr, cc) === color;
  let h = 1, v = 1;
  for (let x = c - 1; same(r, x); x--) h++;
  for (let x = c + 1; same(r, x); x++) h++;
  for (let y = r - 1; same(y, c); y--) v++;
  for (let y = r + 1; same(y, c); y++) v++;
  return h >= 3 || v >= 3;
}
function safeColor(r, c) {
  const options = [];
  for (let k = 0; k < level.colors; k++) if (!wouldMatch(colorAt, r, c, k)) options.push(k);
  return options.length ? options[Math.floor(Math.random() * options.length)] : randColor();
}

function groupRuns(runs) {
  const groups = [];
  for (const run of runs) {
    const ks = new Set(run.cells.map(([r, c]) => key(r, c)));
    const hits = groups.filter((g) => [...ks].some((k) => g.keys.has(k)));
    const merged = { runs: [run], keys: ks };
    for (const g of hits) {
      merged.runs.push(...g.runs);
      g.keys.forEach((k) => merged.keys.add(k));
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  return groups;
}

/** Ce qu'il faut effacer, et les tuiles spéciales à créer. */
function analyseMatches(swapCells) {
  const runs = findRuns();
  if (!runs.length) return null;
  const clear = new Set();
  const creations = [];
  for (const g of groupRuns(runs)) {
    g.keys.forEach((k) => clear.add(k));
    const maxLen = Math.max(...g.runs.map((r) => r.cells.length));
    const hasH = g.runs.some((r) => r.dir === "h"), hasV = g.runs.some((r) => r.dir === "v");
    let special = null;
    if (maxLen >= 5) special = "rainbow";
    else if (hasH && hasV) special = "bomb";
    else if (maxLen === 4) special = g.runs[0].dir;
    if (!special) continue;
    let pos = swapCells && swapCells.find(([r, c]) => g.keys.has(key(r, c)));
    if (!pos && special === "bomb") {
      const counts = {};
      g.runs.forEach((run) => run.cells.forEach(([r, c]) => (counts[key(r, c)] = (counts[key(r, c)] || 0) + 1)));
      const k = Object.keys(counts).find((k) => counts[k] > 1);
      if (k !== undefined) pos = [Math.floor(k / N), k % N];
    }
    if (!pos) {
      const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      pos = longest.cells[Math.floor(longest.cells.length / 2)];
    }
    creations.push({ r: pos[0], c: pos[1], special, color: special === "rainbow" ? RAINBOW : g.runs[0].color, from: [...g.keys] });
  }
  return { clear, creations };
}

/* ---------------------------------------------------------------------- */
/* Effets des tuiles spéciales                                            */
/* ---------------------------------------------------------------------- */
function forEachTile(fn) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) fn(grid[r][c], r, c);
}
function mostCommonColor() {
  const n = {};
  forEachTile((t) => { if (t.color !== RAINBOW) n[t.color] = (n[t.color] || 0) + 1; });
  const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  return best === undefined ? 0 : +best;
}
function area(r, c, rad, out) {
  for (let i = r - rad; i <= r + rad; i++) for (let j = c - rad; j <= c + rad; j++) if (inside(i, j)) out.push([i, j]);
}
function effectCells(t, r, c) {
  const out = [];
  if (t.special === "h") { for (let i = 0; i < N; i++) out.push([r, i]); beam("h", r, t.color); Sound.special(); }
  else if (t.special === "v") { for (let i = 0; i < N; i++) out.push([i, c]); beam("v", c, t.color); Sound.special(); }
  else if (t.special === "bomb") { area(r, c, 1, out); blast(r, c, 1); Sound.boom(); shake(); }
  else if (t.special === "rainbow") {
    const col = mostCommonColor();
    forEachTile((u, rr, cc) => { if (u.color === col) { out.push([rr, cc]); zap(r, c, rr, cc, col); } });
    Sound.special();
  }
  return out;
}
/** Étend l'ensemble effacé en déclenchant les tuiles spéciales touchées. */
function expand(set) {
  const queue = [...set];
  while (queue.length) {
    const k = queue.pop();
    const r = Math.floor(k / N), c = k % N;
    const t = grid[r][c];
    if (!t || !t.special || t.triggered) continue;
    t.triggered = true;
    for (const [rr, cc] of effectCells(t, r, c)) {
      const kk = key(rr, cc);
      if (!set.has(kk)) { set.add(kk); queue.push(kk); }
    }
  }
  return set;
}

/* Effets visuels sur le plateau */
function beam(dir, i, color) {
  const b = document.createElement("div");
  b.className = "beam beam-" + dir;
  b.style.setProperty("--beam", color >= 0 ? PALETTE[color] : "#fff");
  if (dir === "h") b.style.top = i * cell + "px"; else b.style.left = i * cell + "px";
  boardEl().appendChild(b);
  setTimeout(() => b.remove(), 700);
}
function blast(r, c, rad) {
  const b = document.createElement("div");
  b.className = "blast";
  const s = (rad * 2 + 1) * cell;
  Object.assign(b.style, { width: s + "px", height: s + "px", left: (c - rad) * cell + "px", top: (r - rad) * cell + "px" });
  boardEl().appendChild(b);
  setTimeout(() => b.remove(), 700);
}
function zap(r1, c1, r2, c2, col) {
  const z = document.createElement("div");
  z.className = "zap";
  const dx = (c2 - c1) * cell, dy = (r2 - r1) * cell;
  Object.assign(z.style, {
    left: (c1 + 0.5) * cell + "px", top: (r1 + 0.5) * cell + "px",
    width: Math.hypot(dx, dy) + "px", transform: `rotate(${Math.atan2(dy, dx)}rad)`,
  });
  z.style.setProperty("--beam", PALETTE[col]);
  boardEl().appendChild(z);
  setTimeout(() => z.remove(), 600);
}
function shake() {
  const w = $(".board-wrap");
  w.classList.remove("shake"); void w.offsetWidth; w.classList.add("shake");
}
function floatText(text, r, c, big = false) {
  const f = document.createElement("div");
  f.className = "float" + (big ? " big" : "");
  f.textContent = text;
  Object.assign(f.style, { left: (c + 0.5) * cell + "px", top: (r + 0.3) * cell + "px" });
  boardEl().appendChild(f);
  setTimeout(() => f.remove(), 1100);
}
function banner(text, cls = "") {
  const el = $("#cheer");
  el.textContent = text;
  el.className = cls;
  void el.offsetWidth;
  el.classList.add("show");
}

/* ---------------------------------------------------------------------- */
/* Effacement, gravité, cascades                                          */
/* ---------------------------------------------------------------------- */
async function clearCells(set, creations = []) {
  expand(set);
  let gained = 0, sumR = 0, sumC = 0, n = 0;
  // Les notes qui forment une tuile spéciale glissent vers sa case avant de disparaître.
  const target = {};
  for (const cr of creations) for (const k of cr.from) target[k] = [cr.r, cr.c];
  for (const k of set) {
    const r = Math.floor(k / N), c = k % N;
    const t = grid[r][c];
    if (ice[r][c] > 0) { ice[r][c]--; renderIce(r, c, true); }
    if (!t) continue;
    if (t.color !== RAINBOW && level.collect[t.color] !== undefined) {
      collected[t.color] = (collected[t.color] || 0) + 1;
      flyToGoal(t.color, r, c);
    }
    gained += t.special ? 150 : 60;
    sumR += r; sumC += c; n++;
    const el = t.el;
    if (target[k]) {
      place(t, target[k][0], target[k][1], 220);
      el.classList.add("merge");
    } else {
      const delay = Math.random() * 70;
      setTimeout(() => {
        el.classList.add("pop");
        const [x, y] = cellCenter(r, c);
        FX.burst(x, y, t.color >= 0 ? PALETTE[t.color] : "#ffffff", { count: t.special ? 18 : 9, power: t.special ? 1.4 : 1 });
      }, delay);
    }
    setTimeout(() => el.remove(), T_POP + 120);
    grid[r][c] = null;
  }
  const points = gained * Math.max(1, combo);
  score += points;
  if (n) floatText("+" + fmt(points), sumR / n, sumC / n, points >= 1000);
  updateHud();
  await sleep(creations.length ? 240 : 0);
  for (const cr of creations) {
    if (grid[cr.r][cr.c]) continue;
    const t = makeTile(cr.color, cr.special);
    place(t, cr.r, cr.c, 0);
    flash(t, "born", 600);
    grid[cr.r][cr.c] = t;
    const [x, y] = cellCenter(cr.r, cr.c);
    FX.sparkle(x, y, 14);
  }
  if (creations.length) Sound.star();
  await sleep(T_POP);
}

async function gravity() {
  let longest = 0;
  const landed = [];
  for (let c = 0; c < N; c++) {
    let write = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      const t = grid[r][c];
      if (!t) continue;
      if (r !== write) {
        grid[write][c] = t; grid[r][c] = null;
        const d = T_FALL_BASE + T_FALL_ROW * (write - r);
        place(t, write, c, d);
        landed.push([t, d]);
        longest = Math.max(longest, d);
      }
      write--;
    }
    const missing = write + 1;
    const spawned = [];
    for (let r = write; r >= 0; r--) {
      const col = tut ? safeColor(r, c) : randColor();
      const t = makeTile(col);
      place(t, r - missing - 0.3, c, 0); // part au-dessus du plateau
      grid[r][c] = t;
      spawned.push([t, r]);
    }
    if (spawned.length) {
      boardEl().getBoundingClientRect();
      for (const [t, r] of spawned) {
        const d = T_FALL_BASE + T_FALL_ROW * (missing + 0.3);
        place(t, r, c, d);
        landed.push([t, d]);
        longest = Math.max(longest, d);
      }
    }
  }
  for (const [t, d] of landed) setTimeout(() => flash(t, "land", 320), d);
  await sleep(longest + 60);
}

async function cascade(swapCells) {
  combo = 0;
  for (;;) {
    const res = analyseMatches(swapCells);
    if (!res) break;
    combo++;
    Sound.match(combo);
    if (combo >= 3) cheer(combo);
    await clearCells(res.clear, res.creations);
    await gravity();
    await sleep(T_PAUSE);
    swapCells = null;
  }
  if (!findMove()) await shuffle(false);
}

function cheer(n) {
  const words = ["", "", "", "Joli !", "Super !", "Magnifique !", "Virtuose !", "Maestro !"];
  banner(words[Math.min(n, words.length - 1)]);
}

/* ---------------------------------------------------------------------- */
/* Coups possibles, indice, mélange                                       */
/* ---------------------------------------------------------------------- */
function swapInGrid(a, b) {
  const t = grid[a[0]][a[1]];
  grid[a[0]][a[1]] = grid[b[0]][b[1]];
  grid[b[0]][b[1]] = t;
}
function findMove() {
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const a = [r, c], b = [r + dr, c + dc];
        if (!inside(b[0], b[1])) continue;
        const ta = grid[r][c], tb = grid[b[0]][b[1]];
        if (!ta || !tb) continue;
        if (ta.color === RAINBOW || tb.color === RAINBOW || (ta.special && tb.special)) return [a, b];
        swapInGrid(a, b);
        const ok = findRuns().length > 0;
        swapInGrid(a, b);
        if (ok) return [a, b];
      }
  return null;
}

async function shuffle(manual) {
  banner(manual ? "Mélange !" : "Plus de coup possible : mélange !", manual ? "" : "small");
  for (let tries = 0; tries < 60; tries++) {
    const normals = [];
    forEachTile((t) => { if (!t.special) normals.push(t); });
    const colors = normals.map((t) => t.color);
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    normals.forEach((t, i) => (t.color = colors[i]));
    if (!findRuns().length && findMove()) break;
    if (tries === 59) normals.forEach((t) => (t.color = randColor()));
  }
  // Les notes s'envolent vers le centre puis reviennent à leur place.
  forEachTile((t) => place(t, 3.5, 3.5, 320));
  await sleep(360);
  forEachTile((t, r, c) => { renderTile(t); place(t, r, c, 420); });
  await sleep(480);
  if (findRuns().length) await cascade(null);
}

function clearHint() {
  clearTimeout(hintTimer);
  document.querySelectorAll(".tile.hint").forEach((e) => e.classList.remove("hint"));
}
function scheduleHint() {
  clearHint();
  if (ended || tut) return;
  hintTimer = setTimeout(() => {
    if (busy || ended || tut) return;
    const m = findMove();
    if (m) m.forEach(([r, c]) => grid[r][c] && grid[r][c].el.classList.add("hint"));
  }, 7000);
}

/* ---------------------------------------------------------------------- */
/* Échange joué par le joueur                                             */
/* ---------------------------------------------------------------------- */
async function trySwap(a, b) {
  if (busy || ended || !inside(b[0], b[1])) return;
  const ta = grid[a[0]][a[1]], tb = grid[b[0]][b[1]];
  if (!ta || !tb) return;
  if (tut && !tut.accepts(a, b)) { flash(ta, "nope", 400); Sound.bad(); return; }
  busy = true;
  clearHint();
  Sound.swap();
  swapInGrid(a, b);
  place(ta, b[0], b[1]); place(tb, a[0], a[1]);
  await sleep(T_SWAP);

  const both = ta.color === RAINBOW || tb.color === RAINBOW || (ta.special && tb.special);
  if (both) {
    moves--; updateHud();
    await specialCombo(ta, tb, b);
    await gravity();
    await cascade(null);
  } else if (findRuns().length) {
    moves--; updateHud();
    await cascade([a, b]);
  } else {
    Sound.bad();
    swapInGrid(a, b);
    place(ta, a[0], a[1]); place(tb, b[0], b[1]);
    await sleep(T_SWAP);
    flash(ta, "nope", 400); flash(tb, "nope", 400);
    busy = false;
    scheduleHint();
    return;
  }
  busy = false;
  if (tut) await tut.done();
  checkEnd();
  scheduleHint();
}

/** Deux tuiles spéciales échangées l'une avec l'autre (ou une étoile avec une note). */
async function specialCombo(ta, tb, at) {
  combo = 1;
  const [r, c] = at;
  const set = new Set();
  ta.triggered = tb.triggered = true;
  forEachTile((u, rr, cc) => { if (u === ta || u === tb) set.add(key(rr, cc)); });
  const rainbow = ta.color === RAINBOW ? ta : tb.color === RAINBOW ? tb : null;
  const other = rainbow === ta ? tb : ta;
  Sound.special();

  if (rainbow && other.color === RAINBOW) {
    banner("Fortissimo !");
    forEachTile((t, rr, cc) => set.add(key(rr, cc)));
    blast(3.5, 3.5, 4); shake(); Sound.boom();
  } else if (rainbow) {
    const col = other.color;
    forEachTile((t, rr, cc) => {
      if (t.color !== col || t === other) return;
      if (other.special) { t.special = other.special === "bomb" ? "bomb" : Math.random() < 0.5 ? "h" : "v"; renderTile(t); }
      t.el.classList.add("glow");
      zap(r, c, rr, cc, col);
      set.add(key(rr, cc));
    });
    await sleep(other.special ? 650 : 350);
  } else {
    const kinds = [ta.special, tb.special];
    const out = [];
    if (kinds.includes("bomb") && (kinds.includes("h") || kinds.includes("v"))) {
      for (let d = -1; d <= 1; d++) {
        for (let i = 0; i < N; i++) { if (inside(r + d, i)) out.push([r + d, i]); if (inside(i, c + d)) out.push([i, c + d]); }
        if (inside(r + d, 0)) beam("h", r + d, ta.color);
        if (inside(0, c + d)) beam("v", c + d, ta.color);
      }
      shake();
    } else if (kinds[0] === "bomb" && kinds[1] === "bomb") {
      area(r, c, 2, out); blast(r, c, 2); shake(); Sound.boom();
    } else {
      for (let i = 0; i < N; i++) { out.push([r, i]); out.push([i, c]); }
      beam("h", r, ta.color); beam("v", c, tb.color);
    }
    out.forEach(([rr, cc]) => set.add(key(rr, cc)));
  }
  await clearCells(set);
}

/* ---------------------------------------------------------------------- */
/* Bonus : marteau et mélange                                             */
/* ---------------------------------------------------------------------- */
async function useHammer(r, c) {
  booster = null;
  updateBoosters();
  save.boosters.hammer--; persist(); updateBoosters();
  busy = true;
  clearHint();
  const t = grid[r][c];
  if (t) flash(t, "smash", 300);
  await sleep(200);
  Sound.boom(); shake();
  combo = 1;
  await clearCells(new Set([key(r, c)]));
  await gravity();
  await cascade(null);
  busy = false;
  checkEnd();
  scheduleHint();
}

async function onBooster(kind) {
  if (busy || ended || tut) return;
  Sound.tap();
  if (save.boosters[kind] <= 0) {
    const label = kind === "hammer" ? "Marteau" : "Mélange";
    modal(`<div class="modal-icon">${ICONS[kind]}</div><h2>${label}</h2>
      <p>Tu n'en as plus. Regarde une courte vidéo pour en obtenir un.</p>
      <button class="btn big reward" data-act="reward">${ICONS.video} Obtenir 1 ${label.toLowerCase()}</button>
      <button class="btn ghost" data-act="close">Non merci</button>`, async (act) => {
      if (act === "reward" && (await Ads.rewarded())) {
        save.boosters[kind]++; persist(); updateBoosters();
        Sound.gift();
      }
    });
    return;
  }
  if (kind === "hammer") {
    booster = booster === "hammer" ? null : "hammer";
    updateBoosters();
    if (booster) banner("Touche une note à casser", "small");
  } else {
    save.boosters.shuffle--; persist(); updateBoosters();
    busy = true;
    await shuffle(true);
    busy = false;
    scheduleHint();
  }
}
function updateBoosters() {
  for (const k of ["hammer", "shuffle"]) {
    const b = document.querySelector(`[data-booster="${k}"]`);
    if (!b) continue;
    const n = save.boosters[k];
    b.querySelector(".count").textContent = n > 0 ? n : "+";
    b.classList.toggle("empty", n <= 0);
    b.classList.toggle("armed", booster === k);
  }
  boardEl().classList.toggle("aim", booster === "hammer");
}

/* ---------------------------------------------------------------------- */
/* Saisie : glisser, ou toucher deux notes voisines                       */
/* ---------------------------------------------------------------------- */
let drag = null, selected = null;

function cellFromEvent(e) {
  const rect = boardEl().getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left) / cell), r = Math.floor((e.clientY - rect.top) / cell);
  return inside(r, c) ? [r, c] : null;
}
function setSelected(p) {
  document.querySelectorAll(".tile.selected").forEach((e) => e.classList.remove("selected"));
  selected = p;
  if (p && grid[p[0]][p[1]]) { grid[p[0]][p[1]].el.classList.add("selected"); Sound.tap(); }
}
function bindInput() {
  const b = boardEl();
  b.addEventListener("pointerdown", (e) => {
    Sound.unlock();
    if (busy || ended) return;
    const p = cellFromEvent(e);
    if (!p) return;
    if (booster === "hammer") { useHammer(p[0], p[1]); return; }
    drag = { p, x: e.clientX, y: e.clientY, done: false };
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });
  b.addEventListener("pointermove", (e) => {
    if (!drag || drag.done) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.3) return;
    drag.done = true;
    const [r, c] = drag.p;
    const target = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    setSelected(null);
    trySwap(drag.p, target);
  });
  b.addEventListener("pointerup", () => {
    if (!drag) return;
    if (!drag.done) {
      const p = drag.p;
      if (selected && Math.abs(selected[0] - p[0]) + Math.abs(selected[1] - p[1]) === 1) {
        const s = selected; setSelected(null); trySwap(s, p);
      } else if (selected && selected[0] === p[0] && selected[1] === p[1]) setSelected(null);
      else setSelected(p);
    }
    drag = null;
  });
  b.addEventListener("pointercancel", () => (drag = null));
}

/* ====================================================================== */
/* Tutoriel interactif (niveau 1)                                         */
/* ====================================================================== */
// Plateau du tutoriel : couleurs imposées pour 3 coups guidés, le reste est tiré au hasard
// puis vérifié par simulation pour que chaque étape se passe exactement comme prévu.
const TUT_FIXED = {
  "6,0": 0, "6,1": 0, "5,2": 0, "6,2": 1,                       // étape 1 : aligner 3
  "3,4": 2, "3,5": 2, "3,7": 2, "2,6": 2, "3,6": 3,              // étape 2 : aligner 4 → ligne
  "4,6": 2, "5,5": 2, "5,6": 1,                                  // étape 3 : déclencher la ligne
};
function tutorialColors() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const g = Array.from({ length: N }, () => Array(N).fill(null));
    const get = (r, c) => (inside(r, c) ? g[r][c] : null);
    for (const [k, v] of Object.entries(TUT_FIXED)) { const [r, c] = k.split(",").map(Number); g[r][c] = v; }
    let ok = true;
    for (let r = 0; r < N && ok; r++)
      for (let c = 0; c < N; c++) {
        if (g[r][c] !== null) continue;
        const opts = [0, 1, 2, 3].filter((k) => !wouldMatch(get, r, c, k));
        if (!opts.length) { ok = false; break; }
        g[r][c] = opts[Math.floor(Math.random() * opts.length)];
      }
    if (!ok || runsOf(get).length) continue;
    if (simulateTutorial(g)) return g;
  }
  return null;
}
function simulateTutorial(g0) {
  const g = g0.map((row) => row.slice());
  const get = (r, c) => (inside(r, c) ? g[r][c] : null);
  const sw = (a, b) => { const t = g[a[0]][a[1]]; g[a[0]][a[1]] = g[b[0]][b[1]]; g[b[0]][b[1]] = t; };
  const fall = () => {
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = N - 1; r >= 0; r--) if (g[r][c] !== null) col.push(g[r][c]);
      for (let r = N - 1, i = 0; r >= 0; r--, i++) g[r][c] = i < col.length ? col[i] : null;
    }
  };
  // Étape 1
  sw([5, 2], [6, 2]);
  let runs = runsOf(get);
  if (runs.length !== 1 || runs[0].cells.length !== 3) return false;
  runs[0].cells.forEach(([r, c]) => (g[r][c] = null));
  fall();
  if (runsOf(get).length) return false;
  // Étape 2
  sw([2, 6], [3, 6]);
  runs = runsOf(get);
  if (runs.length !== 1 || runs[0].cells.length !== 4 || runs[0].dir !== "h") return false;
  runs[0].cells.forEach(([r, c]) => (g[r][c] = r === 3 && c === 6 ? 2 : null));
  fall();
  if (runsOf(get).length) return false;
  // Étape 3
  if (g[3][6] !== 2 || g[4][6] !== 2) return false;
  sw([5, 5], [5, 6]);
  runs = runsOf(get);
  return runs.length === 1 && runs[0].dir === "v" && runs[0].cells.some(([r, c]) => r === 3 && c === 6);
}

function tutLayer() { return $("#tut"); }
function spotlight(rect, round = false) {
  const s = $("#tut-spot");
  if (!rect) { s.hidden = true; return; }
  s.hidden = false;
  const pad = 6;
  Object.assign(s.style, {
    left: rect.left - pad + "px", top: rect.top - pad + "px",
    width: rect.width + pad * 2 + "px", height: rect.height + pad * 2 + "px",
  });
  s.classList.toggle("round", round);
}
function cellsRect(cells) {
  const b = boardEl().getBoundingClientRect();
  const rs = cells.map((p) => p[0]), cs = cells.map((p) => p[1]);
  const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
  return { left: b.left + c0 * cell, top: b.top + r0 * cell, width: (c1 - c0 + 1) * cell, height: (r1 - r0 + 1) * cell };
}
function showHand(from, to) {
  const h = $("#tut-hand");
  if (!from) { h.hidden = true; return; }
  const [x1, y1] = cellCenter(...from), [x2, y2] = cellCenter(...to);
  h.hidden = false;
  h.style.left = x1 + "px"; h.style.top = y1 + "px";
  h.style.setProperty("--dx", x2 - x1 + "px");
  h.style.setProperty("--dy", y2 - y1 + "px");
}
/** Bulle d'explication. Si `button` est donné, attend que le joueur appuie. */
function bubble(html, { near, button } = {}) {
  const bb = $("#tut-bubble");
  bb.innerHTML = `<div class="tut-text">${html}</div>${button ? `<button class="btn big small-btn" id="tut-ok">${button}</button>` : ""}`;
  bb.hidden = false;
  // Au-dessus ou en dessous de la zone mise en valeur.
  const H = innerHeight;
  if (near && near.top > H * 0.45) { bb.style.top = ""; bb.style.bottom = H - near.top + 18 + "px"; }
  else { bb.style.bottom = ""; bb.style.top = (near ? near.top + near.height : H * 0.3) + 18 + "px"; }
  bb.classList.remove("in"); void bb.offsetWidth; bb.classList.add("in");
  if (!button) return Promise.resolve();
  return new Promise((res) => { $("#tut-ok").onclick = () => { Sound.tap(); res(); }; });
}

async function runTutorial() {
  const layer = tutLayer();
  layer.hidden = false;
  const steps = [
    { move: [[5, 2], [6, 2]], text: "Fais glisser cette note vers le bas pour aligner <b>3 notes identiques</b>." },
    { info: "hud" },
    { move: [[2, 6], [3, 6]], text: "Aligne <b>4 notes</b> d'un coup pour créer une note spéciale." },
    { info: "line" },
    { move: [[5, 5], [5, 6]], text: "Aligne la note rayée avec deux notes de sa couleur pour la déclencher." },
    { info: "end" },
  ];
  let resolveMove = null;
  tut = {
    allowed: null,
    accepts(a, b) {
      if (!this.allowed) return false;
      const [x, y] = this.allowed;
      const same = (p, q) => p[0] === q[0] && p[1] === q[1];
      return (same(a, x) && same(b, y)) || (same(a, y) && same(b, x));
    },
    async done() { if (resolveMove) { const r = resolveMove; resolveMove = null; r(); } },
  };
  for (const st of steps) {
    if (st.move) {
      tut.allowed = st.move;
      const rect = cellsRect(st.move);
      spotlight(rect);
      showHand(...st.move);
      bubble(st.text, { near: rect });
      await new Promise((r) => (resolveMove = r));
      tut.allowed = null;
      showHand(null);
    } else if (st.info === "hud") {
      const rect = $(".hud").getBoundingClientRect();
      spotlight(rect);
      await bubble("Bravo ! Chaque alignement rapporte des points.<br>Atteins l'<b>objectif</b> avant d'avoir utilisé tous tes <b>coups</b>.", { near: rect, button: "Compris" });
    } else if (st.info === "line") {
      const rect = cellsRect([[3, 6]]);
      spotlight(rect, true);
      await bubble("Voici une <b>note rayée</b> ! Quand elle est déclenchée, elle efface toute sa rangée.", { near: rect, button: "Suite" });
    } else if (st.info === "end") {
      spotlight(null);
      await bubble(`Excellent ! Pense aussi à :<ul class="tut-list">
        <li>${gemHtml(4, "bomb")} aligner en <b>L ou en T</b> → une bombe ;</li>
        <li>${gemHtml(RAINBOW)} aligner <b>5 notes</b> → une étoile qui efface toute une couleur.</li></ul>
        À toi de jouer !`, { button: "Jouer" });
    }
  }
  layer.hidden = true;
  $("#tut-bubble").hidden = true;
  tut = null;
  save.tutorialDone = true;
  persist();
  scheduleHint();
  checkEnd();
}

/* ====================================================================== */
/* Interface : HUD, objectifs                                             */
/* ====================================================================== */
const STAR_STEPS = [1, 1.5, 2.2];
function starsFor(s) { return STAR_STEPS.filter((m) => s >= level.target * m).length; }

function goalsDone() {
  const collectOk = Object.entries(level.collect).every(([col, n]) => (collected[col] || 0) >= n);
  const iceOk = ice.every((row) => row.every((v) => v === 0));
  return collectOk && iceOk;
}
const hasSideGoals = () => Object.keys(level.collect).length > 0 || level.ice.length > 0;

function goalChips(lv, withProgress) {
  const out = [];
  for (const [col, n] of Object.entries(lv.collect)) {
    const left = withProgress ? Math.max(0, n - (collected[col] || 0)) : n;
    out.push(`<div class="goal ${left ? "" : "done"}" data-goal="${col}"><span class="mini">${gemHtml(+col)}</span><b>${left || "✓"}</b></div>`);
  }
  if (lv.ice.length) {
    const left = withProgress ? ice.flat().filter((v) => v > 0).length : lv.ice.length;
    out.push(`<div class="goal ${left ? "" : "done"}"><span class="mini ice-mini">❄︎</span><b>${left || "✓"}</b></div>`);
  }
  if (!Object.keys(lv.collect).length && !lv.ice.length) {
    const done = withProgress && score >= lv.target;
    out.push(`<div class="goal ${done ? "done" : ""}"><span class="mini star-mini">${ICONS.star}</span><b>${done ? "✓" : fmt(lv.target)}</b></div>`);
  }
  return out.join("");
}

let scoreAnim = 0;
function updateHud() {
  $("#moves").textContent = Math.max(0, moves);
  $("#moves-badge").classList.toggle("low", moves <= 5 && !ended);
  $("#goals").innerHTML = goalChips(level, true);
  const pct = Math.min(100, (score / (level.target * STAR_STEPS[2])) * 100);
  $("#progress-fill").style.width = pct + "%";
  document.querySelectorAll(".progress i").forEach((el, i) => el.classList.toggle("on", score >= level.target * STAR_STEPS[i]));
  // Le score défile jusqu'à sa nouvelle valeur.
  cancelAnimationFrame(scoreAnim);
  const from = shownScore, to = score, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 500);
    shownScore = from + (to - from) * (1 - Math.pow(1 - k, 3));
    $("#score").textContent = fmt(shownScore);
    if (k < 1) scoreAnim = requestAnimationFrame(step);
  };
  scoreAnim = requestAnimationFrame(step);
}

function flyToGoal(color, r, c) {
  const goal = document.querySelector(`[data-goal="${color}"] .mini`);
  if (!goal) return;
  const [x, y] = cellCenter(r, c);
  const g = goal.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "flyer";
  f.innerHTML = gemHtml(color);
  Object.assign(f.style, { left: x + "px", top: y + "px", width: cell * 0.7 + "px", height: cell * 0.7 + "px" });
  document.body.appendChild(f);
  requestAnimationFrame(() => {
    f.style.transform = `translate(${g.left + g.width / 2 - x}px, ${g.top + g.height / 2 - y}px) scale(.5)`;
    f.style.opacity = "0.2";
  });
  setTimeout(() => f.remove(), 700);
}

function renderIce(r, c, cracked = false) {
  const el = document.getElementById(`ice-${r}-${c}`);
  if (!el) return;
  el.className = "ice" + (ice[r][c] ? " l" + ice[r][c] : "");
  if (cracked) {
    const [x, y] = cellCenter(r, c);
    FX.burst(x, y, "#d8f3ff", { count: 6, power: 0.7 });
  }
}

function layout() {
  const b = boardEl();
  cell = b.clientWidth / N;
  b.style.setProperty("--cell", cell + "px");
  if (grid.length) forEachTile((t, r, c) => place(t, r, c, 0));
}
const pct = (i) => (i * 100) / N + "%";

/* ====================================================================== */
/* Déroulé d'un niveau                                                    */
/* ====================================================================== */
function worldOf(index) { return WORLDS[Math.min(WORLDS.length - 1, Math.floor(index / 10))]; }

function levelCard(index) {
  refreshLives();
  if (save.lives <= 0) { showNoLives(index); return; }
  const lv = getLevel(index);
  const st = save.stars[index] || 0;
  modal(`<small class="eyebrow">${worldOf(index).name}</small><h2>Niveau ${lv.number}</h2>
    <div class="stars small">${[1, 2, 3].map((n) => `<span class="star ${n <= st ? "on" : ""}">${ICONS.star}</span>`).join("")}</div>
    <p class="muted">Objectif en ${lv.moves} coups</p>
    <div class="goals-card">${goalChips(lv, false)}</div>
    ${save.best[index] ? `<p class="muted">Meilleur score : ${fmt(save.best[index])}</p>` : ""}
    <button class="btn big" data-act="play">${ICONS.play} Jouer</button>
    <button class="btn ghost" data-act="close">Retour</button>`, (act) => { if (act === "play") startLevel(index); });
}

async function startLevel(index, { replayTutorial = false } = {}) {
  refreshLives();
  if (save.lives <= 0) { showNoLives(index); return; }
  level = getLevel(index);
  score = 0; shownScore = 0; moves = level.moves; collected = {}; ended = false; busy = true; extraMovesUsed = false;
  booster = null;
  FX.setHue(worldOf(index).hue);
  await showScreen("game");
  Ads.hideBanner();
  const b = boardEl();
  b.innerHTML = "";
  $("#level-title").textContent = "Niveau " + level.number;
  layout();
  ice = Array.from({ length: N }, () => Array(N).fill(0));
  for (const [r, c, l] of level.ice) ice[r][c] = l;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const bg = document.createElement("div");
      bg.className = "cellbg" + ((r + c) % 2 ? " alt" : "");
      bg.style.left = pct(c); bg.style.top = pct(r);
      b.appendChild(bg);
      const ie = document.createElement("div");
      ie.id = `ice-${r}-${c}`;
      ie.style.left = pct(c); ie.style.top = pct(r);
      b.appendChild(ie);
      renderIce(r, c);
    }
  const withTutorial = level.tutorial && (!save.tutorialDone || replayTutorial);
  const preset = withTutorial ? tutorialColors() : null;
  // Plateau de départ sans alignement, avec au moins un coup possible.
  do {
    b.querySelectorAll(".tile").forEach((e) => e.remove());
    grid = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        let col;
        if (preset) col = preset[r][c];
        else do col = randColor(); while (wouldMatch(colorAt, r, c, col));
        const t = makeTile(col);
        place(t, r - N - 1, c, 0);
        grid[r][c] = t;
      }
  } while (!findMove());
  updateBoosters();
  updateHud();
  b.getBoundingClientRect();
  // Les notes tombent en cascade, colonne après colonne.
  forEachTile((t, r, c) => {
    t.el.style.transitionDelay = c * 45 + (N - r) * 35 + "ms";
    place(t, r, c, 620);
  });
  await sleep(1150);
  forEachTile((t) => (t.el.style.transitionDelay = ""));
  busy = false;

  if (withTutorial && preset) { runTutorial(); return; }
  if (level.intro && !save.intros[level.intro]) {
    await introCard(level.intro);
    save.intros[level.intro] = true; persist();
  } else {
    banner(objectiveText(level), "small");
  }
  scheduleHint();
}

function objectiveText(lv) {
  if (Object.keys(lv.collect).length) return "Récolte les notes !";
  if (lv.ice.length) return "Dégèle toutes les cases !";
  return `Objectif : ${fmt(lv.target)} points`;
}

const INTROS = {
  collect: {
    title: "Récolte",
    art: () => `<div class="demo">${[0, 0, 0].map((c) => gemHtml(c)).join("")}</div>`,
    text: "Fais disparaître le nombre de notes demandé dans chaque couleur. Le compteur en haut diminue à chaque note récoltée.",
  },
  bomb: {
    title: "La bombe",
    art: () => `<div class="demo l-shape"><span>${gemHtml(1)}</span><span>${gemHtml(1)}</span><span>${gemHtml(1)}</span><span>${gemHtml(1)}</span><span>${gemHtml(1)}</span></div><div class="demo arrow">→ ${gemHtml(1, "bomb")}</div>`,
    text: "Aligne 5 notes en forme de <b>L</b> ou de <b>T</b> : tu obtiens une bombe qui efface toutes les notes autour d'elle.",
  },
  ice: {
    title: "Le givre",
    art: () => `<div class="demo"><span class="ice-demo">${gemHtml(3)}</span><span class="ice-demo">${gemHtml(4)}</span></div>`,
    text: "Certaines cases sont givrées. Fais un alignement <b>sur</b> ces cases pour les dégeler. Il faut toutes les libérer pour gagner.",
  },
  star: {
    title: "L'étoile",
    art: () => `<div class="demo">${[5, 5, 5, 5, 5].map((c) => gemHtml(c)).join("")}</div><div class="demo arrow">→ ${gemHtml(RAINBOW)}</div>`,
    text: "Aligne <b>5 notes</b> en ligne droite pour créer une étoile. Échange-la avec une note : toutes les notes de cette couleur disparaissent !",
  },
  combo: {
    title: "Les combinaisons",
    art: () => `<div class="demo">${gemHtml(0, "h")}<b>+</b>${gemHtml(2, "bomb")}</div>`,
    text: "Échange <b>deux notes spéciales</b> entre elles pour un effet géant. Essaie étoile + étoile pour vider tout le plateau !",
  },
  ice2: {
    title: "Givre épais",
    art: () => `<div class="demo"><span class="ice-demo thick">${gemHtml(4)}</span></div>`,
    text: "Le givre épais demande <b>deux</b> alignements sur la même case pour fondre complètement.",
  },
};
function introCard(id) {
  const it = INTROS[id];
  return new Promise((res) =>
    modal(`<small class="eyebrow">Nouveau !</small><h2>${it.title}</h2><div class="intro-art">${it.art()}</div><p>${it.text}</p>
      <button class="btn big" data-act="close">Compris !</button>`, res));
}

async function checkEnd() {
  if (ended || tut) return;
  const won = goalsDone() && score >= level.target;
  if ((hasSideGoals() && won) || moves <= 0) {
    ended = true;
    clearHint();
    updateHud();
    if (won) { await finale(); onWin(); } else { await sleep(500); onOutOfMoves(); }
  }
}

/** Coups restants → bonus : chaque coup transforme une note en ligne et la déclenche. */
async function finale() {
  busy = true;
  banner("Bravo !", "big");
  Sound.win();
  await sleep(1100);
  if (moves > 0) {
    banner("Coups restants en bonus !", "small");
    await sleep(700);
  }
  let bonusRounds = Math.min(moves, 8);
  score += Math.max(0, moves - bonusRounds) * 300;
  while (bonusRounds-- > 0) {
    const cand = [];
    forEachTile((t, r, c) => { if (!t.special && t.color !== RAINBOW) cand.push([t, r, c]); });
    if (!cand.length) break;
    const [t, r, c] = cand[Math.floor(Math.random() * cand.length)];
    t.special = Math.random() < 0.5 ? "h" : "v";
    renderTile(t);
    flash(t, "born", 500);
    moves--; updateHud();
    await sleep(260);
    combo = 1;
    await clearCells(new Set([key(r, c)]));
    await gravity();
  }
  moves = 0;
  await cascade(null);
  updateHud();
  busy = false;
}

function onWin() {
  const i = level.number - 1;
  const stars = Math.max(1, starsFor(score));
  const prevBest = save.best[i] || 0;
  const isRecord = prevBest > 0 && score > prevBest;
  save.stars[i] = Math.max(save.stars[i] || 0, stars);
  save.best[i] = Math.max(save.best[i] || 0, score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, level.number + 1));
  persist();
  FX.confetti();
  modal(`<small class="eyebrow">Niveau ${level.number}</small><h2>Bravo !</h2>
    <div class="stars">${[1, 2, 3].map((n) => `<span class="star" data-n="${n}">${ICONS.star}</span>`).join("")}</div>
    <p class="final-score" id="final-score">0</p>
    ${isRecord ? `<p class="record">Nouveau record !</p>` : ""}
    <div class="row">
      <button class="btn ghost" data-act="map">${ICONS.map} Carte</button>
      ${level.number < LEVEL_COUNT ? `<button class="btn big" data-act="next">Suivant ${ICONS.play}</button>` : ""}
    </div>`, async (act) => {
    await Ads.maybeInterstitial(level.number);
    if (act === "next") levelCard(level.number); else openMap();
  });
  // Les étoiles s'allument une à une, puis le score défile.
  document.querySelectorAll("#modal-box .star").forEach((el, k) => {
    if (k < stars) setTimeout(() => {
      el.classList.add("on");
      Sound.star();
      const r = el.getBoundingClientRect();
      FX.sparkle(r.left + r.width / 2, r.top + r.height / 2, 18);
    }, 500 + k * 450);
  });
  const fs = $("#final-score"), t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / 1400);
    if (fs) fs.textContent = fmt(score * (1 - Math.pow(1 - k, 3))) + " pts";
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function onOutOfMoves() {
  Sound.lose();
  const reason = score < level.target && goalsDone() ? "Il manque des points…" : "Plus de coups !";
  modal(`<h2>${reason}</h2>
    <div class="goals-card">${goalChips(level, true)}</div>
    ${!extraMovesUsed ? `<p>Regarde une courte vidéo pour obtenir <b>5 coups de plus</b>.</p>
      <button class="btn big reward" data-act="reward">${ICONS.video} +5 coups</button>` : ""}
    <button class="btn ghost" data-act="giveup">Abandonner</button>`, async (act) => {
    if (act === "reward") {
      const ok = await Ads.rewarded();
      if (ok) {
        extraMovesUsed = true;
        moves += 5; ended = false; updateHud(); scheduleHint();
        banner("+5 coups !");
        return;
      }
      onOutOfMoves();
      return;
    }
    loseLife();
    onLose();
  });
}

function loseLife() {
  refreshLives();
  if (save.lives >= MAX_LIVES) save.livesTs = Date.now();
  save.lives = Math.max(0, save.lives - 1);
  persist();
}

function onLose() {
  modal(`<h2>Niveau échoué</h2>
    <div class="lives-big">${ICONS.heart}<b>${save.lives}</b></div>
    <p>${save.lives ? "Il te reste " + save.lives + (save.lives > 1 ? " vies." : " vie.") : "Tu n'as plus de vie pour l'instant."}</p>
    <div class="row"><button class="btn ghost" data-act="map">${ICONS.map} Carte</button>
    <button class="btn big" data-act="retry">Réessayer</button></div>`, async (act) => {
    await Ads.maybeInterstitial(level.number);
    if (act === "retry") startLevel(level.number - 1); else openMap();
  });
}

function showNoLives(index) {
  modal(`<div class="lives-big">${ICONS.heart}<b>${save.lives}</b></div><h2>${save.lives ? "Vies" : "Plus de vies"}</h2>
    <p>${save.lives >= MAX_LIVES ? "Tes vies sont au maximum." : `Prochaine vie dans <b id="life-timer">${nextLifeIn()}</b>`}</p>
    ${save.lives < MAX_LIVES ? `<button class="btn big reward" data-act="reward">${ICONS.video} Regarder une vidéo : +1 vie</button>` : ""}
    <button class="btn ghost" data-act="close">${save.lives ? "Fermer" : "Plus tard"}</button>`, async (act) => {
    if (act === "reward" && (await Ads.rewarded())) {
      save.lives = Math.min(MAX_LIVES, save.lives + 1); persist();
      updateLivesUi();
      Sound.gift();
      if (index !== undefined) startLevel(index);
    }
  });
}

/* ====================================================================== */
/* Fenêtres, écrans                                                       */
/* ====================================================================== */
function modal(html, onAction) {
  const m = $("#modal");
  const box = $("#modal-box");
  box.innerHTML = html;
  m.classList.remove("closing");
  m.classList.add("open");
  box.onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    Sound.tap();
    m.classList.add("closing");
    setTimeout(() => {
      m.classList.remove("open", "closing");
      onAction && onAction(btn.dataset.act, btn);
    }, 220);
  };
}

let currentScreen = "loading";
async function showScreen(id, beforeShow) {
  if (id === currentScreen) { beforeShow && beforeShow(); return; }
  const from = document.getElementById(currentScreen), to = document.getElementById(id);
  currentScreen = id;
  from?.classList.add("leaving");
  await sleep(260);
  from?.classList.remove("active", "leaving");
  to.classList.add("active", "entering");
  beforeShow && beforeShow();
  void to.offsetWidth;
  to.classList.remove("entering");
  await sleep(350);
}

function updateLivesUi() {
  refreshLives();
  document.querySelectorAll(".lives").forEach((e) => (e.textContent = save.lives));
  document.querySelectorAll(".lives-timer").forEach((e) => (e.textContent = save.lives >= MAX_LIVES ? "max" : nextLifeIn()));
  const lt = $("#life-timer");
  if (lt) lt.textContent = nextLifeIn();
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  document.querySelectorAll(".total-stars").forEach((e) => (e.textContent = total));
  const giftBtn = $("#gift-btn");
  if (giftBtn) giftBtn.classList.toggle("ready", save.lastGift !== today());
}

/* ---------------------------------------------------------------------- */
/* Carte des niveaux                                                      */
/* ---------------------------------------------------------------------- */
const STEP_Y = 104, BANNER_H = 120, PAD_Y = 90;

function openMap() {
  showScreen("map", renderMap);
  Ads.showBanner();
}
function renderMap() {
  const wrap = $("#level-list");
  const width = Math.min(wrap.clientWidth || innerWidth, 520);
  const worldH = 10 * STEP_Y + BANNER_H;
  const total = PAD_Y * 2 + WORLDS.length * worldH;
  const yOf = (i) => total - (PAD_Y + Math.floor(i / 10) * worldH + BANNER_H + (i % 10) * STEP_Y + 40);
  const xOf = (i) => width / 2 + Math.sin(i * 0.85) * width * 0.3;
  let html = `<div class="map-inner" style="height:${total}px;width:${width}px">`;
  // Chemin pointillé reliant les niveaux.
  let d = "";
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const x = xOf(i), y = yOf(i);
    if (!i) d += `M${x},${y}`;
    else {
      const px = xOf(i - 1), py = yOf(i - 1);
      d += ` C${px},${(py + y) / 2} ${x},${(py + y) / 2} ${x},${y}`;
    }
  }
  const doneUpTo = Math.max(0, save.unlocked - 1);
  html += `<svg class="path" width="${width}" height="${total}"><path d="${d}" class="road"/><path d="${d}" class="road-dash"/></svg>`;
  WORLDS.forEach((w, wi) => {
    const top = total - (PAD_Y + wi * worldH + BANNER_H);
    html += `<div class="world-banner" style="top:${top}px;--h:${w.hue}"><small>Monde ${wi + 1}</small><b>${w.name}</b></div>`;
    html += `<div class="world-deco" style="top:${top - worldH / 2}px;--h:${w.hue}">${GLYPHS[wi % GLYPHS.length]}</div>`;
  });
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const locked = i + 1 > save.unlocked, st = save.stars[i] || 0, current = i + 1 === save.unlocked;
    const cls = locked ? "locked" : st ? "done" : "open";
    html += `<button class="node ${cls}${current ? " current" : ""}" data-level="${i}" style="left:${xOf(i)}px;top:${yOf(i)}px;--h:${worldOf(i).hue}" ${locked ? "disabled" : ""}>
      ${current ? `<span class="marker">${GLYPHS[1]}</span>` : ""}
      <b>${locked ? ICONS.lock : i + 1}</b>
      <span class="nstars">${[1, 2, 3].map((n) => `<i class="${n <= st ? "on" : ""}">${ICONS.star}</i>`).join("")}</span></button>`;
  }
  html += "</div>";
  wrap.innerHTML = html;
  wrap.querySelectorAll(".node:not(.locked)").forEach((n) => (n.onclick = () => { Sound.tap(); levelCard(+n.dataset.level); }));
  const cur = wrap.querySelector(".node.current") || wrap.querySelector(`[data-level="${doneUpTo}"]`);
  wrap.scrollTop = parseFloat(cur.style.top) - wrap.clientHeight / 2;
  onMapScroll();
  updateLivesUi();
}
function onMapScroll() {
  const wrap = $("#level-list");
  const inner = wrap.querySelector(".map-inner");
  if (!inner) return;
  const total = inner.offsetHeight, worldH = 10 * STEP_Y + BANNER_H;
  const fromBottom = total - (wrap.scrollTop + wrap.clientHeight / 2) - PAD_Y;
  const wi = Math.max(0, Math.min(WORLDS.length - 1, Math.floor(fromBottom / worldH)));
  FX.setHue(WORLDS[wi].hue);
}

/* ---------------------------------------------------------------------- */
/* Accueil, cadeau du jour, réglages, aide                                */
/* ---------------------------------------------------------------------- */
function openHome() {
  FX.setHue(WORLDS[0].hue);
  showScreen("home");
  Ads.hideBanner();
  $("#play-label").textContent = save.unlocked > 1 ? `Niveau ${save.unlocked}` : "Commencer";
  updateLivesUi();
}

const GIFTS = [
  { kind: "hammer", label: "1 marteau", icon: "hammer" },
  { kind: "shuffle", label: "1 mélange", icon: "shuffle" },
  { kind: "life", label: "1 vie", icon: "heart" },
  { kind: "hammer2", label: "2 marteaux", icon: "hammer" },
];
function openGift() {
  Sound.tap();
  if (save.lastGift === today()) {
    modal(`<div class="modal-icon">${ICONS.gift}</div><h2>Cadeau du jour</h2><p>Tu as déjà ouvert le cadeau d'aujourd'hui. Reviens demain !</p>
      <button class="btn big" data-act="close">OK</button>`);
    return;
  }
  modal(`<small class="eyebrow">Cadeau du jour</small><h2>Une surprise t'attend</h2>
    <button class="chest" data-act="open" aria-label="Ouvrir le cadeau">${ICONS.gift}</button>
    <p class="muted">Touche le cadeau pour l'ouvrir</p>`, (act) => {
    if (act !== "open") return;
    const g = GIFTS[Math.floor(Math.random() * GIFTS.length)];
    if (g.kind === "life") save.lives = Math.min(MAX_LIVES + 1, save.lives + 1);
    else if (g.kind === "hammer2") save.boosters.hammer += 2;
    else save.boosters[g.kind]++;
    save.lastGift = today();
    persist();
    updateLivesUi();
    Sound.gift();
    modal(`<small class="eyebrow">Cadeau du jour</small><div class="gift-reward">${ICONS[g.icon]}</div><h2>${g.label} !</h2>
      <p class="muted">Un nouveau cadeau t'attend demain.</p><button class="btn big" data-act="close">Super !</button>`);
    const r = $(".gift-reward").getBoundingClientRect();
    FX.sparkle(r.left + r.width / 2, r.top + r.height / 2, 24);
  });
}

function toggleRow(id, label, icon, on) {
  return `<button class="toggle" data-act="${id}" aria-pressed="${on}"><span class="t-icon">${ICONS[icon]}</span><span class="t-label">${label}</span><span class="switch"><span></span></span></button>`;
}
function openSettings(fromGame = false) {
  modal(`<h2>Réglages</h2>
    <div class="toggles">
      ${toggleRow("sfx", "Effets sonores", "sound", Sound.sfx)}
      ${toggleRow("music", "Musique", "music", Sound.music)}
      ${toggleRow("haptics", "Vibrations", "vibrate", Sound.haptics)}
    </div>
    ${fromGame ? "" : `<button class="btn" data-act="tuto">Revoir le tutoriel</button>`}
    <button class="btn" data-act="help">Comment jouer</button>
    ${Ads.privacyOptionsRequired ? `<button class="btn" data-act="privacy">Confidentialité et publicité</button>` : ""}
    ${fromGame ? "" : `<button class="btn ghost danger" data-act="reset">Effacer ma progression</button>`}
    <button class="btn big" data-act="close">Fermer</button>
    <p class="version">Mélo Pop ${VERSION}</p>`, (act) => {
    if (act === "sfx") { Sound.sfx = !Sound.sfx; save.sound = Sound.sfx; persist(); openSettings(fromGame); }
    if (act === "music") { Sound.music = !Sound.music; save.music = Sound.music; persist(); openSettings(fromGame); }
    if (act === "haptics") { Sound.haptics = !Sound.haptics; save.haptics = Sound.haptics; persist(); openSettings(fromGame); }
    if (act === "tuto") startLevel(0, { replayTutorial: true });
    if (act === "help") openHelp(fromGame ? "game" : currentScreen);
    if (act === "privacy") Ads.showPrivacyOptions();
    if (act === "reset") confirmReset();
    if (act === "close" && fromGame) resumeGame();
  });
}
function confirmReset() {
  modal(`<h2>Tout effacer ?</h2><p>Tes niveaux, étoiles et bonus seront perdus. Cette action est définitive.</p>
    <div class="row"><button class="btn ghost" data-act="close">Annuler</button><button class="btn danger-fill" data-act="yes">Effacer</button></div>`, (act) => {
    if (act !== "yes") return;
    Object.assign(save, DEFAULT_SAVE());
    persist();
    openHome();
  });
}

let helpReturn = "home";
function openHelp(ret = "home") {
  helpReturn = ret;
  showScreen("help");
}
function closeHelp() {
  if (helpReturn === "game") { showScreen("game"); resumeGame(); }
  else if (helpReturn === "map") openMap();
  else openHome();
}

function pause() {
  if (ended || busy || tut) return;
  Sound.tap();
  modal(`<h2>Pause</h2>
    <button class="btn big" data-act="close">${ICONS.play} Reprendre</button>
    <button class="btn" data-act="settings">Réglages</button>
    <button class="btn" data-act="help">Comment jouer</button>
    <button class="btn ghost danger" data-act="quit">Quitter le niveau (−1 vie)</button>`, (act) => {
    if (act === "settings") openSettings(true);
    if (act === "help") openHelp("game");
    if (act === "quit") { ended = true; clearHint(); loseLife(); openMap(); }
  });
}
function resumeGame() { scheduleHint(); }

/* ====================================================================== */
/* Démarrage                                                              */
/* ====================================================================== */
function renderHelp() {
  const rows = [
    [`<div class="demo">${gemHtml(0)}${gemHtml(0)}<span class="swap-demo">${gemHtml(0)}</span></div>`,
      "Échanger", "Fais glisser une note vers une voisine (ou touche-les l'une après l'autre) pour aligner au moins 3 notes identiques."],
    [`<div class="demo">${gemHtml(3, "h")}${gemHtml(4, "v")}</div>`,
      "Note rayée", "Aligne 4 notes. Déclenchée, elle efface toute une rangée ou une colonne, selon le sens de ses rayures."],
    [`<div class="demo">${gemHtml(1, "bomb")}</div>`, "Bombe", "Aligne 5 notes en L ou en T. Elle efface les 8 notes qui l'entourent."],
    [`<div class="demo">${gemHtml(RAINBOW)}</div>`, "Étoile", "Aligne 5 notes en ligne. Échange-la avec une note pour effacer toutes celles de la même couleur."],
    [`<div class="demo">${gemHtml(0, "h")}<b>+</b>${gemHtml(RAINBOW)}</div>`, "Combinaisons", "Échange deux notes spéciales entre elles pour un effet encore plus puissant."],
    [`<div class="demo"><span class="ice-demo">${gemHtml(4)}</span><span class="ice-demo thick">${gemHtml(2)}</span></div>`,
      "Givre", "Fais un alignement sur une case givrée pour la dégeler. Le givre épais demande deux passages."],
    [`<div class="demo"><span class="mini">${gemHtml(2)}</span><b>12</b></div>`, "Objectifs", "Chaque niveau a un objectif : un score, des notes à récolter ou du givre à faire fondre, avec un nombre de coups limité."],
    [`<div class="demo icon-demo">${ICONS.star}${ICONS.star}${ICONS.star}</div>`, "Étoiles", "Plus ton score est élevé, plus tu gagnes d'étoiles (jusqu'à 3). Les coups restants rapportent des points bonus."],
    [`<div class="demo icon-demo heart">${ICONS.heart}</div>`, "Vies", "Un niveau perdu coûte une vie. Elles se rechargent toutes seules : une vie toutes les 20 minutes, jusqu'à 5."],
    [`<div class="demo icon-demo">${ICONS.hammer}${ICONS.shuffle}</div>`, "Bonus", "Le marteau casse la note de ton choix, le mélange redistribue le plateau. Aucun des deux ne coûte de coup."],
  ];
  $("#help-list").innerHTML = rows.map(([art, t, p]) => `<article class="help-card"><div class="help-art">${art}</div><div><h3>${t}</h3><p>${p}</p></div></article>`).join("");
}

function fillIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICONS[el.dataset.icon] + el.innerHTML));
}

async function boot() {
  Sound.sfx = save.sound; Sound.haptics = save.haptics;
  Sound.music = save.music;
  refreshLives();
  fillIcons();
  renderHelp();
  FX.init();
  bindInput();
  const firstTouch = () => { Sound.unlock(); };
  addEventListener("pointerdown", firstTouch, { once: true });

  $("#play").onclick = () => {
    Sound.unlock(); Sound.tap();
    if (!save.tutorialDone) startLevel(0); else openMap();
  };
  $("#home-help").onclick = () => { Sound.tap(); openHelp("home"); };
  $("#home-settings").onclick = () => { Sound.tap(); openSettings(); };
  $("#gift-btn").onclick = openGift;
  $("#map-settings").onclick = () => { Sound.tap(); openSettings(); };
  $("#map-back").onclick = () => { Sound.tap(); openHome(); };
  $("#help-back").onclick = () => { Sound.tap(); closeHelp(); };
  $("#pause").onclick = pause;
  document.querySelectorAll(".lives-btn").forEach((b) => (b.onclick = () => { Sound.tap(); refreshLives(); showNoLives(); }));
  document.querySelectorAll("[data-booster]").forEach((b) => (b.onclick = () => onBooster(b.dataset.booster)));
  $("#level-list").addEventListener("scroll", onMapScroll, { passive: true });
  addEventListener("resize", layout);
  document.addEventListener("visibilitychange", () => (document.hidden ? Sound.suspend() : Sound.resume()));
  setInterval(updateLivesUi, 1000);

  // Écran de chargement : on attend les polices, avec une durée minimale pour l'animation.
  const t0 = performance.now();
  try { await Promise.race([document.fonts.ready, sleep(2500)]); } catch (e) { /* ok */ }
  Ads.init();
  await sleep(Math.max(0, 1600 - (performance.now() - t0)));
  openHome();
}
boot();

// Accès de débogage depuis la console.
window.__melopop = { get state() { return { level, score, moves, collected, grid, busy, ended }; }, startLevel, save, levelCard };
