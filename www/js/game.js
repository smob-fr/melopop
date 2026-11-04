// Mélo Pop — moteur de jeu « match-3 » et interface.
import { getLevel, LEVEL_COUNT } from "./levels.js";
import { Ads } from "./ads.js";
import { Sound } from "./sound.js";

const N = 8;
const GLYPHS = ["♪", "♫", "♩", "♬", "♭", "♯"].map((g) => g + "︎");
const COLOR_NAMES = ["rouge", "orange", "jaune", "vert", "bleu", "violet"];
const RAINBOW = -1;
const MAX_LIVES = 5;
const LIFE_REGEN_MS = 20 * 60e3;
const T_SWAP = 160, T_POP = 220, T_FALL = 260;

const $ = (s, root = document) => root.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (r, c) => r * N + c;
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

/* ====================================================================== */
/* Sauvegarde                                                             */
/* ====================================================================== */
const SAVE_KEY = "melopop.v1";
const save = (() => {
  let d = { unlocked: 1, stars: {}, best: {}, lives: MAX_LIVES, livesTs: Date.now(), sound: true };
  try { Object.assign(d, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* vide */ }
  return d;
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* privé */ } }

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
  const ms = LIFE_REGEN_MS - (Date.now() - save.livesTs);
  const m = Math.max(0, Math.floor(ms / 60e3)), s = Math.max(0, Math.floor((ms % 60e3) / 1e3));
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ====================================================================== */
/* État de la partie                                                      */
/* ====================================================================== */
let level = null;
let grid = [];   // grid[r][c] = tuile | null
let ice = [];    // ice[r][c] = couches de givre restantes
let score = 0, moves = 0, combo = 0;
let collected = {};
let busy = false, ended = false, extraMovesUsed = false;
let hintTimer = 0;
let nextId = 1;

const boardEl = () => $("#board");
let cell = 40;

function makeTile(color, special = null) {
  const t = { id: nextId++, color, special, el: document.createElement("div") };
  t.el.className = "tile";
  renderTile(t);
  boardEl().appendChild(t.el);
  return t;
}
function renderTile(t) {
  t.el.className = "tile " + (t.color === RAINBOW ? "rainbow" : "c" + t.color) + (t.special ? " sp-" + t.special : "");
  t.el.innerHTML = `<span>${t.color === RAINBOW ? "★" : GLYPHS[t.color]}</span>`;
}
function place(t, r, c) {
  t.el.style.transform = `translate(${c * cell}px, ${r * cell}px)`;
}
function randColor() { return Math.floor(Math.random() * level.colors); }

/* ---------------------------------------------------------------------- */
/* Détection des alignements                                              */
/* ---------------------------------------------------------------------- */
function colorAt(r, c) {
  const t = inside(r, c) && grid[r][c];
  return t ? t.color : null;
}

function findRuns() {
  const runs = [];
  for (let horiz of [true, false]) {
    for (let a = 0; a < N; a++) {
      let b = 0;
      while (b < N) {
        const col = horiz ? colorAt(a, b) : colorAt(b, a);
        let e = b + 1;
        while (e < N && col !== null && col !== RAINBOW && (horiz ? colorAt(a, e) : colorAt(e, a)) === col) e++;
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

/** Calcule ce qu'il faut effacer et les tuiles spéciales à créer. */
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
    else if (maxLen === 4) special = g.runs[0].dir; // alignement horizontal → efface la ligne
    if (!special) continue;
    // Où placer la tuile spéciale : la case jouée, sinon l'intersection, sinon le milieu.
    let pos = swapCells && swapCells.find(([r, c]) => g.keys.has(key(r, c)));
    if (!pos && special === "bomb") {
      const counts = {};
      g.runs.forEach((run) => run.cells.forEach(([r, c]) => (counts[key(r, c)] = (counts[key(r, c)] || 0) + 1)));
      const k = +Object.keys(counts).find((k) => counts[k] > 1);
      if (!Number.isNaN(k)) pos = [Math.floor(k / N), k % N];
    }
    if (!pos) {
      const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      pos = longest.cells[Math.floor(longest.cells.length / 2)];
    }
    creations.push({ r: pos[0], c: pos[1], special, color: special === "rainbow" ? RAINBOW : g.runs[0].color });
  }
  return { clear, creations };
}

/* ---------------------------------------------------------------------- */
/* Effets des tuiles spéciales                                            */
/* ---------------------------------------------------------------------- */
function mostCommonColor() {
  const n = {};
  forEachTile((t) => { if (t.color !== RAINBOW) n[t.color] = (n[t.color] || 0) + 1; });
  const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  return best === undefined ? 0 : +best;
}
function forEachTile(fn) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) fn(grid[r][c], r, c);
}
function effectCells(t, r, c) {
  const out = [];
  if (t.special === "h") { for (let i = 0; i < N; i++) out.push([r, i]); beam("h", r); }
  else if (t.special === "v") { for (let i = 0; i < N; i++) out.push([i, c]); beam("v", c); }
  else if (t.special === "bomb") { area(r, c, 1, out); blast(r, c, 1); }
  else if (t.special === "rainbow") {
    const col = mostCommonColor();
    forEachTile((u, rr, cc) => { if (u.color === col) out.push([rr, cc]); });
  }
  return out;
}
function area(r, c, rad, out) {
  for (let i = r - rad; i <= r + rad; i++) for (let j = c - rad; j <= c + rad; j++) if (inside(i, j)) out.push([i, j]);
}
/** Étend un ensemble de cases en déclenchant les tuiles spéciales touchées. */
function expand(set) {
  const queue = [...set];
  while (queue.length) {
    const k = queue.pop();
    const r = Math.floor(k / N), c = k % N;
    const t = grid[r][c];
    if (!t || !t.special || t.triggered) continue;
    t.triggered = true;
    Sound.special();
    for (const [rr, cc] of effectCells(t, r, c)) {
      const kk = key(rr, cc);
      if (!set.has(kk)) { set.add(kk); queue.push(kk); }
    }
  }
  return set;
}

/* Effets visuels */
function beam(dir, i) {
  const b = document.createElement("div");
  b.className = "beam beam-" + dir;
  if (dir === "h") b.style.top = i * cell + "px"; else b.style.left = i * cell + "px";
  b.style.setProperty("--cell", cell + "px");
  boardEl().appendChild(b);
  setTimeout(() => b.remove(), 450);
}
function blast(r, c, rad) {
  const b = document.createElement("div");
  b.className = "blast";
  const s = (rad * 2 + 1) * cell;
  Object.assign(b.style, { width: s + "px", height: s + "px", left: (c - rad) * cell + "px", top: (r - rad) * cell + "px" });
  boardEl().appendChild(b);
  setTimeout(() => b.remove(), 450);
}
function floatText(text, r, c) {
  const f = document.createElement("div");
  f.className = "float";
  f.textContent = text;
  Object.assign(f.style, { left: (c + 0.5) * cell + "px", top: (r + 0.3) * cell + "px" });
  boardEl().appendChild(f);
  setTimeout(() => f.remove(), 800);
}

/* ---------------------------------------------------------------------- */
/* Effacement, gravité, cascades                                          */
/* ---------------------------------------------------------------------- */
async function clearCells(set, creations = []) {
  expand(set);
  // Les cases où naît une tuile spéciale ne sont pas libérées par le givre en double.
  let gained = 0, sumR = 0, sumC = 0;
  for (const k of set) {
    const r = Math.floor(k / N), c = k % N;
    const t = grid[r][c];
    if (ice[r][c] > 0) { ice[r][c]--; renderIce(r, c); }
    if (!t) continue;
    if (t.color !== RAINBOW && level.collect[t.color] !== undefined) collected[t.color] = (collected[t.color] || 0) + 1;
    gained += t.special ? 120 : 60;
    sumR += r; sumC += c;
    t.el.classList.add("pop");
    const el = t.el;
    setTimeout(() => el.remove(), T_POP);
    grid[r][c] = null;
  }
  const points = gained * Math.max(1, combo);
  score += points;
  if (set.size) floatText("+" + points, sumR / set.size, sumC / set.size);
  for (const cr of creations) {
    if (grid[cr.r][cr.c]) continue;
    const t = makeTile(cr.color, cr.special);
    place(t, cr.r, cr.c);
    t.el.classList.add("born");
    grid[cr.r][cr.c] = t;
  }
  if (creations.length) Sound.special();
  updateHud();
  await sleep(T_POP);
}

async function gravity() {
  const spawned = [];
  for (let c = 0; c < N; c++) {
    let write = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      const t = grid[r][c];
      if (!t) continue;
      if (r !== write) { grid[write][c] = t; grid[r][c] = null; place(t, write, c); }
      write--;
    }
    const missing = write + 1;
    for (let r = write; r >= 0; r--) {
      const t = makeTile(randColor());
      place(t, r - missing, c); // démarre au-dessus du plateau
      grid[r][c] = t;
      spawned.push([t, r, c]);
    }
  }
  if (spawned.length) {
    boardEl().getBoundingClientRect(); // force le rendu de la position de départ
    for (const [t, r, c] of spawned) place(t, r, c);
  }
  await sleep(T_FALL);
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
    swapCells = null;
  }
  if (!findMove()) await shuffle();
}

function cheer(n) {
  const words = ["", "", "", "Joli !", "Super !", "Magnifique !", "Virtuose !"];
  const el = $("#cheer");
  el.textContent = words[Math.min(n, words.length - 1)];
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
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

async function shuffle() {
  const el = $("#cheer");
  el.textContent = "Mélange !";
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  for (let tries = 0; tries < 50; tries++) {
    const normals = [];
    forEachTile((t) => { if (!t.special) normals.push(t); });
    const colors = normals.map((t) => t.color);
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    normals.forEach((t, i) => (t.color = colors[i]));
    if (!findRuns().length && findMove()) break;
    if (tries === 49) normals.forEach((t) => (t.color = randColor()));
  }
  forEachTile((t) => { renderTile(t); t.el.classList.add("born"); });
  await sleep(400);
  if (findRuns().length) await cascade(null);
}

function scheduleHint() {
  clearTimeout(hintTimer);
  document.querySelectorAll(".tile.hint").forEach((e) => e.classList.remove("hint"));
  if (ended) return;
  hintTimer = setTimeout(() => {
    if (busy || ended) return;
    const m = findMove();
    if (m) m.forEach(([r, c]) => grid[r][c] && grid[r][c].el.classList.add("hint"));
  }, 6000);
}

/* ---------------------------------------------------------------------- */
/* Échange joué par le joueur                                             */
/* ---------------------------------------------------------------------- */
async function trySwap(a, b) {
  if (busy || ended || !inside(b[0], b[1])) return;
  const ta = grid[a[0]][a[1]], tb = grid[b[0]][b[1]];
  if (!ta || !tb) return;
  busy = true;
  scheduleHint();
  Sound.swap();
  swapInGrid(a, b);
  place(ta, b[0], b[1]); place(tb, a[0], a[1]);
  await sleep(T_SWAP);

  const combo2 = ta.color === RAINBOW || tb.color === RAINBOW || (ta.special && tb.special);
  if (combo2) {
    moves--;
    updateHud();
    await specialCombo(ta, tb, b);
    await gravity();
    await cascade(null);
  } else if (findRuns().length) {
    moves--;
    updateHud();
    await cascade([a, b]);
  } else {
    Sound.bad();
    swapInGrid(a, b);
    place(ta, a[0], a[1]); place(tb, b[0], b[1]);
    await sleep(T_SWAP);
  }
  busy = false;
  checkEnd();
  scheduleHint();
}

/** Combinaisons de deux tuiles spéciales (ou d'une étoile avec une note). */
async function specialCombo(ta, tb, at) {
  combo = 1;
  const [r, c] = at;
  const set = new Set();
  ta.triggered = tb.triggered = true;
  const posOf = (t) => { let p; forEachTile((u, rr, cc) => { if (u === t) p = [rr, cc]; }); return p; };
  set.add(key(...posOf(ta))); set.add(key(...posOf(tb)));
  const rainbow = ta.color === RAINBOW ? ta : tb.color === RAINBOW ? tb : null;
  const other = rainbow === ta ? tb : ta;
  Sound.special();

  if (rainbow && other.color === RAINBOW) {
    forEachTile((t, rr, cc) => set.add(key(rr, cc)));
    blast(3.5, 3.5, 4);
  } else if (rainbow) {
    const col = other.color;
    forEachTile((t, rr, cc) => {
      if (t.color !== col || t === other) return;
      if (other.special) { t.special = other.special === "bomb" ? "bomb" : Math.random() < 0.5 ? "h" : "v"; renderTile(t); }
      t.el.classList.add("glow");
      set.add(key(rr, cc));
    });
    await sleep(other.special ? 450 : 200);
  } else {
    const kinds = [ta.special, tb.special];
    const out = [];
    if (kinds.includes("bomb") && (kinds.includes("h") || kinds.includes("v"))) {
      for (let d = -1; d <= 1; d++) {
        for (let i = 0; i < N; i++) { if (inside(r + d, i)) out.push([r + d, i]); if (inside(i, c + d)) out.push([i, c + d]); }
        if (inside(r + d, 0)) beam("h", r + d);
        if (inside(0, c + d)) beam("v", c + d);
      }
    } else if (kinds[0] === "bomb" && kinds[1] === "bomb") {
      area(r, c, 2, out); blast(r, c, 2);
    } else {
      for (let i = 0; i < N; i++) { out.push([r, i]); out.push([i, c]); }
      beam("h", r); beam("v", c);
    }
    out.forEach(([rr, cc]) => set.add(key(rr, cc)));
  }
  await clearCells(set);
}

/* ---------------------------------------------------------------------- */
/* Saisie : glisser ou toucher deux tuiles                                */
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
  if (p && grid[p[0]][p[1]]) grid[p[0]][p[1]].el.classList.add("selected");
}
function bindInput() {
  const b = boardEl();
  b.addEventListener("pointerdown", (e) => {
    Sound.unlock();
    if (busy || ended) return;
    const p = cellFromEvent(e);
    if (!p) return;
    drag = { p, x: e.clientX, y: e.clientY, done: false };
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener("pointermove", (e) => {
    if (!drag || drag.done) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return;
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
/* Interface : HUD, écrans, fenêtres                                      */
/* ====================================================================== */
function starsFor(s) { return s >= level.target * 2.2 ? 3 : s >= level.target * 1.5 ? 2 : s >= level.target ? 1 : 0; }

function goalsDone() {
  const collectOk = Object.entries(level.collect).every(([col, n]) => (collected[col] || 0) >= n);
  const iceOk = ice.every((row) => row.every((v) => v === 0));
  return collectOk && iceOk;
}
const hasSideGoals = () => Object.keys(level.collect).length > 0 || level.ice.length > 0;

function updateHud() {
  $("#moves").textContent = Math.max(0, moves);
  $("#moves").classList.toggle("low", moves <= 5);
  $("#score").textContent = score.toLocaleString("fr-FR");
  const pct = Math.min(100, (score / (level.target * 2.2)) * 100);
  $("#progress-fill").style.width = pct + "%";
  const goals = [];
  for (const [col, n] of Object.entries(level.collect)) {
    const left = Math.max(0, n - (collected[col] || 0));
    goals.push(`<div class="goal ${left ? "" : "done"}"><span class="mini c${col}">${GLYPHS[col]}</span><b>${left || "✓"}</b></div>`);
  }
  if (level.ice.length) {
    const left = ice.flat().filter((v) => v > 0).length;
    goals.push(`<div class="goal ${left ? "" : "done"}"><span class="mini ice-mini">❄︎</span><b>${left || "✓"}</b></div>`);
  }
  if (!hasSideGoals()) goals.push(`<div class="goal ${score >= level.target ? "done" : ""}"><small>Objectif</small><b>${level.target.toLocaleString("fr-FR")}</b></div>`);
  $("#goals").innerHTML = goals.join("");
}

function renderIce(r, c) {
  const el = document.getElementById(`ice-${r}-${c}`);
  if (el) el.className = "ice" + (ice[r][c] ? " l" + ice[r][c] : "");
}

function layout() {
  const b = boardEl();
  const w = b.clientWidth;
  cell = w / N;
  b.style.setProperty("--cell", cell + "px");
  if (grid.length) forEachTile((t, r, c) => place(t, r, c));
}

const ie_pos = (i) => (i * 100) / N + "%";

function startLevel(index) {
  refreshLives();
  if (save.lives <= 0) { showNoLives(index); return; }
  level = getLevel(index);
  score = 0; moves = level.moves; collected = {}; ended = false; busy = false; extraMovesUsed = false;
  showScreen("game");
  Ads.hideBanner();
  const b = boardEl();
  b.innerHTML = "";
  $("#level-title").textContent = "Niveau " + level.number;
  layout();
  // Givre
  ice = Array.from({ length: N }, () => Array(N).fill(0));
  for (const [r, c, l] of level.ice) ice[r][c] = l;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const bg = document.createElement("div");
      bg.className = "cellbg" + ((r + c) % 2 ? " alt" : "");
      bg.style.left = ie_pos(c); bg.style.top = ie_pos(r);
      b.appendChild(bg);
      const ie = document.createElement("div");
      ie.id = `ice-${r}-${c}`;
      ie.style.left = ie_pos(c); ie.style.top = ie_pos(r);
      b.appendChild(ie);
      renderIce(r, c);
    }
  // Tuiles initiales sans alignement, avec au moins un coup jouable.
  do {
    b.querySelectorAll(".tile").forEach((e) => e.remove());
    grid = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        let col;
        do col = randColor();
        while ((colorAt(r, c - 1) === col && colorAt(r, c - 2) === col) || (colorAt(r - 1, c) === col && colorAt(r - 2, c) === col));
        const t = makeTile(col);
        place(t, r - N, c);
        grid[r][c] = t;
      }
  } while (!findMove());
  b.getBoundingClientRect();
  forEachTile((t, r, c) => { t.el.style.transitionDelay = (N - r) * 25 + "ms"; place(t, r, c); });
  setTimeout(() => forEachTile((t) => (t.el.style.transitionDelay = "")), 600);
  updateHud();
  showIntro();
  scheduleHint();
}

function showIntro() {
  const parts = [];
  if (!hasSideGoals()) parts.push(`Atteins <b>${level.target.toLocaleString("fr-FR")}</b> points`);
  for (const [col, n] of Object.entries(level.collect)) parts.push(`Récolte <b>${n}</b> notes <span class="mini c${col}">${GLYPHS[col]}</span>`);
  if (level.ice.length) parts.push(`Dégèle les <b>${level.ice.length}</b> cases givrées`);
  modal(`<h2>Niveau ${level.number}</h2><p>${parts.join("<br>")}</p><p class="muted">en ${level.moves} coups</p>
    <button class="btn big" data-act="close">C'est parti !</button>`);
}

async function checkEnd() {
  if (ended) return;
  const won = goalsDone() && score >= level.target;
  if ((hasSideGoals() && won) || moves <= 0) {
    ended = true;
    clearTimeout(hintTimer);
    if (won) await finale();
    if (won) onWin(); else onOutOfMoves();
  }
}

/** Coups restants → bonus : chaque coup transforme une note en ligne et la déclenche. */
async function finale() {
  busy = true;
  const el = $("#cheer");
  el.textContent = "Bravo !"; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  await sleep(500);
  let bonusRounds = Math.min(moves, 8);
  score += Math.max(0, moves - bonusRounds) * 300;
  while (bonusRounds-- > 0) {
    const cand = [];
    forEachTile((t, r, c) => { if (!t.special && t.color !== RAINBOW) cand.push([t, r, c]); });
    if (!cand.length) break;
    const [t, r, c] = cand[Math.floor(Math.random() * cand.length)];
    t.special = Math.random() < 0.5 ? "h" : "v";
    renderTile(t);
    moves--; updateHud();
    await sleep(120);
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
  Sound.win();
  const i = level.number - 1;
  const stars = Math.max(1, starsFor(score));
  save.stars[i] = Math.max(save.stars[i] || 0, stars);
  save.best[i] = Math.max(save.best[i] || 0, score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, level.number + 1));
  persist();
  const starsHtml = [1, 2, 3].map((n) => `<span class="star ${n <= stars ? "on" : ""}" style="animation-delay:${n * 0.2}s">★</span>`).join("");
  modal(`<h2>Niveau réussi !</h2><div class="stars">${starsHtml}</div>
    <p class="final-score">${score.toLocaleString("fr-FR")} pts</p>
    <div class="row">
      <button class="btn ghost" data-act="map">Carte</button>
      ${level.number < LEVEL_COUNT ? `<button class="btn big" data-act="next">Suivant ▸</button>` : ""}
    </div>`, async (act) => {
    await Ads.maybeInterstitial(level.number);
    if (act === "next") startLevel(level.number); else openMap();
  });
}

function onOutOfMoves() {
  Sound.lose();
  const reason = score < level.target && goalsDone() ? "Il manque des points…" : "Plus de coups !";
  modal(`<h2>${reason}</h2>
    ${!extraMovesUsed ? `<p>Regarde une courte vidéo pour obtenir <b>+5 coups</b>.</p>
      <button class="btn big reward" data-act="reward">▶ +5 coups</button>` : ""}
    <div class="row"><button class="btn ghost" data-act="giveup">Abandonner</button></div>`, async (act) => {
    if (act === "reward") {
      const ok = await Ads.rewarded();
      if (ok) {
        extraMovesUsed = true;
        moves += 5; ended = false; updateHud(); scheduleHint();
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
  modal(`<h2>Niveau échoué</h2><p>Il te reste <b>${save.lives}</b> ❤︎</p>
    <div class="row"><button class="btn ghost" data-act="map">Carte</button>
    <button class="btn big" data-act="retry">Réessayer</button></div>`, async (act) => {
    await Ads.maybeInterstitial(level.number);
    if (act === "retry") startLevel(level.number - 1); else openMap();
  });
}

function showNoLives(index) {
  modal(`<h2>Plus de vies</h2><p>Prochaine vie dans <b id="life-timer">${nextLifeIn()}</b></p>
    <button class="btn big reward" data-act="reward">▶ Regarder une pub : +1 ❤︎</button>
    <div class="row"><button class="btn ghost" data-act="close">Plus tard</button></div>`, async (act) => {
    if (act === "reward" && (await Ads.rewarded())) {
      save.lives = Math.min(MAX_LIVES, save.lives + 1); persist();
      updateLivesUi();
      if (index !== undefined) startLevel(index);
    }
  });
}

/* Fenêtre modale générique */
function modal(html, onAction) {
  const m = $("#modal");
  $("#modal-box").innerHTML = html;
  m.classList.add("open");
  $("#modal-box").onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    m.classList.remove("open");
    onAction && onAction(btn.dataset.act);
  };
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

function updateLivesUi() {
  refreshLives();
  document.querySelectorAll(".lives").forEach((e) => (e.textContent = save.lives));
  const t = $("#lives-timer");
  if (t) t.textContent = save.lives >= MAX_LIVES ? "max" : nextLifeIn();
  const lt = $("#life-timer");
  if (lt) lt.textContent = nextLifeIn();
}

function openMap() {
  showScreen("map");
  const list = $("#level-list");
  list.innerHTML = "";
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $("#total-stars").textContent = total;
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const node = document.createElement("button");
    const locked = i + 1 > save.unlocked;
    const st = save.stars[i] || 0;
    node.className = "node" + (locked ? " locked" : "") + (i + 1 === save.unlocked ? " current" : "");
    node.style.setProperty("--x", Math.round(50 + Math.sin(i * 0.9) * 30) + "%");
    node.innerHTML = `<b>${locked ? "🔒︎" : i + 1}</b><span class="nstars">${"★".repeat(st)}${"☆".repeat(3 - st)}</span>`;
    if (!locked) node.onclick = () => startLevel(i);
    list.appendChild(node);
  }
  updateLivesUi();
  requestAnimationFrame(() => list.querySelector(".current")?.scrollIntoView({ block: "center" }));
  Ads.showBanner();
}

function openSettings() {
  modal(`<h2>Réglages</h2>
    <button class="btn" data-act="sound">Son : ${Sound.enabled ? "activé" : "coupé"}</button>
    ${Ads.privacyOptionsRequired ? `<button class="btn" data-act="privacy">Confidentialité et publicité</button>` : ""}
    <button class="btn ghost" data-act="close">Fermer</button>`, (act) => {
    if (act === "sound") { Sound.enabled = !Sound.enabled; save.sound = Sound.enabled; persist(); openSettings(); }
    if (act === "privacy") Ads.showPrivacyOptions();
  });
}

function pause() {
  if (ended) return;
  modal(`<h2>Pause</h2>
    <button class="btn big" data-act="close">Reprendre</button>
    <button class="btn" data-act="sound">Son : ${Sound.enabled ? "activé" : "coupé"}</button>
    <button class="btn ghost" data-act="quit">Quitter le niveau (−1 ❤︎)</button>`, (act) => {
    if (act === "sound") { Sound.enabled = !Sound.enabled; save.sound = Sound.enabled; persist(); pause(); }
    if (act === "quit") { ended = true; clearTimeout(hintTimer); loseLife(); openMap(); }
  });
}

/* ====================================================================== */
/* Démarrage                                                              */
/* ====================================================================== */
function boot() {
  Sound.enabled = save.sound;
  refreshLives();
  bindInput();
  $("#play").onclick = () => { Sound.unlock(); openMap(); };
  $("#home-settings").onclick = openSettings;
  $("#map-settings").onclick = openSettings;
  $("#map-back").onclick = () => { Ads.hideBanner(); showScreen("home"); };
  $("#pause").onclick = pause;
  $("#lives-btn").onclick = () => { refreshLives(); if (save.lives < MAX_LIVES) showNoLives(); };
  window.addEventListener("resize", layout);
  setInterval(updateLivesUi, 1000);
  updateLivesUi();
  Ads.init();
}
boot();

// Accès de débogage depuis la console.
window.__melopop = { get state() { return { level, score, moves, collected, grid }; }, startLevel, save };
