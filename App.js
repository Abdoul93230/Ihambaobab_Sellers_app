import React, { useEffect, useState, useRef } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import AppSplash from './src/components/AppSplash';
import OnboardingScreen from './src/screens/OnboardingScreen';
import Constants from 'expo-constants';
const _isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
const PushNotificationsBridge = _isExpoGo ? () => null : require('./src/components/PushNotificationsBridge').default;
import { ThemeProvider } from './src/context/ThemeContext';
import { useAuthStore } from './src/stores/authStore';
import { useAgentStore } from './src/stores/agentStore';
import { useSyncStore } from './src/stores/syncStore';
import { useNotificationStore } from './src/stores/notificationStore';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { initDB } from './src/db/database';
import { syncService } from './src/services/syncService';
import { purgeOldDrafts } from './src/services/imageDraftService';
import { useTutorial } from './src/hooks/useTutorial';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const verifyAuth      = useAuthStore((s) => s.verifyAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const verifyAgentAuth = useAgentStore((s) => s.verifyAuth);
  const seller          = useAuthStore((s) => s.seller);
  const token           = useAuthStore((s) => s.token);
  const sellerId        = seller?._id || seller?.id || null;
  const triggerSync     = useSyncStore((s) => s.triggerSync);
  const triggerFullSync = useSyncStore((s) => s.triggerFullSync);

  const [ready, setReady] = useState(false);
  const { loaded: tutLoaded, onboardingDone, markOnboardingDone } = useTutorial();
  const appState = useRef(AppState.currentState);
  const lastForegroundSync = useRef(0);

  // ── Démarrage ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      await initDB();
      await purgeOldDrafts().catch(() => {});
      await syncService.loadFromDB();
      useNotificationStore.getState().load().catch(() => {});
      await Promise.all([verifyAuth(), verifyAgentAuth()]);
      try { await SplashScreen.hideAsync(); } catch (_) {}
      registerBackgroundSync();
      setReady(true);
    }
    boot().catch((e) => console.error('[BOOT CRASH]', e?.message, e?.stack));
  }, []);

  // ── Sync complète au login (socket géré dans AppNavigator) ────────────────
  useEffect(() => {
    if (!isAuthenticated || !sellerId || !token) return;
    lastForegroundSync.current = Date.now();
    triggerFullSync();
    useNotificationStore.getState().fetchFromAPI(sellerId);
  }, [isAuthenticated, sellerId, token]);

  // ── AppState : sync sélective au retour en foreground ─────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && isAuthenticated) {
        const now = Date.now();
        if (now - lastForegroundSync.current > 60_000) {
          lastForegroundSync.current = now;
          triggerSync();
          const { seller: s } = useAuthStore.getState();
          const sid = s?._id || s?.id;
          if (sid) useNotificationStore.getState().fetchFromAPI(sid);
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaProvider>
        {!ready || !tutLoaded ? (
          <AppSplash />
        ) : !onboardingDone ? (
          <OnboardingScreen onDone={markOnboardingDone} />
        ) : (
          <ThemeProvider>
            <PushNotificationsBridge />
            <AppNavigator />
            <Toast />
          </ThemeProvider>
        )}
      </SafeAreaProvider>
     </View>
  );
}
