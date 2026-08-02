import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { BACKEND_URL, STORAGE_KEY, AGENT_STORAGE_KEY, RETRY_DELAYS } from './constants';

export { BACKEND_URL };

const apiClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,  // 30s défaut — assez pour la plupart des requêtes
  headers: { 'Content-Type': 'application/json' },
});

// Timeouts spécifiques accessibles depuis les services
export const TIMEOUTS = {
  SHORT:  8000,   // heartbeat, vérifications légères
  DEFAULT: 30000, // lectures standard
  UPLOAD: 120000, // upload images (réseau mobile peut être lent)
};

// Injecte le token JWT à chaque requête.
// Priorité : header déjà positionné > session agent active > session vendeur.
// L'agent passe en premier : si une session agent existe en mémoire,
// on est forcément en mode caissier et on ne doit jamais envoyer le token vendeur.
apiClient.interceptors.request.use(async (config) => {
  // Si l'appelant a déjà mis un Authorization explicite, on le respecte
  if (config.headers.Authorization) return config;

  try {
    // 1. Session agent (priorité absolue quand un caissier est connecté)
    const { useAgentStore } = require('../stores/agentStore');
    const agentState = useAgentStore.getState();
    if (agentState.isAuthenticated && agentState.token) {
      config.headers.Authorization = `Bearer ${agentState.token}`;
      return config;
    }
  } catch (_) {}

  try {
    // 2. Session vendeur
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
        return config;
      }
    }
  } catch (_) {}

  return config;
});

let _loggingOut = false; // garde pour éviter plusieurs forceLogout en parallèle

// Retry 502 + erreurs réseau + logout auto sur 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const req = error.config;

    // Retry 502 (serveur qui redémarre)
    if (error.response?.status === 502 && !req._retry) {
      req._retryCount = (req._retryCount || 0) + 1;
      if (req._retryCount <= 3) {
        req._retry = true;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[req._retryCount - 1]));
        return apiClient(req);
      }
    }

    // Retry erreur réseau brute (pas de réponse reçue) — React Native peut rater
    // la première requête après un burst de fetches parallèles (pool TCP saturé).
    // Codes indiquant que la requête n'a pas atteint le serveur : ECONNRESET,
    // ECONNABORTED (timeout), ENOTFOUND, ERR_NETWORK, ERR_INTERNET_DISCONNECTED.
    // On exclut les mutations si l'erreur est ambiguë (timeout = peut-être reçu).
    const safeToRetry = !error.response && !req._networkRetry;
    const isTimeout = error.code === 'ECONNABORTED';
    const isMutation = req.method && ['post', 'put', 'patch', 'delete'].includes(req.method.toLowerCase());
    if (safeToRetry && !(isTimeout && isMutation)) {
      req._networkRetry = true;
      await new Promise((r) => setTimeout(r, 1200));
      return apiClient(req);
    }

    // Logout automatique sur 401 (token expiré) — une seule fois même si plusieurs requêtes parallèles
    if (error.response?.status === 401 && req?.headers?.Authorization && !_loggingOut) {
      // Extrait le token de la requête qui a échoué
      const failedToken = req.headers.Authorization.replace(/^Bearer\s+/i, '');

      // ── Identifie à qui appartient le token qui a expiré ──
      // Compare le token de la requête avec le token de chaque store
      // (évite de déconnecter l'agent si c'est un token vendeur résiduel qui expire)

      let isAgentToken = false;
      let isSellerToken = false;
      try {
        const { useAgentStore } = require('../stores/agentStore');
        const agentToken = useAgentStore.getState().token;
        if (agentToken && agentToken === failedToken) isAgentToken = true;
      } catch (_) {}

      if (!isAgentToken) {
        try {
          const { useAuthStore } = require('../stores/authStore');
          const sellerToken = useAuthStore.getState().token;
          if (sellerToken && sellerToken === failedToken) isSellerToken = true;
        } catch (_) {}
      }

      // Si c'est un token inconnu (ni agent ni vendeur actuel) — ignorer silencieusement
      if (!isAgentToken && !isSellerToken) return Promise.reject(error);

      _loggingOut = true;

      if (isAgentToken) {
        // ── Token agent expiré : logout agent uniquement ──
        try {
          const { useAgentStore } = require('../stores/agentStore');
          await useAgentStore.getState().logout();
        } catch (_) {}
        _loggingOut = false;
        Toast.show({
          type: 'info',
          text1: 'Session caissier expirée',
          text2: 'Veuillez vous reconnecter.',
          visibilityTime: 5000,
        });
      } else {
        // ── Token vendeur expiré ──
        let isResubToken = false;
        try {
          const b64 = failedToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
          const pad = b64 && b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
          isResubToken = b64 ? JSON.parse(atob(b64 + pad))?.purpose === 'resubscription' : false;
        } catch (_) {}

        try {
          const { useAuthStore } = require('../stores/authStore');
          await useAuthStore.getState().forceLogout();
        } catch (_) {}
        _loggingOut = false;
        Toast.show({
          type: 'info',
          text1: isResubToken ? 'Session abonnement expirée' : 'Session expirée',
          text2: isResubToken
            ? 'Votre session a expiré (24h). Reconnectez-vous pour continuer.'
            : 'Veuillez vous reconnecter.',
          visibilityTime: 5000,
        });
        // AppNavigator réagit à isAuthenticated=false et affiche Login automatiquement
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
