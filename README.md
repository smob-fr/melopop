# 🎵 Mélo Pop

Jeu de type « match-3 » sur le thème de la musique : échange deux notes voisines pour
aligner au moins 3 notes de la même couleur.

## Contenu du jeu

- **Écran de chargement, accueil animé, carte des niveaux** en 6 mondes (Prélude, Allegro, Andante, Scherzo, Nocturne, Grand Final), chacun avec son ambiance de couleur.
- **Tutoriel interactif** au premier lancement : une main montre le geste, la zone à jouer est mise en lumière, et le joueur réalise 3 coups guidés (alignement de 3, création d'une note rayée, déclenchement). Le tutoriel peut être revu depuis les réglages.
- **Fiches « Nouveau ! »** qui présentent chaque mécanique la première fois qu'elle apparaît (récolte, bombe, givre, étoile, combinaisons, givre épais), et une page **Comment jouer** illustrée.
- **60 niveaux** avec 3 types d'objectifs : score, récolte de notes, cases givrées (1 ou 2 couches).
- **Tuiles spéciales** : 4 alignées → note rayée (efface une rangée ou une colonne) ; L ou T → bombe (carré 3×3) ; 5 alignées → étoile (efface une couleur). Combinaisons entre spéciales.
- **5 bonus**, sans coût de coup : marteau (casse une note), bombe (à poser où l'on veut), étoile (efface toute une couleur), mélange, +3 coups. Un **tutoriel des bonus** au niveau 3 les présente un par un, avec un essai guidé.
- **Gagner des bonus** : cadeau du jour, 3 étoiles sur un niveau (+1 bonus), coffre tous les 5 niveaux (+2 bonus), vidéo récompensée, ou lots dans la boutique.
- Étoiles (1 à 3), **5 vies** qui se rechargent (1 toutes les 20 min), records.
- Graphismes : notes en relief, particules, rayons, explosions, secousses, confettis, décor animé (portée qui ondule, notes qui flottent).
- **Musique d'ambiance** et effets sonores générés en direct (aucun fichier audio), **vibrations**. Chaque réglage peut être coupé.
- Respect du réglage système « réduire les animations ».

## Monétisation (Google AdMob)

| Format | Où | Règle |
|---|---|---|
| Bannière | carte des niveaux uniquement | jamais sur le plateau (évite les clics accidentels, interdits par AdMob) |
| Interstitielle | après une partie | à partir du niveau 4, 1 partie sur 3, 2 min minimum entre deux |
| Récompensée | fin de coups / plus de vies / bonus épuisé | +5 coups (1 fois par partie), +1 vie ou +1 bonus |

Le consentement RGPD passe par le formulaire Google UMP, et la transparence du suivi (ATT) est
gérée sur iOS. Un bouton « Confidentialité et publicité » apparaît dans les réglages quand la loi l'exige.
Toutes les règles se trouvent en haut de `www/js/ads.js`.

Dans un navigateur, les pubs sont **simulées**, ce qui permet de tester tout le parcours sans téléphone.

## Achats intégrés (RevenueCat)

La **boutique** est accessible depuis l'accueil, la carte, et quand le joueur n'a plus de vies ou plus de bonus.

| Identifiant produit | Type à créer dans les stores | Prix conseillé | Contenu |
|---|---|---|---|
| `melopop_noads` | **non consommable** | 3,99 € | supprime bannières et interstitielles (les vidéos bonus restent) |
| `melopop_starter` | consommable | 1,99 € | 3 bonus de chaque sorte, vies pleines (proposé une seule fois) |
| `melopop_pack_s` | consommable | 0,99 € | 2 marteaux, 2 bombes, 1 étoile, 1 mélange |
| `melopop_pack_l` | consommable | 4,99 € | 10 bonus de chaque sorte (50), vies pleines |
| `melopop_lives` | consommable | 0,99 € | toutes les vies |

Mise en place :
1. Crée un compte gratuit sur **revenuecat.com** (gratuit jusqu'à 2 500 $ de revenus par mois), puis un projet avec une appli Android et une appli iOS.
2. Crée les 5 produits ci-dessus dans **Google Play Console** (Monétiser › Produits intégrés) et dans **App Store Connect** (Achats intégrés), avec exactement les mêmes identifiants.
3. Dans RevenueCat : importe les produits, puis crée un **droit** (*entitlement*) nommé `no_ads` et rattache-lui `melopop_noads`.
4. Colle les clés publiques RevenueCat (`goog_…` et `appl_…`) dans `www/js/store.js`.
5. iOS : dans Xcode, onglet *Signing & Capabilities*, ajoute **In-App Purchase**.
6. Teste avec un compte testeur (Play Console › Tests de licence, et Sandbox sur App Store Connect) : aucun débit réel.

Le bouton **Restaurer mes achats** (dans les réglages), obligatoire pour Apple, récupère « Sans pub » après un changement de téléphone.
Les packs consommables sont stockés sur l'appareil : ils ne sont pas restaurables, comme dans la plupart des jeux.

Dans un navigateur, les achats sont **simulés** (aucun débit), pour tester le parcours.

## Notifications

Après le niveau 2, le jeu propose au joueur de recevoir des rappels, avec une explication avant la demande du système. Les rappels se règlent ensuite dans *Réglages › Rappels*. Ils sont programmés sur le téléphone, sans serveur :
- **vies rechargées** (à l'heure où elles seront toutes revenues) ;
- **cadeau du jour** à 18 h, s'il n'a pas été ouvert ;
- **rappel** si le jeu n'est pas ouvert pendant 3 jours.

Aucun rappel n'est envoyé entre 21 h et 9 h. Ils sont annulés dès que le joueur revient dans le jeu. Les autorisations Android nécessaires sont ajoutées automatiquement par le module.

## Version en ligne

Le jeu est jouable dans un navigateur sur **https://smob-fr.github.io/melopop/** (GitHub Pages, branche `main`).
Sur téléphone, « Ajouter à l'écran d'accueil » l'installe comme une appli. Dans cette version, les pubs et les achats sont simulés.

## Essayer tout de suite (navigateur)

```bash
cd melopop
npm run serve        # puis ouvre http://localhost:8080
```

## Construire les applis

Il faut Node 20 ou plus, **Android Studio** pour Android, et un **Mac avec Xcode** pour iOS.

```bash
cd melopop
npm install
npm run add:android   # crée android/ et y ajoute la config AdMob
npm run add:ios       # crée ios/ (Mac uniquement)
npm run assets        # icône et écran de démarrage, à partir de assets/
npm run android       # ouvre Android Studio → Build > Generate Signed Bundle (.aab)
npm run ios           # ouvre Xcode → Product > Archive
```

Après chaque modification du dossier `www/`, lance `npm run sync`.

## Checklist avant publication

1. **AdMob** (admob.google.com) : crée 2 applis (Android + iOS) et, pour chacune, 3 blocs
   d'annonces (bannière adaptative, interstitielle, récompensée).
2. Dans `www/js/ads.js` : colle tes identifiants de blocs dans `AD_UNITS`, puis passe `TESTING = false`. Configure aussi les achats intégrés (voir plus haut).
3. Identifiants d'application :
   `ADMOB_ANDROID_APP_ID=ca-app-pub-xxx~yyy ADMOB_IOS_APP_ID=ca-app-pub-xxx~zzz npm run admob:config`
4. AdMob > Confidentialité et messages : active le **message RGPD** (et le message ATT pour iOS).
5. Publie un fichier **app-ads.txt** sur ton site web, déclaré comme site du développeur dans les stores.
6. Change `appId` dans `capacitor.config.json` (identifiant unique et définitif, ex. `fr.tonnom.melopop`).
7. Icône et écran de démarrage : déjà fournis dans `assets/` (`icon-only.png` 1024×1024, `splash.png` 2732×2732), à générer avec `npm run assets`.
8. **Politique de confidentialité** : un modèle est prêt dans `www/privacy.html`. Complète les zones surlignées (nom, e-mail, date), puis publie-la, par exemple avec GitHub Pages (`https://smob-fr.github.io/melopop/www/privacy.html`), et indique cette adresse dans les deux stores.
9. **Google Play Console** (25 $ une fois) : formulaire « Sécurité des données » (identifiant publicitaire collecté), case « Contient des annonces », classification du contenu, et test fermé avec 12 testeurs pendant 14 jours pour un nouveau compte personnel.
10. **App Store Connect** (99 $/an) : « App Privacy » (Identifiers > Device ID, utilisé pour la publicité tierce) et classification d'âge.

## Idées pour la suite

- Plus de types d'obstacles (cadenas, cases vides).
- Musique et sons enregistrés par un musicien, pour remplacer les sons synthétisés.

## Structure

```
melopop/
├── capacitor.config.json
├── package.json
├── assets/                      # icône et écran de démarrage (sources)
├── scripts/configure-admob.mjs   # ajoute la config AdMob dans android/ et ios/
└── www/
    ├── index.html
    ├── style.css
    ├── privacy.html                # politique de confidentialité (à compléter)
    ├── fonts/                      # police Fredoka (licence OFL)
    └── js/
        ├── game.js     # moteur match-3, tutoriel, écrans
        ├── levels.js   # niveaux et mondes
        ├── fx.js       # décor animé et particules (canvas)
        ├── icons.js    # icônes SVG
        ├── ads.js      # AdMob, consentement, règles de fréquence
        ├── store.js    # achats intégrés (RevenueCat) et catalogue
        ├── notify.js   # notifications locales
        └── sound.js    # musique, sons et vibrations
```
