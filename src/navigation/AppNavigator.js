import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import CachedImage from '../components/CachedImage';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { navigationRef } from './RootNavigation';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../context/ThemeContext';
import { socketService } from '../services/socketService';
import Toast from 'react-native-toast-message';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import AbonnementScreen, { AbonnementWallScreen } from '../screens/AbonnementScreen';
import DashboardScreen from '../screens/DashboardScreen';
import VenteScreen from '../screens/VenteScreen';
import ProduitsScreen from '../screens/ProduitsScreen';
import ProduitUpdateScreen from '../screens/ProduitUpdateScreen';
import CommandesScreen from '../screens/CommandesScreen';
import PlusScreen from '../screens/PlusScreen';
import PortefeuilleScreen from '../screens/PortefeuilleScreen';
import InventaireScreen from '../screens/InventaireScreen';
import BannièresScreen from '../screens/BannièresScreen';
import CarnetCreancesScreen from '../screens/CarnetCreancesScreen';
import BilanVentesScreen from '../screens/BilanVentesScreen';
import SyncIndicator from '../components/SyncIndicator';
import PhotoProfileModal from '../components/PhotoProfileModal';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Exactement comme BOTTOM_NAV du web
const BOTTOM_NAV = [
  { name: 'Dashboard',    label: 'Accueil',      icon: 'home',       iconOut: 'home-outline',       component: DashboardScreen,     hideHeader: false },
  { name: 'Portefeuille', label: 'Portefeuille', icon: 'wallet',     iconOut: 'wallet-outline',     component: PortefeuilleScreen,  hideHeader: false },
  { name: 'Produits',     label: 'Produits',     icon: 'cube',       iconOut: 'cube-outline',       component: ProduitsNavigator,   hideHeader: false },
  { name: 'Vente',        label: 'Caisse',       icon: 'storefront', iconOut: 'storefront-outline', component: VenteScreen,         hideHeader: false },
  { name: 'Plus',         label: 'Paramètres',   icon: 'settings',   iconOut: 'settings-outline',   component: PlusScreen,          hideHeader: false },
];

// PAGE_TITLES identiques au web
export const PAGE_TITLES = {
  Dashboard:    "Vue d'ensemble",
  Portefeuille: 'Mon Portefeuille',
  Produits:     'Mes produits',
  Vente:        'Caisse Physique',
  Plus:         'Paramètres',
  Abonnement:   'Mon Abonnement',
  Inventaire:   'Inventaire',
  Bannières:       'Bannières',
  CarnetCreances:  'Carnet de créances',
  BilanVentes:     'Bilan des ventes',
};

// ─── Mur abonnement (suspended / no_subscription) ────────────────────────────
function SubscriptionWall() {
  const { colors } = useTheme();
  const { subscription } = useAuthStore();
  const status = subscription?.status;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader pageTitle="Mon Abonnement" />
      <AbonnementWallScreen />
    </View>
  );
}

// ─── Bannière grace_period (insérée dans AppHeader) ───────────────────────────
function GraceBanner() {
  const { subscription } = useAuthStore();
  const { colors } = useTheme();
  const navigation = useNavigation();
  if (subscription?.status !== 'grace_period') return null;
  const days = subscription?.daysRemaining ?? '?';
  return (
    <TouchableOpacity
      style={styles.graceBanner}
      onPress={() => navigation.navigate('Abonnement')}
      activeOpacity={0.85}
    >
      <Ionicons name="warning-outline" size={14} color="#fff" />
      <Text style={styles.graceBannerText}>
        Période de grâce — {days}j avant suspension. Renouveler →
      </Text>
    </TouchableOpacity>
  );
}

// ─── Top Header (identique au web) ───────────────────────────────────────────
function AppHeader({ pageTitle }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { seller } = useAuthStore();
  const [photoVisible, setPhotoVisible] = useState(false);

  const initial = (seller?.storeName || seller?.name || 'V').charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={[styles.headerSafe, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgCard} />
      <SyncIndicator />
      <View style={styles.headerRow}>
        {/* Gauche : titre + store */}
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{pageTitle}</Text>
          <Text style={[styles.headerStore, { color: colors.textMuted }]} numberOfLines={1}>
            {seller?.storeName || 'Votre boutique'}
          </Text>
        </View>

        {/* Droite : dark mode + notif + avatar */}
        <View style={styles.headerRight}>
          {/* Toggle thème */}
          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.headerBtn, { backgroundColor: colors.bgHover }]}
            activeOpacity={0.7}
          >
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.textSub} />
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.bgHover }]} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={18} color={colors.textSub} />
          </TouchableOpacity>

          {/* Avatar cliquable → PhotoProfileModal */}
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.primary }]}
            onPress={() => setPhotoVisible(true)}
            activeOpacity={0.8}
          >
            {seller?.logo
              ? <CachedImage uri={seller.logo} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <Text style={styles.avatarText}>{initial}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      <PhotoProfileModal visible={photoVisible} onClose={() => setPhotoVisible(false)} />
      <GraceBanner />
    </SafeAreaView>
  );
}

// ─── Tab Navigator avec header custom ────────────────────────────────────────
// Stack imbriqué pour la section Produits (liste + détail/update)
const ProduitsStack = createStackNavigator();
function ProduitsNavigator() {
  return (
    <ProduitsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProduitsStack.Screen name="ProduitsList" component={ProduitsScreen} />
      <ProduitsStack.Screen name="ProduitUpdate" component={ProduitUpdateScreen} />
    </ProduitsStack.Navigator>
  );
}

function TabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const tab = BOTTOM_NAV.find(t => t.name === route.name);
        return {
          header: tab?.hideHeader
            ? () => null
            : () => <AppHeader pageTitle={PAGE_TITLES[route.name] || route.name} />,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.bgCard,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom + 6,
            paddingTop: 4,
          },
          tabBarLabelStyle: { fontSize: 9, fontWeight: '700' },
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.tabIconWrap, focused && { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={focused ? tab.icon : tab.iconOut} size={20} color={color} />
            </View>
          ),
        };
      }}
    >
      {BOTTOM_NAV.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{ tabBarLabel: tab.label }}
        />
      ))}
      {/* Écrans dans le Tab pour avoir header + tabbar, mais sans bouton visible */}
      <Tab.Screen
        name="Abonnement"
        component={AbonnementScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
          header: () => <AppHeader pageTitle="Mon Abonnement" />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isAuthenticated, authChecked, subscription, seller, updateSubscription } = useAuthStore();
  const { colors, isDark } = useTheme();

  const sellerId = seller?._id || seller?.id || null;

  // Statuts qui bloquent l'accès à l'app et forcent l'AbonnementScreen
  const subStatus = subscription?.status;
  const isBlocked = isAuthenticated && (subStatus === 'suspended' || subStatus === 'no_subscription');

  // ─── Socket : connexion + events abonnement/suspension ────────────────────
  useEffect(() => {
    if (!isAuthenticated || !sellerId) {
      socketService.disconnect();
      return;
    }

    socketService.connect(sellerId, useAuthStore.getState().token);

    const offSuspended = socketService.on('account_suspended', ({ suspensionReason }) => {
      updateSubscription({ status: 'suspended' });
      Toast.show({
        type: 'error',
        text1: 'Compte suspendu',
        text2: suspensionReason || 'Contactez le support.',
        visibilityTime: 4000,
      });
    });

    const offReactivated = socketService.on('account_reactivated', () => {
      const { token: currentToken } = useAuthStore.getState();
      let isResub = false;
      try {
        const b64 = currentToken?.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
        if (b64) {
          const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
          isResub = JSON.parse(atob(b64 + pad))?.purpose === 'resubscription';
        }
      } catch {}
      if (isResub) {
        // Token resubscription (24h) — un vrai token est nécessaire → forcer la reconnexion
        useAuthStore.getState().forceLogout();
        Toast.show({
          type: 'success',
          text1: 'Compte réactivé !',
          text2: 'Reconnectez-vous pour accéder à votre boutique.',
          visibilityTime: 5000,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Compte réactivé !',
          text2: 'Votre abonnement est de nouveau actif.',
          visibilityTime: 3000,
        });
        useAuthStore.getState().verifyAuth();
      }
    });

    return () => {
      offSuspended();
      offReactivated();
    };
  }, [isAuthenticated, sellerId]); // eslint-disable-line

  if (!authChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        ...(isDark ? DarkTheme : DefaultTheme),
        colors: {
          ...(isDark ? DarkTheme : DefaultTheme).colors,
          primary: colors.primary,
          background: colors.bg,
          card: colors.bgCard,
          text: colors.text,
          border: colors.border,
          notification: colors.danger,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        ) : isBlocked ? (
          <Stack.Screen name="SubscriptionWall" component={SubscriptionWall} />
        ) : (
          <>
            <Stack.Screen name="Main"       component={TabNavigator} />
            <Stack.Screen name="Commandes"  component={CommandesScreen} />
            <Stack.Screen
              name="Inventaire"
              component={InventaireScreen}
              options={{ headerShown: true, header: () => <AppHeader pageTitle="Inventaire" /> }}
            />
            <Stack.Screen
              name="Bannières"
              component={BannièresScreen}
              options={{ headerShown: true, header: () => <AppHeader pageTitle="Bannières" /> }}
            />
            <Stack.Screen
              name="CarnetCreances"
              component={CarnetCreancesScreen}
              options={{ headerShown: true, header: () => <AppHeader pageTitle="Carnet de créances" /> }}
            />
            <Stack.Screen
              name="BilanVentes"
              component={BilanVentesScreen}
              options={{ headerShown: true, header: () => <AppHeader pageTitle="Bilan des ventes" /> }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Header
  headerSafe: {
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: 56,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  headerStore: { fontSize: 11, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Grace banner
  graceBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#EF4444',
    paddingVertical: 7, paddingHorizontal: 16,
  },
  graceBannerText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Tab icon
  tabIconWrap: {
    width: 34, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
});
