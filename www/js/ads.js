// Mélo Pop — couche publicitaire.
// • Dans l'appli native (Capacitor) : Google AdMob via @capacitor-community/admob,
//   avec le formulaire de consentement RGPD (UMP) de Google.
// • Dans un navigateur : publicités simulées, pour tester le parcours.
//
// ⚠️ Avant publication : remplace les identifiants de TEST ci-dessous par tes
// propres blocs d'annonces AdMob, et passe TESTING à false.

const TESTING = true;

const AD_UNITS = {
  android: {
    banner: "ca-app-pub-3940256099942544/9214589741",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917",
  },
  ios: {
    banner: "ca-app-pub-3940256099942544/2435281174",
    interstitial: "ca-app-pub-3940256099942544/4411468910",
    rewarded: "ca-app-pub-3940256099942544/1712485313",
  },
};

// Règles de fréquence (confort du joueur + règles AdMob).
const INTERSTITIAL_EVERY = 3;        // une interstitielle toutes les 3 parties terminées
const INTERSTITIAL_COOLDOWN = 120e3; // et jamais plus d'une toutes les 2 minutes
const INTERSTITIAL_FROM_LEVEL = 4;   // pas de pub pendant la découverte du jeu

const Cap = window.Capacitor;
const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const platform = native ? Cap.getPlatform() : "web";
const AdMob = native ? Cap.Plugins.AdMob : null;
const ids = AD_UNITS[platform] || AD_UNITS.android;

let ready = false;
let canRequestAds = false;
let privacyRequired = false;
let gamesSinceAd = 0;
let lastAdAt = 0;
let removeAds = false; // à brancher sur un achat intégré « Sans pub » plus tard

async function preload() {
  if (!native || !canRequestAds) return;
  try { await AdMob.prepareInterstitial({ adId: ids.interstitial, isTesting: TESTING }); } catch (e) { /* réessayé plus tard */ }
  try { await AdMob.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: TESTING }); } catch (e) { /* idem */ }
}

/* ---------- Simulation navigateur ---------- */
function fakeAd({ title, seconds, closable }) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "fake-ad";
    el.innerHTML = `<div class="fake-ad-box"><small>Publicité (simulation)</small><h3>${title}</h3>
      <div class="fake-ad-count">${seconds}</div><button class="btn" disabled>Fermer</button></div>`;
    document.body.appendChild(el);
    const btn = el.querySelector("button");
    const count = el.querySelector(".fake-ad-count");
    let s = seconds;
    const timer = setInterval(() => {
      s--;
      count.textContent = s > 0 ? s : "✓";
      if (s <= 0) { clearInterval(timer); btn.disabled = false; }
    }, 1000);
    if (closable) btn.disabled = false;
    btn.onclick = () => {
      clearInterval(timer);
      el.remove();
      resolve(s <= 0);
    };
  });
}

export const Ads = {
  native,

  async init() {
    if (!native) { ready = true; canRequestAds = true; return; }
    try {
      await AdMob.initialize({ initializeForTesting: TESTING });
      // Consentement RGPD (formulaire Google UMP, à configurer dans la console AdMob).
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === "REQUIRED") {
        info = await AdMob.showConsentForm();
      }
      canRequestAds = info.canRequestAds !== false;
      privacyRequired = info.privacyOptionsRequirementStatus === "REQUIRED";
      // iOS : App Tracking Transparency (le message vient de Info.plist).
      if (platform === "ios") {
        try {
          const st = await AdMob.trackingAuthorizationStatus();
          if (st.status === "notDetermined") await AdMob.requestTrackingAuthorization();
        } catch (e) { /* iOS < 14 */ }
      }
      ready = true;
      preload();
    } catch (e) {
      console.warn("AdMob indisponible", e);
    }
  },

  /** Faut-il afficher un bouton « Confidentialité » dans les réglages ? */
  get privacyOptionsRequired() { return privacyRequired; },

  async showPrivacyOptions() {
    if (native) { try { await AdMob.showPrivacyOptionsForm(); } catch (e) { console.warn(e); } }
  },

  async showBanner() {
    if (removeAds || !ready) return;
    if (!native) { document.body.classList.add("has-fake-banner"); return; }
    if (!canRequestAds) return;
    try {
      await AdMob.showBanner({
        adId: ids.banner, adSize: "ADAPTIVE_BANNER", position: "BOTTOM_CENTER", margin: 0, isTesting: TESTING,
      });
      document.body.classList.add("has-banner");
    } catch (e) { console.warn(e); }
  },

  async hideBanner() {
    document.body.classList.remove("has-banner", "has-fake-banner");
    if (native) { try { await AdMob.hideBanner(); } catch (e) { /* pas de bannière */ } }
  },

  /** Appelé à la fin de chaque partie ; n'affiche une pub que si les règles le permettent. */
  async maybeInterstitial(levelNumber) {
    if (removeAds || !ready || levelNumber < INTERSTITIAL_FROM_LEVEL) return;
    gamesSinceAd++;
    if (gamesSinceAd < INTERSTITIAL_EVERY || Date.now() - lastAdAt < INTERSTITIAL_COOLDOWN) return;
    gamesSinceAd = 0;
    lastAdAt = Date.now();
    if (!native) { await fakeAd({ title: "Pub interstitielle", seconds: 3, closable: false }); return; }
    if (!canRequestAds) return;
    try { await AdMob.showInterstitial(); } catch (e) { /* pas encore chargée */ }
    preload();
  },

  /** Pub récompensée. Résout `true` si le joueur l'a regardée jusqu'au bout. */
  async rewarded() {
    if (!ready) return false;
    if (!native) return fakeAd({ title: "Pub récompensée", seconds: 5, closable: true });
    if (!canRequestAds) return false;
    try {
      const reward = await AdMob.showRewardVideoAd();
      lastAdAt = Date.now(); // évite d'enchaîner avec une interstitielle
      preload();
      return !!reward;
    } catch (e) {
      preload();
      return false;
    }
  },
};
