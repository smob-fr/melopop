// Petits sons synthétisés (Web Audio) : chaque combinaison joue une note
// d'une gamme pentatonique, qui monte avec les réactions en chaîne.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.18, type = "triangle", vol = 0.18 } = {}) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const Sound = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; },
  unlock() { ac(); },
  swap() { tone(330, { dur: 0.08, type: "sine", vol: 0.1 }); },
  bad() { tone(196, { dur: 0.12, type: "square", vol: 0.06 }); tone(165, { at: 0.08, dur: 0.14, type: "square", vol: 0.06 }); },
  match(combo) {
    const i = Math.min(combo - 1, SCALE.length - 1);
    tone(SCALE[i]);
    tone(SCALE[i] / 2, { dur: 0.25, type: "sine", vol: 0.08 });
  },
  special() { [0, 2, 4].forEach((n, k) => tone(SCALE[n] * 2, { at: k * 0.04, dur: 0.2, vol: 0.12 })); },
  win() { [0, 2, 4, 5, 7, 9].forEach((n, k) => tone(SCALE[n], { at: k * 0.11, dur: 0.3 })); },
  lose() { [4, 3, 1, 0].forEach((n, k) => tone(SCALE[n] / 2, { at: k * 0.16, dur: 0.3, type: "sine" })); },
};
