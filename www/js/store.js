// Mélo Pop — achats intégrés.
// • Dans l'appli native : RevenueCat (@revenuecat/purchases-capacitor), qui gère
//   Google Play et l'App Store avec le même code.
// • Dans un navigateur : achats simulés, pour tester le parcours sans payer.
//
// ⚠️ Avant publication : colle tes clés publiques RevenueCat ci-dessous
// (RevenueCat › Project settings › API keys) et crée les produits listés plus bas
// dans Google Play Console et App Store Connect, avec exactement les mêmes identifiants.

const REVENUECAT_KEYS = {
  android: "", // ex. "goog_xxxxxxxxxxxxxxxx"
  ios: "",     // ex. "appl_xxxxxxxxxxxxxxxx"
};
const NO_ADS_ENTITLEMENT = "no_ads"; // « droit » à créer dans RevenueCat, relié au produit melopop_noads

/**
 * Catalogue. `price` n'est qu'une valeur par défaut : dans l'appli, c'est le prix
 * fixé dans le store (dans la devise du joueur) qui s'affiche.
 * type : "noads" (achat définitif, restaurable), "once" (proposé une seule fois),
 *        "consumable" (peut être racheté).
 */
export const PRODUCTS = [
  { id: "melopop_noads", type: "noads", title: "Sans pub", price: "3,99 €", art: "noads", badge: "Le plus demandé",
    desc: "Fini les bannières et les pubs entre les niveaux. Les vidéos bonus restent disponibles, si tu veux des cadeaux." },
  { id: "melopop_starter", type: "once", title: "Pack découverte", price: "1,99 €", art: "starter", badge: "Offre unique",
    desc: "3 bonus de chaque sorte (marteau, bombe, étoile, mélange, +3 coups) et toutes tes vies rechargées.",
    grant: { hammer: 3, bomb: 3, star: 3, shuffle: 3, moves: 3, lives: "full" } },
  { id: "melopop_pack_s", type: "consumable", title: "Petit coffret", price: "0,99 €", art: "small",
    desc: "2 marteaux, 2 bombes, 1 étoile et 1 mélange.", grant: { hammer: 2, bomb: 2, star: 1, shuffle: 1 } },
  { id: "melopop_pack_l", type: "consumable", title: "Grand coffret", price: "4,99 €", art: "big", badge: "Meilleure affaire",
    desc: "10 bonus de chaque sorte (50 en tout) et toutes tes vies rechargées.",
    grant: { hammer: 10, bomb: 10, star: 10, shuffle: 10, moves: 10, lives: "full" } },
  { id: "melopop_lives", type: "consumable", title: "Recharge de vies", price: "0,99 €", art: "lives",
    desc: "Toutes tes vies, tout de suite.", grant: { lives: "full" } },
];

const Cap = window.Capacitor;
const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const platform = native ? Cap.getPlatform() : "web";
const Purchases = native ? Cap.Plugins.Purchases : null;

let ready = false;
let storeProducts = {}; // id → produit renvoyé par le store
let onNoAds = () => {};

function hasNoAds(customerInfo) {
  return !!customerInfo?.entitlements?.active?.[NO_ADS_ENTITLEMENT];
}

/* ---------- Simulation navigateur : fausse fenêtre de paiement ---------- */
function fakePurchase(p) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "fake-ad";
    el.innerHTML = `<div class="fake-ad-box pay-sheet">
      <small>Paiement (simulation, aucun débit)</small>
      <h3>${p.title}</h3><p>${p.desc}</p><div class="fake-ad-count">${p.price}</div>
      <button class="btn" data-r="ok">Confirmer l'achat</button>
      <button class="btn ghost" data-r="no">Annuler</button></div>`;
    document.body.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) return;
      el.remove();
      resolve(b.dataset.r === "ok");
    };
  });
}

export const Store = {
  native,
  /** Vrai quand les achats sont utilisables (toujours vrai dans le navigateur, en simulation). */
  get available() { return ready; },

  /** `noAdsCallback(true)` est appelé dès qu'on sait que le joueur a acheté « Sans pub ». */
  async init(noAdsCallback) {
    onNoAds = noAdsCallback || onNoAds;
    if (!native) { ready = true; return; }
    const apiKey = REVENUECAT_KEYS[platform];
    if (!apiKey || !Purchases) { console.warn("Boutique : clé RevenueCat manquante"); return; }
    try {
      await Purchases.configure({ apiKey });
      ready = true;
      const { customerInfo } = await Purchases.getCustomerInfo();
      if (hasNoAds(customerInfo)) onNoAds(true);
      const { products } = await Purchases.getProducts({
        productIdentifiers: PRODUCTS.map((p) => p.id),
        type: "NON_SUBSCRIPTION",
      });
      for (const sp of products) storeProducts[sp.identifier] = sp;
    } catch (e) {
      console.warn("Boutique indisponible", e);
    }
  },

  priceOf(p) {
    return storeProducts[p.id]?.priceString || p.price;
  },

  /**
   * Lance l'achat. Résout { ok: true } si payé, { ok: false, cancelled } sinon.
   * C'est à l'appelant d'accorder ce qui a été acheté.
   */
  async buy(p) {
    if (!ready) return { ok: false, error: "La boutique n'est pas disponible pour le moment." };
    if (!native) return { ok: await fakePurchase({ ...p, price: this.priceOf(p) }), cancelled: true };
    const product = storeProducts[p.id];
    if (!product) return { ok: false, error: "Ce produit n'est pas disponible pour le moment." };
    try {
      const res = await Purchases.purchaseStoreProduct({ product });
      if (p.type === "noads" && hasNoAds(res.customerInfo)) onNoAds(true);
      return { ok: true };
    } catch (e) {
      const cancelled = e?.userCancelled || e?.code === "1" || e?.code === 1;
      return { ok: false, cancelled, error: cancelled ? null : "L'achat n'a pas abouti. Aucun montant n'a été débité." };
    }
  },

  /** Restaure « Sans pub » (obligatoire pour l'App Store, utile après un changement de téléphone). */
  async restore() {
    if (!native) return { ok: true, noAds: false };
    if (!ready) return { ok: false };
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      const noAds = hasNoAds(customerInfo);
      if (noAds) onNoAds(true);
      return { ok: true, noAds };
    } catch (e) {
      return { ok: false };
    }
  },
};
