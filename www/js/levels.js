// Mélo Pop — définition des niveaux.
// Chaque niveau : moves (coups), colors (nb de couleurs, 4 à 6), target (score 1 étoile),
// collect (notes à récolter par couleur), ice (cases « givrées » à dégeler, 1 ou 2 couches).

const N = 8;

const PATTERNS = {
  center: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5,
  bottom: (r) => r >= 6,
  border: (r, c) => r === 0 || c === 0 || r === N - 1 || c === N - 1,
  cross: (r, c) => r === 3 || r === 4 || c === 3 || c === 4,
  diag: (r, c) => r === c || r + c === N - 1,
  checker: (r, c) => (r + c) % 2 === 0 && r >= 2,
  corners: (r, c) => (r < 3 || r > 4) && (c < 3 || c > 4),
  full: () => true,
};

function ice(pattern, layers = 1, deepPattern = null) {
  const cells = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (PATTERNS[pattern](r, c)) {
        const deep = deepPattern && PATTERNS[deepPattern](r, c);
        cells.push([r, c, deep ? 2 : layers]);
      }
  return cells;
}

// Niveaux conçus à la main (1 → 20), puis génération progressive.
const HAND = [
  { moves: 20, colors: 4, target: 3000, tutorial: true },
  { moves: 18, colors: 4, target: 2500, collect: { 0: 15 }, intro: "collect" },
  { moves: 20, colors: 5, target: 4500, boosterTuto: true },
  { moves: 18, colors: 5, target: 2000, ice: ice("center"), intro: "ice" },
  { moves: 20, colors: 5, target: 3000, collect: { 1: 20, 3: 20 }, intro: "star" },
  { moves: 22, colors: 5, target: 3000, ice: ice("bottom") },
  { moves: 18, colors: 5, target: 6000, intro: "bomb" },
  { moves: 22, colors: 5, target: 3500, ice: ice("cross"), intro: "combo" },
  { moves: 20, colors: 5, target: 4000, collect: { 2: 25, 4: 25 } },
  { moves: 24, colors: 5, target: 4000, ice: ice("border") },
  { moves: 22, colors: 6, target: 5000 },
  { moves: 22, colors: 6, target: 3500, ice: ice("diag") },
  { moves: 22, colors: 6, target: 4000, collect: { 0: 20, 1: 20, 5: 20 } },
  { moves: 25, colors: 6, target: 4500, ice: ice("center", 2), intro: "ice2" },
  { moves: 20, colors: 6, target: 8000 },
  { moves: 25, colors: 6, target: 5000, ice: ice("checker") },
  { moves: 24, colors: 6, target: 5000, collect: { 3: 30, 4: 30 }, ice: ice("bottom") },
  { moves: 26, colors: 6, target: 5500, ice: ice("corners", 1, "border") },
  { moves: 24, colors: 6, target: 6000, collect: { 0: 25, 2: 25, 5: 25 } },
  { moves: 30, colors: 6, target: 6000, ice: ice("full", 1, "center") },
];

const CYCLE = ["score", "ice", "collect", "mixed"];
const ICE_ORDER = ["center", "cross", "border", "diag", "checker", "corners", "bottom", "full"];

function generate(i) {
  const k = i - HAND.length; // 0, 1, 2…
  const kind = CYCLE[k % CYCLE.length];
  const tier = Math.floor(k / CYCLE.length);
  const base = { colors: 6, moves: 26 - Math.min(tier, 6), target: 6000 + tier * 600 };
  const pick = (n) => {
    const out = {};
    for (let j = 0; j < n; j++) out[(k + j * 2) % 6] = 25 + tier * 3;
    return out;
  };
  const pat = ICE_ORDER[tier % ICE_ORDER.length];
  if (kind === "score") return { ...base, target: 8000 + tier * 1000, moves: 22 };
  if (kind === "ice") return { ...base, ice: ice(pat, tier >= 2 ? 2 : 1, tier >= 1 ? "center" : null) };
  if (kind === "collect") return { ...base, collect: pick(2 + (tier % 2)) };
  return { ...base, moves: base.moves + 4, collect: pick(2), ice: ice(pat) };
}

export const LEVEL_COUNT = 60;

// Les niveaux sont regroupés en « mondes » de 10, chacun avec son ambiance.
export const WORLDS = [
  { name: "Prélude", hue: 285 },
  { name: "Allegro", hue: 330 },
  { name: "Andante", hue: 200 },
  { name: "Scherzo", hue: 30 },
  { name: "Nocturne", hue: 240 },
  { name: "Grand Final", hue: 160 },
];

export function getLevel(index) {
  const def = index < HAND.length ? HAND[index] : generate(index);
  return { number: index + 1, collect: {}, ice: [], ...def };
}
