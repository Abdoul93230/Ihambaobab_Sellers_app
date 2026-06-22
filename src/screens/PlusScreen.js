import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import CachedImage from '../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useModules } from '../hooks/useModules';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import PhotoProfileModal from '../components/PhotoProfileModal';
import { useNavigation } from '@react-navigation/native';

function MenuSection({ title, items, colors }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            onPress={item.onPress}
            disabled={item.disabled}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: `${item.color}15` }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
            <Text style={[styles.menuLabel, { color: item.disabled ? colors.textDisabled : colors.text }]}>
              {item.label}
            </Text>
            {item.badge && (
              <View style={[styles.badge, { backgroundColor: item.badgeColor || colors.primary }]}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}
            {item.disabled
              ? <Ionicons name="lock-closed-outline" size={14} color={colors.textDisabled} />
              : <Ionicons name="chevron-forward-outline" size={16} color={colors.border} />
            }
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function PlusScreen() {
  const { seller, logout, subscription } = useAuthStore();
  const { has } = useModules();
  const { pendingCount, lastSyncLabel, triggerSync, isSyncing } = useSync();
  const { colors, isDark, setTheme, mode } = useTheme();
  const [photoVisible, setPhotoVisible] = useState(false);
  const navigation = useNavigation();

  const initial = (seller?.storeName || seller?.name || 'V').charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', style: 'destructive', onPress: logout },
    ]);
  };

  const subStatus = subscription?.status;
  const subBadge = subStatus === 'trial' ? 'Essai' : subStatus === 'grace_period' ? '!' : subStatus === 'suspended' ? '!' : null;
  const subBadgeColor = (subStatus === 'grace_period' || subStatus === 'suspended') ? '#EF4444' : '#6366F1';

  const abonnementItems = [
    {
      label: 'Mon Abonnement',
      icon: 'star-outline',
      color: '#6366F1',
      badge: subBadge,
      badgeColor: subBadgeColor,
      onPress: () => navigation.navigate('Abonnement'),
    },
  ];

  const analyticsItems = [
    // { label: 'Mes Commandes',         icon: 'cart-outline',         color: '#10B981', disabled: false,                      onPress: () => navigation.navigate('Commandes') },
    { label: 'Bilan des ventes',      icon: 'bar-chart-outline',    color: '#30A08B', disabled: !has('bilanJournalier'),    onPress: () => navigation.navigate('BilanVentes') },
    { label: 'Performance produits',  icon: 'trending-up-outline',  color: '#6366F1', disabled: !has('performanceProduits'), onPress: () => {} },
    { label: 'Rapport mensuel',       icon: 'document-text-outline',color: '#F59E0B', disabled: !has('rapportPeriodique'),  onPress: () => {} },
  ];

  const gestionItems = [
    { label: 'Inventaire',         icon: 'cube-outline',         color: '#30A08B', disabled: false,                  onPress: () => navigation.navigate('Inventaire') },
    { label: 'Bannières',          icon: 'images-outline',       color: '#B17236', disabled: false,                  onPress: () => navigation.navigate('Bannières') },
    { label: 'Carnet de créances', icon: 'book-outline',         color: '#EF4444', disabled: !has('carnetCreances'), onPress: () => navigation.navigate('CarnetCreances') },
    { label: 'Alertes stock',      icon: 'alert-circle-outline', color: '#F59E0B', disabled: !has('alertesStock'),   onPress: () => {} },
  ];

  const syncItems = [
    {
      label: isSyncing ? 'Synchronisation...' : `Sync (${lastSyncLabel || 'jamais'})`,
      icon: 'sync-outline', color: '#3B82F6',
      badge: pendingCount > 0 ? String(pendingCount) : null,
      badgeColor: '#F59E0B',
      onPress: triggerSync,
    },
  ];

  const themeItems = [
    { label: 'Mode clair',   icon: 'sunny-outline',  color: '#F59E0B', onPress: () => setTheme('light'),  badge: mode === 'light'  ? '✓' : null, badgeColor: colors.primary },
    { label: 'Mode sombre',  icon: 'moon-outline',   color: '#6366F1', onPress: () => setTheme('dark'),   badge: mode === 'dark'   ? '✓' : null, badgeColor: colors.primary },
    { label: 'Système',      icon: 'phone-portrait-outline', color: '#30A08B', onPress: () => setTheme('system'), badge: mode === 'system' ? '✓' : null, badgeColor: colors.primary },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Profil vendeur — cliquable pour changer la photo */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          onPress={() => setPhotoVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.avatarWrap}>
            {seller?.logo
              ? <CachedImage uri={seller.logo} style={styles.avatarImg} contentFit="cover" />
              : <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
            }
            {/* Bouton edit */}
            <View style={[styles.editBadge, { backgroundColor: colors.primary, borderColor: colors.bgCard }]}>
              <Ionicons name="camera-outline" size={10} color="#fff" />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{seller?.storeName || seller?.name || 'Vendeur'}</Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{seller?.email || seller?.phone || ''}</Text>
            <Text style={[styles.profileEdit, { color: colors.primary }]}>Modifier la photo</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={18} color={colors.border} />
        </TouchableOpacity>

        <MenuSection title="ABONNEMENT" items={abonnementItems} colors={colors} />
        <MenuSection title="ANALYTIQUES" items={analyticsItems} colors={colors} />
        <MenuSection title="GESTION" items={gestionItems} colors={colors} />
        <MenuSection title="SYNCHRONISATION" items={syncItems} colors={colors} />
        <MenuSection title="APPARENCE" items={themeItems} colors={colors} />

        {/* Déconnexion */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.bgDanger, borderColor: colors.dangerText + '30' }]}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
          <Text style={[styles.logoutText, { color: colors.dangerText }]}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textDisabled }]}>Ihambaobab Vendeur v1.0.0</Text>
      </ScrollView>

      <PhotoProfileModal visible={photoVisible} onClose={() => setPhotoVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },

  // Profil
  profileCard: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2,
  },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 24, fontWeight: '800', color: '#fff' },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: '700' },
  profileEmail: { fontSize: 12, marginTop: 1 },
  profileEdit: { fontSize: 12, fontWeight: '600', marginTop: 3 },

  // Sections
  section: { gap: 8 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingLeft: 4 },
  sectionCard: { borderRadius: 14, overflow: 'hidden', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1,
  },
  logoutText: { fontSize: 14, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 11, marginTop: 4 },
});
