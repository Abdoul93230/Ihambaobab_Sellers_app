import NetInfo from '@react-native-community/netinfo';
import apiClient, { TIMEOUTS } from '../config/api';
import { mutationQueue } from './mutationQueue';
import { useSyncStore } from '../stores/syncStore';
import { useAuthStore } from '../stores/authStore';
import {
  getDB, upsertMany, readAll, readWhere, count, getMeta, setMeta,
  getBilanCache, setBilanCache, getBilanCacheOffline, clearDB,
} from '../db/database';

// ─── Délais de fraîcheur (filet de sécurité uniquement) ──────────────────────
const STALE_AFTER = {
  modules:    Infinity,           // jamais (admin change ça)
  types:      Infinity,           // jamais (admin crée les types)
  categories: Infinity,           // jamais (admin crée les catégories)
  produits:   30 * 60 * 1000,
  creances:   15 * 60 * 1000,
  commandes:   5 * 60 * 1000,
  bilan:       3 * 60 * 1000,
};

function getSellerId() {
  const s = useAuthStore.getState().seller;
  return s?._id || s?.id || null;
}

async function isStale(entity) {
  const lastFetch = await getMeta(`lastFetch_${entity}`);
  if (!lastFetch) return true;
  const limit = STALE_AFTER[entity] ?? 5 * 60 * 1000;
  if (limit === Infinity) return false;
  return Date.now() - lastFetch > limit;
}

async function markFetched(entity) {
  await setMeta(`lastFetch_${entity}`, Date.now());
  useSyncStore.getState().markFetched(entity); // met aussi à jour le store en mémoire
}

// ─── Fetchers — écrivent dans SQLite ET dans le syncStore (mémoire) ───────────
const fetchers = {
  produits: async () => {
    const [res, pubRes] = await Promise.allSettled([
      apiClient.get('/Products?limit=50&page=1'),
      apiClient.get('/Products?status=Published&limit=1'),
    ]);

    if (res.status === 'fulfilled') {
      const d = res.value.data;
      const prods = d?.data || d?.products || [];
      const total = d?.total ?? prods.length;
      const pages = d?.pages ?? 1;

      // 1. Upsert les produits reçus
      await upsertMany('produits', prods, p => String(p._id));

      // 2. Supprimer de SQLite les produits absents du serveur
      //    → couvre suppression via web, admin, MongoDB direct
      //    → protège les produits _pendingSync (créés offline, pas encore syncs)
      if (prods.length > 0) {
        const db = getDB();
        const serverIds = prods.map(p => String(p._id));

        // Récupère les IDs locaux à comparer avec le serveur
        // Exclut les produits offline (id LIKE 'local_%') — ils ne viennent pas du serveur
        const localRows = await db.getAllAsync(
          `SELECT id FROM produits WHERE id NOT LIKE 'local_%'`
        ).catch(() => []);

        // Supprime ceux absents du serveur
        const toDelete = localRows
          .map(r => r.id)
          .filter(id => !serverIds.includes(id));

        if (toDelete.length > 0) {
          await db.withTransactionAsync(async () => {
            for (const id of toDelete) {
              await db.runAsync(`DELETE FROM produits WHERE id = ?`, [id]);
            }
          });
          if (__DEV__) console.log('[sync] produits supprimés du cache local:', toDelete.length);
        }
      }

      await setMeta('produits_pagination', { total, pages, lastPage: 1 });

      // 3. Recharge depuis SQLite — inclut les produits offline (_pendingSync)
      const allLocal = await readAll('produits').catch(() => prods);
      useSyncStore.getState().setStoreData('produits', allLocal);
    }

    if (pubRes.status === 'fulfilled') {
      const totalPublished = pubRes.value.data?.total ?? 0;
      useSyncStore.getState().setStoreData('produitsStats', {
        totalPublished,
        hasMore: (await getMeta('produits_pagination'))?.pages > 1,
      });
    }

    await markFetched('produits');
  },

  commandes: async () => {
    const sellerId = getSellerId();
    if (!sellerId) return;

    // Page 1 — données récentes pour le dashboard et l'écran commandes
    const res = await apiClient.get(`/seller-orders/${sellerId}?limit=50&page=1`);
    const d = res.data;
    const orders = d?.data?.orders || d?.orders || d?.data || [];
    const pagination = d?.data?.pagination || d?.pagination || {};

    // Stocke la pagination pour que les écrans sachent s'il y a plus
    await setMeta('commandes_pagination', {
      totalOrders: pagination.totalOrders ?? orders.length,
      totalPages:  pagination.totalPages  ?? 1,
      lastPage:    1,
    });

    await upsertMany('commandes', orders, o => String(o._id));
    const uniqueClients = orders.length > 0
      ? new Set(orders.map(o => o.client?.email || o.client?.name)).size : 0;
    useSyncStore.getState().setStoreData('commandes', orders);
    useSyncStore.getState().setStoreData('commandesStats', {
      uniqueClients,
      totalOrders: pagination.totalOrders ?? orders.length,
      hasMore: pagination.hasNext ?? false,
    });

    await markFetched('commandes');
  },

  bilan: async () => {
    const res = await apiClient.get('/api/modules/bilan/today');
    const data = res.data?.data || res.data;

    // Cache SQLite pour "today"
    await setBilanCache('today', data);
    useSyncStore.getState().setStoreData('bilanToday', data);
    await markFetched('bilan');
  },

  creances: async () => {
    const res = await apiClient.get('/api/modules/creances?limit=50');
    const d = res.data;
    const items = d?.data?.credits || d?.data || d?.creances || [];

    // Upsert les items serveur dans SQLite
    await upsertMany('creances', items, c => String(c._id));

    // Recharge depuis SQLite — inclut les créances offline (local_xxx) en attente de sync
    const allLocal = await readAll('creances').catch(() => items);
    useSyncStore.getState().setStoreData('creances', allLocal);
    await markFetched('creances');
  },

  modules: async () => {
    const res = await apiClient.get('/api/modules/acces');
    const modules = res.data?.data?.modules || null;
    useSyncStore.getState().setStoreData('modules', modules);
    await markFetched('modules');
  },

  // Types et catégories — rarement modifiés, fetchés une fois par session
  types: async () => {
    const res = await apiClient.get('/getAllType');
    const list = res.data?.data || res.data?.types || res.data || [];
    const items = Array.isArray(list) ? list : [];
    await upsertMany('types', items, t => String(t._id));
    useSyncStore.getState().setStoreData('types', items);
    await markFetched('types');
  },

  categories: async () => {
    const res = await apiClient.get('/getAllCategories');
    const list = res.data?.data || res.data || [];
    const items = Array.isArray(list) ? list : [];
    await upsertMany('categories', items, c => String(c._id));
    useSyncStore.getState().setStoreData('categories', items);
    await markFetched('categories');
  },
};

// ─── Service principal ────────────────────────────────────────────────────────
export const syncService = {
  // Charge les données depuis SQLite dans le store mémoire (démarrage / offline)
  loadFromDB: async () => {
    const [produits, commandes, creances, types, categories] = await Promise.all([
      readAll('produits').catch(() => []),
      readAll('commandes').catch(() => []),
      readAll('creances').catch(() => []),
      readAll('types').catch(() => []),
      readAll('categories').catch(() => []),
    ]);

    const totalPublished = await count('produits', 'isPublished = ?', ['Published']).catch(() => 0);
    const bilanToday = await getBilanCacheOffline('today').catch(() => null);

    const store = useSyncStore.getState();
    store.setStoreData('produits', produits);
    store.setStoreData('commandes', commandes);
    store.setStoreData('creances', creances);
    store.setStoreData('bilanToday', bilanToday);
    store.setStoreData('produitsStats', { totalPublished });
    store.setStoreData('types', types);
    store.setStoreData('categories', categories);
  },

  // Pull complet (login, pull-to-refresh forcé)
  pullAll: async () => {
    await Promise.allSettled(Object.values(fetchers).map(f => f().catch(() => {})));
  },

  // Pull intelligent via heartbeat — 1 requête légère pour savoir ce qui a changé
  // Couvre le cas : vente POS sur le web, modification produit depuis l'admin web, etc.
  pullStale: async () => {
    try {
      // 1. Une seule requête heartbeat (<30ms côté serveur)
      const res = await apiClient.get('/api/sync/heartbeat', { timeout: TIMEOUTS.SHORT });
      const serverTs = res.data?.data;
      if (!serverTs) throw new Error('heartbeat vide');

      // 2. Lit les lastFetchAt locaux depuis SQLite
      const [localCommandes, localProduits, localBilan, localCreances] = await Promise.all([
        getMeta('lastFetch_commandes'),
        getMeta('lastFetch_produits'),
        getMeta('lastFetch_bilan'),
        getMeta('lastFetch_creances'),
      ]);

      // 3. Compare : fetch seulement si le serveur est plus récent que notre dernière fetch
      const toFetch = [];
      if (serverTs.commandes && (!localCommandes || serverTs.commandes > localCommandes))
        toFetch.push('commandes');
      if (serverTs.produits && (!localProduits || serverTs.produits > localProduits))
        toFetch.push('produits');
      if (serverTs.bilan && (!localBilan || serverTs.bilan > localBilan))
        toFetch.push('bilan');
      if (serverTs.creances && (!localCreances || serverTs.creances > localCreances))
        toFetch.push('creances');

      // 4. Supprime les produits effacés côté serveur de SQLite + store
      const deletedIds = serverTs.deletedIds;
      if (deletedIds?.length > 0) {
        const db = require('../db/database');
        const store = useSyncStore.getState();

        // Supprime de SQLite
        for (const id of deletedIds) {
          await db.getDB().runAsync(`DELETE FROM produits WHERE id = ?`, [id]).catch(() => {});
        }

        // Supprime du store mémoire
        const current = store.produits ?? [];
        const filtered = current.filter(p => !deletedIds.includes(String(p._id)));
        if (filtered.length !== current.length) {
          store.setStoreData('produits', filtered);
          if (__DEV__) console.log('[sync] produits supprimés du cache:', deletedIds.length);
        }
      }

      if (toFetch.length === 0) {
        if (__DEV__) console.log('[sync] heartbeat → tout à jour, 0 fetch');
        return;
      }

      if (__DEV__) console.log('[sync] heartbeat → entités modifiées:', toFetch.join(', '));
      await Promise.allSettled(toFetch.map(key => fetchers[key]?.().catch(() => {})));

    } catch (_) {
      // Heartbeat échoue (offline, erreur serveur) → fallback sur staleness locale
      const tasks = await Promise.all(
        Object.entries(fetchers).map(async ([key, f]) => {
          const stale = await isStale(key);
          return stale ? f : null;
        })
      );
      const toRun = tasks.filter(Boolean);
      if (toRun.length) await Promise.allSettled(toRun.map(f => f().catch(() => {})));
    }
  },

  // Invalidation ciblée (socket event, après mutation)
  // Force le re-fetch de l'entité sans attendre la staleness
  invalidateAndFetch: async (...entities) => {
    
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return; // offline → pas de fetch, garder local

    await Promise.allSettled(
      entities
        .filter(e => fetchers[e])
        .map(e => {
          // Efface le timestamp → force considéré comme stale
          setMeta(`lastFetch_${e}`, 0);
          return fetchers[e]().catch(() => {});
        })
    );
  },

  // Bilan widget avec cache SQLite (fonctionne offline)
  // forceRefresh=true bypasse le cache (changement de période manuel)
  pullBilanWidget: async (period, customFrom, customTo, forceRefresh = false) => {
    // _v2 sur 7d/30d pour invalider l'ancien cache qui stockait un objet agrégé (pas un tableau)
    const cacheKey = period === 'custom'
      ? `custom_${customFrom}_${customTo}`
      : period === 'today'
      ? 'today'
      : `${period}_v2`;

    // Essaie le cache frais en premier (sauf si forceRefresh demandé)
    if (!forceRefresh) {
      const cached = await getBilanCache(cacheKey).catch(() => null);
      if (cached) return { data: cached, fromCache: true };
    }

    // Vérifie la connectivité
    
    const { isConnected } = await NetInfo.fetch();

    if (!isConnected) {
      // Offline → retourne le cache même expiré
      const stale = await getBilanCacheOffline(cacheKey).catch(() => null);
      return stale ? { data: stale, fromCache: true, stale: true } : null;
    }

    // Online → fetch
    let url;
    if (period === 'today') url = '/api/modules/bilan/today';
    else if (period === 'custom' && customFrom && customTo)
      url = `/api/modules/bilan/range?from=${customFrom}&to=${customTo}`;
    else url = `/api/modules/bilan/history?days=${period === '7d' ? 7 : 30}`;

    const res = await apiClient.get(url);
    const raw = res.data?.data || res.data;
    const data = raw;

    await setBilanCache(cacheKey, data).catch(() => {});
    return { data, fromCache: false };
  },

  // Historique jour par jour pour graphiques dashboard (avec cache SQLite)
  // Accepte soit days (7/30) soit from+to (custom)
  pullBilanHistory: async (daysOrFrom, toOrForce, forceRefresh = false) => {
    // Signature : (days, forceRefresh) OU (from, to, forceRefresh)
    let url, cacheKey, force;
    if (typeof toOrForce === 'boolean') {
      // Ancien appel : (days, forceRefresh)
      const days = daysOrFrom;
      force    = toOrForce;
      url      = `/api/modules/bilan/history?days=${days}`;
      cacheKey = `history_${days}d`;
    } else {
      // Nouvel appel : (from, to, forceRefresh)
      const from = daysOrFrom, to = toOrForce;
      force    = forceRefresh;
      url      = `/api/modules/bilan/history?from=${from}&to=${to}`;
      // v2 dans la clé pour invalider les anciens caches qui avaient les données tronquées
      cacheKey = `history_custom_v2_${from}_${to}`;
    }

    if (!force) {
      const cached = await getBilanCache(cacheKey).catch(() => null);
      if (cached) return { data: cached, fromCache: true };
    }

    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) {
      const stale = await getBilanCacheOffline(cacheKey).catch(() => null);
      return stale ? { data: stale, fromCache: true, stale: true } : null;
    }

    const res = await apiClient.get(url);
    const raw = res.data?.data || res.data;
    if (!Array.isArray(raw)) return null;

    await setBilanCache(cacheKey, raw).catch(() => {});
    return { data: raw, fromCache: false };
  },

  // Push mutations offline → serveur
  pushPendingMutations: async () => {
    const pending = await mutationQueue.getPending();
    if (!pending.length) return;

    const HANDLERS = {
      CREATE_VENTE: (p) => apiClient.post('/api/pos/vente', p),
      UPDATE_COMMANDE_STATUS: ({ commandeId, status }) => {
        const sid = getSellerId();
        if (status === 'validated')
          return apiClient.put(`/seller-orders/${commandeId}/validate/${sid}`);
        return apiClient.put(`/seller-orders/${commandeId}/toggle-product/${sid}/status`, { status });
      },
      ADD_PAIEMENT_CREANCE: ({ creanceId, montant, note }) =>
        apiClient.patch(`/api/modules/creances/${creanceId}/rembourser`, { montant, note }),
      CREATE_CREANCE: (payload) =>
        apiClient.post('/api/modules/creances', payload),
      UPDATE_CREANCE: ({ creanceId, ...body }) =>
        apiClient.patch(`/api/modules/creances/${creanceId}`, body),
      DELETE_CREANCE: ({ creanceId }) =>
        apiClient.delete(`/api/modules/creances/${creanceId}`),
      CHANGE_STATUT_CREANCE: ({ creanceId, statut }) =>
        apiClient.patch(`/api/modules/creances/${creanceId}/statut`, { statut }),
      SEND_RAPPEL_CREANCE: ({ creanceId, canal }) =>
        apiClient.post(`/api/modules/creances/${creanceId}/rappel`, { canal }),
      UPDATE_STOCK_PRODUIT: ({ produitId, quantite }) =>
        apiClient.put(`/Products/${produitId}`, { quantite }),

      // Ajustement de stock depuis l'écran Inventaire (supporte les variantes)
      ADJUST_STOCK: ({ produitId, stock, variantId }) =>
        apiClient.patch(`/api/stock/adjust/${produitId}`, { stock, variantId: variantId || null }),

      // Produit offline — images stockées en base64 dans AsyncStorage
      UPDATE_PRODUCT: async (p) => {
        const { productId, imageDraftKeys, variantDraftKeys, ...body } = p;
        const { readImageDraft, cleanupDrafts } = require('./imageDraftService');
        const form = new FormData();

        Object.entries(body).forEach(([k, v]) => {
          if (v !== undefined && v !== null)
            form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        });

        // Lit les images depuis AsyncStorage et les ajoute au FormData
        if (imageDraftKeys) {
          for (const [field, draftKey] of Object.entries(imageDraftKeys)) {
            const img = await readImageDraft(draftKey);
            if (img) form.append(field, img);
          }
        }
        if (variantDraftKeys) {
          for (const [field, draftKey] of Object.entries(variantDraftKeys)) {
            const img = await readImageDraft(draftKey);
            if (img) form.append(field, img);
          }
        }

        const res = await apiClient.put(`/Product2/${productId}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: TIMEOUTS.UPLOAD,
        });

        // Nettoie les drafts après upload réussi
        const allDraftKeys = [
          ...(imageDraftKeys ? Object.values(imageDraftKeys) : []),
          ...(variantDraftKeys ? Object.values(variantDraftKeys) : []),
        ];
        await cleanupDrafts(allDraftKeys);
        return res;
      },

      CREATE_PRODUCT: async (p) => {
        const { imageDraftKeys, variantDraftKeys, ...body } = p;
        const { readImageDraft, cleanupDrafts } = require('./imageDraftService');
        const form = new FormData();

        Object.entries(body).forEach(([k, v]) => {
          if (v !== undefined && v !== null)
            form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        });

        if (imageDraftKeys) {
          for (const [field, draftKey] of Object.entries(imageDraftKeys)) {
            const img = await readImageDraft(draftKey);
            if (img) form.append(field, img);
          }
        }
        if (variantDraftKeys) {
          for (const [field, draftKey] of Object.entries(variantDraftKeys)) {
            const img = await readImageDraft(draftKey);
            if (img) form.append(field, img);
          }
        }

        const res = await apiClient.post('/product', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: TIMEOUTS.UPLOAD,
        });

        const allDraftKeys = [
          ...(imageDraftKeys ? Object.values(imageDraftKeys) : []),
          ...(variantDraftKeys ? Object.values(variantDraftKeys) : []),
        ];
        await cleanupDrafts(allDraftKeys);
        return res;
      },
    };

    for (const mutation of pending) {
      const handler = HANDLERS[mutation.type];
      if (!handler) { await mutationQueue.markDone(mutation.id); continue; }

      // Réservation atomique — si un autre worker a déjà pris cette mutation, on la saute
      // Empêche les créations/updates multiples quand plusieurs sync se déclenchent en même temps
      const reserved = await mutationQueue.reserveForSync(mutation.id);
      if (!reserved) continue; // déjà en cours ailleurs

      try {
        await handler(mutation.payload);
        await mutationQueue.markDone(mutation.id);

        // Nettoyage des entrées locales (local_xxx) avant le refetch
        // → évite que readAll() ramène encore l'entrée locale après que le serveur a créé le vrai document
        if (mutation.type === 'CREATE_PRODUCT' || mutation.type === 'UPDATE_PRODUCT') {
          const db = getDB();
          await db.runAsync(`DELETE FROM produits WHERE id LIKE 'local_%'`);
          const current = useSyncStore.getState().produits ?? [];
          useSyncStore.getState().setStoreData(
            'produits',
            current.filter(p => !String(p._id).startsWith('local_'))
          );
        }

        if (mutation.type === 'CREATE_CREANCE') {
          const db = getDB();
          await db.runAsync(`DELETE FROM creances WHERE id LIKE 'local_%'`);
          const current = useSyncStore.getState().creances ?? [];
          useSyncStore.getState().setStoreData(
            'creances',
            current.filter(c => !String(c._id).startsWith('local_'))
          );
        }

        // Invalide et refetch l'entité concernée
        const entityMap = {
          CREATE_VENTE:          ['bilan', 'commandes'],
          UPDATE_COMMANDE_STATUS:['commandes'],
          ADD_PAIEMENT_CREANCE:  ['creances'],
          CREATE_CREANCE:        ['creances'],
          UPDATE_CREANCE:        ['creances'],
          DELETE_CREANCE:        ['creances'],
          CHANGE_STATUT_CREANCE:  ['creances'],
          SEND_RAPPEL_CREANCE:    ['creances'],
          UPDATE_STOCK_PRODUIT:  ['produits'],
          ADJUST_STOCK:          ['produits'],
          UPDATE_PRODUCT:        ['produits'],
          CREATE_PRODUCT:        ['produits'],
        };
        const toInvalidate = entityMap[mutation.type];
        if (toInvalidate) {
          await syncService.invalidateAndFetch(...toInvalidate);
        }
      } catch (_) {
        await mutationQueue.markError(mutation.id);
      }
    }
    await mutationQueue.cleanup();
  },

  // Charge la page suivante de commandes (scroll infini)
  fetchNextCommandesPage: async () => {
    const sellerId = getSellerId();
    if (!sellerId) return false;

    const pagination = await getMeta('commandes_pagination');
    if (!pagination) return false;
    const { lastPage, totalPages } = pagination;
    if (lastPage >= totalPages) return false; // déjà tout chargé

    const nextPage = lastPage + 1;
    const res = await apiClient.get(`/seller-orders/${sellerId}?limit=50&page=${nextPage}`);
    const d = res.data;
    const orders = d?.data?.orders || d?.orders || d?.data || [];
    const newPagination = d?.data?.pagination || d?.pagination || {};

    // Upsert dans SQLite (ajoute sans écraser les pages précédentes)
    await upsertMany('commandes', orders, o => String(o._id));
    await setMeta('commandes_pagination', {
      ...pagination,
      lastPage: nextPage,
      totalOrders: newPagination.totalOrders ?? pagination.totalOrders,
      totalPages: newPagination.totalPages ?? totalPages,
    });

    // APPEND au store — n'écrase pas les pages précédentes déjà en mémoire
    const current = useSyncStore.getState().commandes ?? [];
    const existingIds = new Set(current.map(o => String(o._id)));
    const newOnly = orders.filter(o => !existingIds.has(String(o._id)));
    if (newOnly.length > 0) {
      useSyncStore.getState().setStoreData('commandes', [...current, ...newOnly]);
    }

    return nextPage < (newPagination.totalPages ?? totalPages);
  },

  // Charge la page suivante de produits (scroll infini)
  fetchNextProduitsPage: async () => {
    const pagination = await getMeta('produits_pagination');
    if (!pagination) return false;
    const { lastPage, pages } = pagination;
    if (lastPage >= pages) return false;

    const nextPage = lastPage + 1;
    const res = await apiClient.get(`/Products?limit=50&page=${nextPage}`);
    const d = res.data;
    const prods = d?.data || d?.products || [];

    await upsertMany('produits', prods, p => String(p._id));
    await setMeta('produits_pagination', { ...pagination, lastPage: nextPage });

    // APPEND au store — évite O(n²) reload complet à chaque page
    const current = useSyncStore.getState().produits ?? [];
    const existingIds = new Set(current.map(p => String(p._id)));
    const newOnly = prods.filter(p => !existingIds.has(String(p._id)));
    if (newOnly.length > 0) {
      useSyncStore.getState().setStoreData('produits', [...current, ...newOnly]);
    }

    return nextPage < (d?.pages ?? pages);
  },

  // Recherche un produit par nom — d'abord local, puis réseau si pas trouvé
  searchProduit: async (query) => {
    
    // Recherche locale SQLite (LIKE)
    const localResults = await readWhere(
      'produits',
      "LOWER(json_extract(data, '$.name')) LIKE ?",
      [`%${query.toLowerCase()}%`]
    ).catch(() => []);

    if (localResults.length > 0) return localResults;

    // Pas trouvé local → cherche sur le serveur
    
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return [];

    const res = await apiClient.get(`/Products?search=${encodeURIComponent(query)}&limit=20`);
    const d = res.data;
    const prods = d?.data || d?.products || [];
    if (prods.length) await upsertMany('produits', prods, p => String(p._id));
    return prods;
  },

  // Fetch ciblé d'un seul fetcher par nom (utilisé pour le lazy-load types/catégories)
  fetchOne: async (entity) => {
    const f = fetchers[entity];
    if (f) await f().catch(() => {});
  },

  queueMutation: async (type, payload) => mutationQueue.push(type, payload),

  // Reset complet (logout)
  reset: async () => {
    await clearDB().catch(() => {});
    mutationQueue.reset();
  },
};
