// Ajoute la configuration AdMob aux projets natifs générés par Capacitor.
// Usage : node scripts/configure-admob.mjs   (après `npx cap add android` / `npx cap add ios`)
// Remplace les identifiants d'APPLICATION de test par les tiens avant publication.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ANDROID_APP_ID = process.env.ADMOB_ANDROID_APP_ID || "ca-app-pub-3940256099942544~3347511713"; // test
const IOS_APP_ID = process.env.ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511";         // test

// ---------- Android ----------
const manifest = "android/app/src/main/AndroidManifest.xml";
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, "utf8");
  if (!xml.includes("com.google.android.gms.ads.APPLICATION_ID")) {
    xml = xml.replace(
      /<application([^>]*)>/,
      `<application$1>\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${ANDROID_APP_ID}"/>`
    );
  } else {
    xml = xml.replace(/(APPLICATION_ID" android:value=")[^"]*/, `$1${ANDROID_APP_ID}`);
  }
  if (!xml.includes("com.google.android.gms.permission.AD_ID")) {
    xml = xml.replace(/<\/manifest>/, `    <uses-permission android:name="com.google.android.gms.permission.AD_ID"/>\n</manifest>`);
  }
  writeFileSync(manifest, xml);
  console.log("✓ Android : AndroidManifest.xml configuré");
}

// ---------- iOS ----------
const plist = "ios/App/App/Info.plist";
if (existsSync(plist)) {
  let x = readFileSync(plist, "utf8");
  const add = (k, v) => {
    if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${k}</key>\n\t${v}\n</dict>\n</plist>\n`);
  };
  if (x.includes("<key>GADApplicationIdentifier</key>")) {
    x = x.replace(/(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*/, `$1${IOS_APP_ID}`);
  } else add("GADApplicationIdentifier", `<string>${IOS_APP_ID}</string>`);
  add("NSUserTrackingUsageDescription",
    "<string>Ton identifiant sert uniquement à afficher des publicités plus pertinentes dans Mélo Pop.</string>");
  // Réseaux publicitaires SKAdNetwork (Google). Liste complète : https://developers.google.com/admob/ios/3p-skadnetworks
  add("SKAdNetworkItems", `<array>
\t\t<dict><key>SKAdNetworkIdentifier</key><string>cstr6suwn9.skadnetwork</string></dict>
\t</array>`);
  writeFileSync(plist, x);
  console.log("✓ iOS : Info.plist configuré");
}
