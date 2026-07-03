import { Image } from 'expo-image';

// Taille du batch : nombre d'images téléchargées en parallèle
// On reste conservateur pour ne pas saturer la connexion
const BATCH_SIZE = 6;

function extractProductUrls(produits) {
  const seen = new Set();
  const urls = [];
  for (const p of produits) {
    for (const field of ['image1', 'image2', 'image3']) {
      const u = p[field];
      if (u && (u.startsWith('http://') || u.startsWith('https://')) && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        const u = v.imageUrl;
        if (u && (u.startsWith('http://') || u.startsWith('https://')) && !seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    }
  }
  return urls;
}

// Précharge toutes les images produit en background par petits batches.
// N'attend pas la fin — fire-and-forget — ne bloque rien.
export function prefetchProductImages(produits) {
  if (!Array.isArray(produits) || produits.length === 0) return;
  const urls = extractProductUrls(produits);
  if (urls.length === 0) return;

  (async () => {
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(u => Image.prefetch(u)));
    }
  })();
}
