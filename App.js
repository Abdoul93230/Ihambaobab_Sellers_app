import React, { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import AppSplash from './src/components/AppSplash';
import { ThemeProvider } from './src/context/ThemeContext';
import { useAuthStore } from './src/stores/authStore';
import { useSyncStore } from './src/stores/syncStore';
import { socketService } from './src/services/socketService';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { initDB } from './src/db/database';
import { syncService } from './src/services/syncService';
import { purgeOldDrafts } from './src/services/imageDraftService';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const verifyAuth      = useAuthStore((s) => s.verifyAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const seller          = useAuthStore((s) => s.seller);
  const token           = useAuthStore((s) => s.token);
  // ID stable — évite de recréer le socket si l'objet seller change de référence
  const sellerId        = seller?._id || seller?.id || null;
  const triggerSync     = useSyncStore((s) => s.triggerSync);
  const triggerFullSync = useSyncStore((s) => s.triggerFullSync);

  const [ready, setReady] = useState(false);
  const appState = useRef(AppState.currentState);
  // Timestamp du dernier foreground sync (évite double-sync)
  const lastForegroundSync = useRef(0);

  // ── Démarrage ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      // 1. Initialise SQLite
      await initDB();
      // 2. Purge les vieux brouillons AVANT de lire la DB (pas de race condition)
      await purgeOldDrafts().catch(() => {});
      // 3. Charge les données depuis SQLite → affichage offline immédiat
      await syncService.loadFromDB();
      // 3. Vérifie l'auth
      await verifyAuth();
      try { await SplashScreen.hideAsync(); } catch (_) {}
      registerBackgroundSync();
      setReady(true);
    }
    boot();
  }, []);

  // ── Connexion socket + sync complète au login ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !sellerId || !token) return;

    // Connexion socket
    socketService.connect(sellerId, token);

    // Pull complet au login
    triggerFullSync();

    // Events socket → invalidation ciblée immédiate
    const offNewOrder = socketService.on('new_order', () => {
      // Nouvelle commande marketplace → commandes + bilan
      useSyncStore.getState().invalidate('commandes', 'bilan');
    });

    const offBilanUpdated = socketService.on('bilan_updated', () => {
      // Vente POS faite (depuis web ou app) → bilan uniquement
      useSyncStore.getState().invalidate('bilan');
    });
    const offSuspended = socketService.on('account_suspended', () => {
      useAuthStore.getState().forceLogout();
      Toast.show({ type: 'error', text1: 'Compte suspendu', text2: 'Contactez le support.' });
    });
    const offReactivated = socketService.on('account_reactivated', () => {
      Toast.show({ type: 'success', text1: 'Compte réactivé !' });
      triggerFullSync();
    });

    return () => {
      offNewOrder();
      offBilanUpdated();
      offSuspended();
      offReactivated();
      socketService.disconnect();
    };
  // sellerId et token sont stables — pas de reconnexion parasite
  }, [isAuthenticated, sellerId, token]);

  // ── AppState : sync sélective au retour en foreground ─────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        isAuthenticated
      ) {
        const now = Date.now();
        // Évite double-sync si retour rapide (<30s)
        if (now - lastForegroundSync.current > 30_000) {
          lastForegroundSync.current = now;
          triggerSync();
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  if (!ready) return <AppSplash />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppNavigator />
          <Toast />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
