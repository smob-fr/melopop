// Mélo Pop — notifications locales (programmées sur le téléphone, sans serveur).
// Elles sont reprogrammées chaque fois que le joueur quitte le jeu, et annulées à son retour.
// Dans un navigateur, elles ne sont pas disponibles : le réglage l'indique.

const Cap = window.Capacitor;
const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const LN = native ? Cap.Plugins.LocalNotifications : null;

const IDS = { lives: 101, gift: 102, comeback: 103 };
const GIFT_HOUR = 18;          // rappel du cadeau à 18 h
const COMEBACK_DAYS = 3;       // rappel si le jeu n'est pas ouvert pendant 3 jours
const QUIET = [21, 9];         // jamais entre 21 h et 9 h : on décale au matin

function outOfQuietHours(d) {
  const h = d.getHours();
  if (h >= QUIET[0]) { d.setDate(d.getDate() + 1); d.setHours(QUIET[1], 30, 0, 0); }
  else if (h < QUIET[1]) d.setHours(QUIET[1], 30, 0, 0);
  return d;
}

export const Notify = {
  supported: native && !!LN,

  async permission() {
    if (!this.supported) return "unsupported";
    try { return (await LN.checkPermissions()).display; } catch (e) { return "denied"; }
  },

  /** Demande l'autorisation au système. Résout true si elle est accordée. */
  async request() {
    if (!this.supported) return false;
    try {
      const st = await LN.requestPermissions();
      if (st.display === "granted") {
        try {
          await LN.createChannel({ id: "rappels", name: "Rappels", description: "Vies rechargées et cadeau du jour", importance: 3 });
        } catch (e) { /* iOS : pas de canaux */ }
        return true;
      }
    } catch (e) { /* refusé */ }
    return false;
  },

  async cancelAll() {
    if (!this.supported) return;
    try { await LN.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) }); } catch (e) { /* rien à annuler */ }
  },

  /**
   * Reprogramme les rappels à partir de l'état du jeu.
   * state = { enabled, livesFullAt (ms ou null), giftOpenedToday (bool) }
   */
  async schedule(state) {
    if (!this.supported) return;
    await this.cancelAll();
    if (!state.enabled || (await this.permission()) !== "granted") return;
    const now = Date.now();
    const list = [];
    if (state.livesFullAt && state.livesFullAt > now + 60e3) {
      list.push({ id: IDS.lives, title: "Tes vies sont rechargées ❤️", body: "Les notes t'attendent : reviens jouer à Mélo Pop !",
        schedule: { at: outOfQuietHours(new Date(state.livesFullAt)), allowWhileIdle: true } });
    }
    const gift = new Date();
    gift.setHours(GIFT_HOUR, 0, 0, 0);
    if (state.giftOpenedToday || gift.getTime() < now + 60e3) gift.setDate(gift.getDate() + 1);
    list.push({ id: IDS.gift, title: "Ton cadeau du jour est prêt 🎁", body: "Ouvre-le pour gagner un bonus gratuit.",
      schedule: { at: gift, allowWhileIdle: true } });
    const back = outOfQuietHours(new Date(now + COMEBACK_DAYS * 864e5));
    list.push({ id: IDS.comeback, title: "Une nouvelle mélodie t'attend 🎵", body: "Reviens terminer ton prochain niveau !",
      schedule: { at: back, allowWhileIdle: true } });
    for (const n of list) n.channelId = "rappels";
    try { await LN.schedule({ notifications: list }); } catch (e) { console.warn("Notifications", e); }
  },
};
