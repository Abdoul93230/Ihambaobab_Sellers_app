import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { BACKEND_URL, STORAGE_KEY, RETRY_DELAYS } from './constants';

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

// Injecte le token JWT à chaque requête
apiClient.interceptors.request.use(async (config) => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user.token) config.headers.Authorization = `Bearer ${user.token}`;
    }
  } catch (e) {
    // silencieux
  }
  return config;
});

let _loggingOut = false; // garde pour éviter plusieurs forceLogout en parallèle

// Retry 502 + logout auto sur 401
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

    // Logout automatique sur 401 (token expiré) — une seule fois même si plusieurs requêtes parallèles
    if (error.response?.status === 401 && req?.headers?.Authorization && !_loggingOut) {
      _loggingOut = true;
      let isResubToken = false;
      try {
        const { useAuthStore } = require('../stores/authStore');
        const t = useAuthStore.getState().token;
        if (t) {
          const b64 = t.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
          const pad = b64 && b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
          isResubToken = b64 ? JSON.parse(atob(b64 + pad))?.purpose === 'resubscription' : false;
        }
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

    return Promise.reject(error);
  }
);

export default apiClient;
