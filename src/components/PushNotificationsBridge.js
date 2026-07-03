import { useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { CommonActions } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import { navigationRef } from '../navigation/RootNavigation';
import apiClient from '../config/api';
import { useNotificationStore } from '../stores/notificationStore';

// Comportement en foreground : afficher alerte + son + badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const PROJECT_ID = '2c86e819-5757-41b8-aeb3-667db577edca';

async function registerPushToken(sellerId) {
  // En Expo Go les push FCM ne fonctionnent pas — on log et on sort
  if (Constants.appOwnership === 'expo') {
    console.log('[Push] Expo Go détecté — enregistrement désactivé (utiliser un build APK).');
    return;
  }

  if (Platform.OS === 'android') {
    // Canal principal — son custom "order_chime" (fichier order_chime.wav dans android/app/src/main/res/raw/)
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Nouvelles commandes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: '#30A08B',
      sound: 'order_chime',
      enableVibrate: true,
      showBadge: true,
    });
    // Canal fallback "default" pour les autres notifs
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Ihambaobab Pro',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#30A08B',
      sound: 'default',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[Push] Permission refusée.');
    return;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    PROJECT_ID;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const pushToken = tokenData?.data;
  if (!pushToken) {
    console.log('[Push] Aucun token généré.');
    return;
  }

  // Retry 3× avec délai 1.2s
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await apiClient.post('/seller-push-token', { sellerId, pushToken });
      console.log(`[Push] Token enregistré (tentative ${attempt}).`);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200));
    }
  }
  if (lastError) {
    console.error('[Push] Échec enregistrement token:', lastError?.response?.data?.message || lastError?.message);
  }
}

function waitForNavigator(callback, maxWaitMs = 8000) {
  if (navigationRef.current?.isReady()) {
    callback();
    return;
  }
  const start = Date.now();
  const interval = setInterval(() => {
    if (navigationRef.current?.isReady()) {
      clearInterval(interval);
      callback();
    } else if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
    }
  }, 80);
}

function navigateToOrderDetail(data) {
  const { orderId, reference } = data || {};

  waitForNavigator(() => {
    navigationRef.current.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 1,
              routes: [
                { name: 'Dashboard' },
                { name: 'Portefeuille', params: { openOrderId: orderId, openOrderRef: reference } },
              ],
            },
          },
        ],
      })
    );
  });
}

function handleNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data;
  if (!data) return;

  // Stocker dans le notificationStore local
  useNotificationStore.getState().addNotification({
    id: response.notification.request.identifier,
    type: data.type,
    title: response.notification.request.content.title,
    body: response.notification.request.content.body,
    data,
    readAt: new Date().toISOString(), // marqué lu car l'user a tappé
    receivedAt: new Date().toISOString(),
  });

  if (data.type === 'new_order') {
    navigateToOrderDetail(data);
  }
}

export default function PushNotificationsBridge() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const seller = useAuthStore(s => s.seller);
  const appStateRef = useRef(AppState.currentState);
  const tokenRegistered = useRef(false);

  const sellerId = seller?._id || seller?.id || null;

  // ── Enregistrement token ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const doRegister = async () => {
      if (!isAuthenticated || !sellerId) {
        tokenRegistered.current = false;
        return;
      }
      if (tokenRegistered.current) return;
      tokenRegistered.current = true;
      try {
        await registerPushToken(sellerId);
      } catch (err) {
        tokenRegistered.current = false;
        console.error('[Push] Erreur init:', err?.message);
      }
    };

    doRegister();

    // Re-enregistrement à chaque retour en foreground (token peut avoir changé)
    const sub = AppState.addEventListener('change', nextState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        !cancelled
      ) {
        tokenRegistered.current = false;
        doRegister();
      }
      appStateRef.current = nextState;
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [isAuthenticated, sellerId]);

  // ── Notif reçue en foreground → stocker (sans naviguer) ───────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (!data) return;
      useNotificationStore.getState().addNotification({
        id: notification.request.identifier,
        type: data.type,
        title: notification.request.content.title,
        body: notification.request.content.body,
        data,
        readAt: null,
        receivedAt: new Date().toISOString(),
      });
    });
    return () => sub.remove();
  }, []);

  // ── Tap sur notif (foreground OU background) → naviguer ───────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationResponse(response);
    });
    return () => sub.remove();
  }, []);

  // ── App lancée depuis une notif (cold start) ──────────────────────────────
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(response);
    });
  }, []);

  return null;
}
