import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSync } from '../hooks/useSync';
import CachedImage from '../components/CachedImage';
import apiClient from '../config/api';
import { getMeta, setMeta } from '../db/database';

const AMBER  = '#F59E0B';
const DANGER = '#EF4444';
const GREEN  = '#10B981';

function fmtMoney(n) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + ' M₣';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + ' k₣';
  return new Intl.NumberFormat('fr-FR').format(v) + ' ₣';
}

// ─── Badge niveau ─────────────────────────────────────────────────────────────
function NiveauBadge({ niveau }) {
  const isRupture = niveau === 'rupture';
  return (
    <View style={[s.badge, { backgroundColor: (isRupture ? DANGER : AMBER) + '20' }]}>
      <Text style={[s.badgeText, { color: isRupture ? DANGER : AMBER }]}>
        {isRupture ? 'RUPTURE' : 'STOCK BAS'}
      </Text>
    </View>
  );
}

// ─── Squelette ────────────────────────────────────────────────────────────────
function SkeletonRow({ colors }) {
  return (
    <View style={[s.row, { borderBottomColor: colors.border }]}>
      <View style={[s.thumb, { backgroundColor: colors.bgHover }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[s.skelLine, { width: '65%', backgroundColor: colors.bgHover }]} />
        <View style={[s.skelLine, { width: '40%', backgroundColor: colors.bgHover }]} />
      </View>
      <View style={[s.skelLine, { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.bgHover }]} />
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function AlertesStockScreen() {
  const insets        = useSafeAreaInsets();
  const { colors }    = useTheme();
  const { isOffline } = useSync();

  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  // Ref stable pour isOffline — évite les closures périmées dans fetchAlerts
  const isOfflineRef = useRef(isOffline);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);

  // Modale seuil global
  const [seuilModal, setSeuilModal] = useState(false);
  const [seuilInput, setSeuilInput] = useState('');
  const [saving, setSaving]         = useState(false);

  // ─── Fetch ───────────────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async (silent = false) => {
    // Ne pas faire de requête réseau si hors ligne
    if (isOfflineRef.current) {
      if (!silent) setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/modules/stock/alerts');
      const fresh = res.data?.data ?? null;
      setData(fresh);
      setMeta('alerts_cache', fresh).catch(() => {});
    } catch {
      if (!silent) setError('Impossible de charger les alertes. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    getMeta('alerts_cache').then(cached => {
      if (cached !== null) {
        // Cache dispo → affichage immédiat, pas de spinner
        setData(cached);
        setLoading(false);
        // Fetch réseau en arrière-plan seulement si connecté
        if (!isOfflineRef.current) fetchAlerts(true);
      } else if (!isOfflineRef.current) {
        // Pas de cache + connecté → fetch bloquant
        setLoading(true);
        fetchAlerts(false);
      } else {
        // Hors ligne sans cache
        setLoading(false);
      }
    }).catch(() => {
      if (!isOfflineRef.current) fetchAlerts(false);
      else setLoading(false);
    });
  }, [fetchAlerts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlerts(true);
  }, [fetchAlerts]);

  // Recharge automatiquement quand la connexion revient
  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    const wasOffline = wasOfflineRef.current;
    wasOfflineRef.current = isOffline;
    if (wasOffline && !isOffline) fetchAlerts(!!data); // silent si cache dispo
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Seuil global ────────────────────────────────────────────────────────────
  const openSeuilModal = () => {
    setSeuilInput(String(data?.seuilGlobal ?? 5));
    setSeuilModal(true);
  };

  const saveSeuil = async () => {
    const val = parseInt(seuilInput, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert('Valeur invalide', 'Entrez un nombre entier positif.');
      return;
    }
    if (isOffline) {
      Alert.alert('Hors ligne', 'Vous devez être connecté pour modifier le seuil.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch('/api/modules/stock/seuil', { seuil: val });
      // Recharger pour recalculer les alertes avec le nouveau seuil
      setSeuilModal(false);
      await fetchAlerts(true);
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le seuil. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ─── En-tête (stats + seuil global) ──────────────────────────────────────────
  const ListHeader = useCallback(() => {
    if (!data) return null;
    const seuil = data.seuilGlobal ?? 5;
    return (
      <View>
        {/* Chips statistiques */}
        <View style={[s.statsRow, { borderBottomColor: colors.border, backgroundColor: colors.bgCard }]}>
          <View style={[s.statChip, { backgroundColor: DANGER + '12' }]}>
            <Text style={[s.statVal, { color: DANGER }]}>{data.ruptures}</Text>
            <Text style={[s.statLabel, { color: DANGER }]}>Rupture{data.ruptures !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[s.statChip, { backgroundColor: AMBER + '12' }]}>
            <Text style={[s.statVal, { color: AMBER }]}>{data.stockBas}</Text>
            <Text style={[s.statLabel, { color: AMBER }]}>Stock bas</Text>
          </View>
          <View style={[s.statChip, { backgroundColor: colors.bgHover }]}>
            <Text style={[s.statVal, { color: colors.text }]}>{data.totalProduits}</Text>
            <Text style={[s.statLabel, { color: colors.textMuted }]}>Produit{data.totalProduits !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Seuil global */}
        <TouchableOpacity
          onPress={openSeuilModal}
          style={[s.seuilBanner, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}
          activeOpacity={0.75}
        >
          <View style={[s.seuilIconWrap, { backgroundColor: AMBER + '18' }]}>
            <Ionicons name="flag-outline" size={16} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.seuilBannerLabel, { color: colors.textMuted }]}>Seuil d'alerte global</Text>
            <Text style={[s.seuilBannerVal, { color: colors.text }]}>
              En dessous de <Text style={{ color: AMBER, fontWeight: '800' }}>{seuil} unités</Text>
            </Text>
          </View>
          <View style={[s.seuilEditBtn, { backgroundColor: AMBER + '15', borderColor: AMBER + '40' }]}>
            <Ionicons name="pencil-outline" size={13} color={AMBER} />
            <Text style={[s.seuilEditText, { color: AMBER }]}>Modifier</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [data, colors]);

  // ─── Ligne produit ────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    const isRupture = item.niveau === 'rupture';
    const stockColor = isRupture ? DANGER : AMBER;

    return (
      <View style={[
        s.row,
        { borderBottomColor: colors.border },
        isRupture && { backgroundColor: DANGER + '07' },
      ]}>
        {item.image
          ? <CachedImage uri={item.image} style={s.thumb} contentFit="cover" />
          : <View style={[s.thumbEmpty, { backgroundColor: colors.bgHover }]}>
              <Ionicons name="cube-outline" size={20} color={colors.textDisabled} />
            </View>
        }

        <View style={s.info}>
          <Text style={[s.nom, { color: colors.text }]} numberOfLines={2}>{item.nom}</Text>
          <View style={s.metaRow}>
            {item.variante && (
              <View style={[s.variantChip, { backgroundColor: colors.bgHover }]}>
                <Text style={[s.variantText, { color: colors.textMuted }]}>{item.variante}</Text>
              </View>
            )}
            <NiveauBadge niveau={item.niveau} />
          </View>
          <Text style={[s.prix, { color: colors.textMuted }]}>{fmtMoney(item.prix)}</Text>
        </View>

        <View style={[s.stockPill, { backgroundColor: stockColor + '15', borderColor: stockColor + '50' }]}>
          <Text style={[s.stockVal, { color: stockColor }]}>{item.stock}</Text>
          <Text style={[s.stockUnit, { color: stockColor }]}>unité{item.stock !== 1 ? 's' : ''}</Text>
        </View>
      </View>
    );
  }, [colors]);

  const alertes = data?.alertes ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={s.offlineText}>Hors ligne — les données peuvent ne pas être à jour</Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3].map(i => <SkeletonRow key={i} colors={colors} />)}
        </View>

      ) : isOffline && !data ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: '#6B728018' }]}>
            <Ionicons name="cloud-offline-outline" size={40} color="#6B7280" />
          </View>
          <Text style={[s.emptyTitle, { color: colors.text }]}>Hors ligne</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            Reconnectez-vous pour charger les alertes stock.
          </Text>
        </View>

      ) : error ? (
        <View style={[s.errorBox, { margin: 16, borderColor: DANGER + '40' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={DANGER} />
          <Text style={[s.errorText, { color: DANGER }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchAlerts()} style={s.retryBtn}>
            <Text style={[s.retryText, { color: colors.primary }]}>Réessayer</Text>
          </TouchableOpacity>
        </View>

      ) : (
        <FlatList
          data={alertes}
          keyExtractor={item => item._id + (item.variante || '')}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={AMBER}
              colors={[AMBER]}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: GREEN + '18' }]}>
                <Ionicons name="checkmark-circle-outline" size={40} color={GREEN} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>Tous vos stocks sont OK</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                Aucun produit n'est en rupture ou en dessous de {data?.seuilGlobal ?? 5} unités.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ─── Modale seuil global ─────────────────────────────────────────────── */}
      <Modal
        visible={seuilModal}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setSeuilModal(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !saving && setSeuilModal(false)}
          />

          <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={s.modalHeader}>
              <View style={[s.modalIconWrap, { backgroundColor: AMBER + '18' }]}>
                <Ionicons name="flag-outline" size={18} color={AMBER} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalTitle, { color: colors.text }]}>Seuil d'alerte global</Text>
                <Text style={[s.modalSub, { color: colors.textMuted }]}>
                  Appliqué à tous vos produits
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !saving && setSeuilModal(false)}
                style={[s.modalClose, { backgroundColor: colors.bgHover }]}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[s.inputWrap, { borderColor: AMBER, backgroundColor: colors.bg }]}>
              <TextInput
                style={[s.input, { color: colors.text }]}
                value={seuilInput}
                onChangeText={v => setSeuilInput(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                selectTextOnFocus
                autoFocus
                placeholder="5"
                placeholderTextColor={colors.textDisabled}
              />
              <Text style={[s.inputUnit, { color: colors.textMuted }]}>unités</Text>
            </View>

            <Text style={[s.inputHint, { color: colors.textMuted }]}>
              Une alerte s'affiche quand un produit passe en dessous de ce seuil. Ce réglage s'applique à tous vos produits.
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.btnCancel, { borderColor: colors.border }]}
                onPress={() => setSeuilModal(false)}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={[s.btnCancelText, { color: colors.textMuted }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSave, { backgroundColor: AMBER, opacity: saving ? 0.7 : 1 }]}
                onPress={saveSeuil}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={s.btnSaveText}>Enregistrer</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Offline
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6B7280', paddingHorizontal: 14, paddingVertical: 8,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', flex: 1 },

  // Skeleton
  skelLine: { height: 12, borderRadius: 6 },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  statChip:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, gap: 2 },
  statVal:   { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Seuil banner
  seuilBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  seuilIconWrap:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  seuilBannerLabel:{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  seuilBannerVal:  { fontSize: 13, fontWeight: '600' },
  seuilEditBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  seuilEditText:   { fontSize: 12, fontWeight: '700' },

  // Ligne produit
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  thumb:      { width: 50, height: 50, borderRadius: 12 },
  thumbEmpty: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  info:       { flex: 1, gap: 5 },
  nom:        { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  metaRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  variantChip:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  variantText:{ fontSize: 10, fontWeight: '600' },
  badge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  prix:       { fontSize: 11, fontWeight: '600' },
  stockPill:  { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  stockVal:   { fontSize: 18, fontWeight: '800' },
  stockUnit:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Erreur
  errorBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 14, backgroundColor: '#FEF2F2' },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retryBtn:  { paddingTop: 2 },
  retryText: { fontSize: 13, fontWeight: '700' },

  // Vide
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 14 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Modale
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard:    { width: '100%', borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalIconWrap:{ width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modalTitle:   { fontSize: 15, fontWeight: '800' },
  modalSub:     { fontSize: 12, marginTop: 1 },
  modalClose:   { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  input:        { flex: 1, fontSize: 24, fontWeight: '800' },
  inputUnit:    { fontSize: 13, fontWeight: '600' },
  inputHint:    { fontSize: 11, lineHeight: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  btnCancel:    { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  btnCancelText:{ fontSize: 14, fontWeight: '700' },
  btnSave:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  btnSaveText:  { fontSize: 14, fontWeight: '800', color: '#fff' },
});
