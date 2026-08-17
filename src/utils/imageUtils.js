import { Alert } from 'react-native';

const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/**
 * Vérifie la taille d'un asset expo-image-picker avant upload.
 * Retourne true si l'image est acceptée, false sinon (avec Alert).
 * Utilise fileSize si disponible, sinon estime depuis la longueur base64.
 */
export function checkImageSize(asset) {
  if (!asset) return true;

  let bytes = asset.fileSize ?? null;

  // Estimation depuis base64 si fileSize absent
  if (bytes == null && asset.base64) {
    bytes = Math.round(asset.base64.length * 0.75);
  }

  if (bytes != null && bytes > MAX_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    Alert.alert(
      'Image trop lourde',
      `L'image fait ${mb} Mo. La taille maximale autorisée est ${MAX_MB} Mo. Veuillez en choisir une plus légère.`
    );
    return false;
  }

  return true;
}
