import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import apiClient, { BACKEND_URL } from '../config/api';
import { STORAGE_KEY } from '../config/constants';
import axios from 'axios';

const saveSession = async (data) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (data.token) {
    try { await SecureStore.setItemAsync('sellerToken', data.token); } catch (_) {}
  }
};

const clearSession = async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
  try { await SecureStore.deleteItemAsync('sellerToken'); } catch (_) {}
};

const resetSyncStore = () => {
  try {
    const { useSyncStore } = require('./syncStore');
    useSyncStore.getState().reset();
    // Purge SQLite
    const { syncService } = require('../services/syncService');
    syncService.reset().catch(() => {});
  } catch (_) {}
};

export const useAuthStore = create((set) => ({
  seller: null,
  token: null,
  subscription: null,
  isAuthenticated: false,
  authChecked: false,
  loading: false,
  error: null,
  isResubscriptionToken: false, // true = token limité abonnement uniquement (1h)

  // ─── Vérification au démarrage de l'app ───────────────────────────────────
  verifyAuth: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return set({ authChecked: true });

      const stored = JSON.parse(raw);
      if (!stored.token || !stored.seller) return set({ authChecked: true });

      const sellerId = stored.seller?.id || stored.seller?._id;

      if (sellerId) {
        try {
          // GET /Sellerverify/:id — retourne { message, isvalid, subscriptionStatus }
          const res = await axios.get(`${BACKEND_URL}/Sellerverify/${sellerId}`, {
            headers: { Authorization: `Bearer ${stored.token}` },
            timeout: 8000,
          });

          if (res.data?.code === 'ACCOUNT_SUSPENDED') {
            // Garde la session avec statut suspendu → le navigator affiche le mur
            return set({
              seller: stored.seller, token: stored.token,
              subscription: { ...(stored.subscription || {}), status: 'suspended' },
              isAuthenticated: true, authChecked: true,
            });
          }

          // Mise à jour des champs dynamiques (isvalid, subscriptionStatus)
          const updatedSeller = {
            ...stored.seller,
            isvalid: res.data?.isvalid ?? stored.seller?.isvalid,
            subscriptionStatus: res.data?.subscriptionStatus ?? stored.seller?.subscriptionStatus,
          };
          await saveSession({ token: stored.token, seller: updatedSeller, subscription: stored.subscription });
          set({ seller: updatedSeller, token: stored.token, subscription: stored.subscription || null, isAuthenticated: true, authChecked: true, isResubscriptionToken: false });

          // Rafraîchit subscription ET logo en arrière-plan (non bloquant)
          // subscription.daysRemaining doit être recalculé côté serveur à chaque démarrage
          Promise.allSettled([
            // Abonnement frais depuis le serveur
            apiClient.get('/api/seller/subscription/complete-status', {
              headers: { Authorization: `Bearer ${stored.token}` },
            }).then(r => {
              const data = r.data?.data;
              if (!data) return;
              const freshSubscription = {
                planName:     data.activeSubscription?.planType || stored.subscription?.planName || 'Starter',
                status:       data.statusInfo?.status || stored.subscription?.status || 'active',
                daysRemaining: (data.statusInfo?.status === 'trial' || data.statusInfo?.status === 'active') && data.activeSubscription?.endDate
                  ? Math.ceil((new Date(data.activeSubscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
                  : null,
                commission:   data.activeSubscription?.commission ?? stored.subscription?.commission ?? 5,
              };
              saveSession({ token: stored.token, seller: updatedSeller, subscription: freshSubscription });
              set({ subscription: freshSubscription });
            }),

            // Logo si absent
            !updatedSeller.logo
              ? apiClient.get(`/getSeller/${sellerId}`, {
                  headers: { Authorization: `Bearer ${stored.token}` },
                }).then(r => {
                  const full = r.data?.data || r.data?.seller || r.data;
                  if (full?.logo) {
                    const withLogo = { ...updatedSeller, logo: full.logo, phone: full.phone };
                    saveSession({ token: stored.token, seller: withLogo, subscription: stored.subscription });
                    set({ seller: withLogo });
                  }
                })
              : Promise.resolve(),
          ]).catch(() => {});
          return;
        } catch (networkErr) {
          if (!networkErr.response) {
            return set({ seller: stored.seller, token: stored.token, subscription: stored.subscription || null, isAuthenticated: true, authChecked: true });
          }
          if (networkErr.response?.status === 401) {
            await clearSession();
            return set({ seller: null, token: null, isAuthenticated: false, authChecked: true });
          }
          if (networkErr.response?.status === 403) {
            // Token resubscription → garder connecté avec statut suspendu
            return set({
              seller: stored.seller, token: stored.token,
              subscription: { ...(stored.subscription || {}), status: stored.subscription?.status || 'suspended' },
              isAuthenticated: true, authChecked: true, isResubscriptionToken: true,
            });
          }
          return set({ seller: stored.seller, token: stored.token, subscription: stored.subscription || null, isAuthenticated: true, authChecked: true });
        }
      }

      set({ seller: stored.seller, token: stored.token, subscription: stored.subscription || null, isAuthenticated: true, authChecked: true });
    } catch (_) {
      set({ authChecked: true });
    }
  },

  // ─── Connexion ────────────────────────────────────────────────────────────
  login: async (identifier, password) => {
    set({ loading: true, error: null });
    try {
      // Détecte email vs numéro de téléphone
      const isPhone = /^[+\d][\d\s\-().]{5,}$/.test(identifier.trim());
      const body = isPhone
        ? { phoneNumber: identifier.trim(), password }
        : { email: identifier.trim().toLowerCase(), password };

      const res = await apiClient.post('/SellerLogin', body);
      const data = res.data;

      // Réponse : { token, user: { id, name, email, storeName, subscriptionStatus, ... } }
      const token = data.token;
      const seller = data.user || data.seller;

      if (!token || !seller) {
        set({ loading: false, error: 'Réponse serveur invalide' });
        return { success: false, error: 'Réponse serveur invalide' };
      }

      // Infos abonnement depuis la réponse login
      const subscription = {
        planName: data.subscription?.current?.planType || 'Starter',
        status: data.subscription?.statusInfo?.status || seller.subscriptionStatus || 'active',
        daysRemaining: data.subscription?.daysRemaining ?? null,
        commission: data.subscription?.current?.commission ?? 5,
      };

      await saveSession({ token, seller, subscription });
      set({ seller, token, subscription, isAuthenticated: true, loading: false, error: null, isResubscriptionToken: false });

      // Le login ne retourne pas logo — on le charge en arrière-plan
      const sellerId = seller?.id || seller?._id;
      if (sellerId) {
        apiClient.get(`/getSeller/${sellerId}`)
          .then(r => {
            const fullSeller = r.data?.data || r.data?.seller || r.data;
            if (fullSeller?.logo) {
              const updated = { ...seller, logo: fullSeller.logo, phone: fullSeller.phone };
              saveSession({ token, seller: updated, subscription });
              set({ seller: updated });
            }
          })
          .catch(() => {});
      }

      return { success: true };
    } catch (e) {
      const status  = e.response?.status;
      const errData = e.response?.data;

      // 403 avec token + accountStatus abonnement → suspended / no_subscription
      // Le web redirige vers /abonnement — on connecte avec le statut bloquant
      // pour que le navigator affiche le mur d'abonnement au lieu du message d'erreur.
      // On exclut pending_validation (pas de token dans ce cas de toute façon).
      const isSubscriptionBlock = status === 403
        && errData?.token
        && (errData?.accountStatus === 'suspended' || errData?.canReactivate === true
            || errData?.statusInfo?.status === 'no_subscription'
            || errData?.accessibility?.canResubscribe === true);

      if (isSubscriptionBlock) {
        const seller = errData.user || errData.seller || {};
        const subStatus = errData.statusInfo?.status || errData.completeStatus?.statusInfo?.status || 'suspended';
        const subscription = {
          planName:      errData.subscription?.current?.planType || seller.planType || 'Starter',
          status:        subStatus === 'no_subscription' ? 'no_subscription' : 'suspended',
          daysRemaining: null,
          commission:    5,
        };
        await saveSession({ token: errData.token, seller, subscription });
        set({ seller, token: errData.token, subscription, isAuthenticated: true, loading: false, error: null, isResubscriptionToken: true });
        return { success: true };
      }

      const msg = errData?.message || 'Erreur de connexion. Vérifiez votre connexion internet.';
      set({ loading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  // ─── Déconnexion ──────────────────────────────────────────────────────────
  logout: async () => {
    await clearSession();
    resetSyncStore();
    try {
      const { mutationQueue } = require('../services/mutationQueue');
      mutationQueue.reset();
    } catch (_) {}
    set({ seller: null, token: null, isAuthenticated: false, authChecked: true, error: null, isResubscriptionToken: false });
  },

  // Logout forcé (401 intercepté par axios)
  forceLogout: async () => {
    await clearSession();
    resetSyncStore();
    set({ seller: null, token: null, isAuthenticated: false, authChecked: true, isResubscriptionToken: false });
  },

  updateSeller: async (data) => {
    const state = useAuthStore.getState();
    const updated = { ...state.seller, ...data };
    await saveSession({ token: state.token, seller: updated, subscription: state.subscription });
    set({ seller: updated });
  },

  // Met à jour le statut d'abonnement en mémoire + AsyncStorage (appelé après essai/activation)
  updateSubscription: async (newSub) => {
    const state = useAuthStore.getState();
    const merged = { ...state.subscription, ...newSub };
    await saveSession({ token: state.token, seller: state.seller, subscription: merged });
    set({ subscription: merged });
  },

  clearError: () => set({ error: null }),
}));
