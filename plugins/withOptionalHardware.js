/**
 * Play Console : les fonctions matérielles « déduites » (portrait, wifi, appareil photo, localisation…)
 * ne doivent pas empêcher l'installation. Elles sont déclarées facultatives dans le manifeste,
 * sinon tablettes, ordinateurs et casques Android XR qui ne les ont pas ne peuvent pas installer l'app.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL = [
  'android.hardware.screen.portrait',
  'android.hardware.screen.landscape',
  'android.hardware.wifi',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.microphone',
  'android.hardware.telephony',
  'android.hardware.touchscreen',
];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] || []).filter((f) => !OPTIONAL.includes(f.$?.['android:name']));
    for (const name of OPTIONAL) features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    manifest['uses-feature'] = features;
    return cfg;
  });
};
