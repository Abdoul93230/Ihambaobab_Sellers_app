import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../stores/syncStore';
import { syncService } from '../services/syncService';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import { upsertMany } from '../db/database';
import Toast from 'react-native-toast-message';

const STATUS_CONFIG = {
  pending:   { label: 'En attente',   color: '#F59E0B', bg: '#FFFBEB', icon: 'time-outline' },
  validated: { label: 'Validée',      color: '#3B82F6', bg: '#EFF6FF', icon: 'checkmark-outline' },
  delivered: { label: 'Livrée',       color: '#10B981', bg: '#ECFDF5', icon: 'bicycle-outline' },
  cancelled: { label: 'Annulée',      color: '#EF4444', bg: '#FEF2F2', icon: 'close-outline' },
};

const FILTRES = ['Toutes', 'En attente', 'Validée', 'Livrée'];

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }

function CommandeCard({ commande, onAction }) {
  const cfg = STATUS_CONFIG[commande.status] || STATUS_CONFIG.pending;
  const date = new Date(commande.createdAt || Date.now()).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardId}>#{String(commande._id).slice(-8)}</Text>
          <Text style={styles.cardDate}>{date}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={12} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.clientName}>
          {commande.client?.name || commande.userId?.name || 'Client anonyme'}
        </Text>
        <Text style={styles.total}>{fmt(commande.total)} ₣</Text>
      </View>

      {commande.products && (
        <Text style={styles.articles} numberOfLines={1}>
          {commande.products.map((p) => `${p.productName || p.nom} x${p.quantity || p.quantite}`).join(', ')}
        </Text>
      )}

      {commande.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={() => onAction(commande._id, 'validated')}
          >
            <Ionicons name="checkmark-outline" size={14} color="#3B82F6" />
            <Text style={[styles.actionText, { color: '#3B82F6' }]}>Valider</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
            onPress={() => onAction(commande._id, 'cancelled')}
          >
            <Ionicons name="close-outline" size={14} color="#EF4444" />
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Refuser</Text>
          </TouchableOpacity>
        </View>
      )}
      {commande.status === 'validated' && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
          onPress={() => onAction(commande._id, 'delivered')}
        >
          <Ionicons name="bicycle-outline" size={14} color="#10B981" />
          <Text style={[styles.actionText, { color: '#10B981' }]}>Marquer livrée</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function CommandesScreen() {
  const commandes = useSyncStore((s) => s.commandes) ?? [];
  const { triggerSync, isSyncing } = useSync();
  const { colors } = useTheme();
  const [filtre, setFiltre] = useState('Toutes');

  const filtered = useMemo(() => {
    const statusMap = { 'En attente': 'pending', 'Validée': 'validated', 'Livrée': 'delivered' };
    if (filtre === 'Toutes') return commandes;
    return commandes.filter((c) => c.status === statusMap[filtre]);
  }, [commandes, filtre]);

  const onAction = useCallback(async (commandeId, newStatus) => {
    // Mise à jour optimiste — mémoire + SQLite
    const updated = commandes.map((c) =>
      String(c._id) === String(commandeId) ? { ...c, status: newStatus } : c
    );
    useSyncStore.getState().setStoreData('commandes', updated);
    // Persiste dans SQLite
    const changedItem = updated.find(c => String(c._id) === String(commandeId));
    if (changedItem) {
      upsertMany('commandes', [changedItem], o => String(o._id)).catch(() => {});
    }

    // Queue la mutation
    try {
      await syncService.queueMutation('UPDATE_COMMANDE_STATUS', { commandeId, status: newStatus });
      Toast.show({ type: 'success', text1: 'Statut mis à jour' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur', text2: e.message });
    }
  }, [commandes]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.filtresRow, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        {FILTRES.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFiltre(f)}
            style={[styles.filtreBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }, filtre === f && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[styles.filtreBtnText, { color: filtre === f ? '#fff' : colors.textSub }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => String(c._id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={() => triggerSync()} tintColor="#30A08B" />}
        renderItem={({ item }) => <CommandeCard commande={item} onAction={onAction} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="list-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucune commande</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  filtresRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  filtreBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  filtreBtnActive: { backgroundColor: '#30A08B', borderColor: '#30A08B' },
  filtreBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  list: { padding: 12, gap: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardId: { fontSize: 13, fontWeight: '700', color: '#111827' },
  cardDate: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clientName: { fontSize: 13, color: '#374151' },
  total: { fontSize: 15, fontWeight: '800', color: '#30A08B' },
  articles: { fontSize: 11, color: '#9CA3AF', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  actionText: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 10 },
});
