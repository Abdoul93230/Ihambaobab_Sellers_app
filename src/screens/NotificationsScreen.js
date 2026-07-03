import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

const TYPE_CONFIG = {
  new_order: {
    icon: 'bag-check-outline',
    color: '#30A08B',
    label: 'Nouvelle commande',
    navigate: (data, navigation) => {
      navigation.navigate('Main', {
        screen: 'Portefeuille',
        params: { openOrderId: data.orderId, openOrderRef: data.reference },
      });
    },
  },
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'À l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD < 7) return `il y a ${diffD}j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function NotifRow({ notif, colors, onPress }) {
  const cfg = TYPE_CONFIG[notif.type] || {
    icon: 'notifications-outline',
    color: '#6366F1',
    label: 'Notification',
    navigate: null,
  };
  const isUnread = !notif.readAt;

  return (
    <TouchableOpacity
      onPress={() => onPress(notif)}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: isUnread ? `${cfg.color}08` : 'transparent', borderBottomColor: colors.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${cfg.color}18` }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        {isUnread && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>
          {notif.title || cfg.label}
        </Text>
        <Text style={[styles.body, { color: colors.textSub }]} numberOfLines={2}>
          {notif.body}
        </Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>{fmtDate(notif.receivedAt)}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const seller = useAuthStore(s => s.seller);
  const sellerId = seller?._id || seller?.id;

  const { notifications, load, fetchFromAPI, markRead, markAllRead, clearAll, syncing } = useNotificationStore();

  useEffect(() => {
    load();
    if (sellerId) fetchFromAPI(sellerId);
  }, [sellerId]);

  const handlePress = useCallback((notif) => {
    markRead(notif.id, sellerId);
    const cfg = TYPE_CONFIG[notif.type];
    if (cfg?.navigate) {
      cfg.navigate(notif.data, navigation);
    }
  }, [markRead, sellerId, navigation]);

  const handleClearAll = () => {
    Alert.alert(
      'Effacer toutes les notifications',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer', style: 'destructive', onPress: clearAll },
      ]
    );
  };

  const unread = notifications.filter(n => !n.readAt).length;

  const simulateNotification = () => {
    const fakeId = `sim_${Date.now()}`;
    const fakeOrderId = '507f1f77bcf86cd799439011';
    useNotificationStore.getState().addNotification({
      id: fakeId,
      type: 'new_order',
      title: 'Nouvelle commande !',
      body: `Réf CMD-SIM-${Math.floor(Math.random() * 9000) + 1000} — 15 000 ₣`,
      data: { type: 'new_order', orderId: fakeOrderId, reference: `CMD-SIM-${Math.floor(Math.random() * 9000) + 1000}`, montant: 15000 },
      readAt: null,
      receivedAt: new Date().toISOString(),
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Bandeau Expo Go */}
      {IS_EXPO_GO && (
        <View style={styles.expoGoBanner}>
          <Ionicons name="information-circle-outline" size={15} color="#92400E" />
          <Text style={styles.expoGoBannerText}>
            Expo Go — push désactivées. Utilisez le bouton pour simuler.
          </Text>
          <TouchableOpacity onPress={simulateNotification} style={styles.simBtn} activeOpacity={0.8}>
            <Text style={styles.simBtnText}>Simuler</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Barre d'actions */}
      {(notifications.length > 0 || syncing) && (
        <View style={[styles.bar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
          {syncing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
              <Ionicons name="cloud-download-outline" size={14} color={colors.textMuted} />
              <Text style={{ fontSize: 11, color: colors.textMuted }}>Synchronisation…</Text>
            </View>
          )}
          {unread > 0 && (
            <TouchableOpacity onPress={() => markAllRead(sellerId)} style={styles.barBtn} activeOpacity={0.7}>
              <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
              <Text style={[styles.barBtnText, { color: colors.primary }]}>Tout marquer lu</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleClearAll} style={styles.barBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
            <Text style={[styles.barBtnText, { color: '#EF4444' }]}>Effacer tout</Text>
          </TouchableOpacity>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucune notification</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Les nouvelles commandes et alertes apparaîtront ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <NotifRow notif={item} colors={colors} onPress={handlePress} />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 16,
  },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barBtnText: { fontSize: 13, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute', top: 3, right: 3,
    width: 8, height: 8, borderRadius: 4,
  },
  title: { fontSize: 14, marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 17, marginBottom: 3 },
  time: { fontSize: 11 },

  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 40, gap: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Expo Go
  expoGoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  expoGoBannerText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 15 },
  simBtn: {
    backgroundColor: '#F59E0B', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  simBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
