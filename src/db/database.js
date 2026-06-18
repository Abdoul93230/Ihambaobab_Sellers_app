import * as SQLite from 'expo-sqlite';

let _db = null;

// ─── Schéma de la base locale ─────────────────────────────────────────────────
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS produits (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    isPublished TEXT NOT NULL DEFAULT 'UnPublished',
    quantite    INTEGER DEFAULT 0,
    updatedAt   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS commandes (
    id        TEXT PRIMARY KEY,
    data      TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'pending',
    date      INTEGER DEFAULT 0,
    updatedAt INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS creances (
    id        TEXT PRIMARY KEY,
    data      TEXT NOT NULL,
    statut    TEXT NOT NULL DEFAULT 'en_attente',
    updatedAt INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bilan_cache (
    period_key TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS types (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS image_drafts (
    key        TEXT PRIMARY KEY,
    data       BLOB NOT NULL,
    ext        TEXT NOT NULL DEFAULT 'jpg',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mutations (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    retries    INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_produits_published ON produits(isPublished);
  CREATE INDEX IF NOT EXISTS idx_commandes_date ON commandes(date DESC);
  CREATE INDEX IF NOT EXISTS idx_commandes_status ON commandes(status);
  CREATE INDEX IF NOT EXISTS idx_mutations_status ON mutations(status);
`;

// ─── Initialisation (appelé une seule fois au démarrage) ─────────────────────
export async function initDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('seller.db');
  await _db.execAsync(SCHEMA);
  return _db;
}

export function getDB() {
  if (!_db) throw new Error('DB non initialisée — appelle initDB() d\'abord');
  return _db;
}

// ─── Helpers génériques ───────────────────────────────────────────────────────

// Sauvegarde un array d'objets dans une table (upsert)
export async function upsertMany(table, rows, getId) {
  if (!rows?.length) return;
  const db = getDB();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const id = getId(row);
      const data = JSON.stringify(row);
      const updatedAt = new Date(row.updatedAt || row.date || Date.now()).getTime();

      if (table === 'produits') {
        await db.runAsync(
          `INSERT INTO produits(id, data, isPublished, quantite, updatedAt)
           VALUES(?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             data=excluded.data, isPublished=excluded.isPublished,
             quantite=excluded.quantite, updatedAt=excluded.updatedAt`,
          [id, data, row.isPublished || 'UnPublished', row.quantite ?? 0, updatedAt]
        );
      } else if (table === 'commandes') {
        const status = row.etatTraitement || row.statusLivraison || 'pending';
        await db.runAsync(
          `INSERT INTO commandes(id, data, status, date, updatedAt)
           VALUES(?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             data=excluded.data, status=excluded.status,
             date=excluded.date, updatedAt=excluded.updatedAt`,
          [id, data, status, new Date(row.date || Date.now()).getTime(), updatedAt]
        );
      } else if (table === 'creances') {
        await db.runAsync(
          `INSERT INTO creances(id, data, statut, updatedAt)
           VALUES(?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             data=excluded.data, statut=excluded.statut, updatedAt=excluded.updatedAt`,
          [id, data, row.statut || 'en_attente', updatedAt]
        );
      } else if (table === 'types' || table === 'categories') {
        await db.runAsync(
          `INSERT INTO ${table}(id, data) VALUES(?, ?)
           ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
          [id, data]
        );
      }
    }
  });
}

// Ordre de tri par table — cohérent avec ce que le serveur retourne
const TABLE_ORDER = {
  produits:  'updatedAt DESC',
  commandes: 'date DESC',
  creances:  'updatedAt DESC',
  types:     'rowid ASC',
  categories:'rowid ASC',
};

// Lit tous les enregistrements d'une table avec tri cohérent
export async function readAll(table) {
  const db = getDB();
  const order = TABLE_ORDER[table] || 'rowid DESC';
  const rows = await db.getAllAsync(`SELECT data FROM ${table} ORDER BY ${order}`);
  return rows.map(r => JSON.parse(r.data));
}

// Requête avec filtre et tri
export async function readWhere(table, whereClause, params = []) {
  const db = getDB();
  const order = TABLE_ORDER[table] || 'rowid DESC';
  const rows = await db.getAllAsync(
    `SELECT data FROM ${table} WHERE ${whereClause} ORDER BY ${order}`,
    params
  );
  return rows.map(r => JSON.parse(r.data));
}

// Count avec filtre optionnel
export async function count(table, whereClause = '1=1', params = []) {
  const db = getDB();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) as n FROM ${table} WHERE ${whereClause}`,
    params
  );
  return row?.n ?? 0;
}

// ─── Bilan cache ──────────────────────────────────────────────────────────────
const BILAN_STALE_MS = 3 * 60 * 1000; // 3 min

export async function getBilanCache(periodKey) {
  const db = getDB();
  const row = await db.getFirstAsync(
    'SELECT data, fetched_at FROM bilan_cache WHERE period_key = ?',
    [periodKey]
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > BILAN_STALE_MS) return null; // expiré
  return JSON.parse(row.data);
}

export async function setBilanCache(periodKey, data) {
  const db = getDB();
  await db.runAsync(
    `INSERT INTO bilan_cache(period_key, data, fetched_at)
     VALUES(?, ?, ?)
     ON CONFLICT(period_key) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at`,
    [periodKey, JSON.stringify(data), Date.now()]
  );
}

// Retourne le cache même expiré (pour mode offline)
export async function getBilanCacheOffline(periodKey) {
  const db = getDB();
  const row = await db.getFirstAsync(
    'SELECT data FROM bilan_cache WHERE period_key = ?',
    [periodKey]
  );
  return row ? JSON.parse(row.data) : null;
}

// ─── Meta (timestamps de dernière fetch) ─────────────────────────────────────
export async function getMeta(key) {
  const db = getDB();
  const row = await db.getFirstAsync('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

export async function setMeta(key, value) {
  const db = getDB();
  await db.runAsync(
    `INSERT INTO meta(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, JSON.stringify(value)]
  );
}

// ─── Image drafts (SQLite BLOB) ───────────────────────────────────────────────
// Stocke le base64 directement dans SQLite — pas d'AsyncStorage, pas de limite
export async function saveImageDraftDB(base64, ext = 'jpg') {
  const db = getDB();
  const key = `img_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.runAsync(
    `INSERT INTO image_drafts(key, data, ext, created_at) VALUES(?, ?, ?, ?)`,
    [key, base64, ext, Date.now()]
  );
  return key;
}

export async function readImageDraftDB(key) {
  if (!key) return null;
  const db = getDB();
  const row = await db.getFirstAsync(
    `SELECT data, ext FROM image_drafts WHERE key = ?`,
    [key]
  );
  if (!row) return null;
  return {
    uri:  `data:image/${row.ext === 'png' ? 'png' : 'jpeg'};base64,${row.data}`,
    name: `draft.${row.ext}`,
    type: row.ext === 'png' ? 'image/png' : 'image/jpeg',
  };
}

export async function deleteImageDraftDB(key) {
  if (!key) return;
  const db = getDB();
  await db.runAsync(`DELETE FROM image_drafts WHERE key = ?`, [key]);
}

export async function cleanupImageDraftsDB(keys) {
  if (!keys?.length) return;
  const db = getDB();
  await db.withTransactionAsync(async () => {
    for (const key of keys) {
      await db.runAsync(`DELETE FROM image_drafts WHERE key = ?`, [key]);
    }
  });
}

export async function purgeOldImageDraftsDB() {
  const db = getDB();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await db.runAsync(`DELETE FROM image_drafts WHERE created_at < ?`, [cutoff]);
}

// ─── Mutations queue (SQLite) ─────────────────────────────────────────────────
export async function pushMutation(type, payload) {
  const db = getDB();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO mutations(id, type, payload, status, retries, created_at, updated_at)
     VALUES(?, ?, ?, 'pending', 0, ?, ?)`,
    [id, type, JSON.stringify(payload), now, now]
  );
  return id;
}

export async function getPendingMutations() {
  const db = getDB();
  const now = Date.now();
  try {
    // Remet en pending les mutations syncing depuis > 2min (crash, app tuée)
    await db.runAsync(
      `UPDATE mutations SET status='pending', updated_at=?
       WHERE status='syncing' AND updated_at < ?`,
      [now, now - 2 * 60 * 1000]
    );
  } catch (_) {}
  const rows = await db.getAllAsync(
    `SELECT * FROM mutations WHERE status IN ('pending', 'error') ORDER BY created_at ASC`
  ).catch(() => []);
  return rows.map(r => {
    try { return { ...r, payload: JSON.parse(r.payload) }; }
    catch (_) { return null; }
  }).filter(Boolean);
}

// Réservation atomique — retourne true si on a bien réservé cette mutation
export async function markMutationSyncing(id) {
  const db = getDB();
  const result = await db.runAsync(
    `UPDATE mutations SET status='syncing', updated_at=?
     WHERE id=? AND status IN ('pending', 'error')`,
    [Date.now(), id]
  );
  return result.changes > 0;
}

export async function markMutationDone(id) {
  try {
    const db = getDB();
    await db.runAsync(
      `UPDATE mutations SET status='done', updated_at=? WHERE id=?`,
      [Date.now(), id]
    );
  } catch (e) {
    if (__DEV__) console.warn('[db] markMutationDone failed:', e.message);
  }
}

export async function markMutationError(id) {
  try {
    const db = getDB();
    await db.runAsync(
      `UPDATE mutations SET
         retries = retries + 1,
         status = CASE WHEN retries + 1 >= 3 THEN 'failed' ELSE 'error' END,
         updated_at = ?
       WHERE id = ?`,
      [Date.now(), id]
    );
  } catch (e) {
    if (__DEV__) console.warn('[db] markMutationError failed:', e.message);
  }
}

export async function getPendingMutationsCount() {
  const db = getDB();
  // Compte uniquement pending + error + syncing (pas done/failed)
  // syncing comptés car représentent des actions en cours non finalisées
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) as n FROM mutations WHERE status IN ('pending', 'error', 'syncing')`
  );
  return row?.n ?? 0;
}

export async function cleanupMutations() {
  const db = getDB();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await db.runAsync(
    `DELETE FROM mutations WHERE status = 'done' AND updated_at < ?`,
    [cutoff]
  );
}

// ─── Bilan optimiste (mise à jour locale après vente POS) ────────────────────
// delta : { posTotal, posVentes, articles, modePaiement }
export async function updateBilanCache(delta) {
  const db = getDB();
  const row = await db.getFirstAsync(
    `SELECT data FROM bilan_cache WHERE period_key = 'today'`
  );
  if (!row) return null; // pas de cache chargé, rien à mettre à jour
  const current = JSON.parse(row.data);

  const currentModeP = current.pos?.modePaiement || { ESPECES: 0, MOBILE_MONEY: 0, AUTRE: 0 };
  const mode = delta.modePaiement || 'AUTRE';

  const updated = {
    ...current,
    pos: {
      ...current.pos,
      total:  (current.pos?.total  || 0) + (delta.posTotal  || 0),
      ventes: (current.pos?.ventes || 0) + (delta.posVentes || 0),
      modePaiement: {
        ...currentModeP,
        [mode]: (currentModeP[mode] || 0) + (delta.posTotal || 0),
      },
    },
    totalGeneral:   (current.totalGeneral   || 0) + (delta.posTotal || 0),
    articlesVendus: (current.articlesVendus || 0) + (delta.articles || 0),
  };

  await db.runAsync(
    `UPDATE bilan_cache SET data=? WHERE period_key='today'`,
    [JSON.stringify(updated)]
  );
  return updated;
}

// ─── Reset complet (logout) ───────────────────────────────────────────────────
export async function clearDB() {
  const db = getDB();
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM produits;
      DELETE FROM commandes;
      DELETE FROM creances;
      DELETE FROM bilan_cache;
      DELETE FROM mutations;
      DELETE FROM image_drafts;
      DELETE FROM types;
      DELETE FROM categories;
      DELETE FROM meta;
    `);
  });
}
