# 🎵 Mélo Pop

Jeu de type « match-3 » sur le thème de la musique : échange deux notes voisines pour
aligner au moins 3 notes de la même couleur.

- **60 niveaux** avec 3 types d'objectifs : score, récolte de notes, cases givrées à dégeler (1 ou 2 couches).
- **Tuiles spéciales** :
  - 4 alignées → **ligne** (efface une rangée ou une colonne),
  - alignement en L ou en T → **bombe** (efface un carré 3×3),
  - 5 alignées → **étoile** (efface toutes les notes d'une couleur).
- **Combinaisons** : étoile + note, étoile + spéciale, étoile + étoile, bombe + ligne, ligne + ligne, bombe + bombe.
- Réactions en chaîne qui jouent une mélodie (sons générés, aucun fichier audio), indice après 6 s d'inactivité, mélange automatique quand plus aucun coup n'est possible.
- Étoiles (1 à 3), carte de progression, **5 vies** qui se rechargent (1 toutes les 20 min).
- Sauvegarde locale sur l'appareil (`localStorage`).

## Monétisation (Google AdMob)

| Format | Où | Règle |
|---|---|---|
| Bannière | carte des niveaux uniquement | jamais sur le plateau (évite les clics accidentels, interdits par AdMob) |
| Interstitielle | après une partie | à partir du niveau 4, 1 partie sur 3, 2 min minimum entre deux |
| Récompensée | fin de coups / plus de vies | +5 coups (1 fois par partie) ou +1 vie |

Le consentement RGPD passe par le formulaire Google UMP, et la transparence du suivi (ATT) est
gérée sur iOS. Un bouton « Confidentialité et publicité » apparaît dans les réglages quand la loi l'exige.
Toutes les règles se trouvent en haut de `www/js/ads.js`.

Dans un navigateur, les pubs sont **simulées**, ce qui permet de tester tout le parcours sans téléphone.

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
npm run android       # ouvre Android Studio → Build > Generate Signed Bundle (.aab)
npm run ios           # ouvre Xcode → Product > Archive
```

Après chaque modification du dossier `www/`, lance `npm run sync`.

## Checklist avant publication

1. **AdMob** (admob.google.com) : crée 2 applis (Android + iOS) et, pour chacune, 3 blocs
   d'annonces (bannière adaptative, interstitielle, récompensée).
2. Dans `www/js/ads.js` : colle tes identifiants de blocs dans `AD_UNITS`, puis passe `TESTING = false`.
3. Identifiants d'application :
   `ADMOB_ANDROID_APP_ID=ca-app-pub-xxx~yyy ADMOB_IOS_APP_ID=ca-app-pub-xxx~zzz npm run admob:config`
4. AdMob > Confidentialité et messages : active le **message RGPD** (et le message ATT pour iOS).
5. Publie un fichier **app-ads.txt** sur ton site web, déclaré comme site du développeur dans les stores.
6. Change `appId` dans `capacitor.config.json` (identifiant unique et définitif, ex. `fr.tonnom.melopop`).
7. Icône et écran de démarrage : `npx @capacitor/assets generate` à partir d'une image 1024×1024.
8. **Politique de confidentialité** en ligne (obligatoire avec la pub) : elle doit mentionner AdMob et l'identifiant publicitaire.
9. **Google Play Console** (25 $ une fois) : formulaire « Sécurité des données » (identifiant publicitaire collecté), case « Contient des annonces », classification du contenu, et test fermé avec 12 testeurs pendant 14 jours pour un nouveau compte personnel.
10. **App Store Connect** (99 $/an) : « App Privacy » (Identifiers > Device ID, utilisé pour la publicité tierce) et classification d'âge.

## Idées pour la suite

- Achat intégré « Sans pub » : la variable `removeAds` est déjà prévue dans `ads.js`, à brancher sur un plugin d'achat (RevenueCat par exemple).
- Notifications locales quand les vies sont rechargées.
- Plus de types d'obstacles (cadenas, cases vides).

## Structure

```
melopop/
├── capacitor.config.json
├── package.json
├── scripts/configure-admob.mjs   # ajoute la config AdMob dans android/ et ios/
└── www/
    ├── index.html
    ├── style.css
    └── js/
        ├── game.js     # moteur match-3 et interface
        ├── levels.js   # définition des niveaux
        ├── ads.js      # AdMob, consentement, règles de fréquence
        └── sound.js    # sons Web Audio
```
