import { create } from 'zustand';
import {
  upsertNotifications,
  readNotifications,
  markNotificationReadDB,
  markAllNotificationsReadDB,
  deleteNotificationsDB,
} from '../db/database';
import apiClient from '../config/api';

const MAX_NOTIFICATIONS = 100;

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  loaded: false,
  syncing: false,

  // ── Chargement initial depuis SQLite (offline-first) ──────────────────────
  load: async () => {
    if (get().loaded) return;
    try {
      const local = await readNotifications(MAX_NOTIFICATIONS);
      set({ notifications: local, loaded: true });
    } catch (_) {
      set({ loaded: true });
    }
  },

  // ── Fetch depuis l'API + merge avec SQLite ────────────────────────────────
  // Appelé quand online : au login, au retour en foreground
  fetchFromAPI: async (sellerId) => {
    if (!sellerId || get().syncing) return;
    set({ syncing: true });
    try {
      const res = await apiClient.get(`/seller-notifications/${sellerId}?limit=50`);
      const remote = res.data?.notifications || [];

      if (remote.length === 0) return;

      // Normalise les IDs — MongoDB _id → id
      const normalized = remote.map(n => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data || {},
        readAt: n.readAt || null,
        receivedAt: n.createdAt || new Date().toISOString(),
      }));

      // Persiste en SQLite (upsert — respect du read_at local)
      await upsertNotifications(normalized);

      // Relit depuis SQLite pour avoir l'état fusionné cohérent
      const merged = await readNotifications(MAX_NOTIFICATIONS);
      set({ notifications: merged });
    } catch (_) {
      // Offline ou erreur réseau — on garde ce qu'on a en SQLite
    } finally {
      set({ syncing: false });
    }
  },

  // ── Ajout d'une notif reçue en temps réel (push foreground ou tap) ────────
  addNotification: async (notif) => {
    const { notifications } = get();
    const exists = notifications.some(n => n.id === notif.id);
    if (exists) return;

    // Persiste immédiatement en SQLite
    try {
      await upsertNotifications([notif]);
    } catch (_) {}

    const updated = [notif, ...notifications].slice(0, MAX_NOTIFICATIONS);
    set({ notifications: updated });
  },

  // ── Marquer une notif lue (local immédiat + API en background) ────────────
  markRead: async (id, sellerId) => {
    // Local immédiat — UI réactive
    const updated = get().notifications.map(n =>
      n.id === id ? { ...n, readAt: new Date().toISOString() } : n
    );
    set({ notifications: updated });

    // SQLite
    try { await markNotificationReadDB(id); } catch (_) {}

    // API en background (best-effort)
    if (sellerId) {
      apiClient.put(`/seller-notifications/${sellerId}/read`, { ids: [id] }).catch(() => {});
    }
  },

  // ── Tout marquer lu ───────────────────────────────────────────────────────
  markAllRead: async (sellerId) => {
    const now = new Date().toISOString();
    const updated = get().notifications.map(n =>
      n.readAt ? n : { ...n, readAt: now }
    );
    set({ notifications: updated });

    try { await markAllNotificationsReadDB(); } catch (_) {}

    if (sellerId) {
      apiClient.put(`/seller-notifications/${sellerId}/read`).catch(() => {});
    }
  },

  // ── Effacer tout (local seulement) ────────────────────────────────────────
  clearAll: async () => {
    set({ notifications: [] });
    try { await deleteNotificationsDB(); } catch (_) {}
  },

  unreadCount: () => get().notifications.filter(n => !n.readAt).length,
}));
