/**
 * agentStore — session caissier agent
 *
 * Séparé de authStore pour ne pas interférer avec la session vendeur.
 * Un agent se connecte avec son téléphone + PIN.
 * Son token (12h) est stocké en SecureStore.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../config/api';
import { upsertMany, readAll, refreshAgentTokenInMutations, getDB, clearAgentVentes } from '../db/database';
import { AGENT_STORAGE_KEY } from '../config/constants';

const AGENT_SECURE_KEY = 'agentToken';

const saveAgentSession = async (data) => {
  await AsyncStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(data));
  if (data.token) {
    try { await SecureStore.setItemAsync(AGENT_SECURE_KEY, data.token); } catch (_) {}
  }
};

const clearAgentSession = async () => {
  await AsyncStorage.removeItem(AGENT_STORAGE_KEY);
  try { await SecureStore.deleteItemAsync(AGENT_SECURE_KEY); } catch (_) {}
};

// Cache produits boutique en SQLite pour le mode offline agent
async function cacheAgentProduits(storeId, token) {
  try {
    const res = await apiClient.get(`/searchProductBySeller/${storeId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const list = res.data?.produits || res.data?.products || res.data?.data || [];
    if (Array.isArray(list) && list.length > 0) {
      await upsertMany('produits', list, p => String(p._id));
    }
  } catch (_) {
    // Mode offline dès le login — les produits déjà en SQLite sont utilisés
  }
}

export const useAgentStore = create((set) => ({
  agent:           null,   // { id, name, role, storeId, storeName, storeLogo, photo }
  token:           null,
  isAuthenticated: false,
  authChecked:     false,
  loading:         false,
  error:           null,

  // ─── Vérification au démarrage ────────────────────────────────────────────
  verifyAuth: async () => {
    try {
      const raw = await AsyncStorage.getItem(AGENT_STORAGE_KEY);
      if (!raw) return set({ authChecked: true });

      const stored = JSON.parse(raw);
      if (!stored.token || !stored.agent) return set({ authChecked: true });

      // Vérification basique expiry via JWT payload (sans clef secrète)
      // Décode la partie centrale du JWT (base64url → JSON) sans librairie externe
      try {
        const parts = stored.token.split('.');
        if (parts.length === 3) {
          // JWT uses base64url — replace URL-safe chars and add padding
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '==='.slice(0, (4 - b64.length % 4) % 4);
          // global.atob is available in React Native (Hermes) since SDK 47+
          const payload = JSON.parse(global.atob ? global.atob(padded) : atob(padded));
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            await clearAgentSession();
            return set({ authChecked: true });
          }
        }
      } catch (_) {}

      set({
        agent: stored.agent,
        token: stored.token,
        isAuthenticated: true,
        authChecked: true,
      });
    } catch (_) {
      set({ authChecked: true });
    }
  },

  // ─── Connexion agent ──────────────────────────────────────────────────────
  // storeIdentifier : peut être un storeId (ObjectId) ou un storePhone (+227...)
  login: async (storeIdentifier, phone, pin) => {
    set({ loading: true, error: null });
    try {
      const isObjectId = /^[a-f0-9]{24}$/i.test(storeIdentifier);
      const body = isObjectId
        ? { storeId: storeIdentifier, phone, pin: String(pin) }
        : { storePhone: storeIdentifier, phone, pin: String(pin) };
      const res = await apiClient.post('/api/agents/login', body);
      const { token, agent } = res.data.data;

      await saveAgentSession({ token, agent });
      set({ agent, token, isAuthenticated: true, loading: false, error: null });

      // Rescue les mutations CREATE_VENTE dont l'ancien token a expiré
      try {
        const refreshed = await refreshAgentTokenInMutations(token);
        if (refreshed > 0) {
          const mod = await import('../services/syncService');
          const svc = mod.syncService || mod.default || mod;
          svc.pushPendingMutations();
        }
      } catch (_) {}

      // Cache les produits de la boutique en SQLite pour le mode offline
      cacheAgentProduits(agent.storeId, token);

      return { success: true };
    } catch (e) {
      const msg = e.response?.data?.message || 'Erreur de connexion agent';
      set({ loading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  // ─── Déconnexion ──────────────────────────────────────────────────────────
  logout: async () => {
    await clearAgentSession();
    // Purge le cache produits SQLite — évite qu'un autre agent voie les données
    // du précédent. Les mutations CREATE_VENTE pending sont gardées (elles seront
    // rescuées par refreshAgentTokenInMutations au prochain login).
    try {
      const db = getDB();
      await db.runAsync(`DELETE FROM produits`);
      await db.runAsync(`DELETE FROM meta WHERE key LIKE 'lastFetch_%'`);
      await clearAgentVentes();
    } catch (_) {}
    set({ agent: null, token: null, isAuthenticated: false, authChecked: true, error: null });
  },

  clearError: () => set({ error: null }),

  // ─── Mise à jour du nom ───────────────────────────────────────────────────
  updateName: async (name) => {
    const { agent, token } = useAgentStore.getState();
    if (!agent || !token) return { success: false };
    try {
      const res = await apiClient.patch('/api/agents/me/name', { name }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const newName = res.data?.data?.name;
      if (newName) {
        const updated = { ...agent, name: newName };
        set({ agent: updated });
        await saveAgentSession({ token, agent: updated });
      }
      return { success: true, name: newName };
    } catch (e) {
      return { success: false, error: e.response?.data?.message || 'Erreur mise à jour nom' };
    }
  },

  // ─── Mise à jour photo de profil ─────────────────────────────────────────
  updatePhoto: async (photoBase64) => {
    const { agent, token } = useAgentStore.getState();
    if (!agent || !token) return { success: false };
    try {
      const res = await apiClient.patch('/api/agents/me/photo', { photo: photoBase64 }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const newPhoto = res.data?.data?.photo;
      if (newPhoto) {
        const updated = { ...agent, photo: newPhoto };
        set({ agent: updated });
        await saveAgentSession({ token, agent: updated });
      }
      return { success: true, photo: newPhoto };
    } catch (e) {
      return { success: false, error: e.response?.data?.message || 'Erreur upload photo' };
    }
  },
}));
