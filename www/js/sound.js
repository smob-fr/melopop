// Mélo Pop — sons, musique d'ambiance et vibrations.
// Tout est synthétisé avec Web Audio : aucun fichier audio à embarquer.

// Gamme pentatonique de do majeur : chaque réaction en chaîne monte d'une note.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

let ctx = null, master = null, sfxBus = null, musicBus = null;
let sfxOn = true, musicOn = true, hapticsOn = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    // Petite réverbération (écho filtré) pour donner de l'espace.
    const delay = ctx.createDelay(); delay.delayTime.value = 0.18;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master); sfxBus.connect(delay);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0; musicBus.connect(master); musicBus.connect(delay);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.25, type = "triangle", vol = 0.16, bus = "sfx", attack = 0.01 } = {}) {
  const a = ac();
  if (!a) return;
  if (bus === "sfx" && !sfxOn) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus === "sfx" ? sfxBus : musicBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
// Son de « cloche » : fondamentale + harmonique, comme un petit carillon.
function bell(freq, opts = {}) {
  tone(freq, { type: "sine", dur: 0.6, vol: 0.14, ...opts });
  tone(freq * 2.01, { type: "sine", dur: 0.3, vol: 0.05, ...opts });
}

/* ---------- Musique d'ambiance : progression I–vi–IV–V en arpèges doux ---------- */
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25],  // do
  [220.0, 261.63, 329.63, 440.0],   // la mineur
  [174.61, 220.0, 261.63, 349.23],  // fa
  [196.0, 246.94, 293.66, 392.0],   // sol
];
const PATTERN = [0, 1, 2, 3, 2, 1, 2, 1];
let musicTimer = 0, step = 0, nextAt = 0, playing = false;
const STEP = 0.36; // secondes par note : tempo calme

function scheduleMusic() {
  const a = ctx;
  while (nextAt < a.currentTime + 0.6) {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const at = nextAt - a.currentTime;
    tone(chord[PATTERN[step % 8]] , { at, dur: 0.9, type: "sine", vol: 0.07, bus: "music", attack: 0.03 });
    if (step % 8 === 0) tone(chord[0] / 2, { at, dur: STEP * 8, type: "triangle", vol: 0.05, bus: "music", attack: 0.2 });
    step++;
    nextAt += STEP;
  }
}

function vibrate(ms) {
  if (!hapticsOn) return;
  const H = window.Capacitor?.Plugins?.Haptics;
  if (H && window.Capacitor.isNativePlatform?.()) {
    H.impact({ style: ms > 30 ? "MEDIUM" : "LIGHT" }).catch(() => {});
  } else if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* non pris en charge */ }
  }
}

export const Sound = {
  get sfx() { return sfxOn; }, set sfx(v) { sfxOn = !!v; },
  get music() { return musicOn; },
  set music(v) {
    musicOn = !!v;
    if (musicBus) musicBus.gain.setTargetAtTime(musicOn ? 0.5 : 0, ctx.currentTime, 0.3);
    if (musicOn) { if (ctx) this.startMusic(); } else this.stopMusic();
  },
  get haptics() { return hapticsOn; }, set haptics(v) { hapticsOn = !!v; },

  unlock() { ac(); if (musicOn) this.startMusic(); },
  startMusic() {
    if (!ac() || playing || !musicOn) return;
    playing = true;
    nextAt = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 150);
  },
  stopMusic() { playing = false; clearInterval(musicTimer); },
  suspend() { this.stopMusic(); if (ctx) ctx.suspend(); },
  resume() { if (ctx) ctx.resume(); if (musicOn) this.startMusic(); },

  tap() { tone(880, { dur: 0.06, type: "sine", vol: 0.06 }); },
  swap() { tone(392, { dur: 0.12, type: "sine", vol: 0.09 }); tone(523, { at: 0.06, dur: 0.12, type: "sine", vol: 0.07 }); },
  bad() { tone(220, { dur: 0.14, type: "square", vol: 0.04 }); tone(185, { at: 0.1, dur: 0.18, type: "square", vol: 0.04 }); vibrate(20); },
  match(combo) {
    const i = Math.min(combo - 1, SCALE.length - 1);
    bell(SCALE[i]);
    tone(SCALE[i] / 2, { dur: 0.35, type: "triangle", vol: 0.06 });
    vibrate(12);
  },
  special() { [0, 2, 4, 7].forEach((n, k) => bell(SCALE[n] * 1.5, { at: k * 0.05 })); vibrate(40); },
  boom() { tone(80, { dur: 0.5, type: "sine", vol: 0.3 }); tone(55, { at: 0.02, dur: 0.6, type: "triangle", vol: 0.2 }); vibrate(60); },
  star() { bell(1567.98); bell(2093, { at: 0.08 }); },
  win() { [0, 2, 4, 5, 7, 9].forEach((n, k) => bell(SCALE[n], { at: k * 0.14 })); vibrate(80); },
  lose() { [4, 3, 1, 0].forEach((n, k) => tone(SCALE[n] / 2, { at: k * 0.2, dur: 0.4, type: "sine", vol: 0.12 })); },
  gift() { [0, 4, 7, 9].forEach((n, k) => bell(SCALE[n] * 1.5, { at: k * 0.1 })); },
};
