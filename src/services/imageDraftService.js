import {
  saveImageDraftDB,
  readImageDraftDB,
  deleteImageDraftDB,
  cleanupImageDraftsDB,
  purgeOldImageDraftsDB,
} from '../db/database';

// ─── API publique — SQLite BLOB ───────────────────────────────────────────────
// Stocke le base64 dans SQLite (pas d'AsyncStorage → pas de limite ~6MB)
// SQLite gère les BLOBs efficacement :
//   100 images × 500KB = 50MB dans le même fichier .db — aucun problème
//   Transactions ACID — jamais de corruption
//   Nettoyage automatique au démarrage

export const saveImageDraft = saveImageDraftDB;
export const readImageDraft  = readImageDraftDB;
export const deleteImageDraft = deleteImageDraftDB;
export const cleanupDrafts   = cleanupImageDraftsDB;
export const purgeOldDrafts  = purgeOldImageDraftsDB;
