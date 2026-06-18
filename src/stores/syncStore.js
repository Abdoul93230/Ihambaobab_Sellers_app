import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

// SyncStore = couche MÉMOIRE uniquement
// La persistance est gérée par SQLite (src/db/database.js)
// AsyncStorage n'est utilisé que pour auth token et theme

export const SyncStatus = {
  IDLE:    'idle',
  SYNCING: 'syncing',
  ERROR:   'error',
  OFFLINE: 'offline',
};

export const useSyncStore = create((set, get) => ({
  // ── État sync ───────────────────────────────────────────────────────────────
  status: SyncStatus.IDLE,
  syncError: null,
  pendingCount: 0,
  lastFetchAt: {},
  lastSyncAt: null,

  // ── Données en mémoire (chargées depuis SQLite au démarrage) ─────────────────
  produits:       [],
  ventes:         [],
  commandes:      [],
  creances:       [],
  bilanToday:     null,
  modules:        null,
  produitsStats:  null,
  commandesStats: null,
  types:          [],
  categories:     [],

  // ── Mutations état ────────────────────────────────────────────────────────────
  setStatus:      (status, error = null) => set({ status, syncError: error }),
  setPendingCount: (n) => set({ pendingCount: n }),
  markFetched:    (key) => set(s => ({ lastFetchAt: { ...s.lastFetchAt, [key]: Date.now() } })),

  // setStoreData = met à jour UNIQUEMENT la mémoire (SQLite géré par fetchers)
  setStoreData: (key, data) => {
    const ARRAY_KEYS = ['produits', 'ventes', 'commandes', 'creances'];
    const safe = ARRAY_KEYS.includes(key) ? (Array.isArray(data) ? data : []) : data;
    set({ [key]: safe });
  },

  // Alias pour compatibilité (anciens écrans appellent setLocalData)
  setLocalData: (key, data) => {
    const ARRAY_KEYS = ['produits', 'ventes', 'commandes', 'creances'];
    const safe = ARRAY_KEYS.includes(key) ? (Array.isArray(data) ? data : []) : data;
    set({ [key]: safe });
  },

  // ── Déclencheurs ─────────────────────────────────────────────────────────────

  triggerSync: async () => {
    if (get().status === SyncStatus.SYNCING) return;

    // Pas de sync si le compte est bloqué (suspended / no_subscription)
    const { useAuthStore } = require('./authStore');
    const subStatus = useAuthStore.getState().subscription?.status;
    if (subStatus === 'suspended' || subStatus === 'no_subscription') return;

    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) { set({ status: SyncStatus.OFFLINE }); return; }

    set({ status: SyncStatus.SYNCING, syncError: null });
    try {
      const { syncService } = require('../services/syncService');
      await syncService.pullStale();
      await syncService.pushPendingMutations();
      set({ status: SyncStatus.IDLE, lastSyncAt: Date.now() });
      if (__DEV__) console.log('[sync] ✅ produits:', get().produits?.length, 'commandes:', get().commandes?.length);
    } catch (e) {
      if (__DEV__) console.warn('[sync] ❌', e.message);
      set({ status: SyncStatus.ERROR, syncError: e.message });
    }
  },

  triggerFullSync: async () => {
    if (get().status === SyncStatus.SYNCING) return;

    // Pas de sync si le compte est bloqué
    const { useAuthStore } = require('./authStore');
    const subStatus = useAuthStore.getState().subscription?.status;
    if (subStatus === 'suspended' || subStatus === 'no_subscription') return;

    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) { set({ status: SyncStatus.OFFLINE }); return; }

    set({ status: SyncStatus.SYNCING, syncError: null });
    try {
      const { syncService } = require('../services/syncService');
      await syncService.pullAll();
      await syncService.pushPendingMutations();
      set({ status: SyncStatus.IDLE, lastSyncAt: Date.now() });
    } catch (e) {
      set({ status: SyncStatus.ERROR, syncError: e.message });
    }
  },

  // Invalidation ciblée event-driven (socket, après mutation)
  invalidate: async (...entities) => {
    const { syncService } = require('../services/syncService');
    await syncService.invalidateAndFetch(...entities).catch(() => {});
  },

  stopAutoSync: () => {},

  reset: () => {
    set({
      produits: [], ventes: [], commandes: [], creances: [],
      bilanToday: null, modules: null,
      produitsStats: null, commandesStats: null,
      lastFetchAt: {}, status: SyncStatus.IDLE,
      pendingCount: 0, syncError: null, lastSyncAt: null,
    });
  },
}));

