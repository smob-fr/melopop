// Mélo Pop — effets visuels sur canvas : décor animé et particules.

const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const NOTE_GLYPHS = ["♪", "♫", "♩", "♬"];

export const PALETTE = ["#ff4d6d", "#ff9f1c", "#ffd23f", "#3ddc84", "#3aa7ff", "#b46bff"];

function setupCanvas(cv) {
  const resize = () => {
    cv.width = innerWidth * DPR;
    cv.height = innerHeight * DPR;
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
  };
  resize();
  addEventListener("resize", resize);
  return cv.getContext("2d");
}

/* ---------- Décor : portée qui ondule, notes et halos qui flottent ---------- */
let bgCtx, bgItems = [], bgHue = 285, bgRunning = true;

function initBackground() {
  const cv = document.getElementById("bg");
  bgCtx = setupCanvas(cv);
  const n = reduceMotion ? 10 : 22;
  for (let i = 0; i < n; i++) bgItems.push(newBgItem(true));
}
function newBgItem(anywhere) {
  const bokeh = Math.random() < 0.45;
  return {
    bokeh,
    x: Math.random() * innerWidth,
    y: anywhere ? Math.random() * innerHeight : innerHeight + 40,
    r: bokeh ? 20 + Math.random() * 60 : 14 + Math.random() * 22,
    vy: 0.15 + Math.random() * 0.35,
    sway: Math.random() * Math.PI * 2,
    rot: (Math.random() - 0.5) * 0.6,
    glyph: NOTE_GLYPHS[Math.floor(Math.random() * 4)],
    a: 0.06 + Math.random() * 0.12,
  };
}
function drawBackground(t) {
  const c = bgCtx, W = innerWidth, H = innerHeight;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `hsl(${bgHue}, 55%, 26%)`);
  g.addColorStop(0.55, `hsl(${bgHue + 20}, 50%, 15%)`);
  g.addColorStop(1, `hsl(${bgHue + 40}, 55%, 9%)`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Lueur de scène en haut.
  const spot = c.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, H * 0.8);
  spot.addColorStop(0, `hsla(${bgHue + 40}, 90%, 70%, .28)`);
  spot.addColorStop(1, "transparent");
  c.fillStyle = spot;
  c.fillRect(0, 0, W, H);
  // Portée (5 lignes) qui ondule lentement.
  c.strokeStyle = "rgba(255,255,255,.07)";
  c.lineWidth = 1.5;
  const baseY = H * 0.72;
  for (let l = 0; l < 5; l++) {
    c.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = baseY + l * 14 + Math.sin(x / 140 + t / 2600 + l * 0.15) * 22;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
  // Notes et halos.
  for (const it of bgItems) {
    if (!reduceMotion) {
      it.y -= it.vy;
      it.sway += 0.01;
    }
    const x = it.x + Math.sin(it.sway) * 18;
    if (it.bokeh) {
      const rg = c.createRadialGradient(x, it.y, 0, x, it.y, it.r);
      rg.addColorStop(0, `hsla(${bgHue + 60}, 100%, 80%, ${it.a})`);
      rg.addColorStop(1, "transparent");
      c.fillStyle = rg;
      c.beginPath(); c.arc(x, it.y, it.r, 0, 7); c.fill();
    } else {
      c.save();
      c.translate(x, it.y);
      c.rotate(it.rot + Math.sin(it.sway) * 0.2);
      c.fillStyle = `rgba(255,255,255,${it.a + 0.04})`;
      c.font = `${it.r}px Fredoka, sans-serif`;
      c.fillText(it.glyph, 0, 0);
      c.restore();
    }
    if (it.y < -80) Object.assign(it, newBgItem(false));
  }
}

/* ---------- Particules ---------- */
let pCtx, parts = [];

function initParticles() {
  pCtx = setupCanvas(document.getElementById("fx"));
}
function drawParticles() {
  const c = pCtx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= p.decay;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= 0.97; p.vy = p.vy * 0.97 + p.g;
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    c.globalAlpha = Math.min(1, p.life * 1.5);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    if (p.kind === "glyph") {
      c.fillStyle = p.color;
      c.font = `700 ${p.size}px Fredoka, sans-serif`;
      c.textAlign = "center";
      c.fillText(p.glyph, 0, p.size / 3);
    } else if (p.kind === "ring") {
      c.strokeStyle = p.color;
      c.lineWidth = 3 * p.life;
      c.beginPath(); c.arc(0, 0, p.size * (1.6 - p.life), 0, 7); c.stroke();
    } else if (p.kind === "spark") {
      c.fillStyle = p.color;
      c.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        c.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
        c.lineTo(Math.cos(a + 0.785) * p.size * 0.3, Math.sin(a + 0.785) * p.size * 0.3);
      }
      c.fill();
    } else {
      c.fillStyle = p.color;
      c.beginPath(); c.arc(0, 0, p.size * p.life, 0, 7); c.fill();
    }
    c.restore();
  }
  c.globalAlpha = 1;
}

export const FX = {
  init() {
    initBackground();
    initParticles();
    let last = 0;
    const loop = (t) => {
      if (bgRunning && t - last > 32) { drawBackground(t); last = t; } // ~30 i/s suffisent pour le décor
      if (parts.length || pCtx.__dirty) { drawParticles(); pCtx.__dirty = parts.length > 0; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => (bgRunning = !document.hidden));
  },
  setHue(h) { bgHue = h; },

  /** Éclat de couleur à l'endroit d'une note qui disparaît (coordonnées écran). */
  burst(x, y, color, { count = 10, power = 1 } = {}) {
    if (reduceMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = (1.5 + Math.random() * 3.5) * power;
      parts.push({ kind: i % 3 ? "dot" : "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.12,
        size: 3 + Math.random() * 4, color: i % 4 ? color : "#fff", life: 1, decay: 0.022 + Math.random() * 0.02,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
    }
    parts.push({ kind: "ring", x, y, vx: 0, vy: 0, g: 0, size: 22 * power, color, life: 1, decay: 0.045, rot: 0, vr: 0 });
    if (Math.random() < 0.35) {
      parts.push({ kind: "glyph", glyph: NOTE_GLYPHS[Math.floor(Math.random() * 4)], x, y, vx: (Math.random() - 0.5) * 1.5,
        vy: -2.2, g: -0.01, size: 20, color: "#fff", life: 1, decay: 0.018, rot: 0, vr: (Math.random() - 0.5) * 0.06 });
    }
    pCtx.__dirty = true;
  },

  /** Pluie de confettis pour la victoire. */
  confetti() {
    const n = reduceMotion ? 30 : 120;
    for (let i = 0; i < n; i++) {
      parts.push({ kind: i % 5 ? "dot" : "glyph", glyph: NOTE_GLYPHS[i % 4], x: Math.random() * innerWidth, y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, g: 0.04, size: 5 + Math.random() * 6,
        color: PALETTE[i % PALETTE.length], life: 1, decay: 0.006 + Math.random() * 0.006, rot: 0, vr: (Math.random() - 0.5) * 0.2 });
    }
    pCtx.__dirty = true;
  },

  /** Petites étoiles qui jaillissent d'un point (gain d'étoile, cadeau…). */
  sparkle(x, y, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ kind: "spark", x, y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, g: 0.05, size: 6, color: "#ffe066",
        life: 1, decay: 0.025, rot: 0, vr: 0.1 });
    }
    pCtx.__dirty = true;
  },
};
