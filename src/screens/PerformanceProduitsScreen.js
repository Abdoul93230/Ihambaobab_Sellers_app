import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import { setAgentStatsCache, getAgentStatsCache } from '../db/database';
import apiClient from '../config/api';

const PRIMARY   = '#30A08B';
const BLUE      = '#3B82F6';
const ROSE      = '#F43F5E';
const AMBER     = '#B17236';

const PERIODES = [
  { label: "Auj.",  value: '1d'  },
  { label: '7 j',  value: '7d'  },
  { label: '30 j', value: '30d' },
  { label: '90 j', value: '90d' },
];

const MODES = [
  { key: 'ventes_qte', label: 'Quantité', icon: 'bag-outline',   color: PRIMARY },
  { key: 'ventes_ca',  label: 'CA',       icon: 'cash-outline',  color: AMBER  },
  { key: 'vues',       label: 'Vues',     icon: 'eye-outline',   color: BLUE   },
  { key: 'favoris',    label: 'Favoris',  icon: 'heart-outline', color: ROSE   },
];

function fmtMoney(n) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + ' M₣';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + ' k₣';
  return new Intl.NumberFormat('fr-FR').format(v) + ' ₣';
}
function fmtNum(n) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'k';
  return String(v);
}

// ─── Ligne de classement ──────────────────────────────────────────────────────
function RankRow({ rank, produit, mode, colors }) {
  const medals = ['🥇', '🥈', '🥉'];
  const m = MODES.find(x => x.key === mode);

  let main, sub;
  if (mode === 'ventes_qte') { main = `${fmtNum(produit.quantite)} vendus`; sub = fmtMoney(produit.chiffre); }
  else if (mode === 'ventes_ca') { main = fmtMoney(produit.chiffre); sub = `${fmtNum(produit.quantite)} unités`; }
  else if (mode === 'vues')    { main = `${fmtNum(produit.views)} vues`;    sub = `${fmtNum(produit.favorites)} favoris`; }
  else                          { main = `${fmtNum(produit.favorites)} favoris`; sub = `${fmtNum(produit.views)} vues`; }

  const isTop3 = rank <= 3;

  return (
    <View style={[s.rankRow, { borderBottomColor: colors.border, backgroundColor: isTop3 ? m.color + '06' : 'transparent' }]}>
      <View style={s.rankBadge}>
        {rank <= 3
          ? <Text style={s.medal}>{medals[rank - 1]}</Text>
          : <Text style={[s.rankNum, { color: colors.textDisabled }]}>#{rank}</Text>
        }
      </View>
      {produit.image
        ? <Image source={{ uri: produit.image }} style={[s.thumb, isTop3 && { width: 46, height: 46 }]} />
        : <View style={[s.thumbEmpty, { backgroundColor: colors.bgHover }, isTop3 && { width: 46, height: 46 }]}>
            <Ionicons name="cube-outline" size={16} color={colors.textDisabled} />
          </View>
      }
      <View style={s.rankInfo}>
        <Text style={[s.rankNom, { color: colors.text }, isTop3 && { fontWeight: '700' }]} numberOfLines={1}>
          {produit.nom}
        </Text>
        <Text style={[s.rankSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <View style={[s.rankValueWrap, { backgroundColor: m.color + '12', borderColor: m.color + '30' }]}>
        <Text style={[s.rankValue, { color: m.color }]}>{main}</Text>
      </View>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function PerformanceProduitsScreen() {
  const insets       = useSafeAreaInsets();
  const { colors }   = useTheme();
  const { seller }   = useAuthStore();
  const sellerId     = seller?._id ?? seller?.id;
  const { isOffline } = useSync();

  const [period, setPeriod]         = useState('30d');
  const [mode, setMode]             = useState('ventes_qte');
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  // Cache mémoire par période — accès instantané au switch
  const dataCache = useRef({});

  // ─── Fetch réseau (refresh manuel — recharge tout en un appel) ──────────────
  const fetchData = useCallback(async (p, silent = false) => {
    if (!sellerId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/modules/performance/products/all-periods');
      const byPeriod = res.data?.data ?? {};
      for (const [key, d] of Object.entries(byPeriod)) {
        dataCache.current[key] = d;
        await setAgentStatsCache(`perf_prod_${sellerId}_${key}`, d);
      }
      if (byPeriod[p]) setData(byPeriod[p]);
    } catch (e) {
      if (!e.response && dataCache.current[p]) {
        setData(dataCache.current[p]);
      } else if (!dataCache.current[p]) {
        setError('Impossible de charger les données. Vérifiez votre connexion.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sellerId]);

  // ─── Hydratation SQLite + chargement de toutes les périodes en un appel ─────
  useEffect(() => {
    if (!sellerId) return;
    async function hydrateAndPrefetch() {
      // 1. Lire SQLite pour toutes les périodes → cache mémoire instantané
      for (const per of PERIODES) {
        const cached = await getAgentStatsCache(`perf_prod_${sellerId}_${per.value}`);
        if (cached?.data) dataCache.current[per.value] = cached.data;
      }
      // 2. Afficher la période active depuis le cache si dispo
      if (dataCache.current[period]) {
        setData(dataCache.current[period]);
        setLoading(false); // cache dispo → on libère le skeleton immédiatement
      }
      // Sinon loading reste true → skeleton jusqu'à la réponse réseau

      // 3. Un seul appel réseau pour toutes les périodes
      try {
        const res = await apiClient.get('/api/modules/performance/products/all-periods');
        const byPeriod = res.data?.data ?? {};
        for (const [p, d] of Object.entries(byPeriod)) {
          dataCache.current[p] = d;
          await setAgentStatsCache(`perf_prod_${sellerId}_${p}`, d);
        }
        // Afficher la période active avec les données fraîches
        if (byPeriod[period]) setData(byPeriod[period]);
      } catch (e) {
        if (!dataCache.current[period]) {
          setError('Impossible de charger les données. Vérifiez votre connexion.');
        }
      } finally {
        setLoading(false);
      }
    }
    hydrateAndPrefetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  // ─── Reconnexion : recharge si le cache était vide ──────────────────────────
  const isOfflineRef = useRef(isOffline);
  useEffect(() => {
    const wasOffline = isOfflineRef.current;
    isOfflineRef.current = isOffline;
    if (wasOffline && !isOffline) fetchData(period, !!dataCache.current[period]);
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Changement de période ───────────────────────────────────────────────────
  const handlePeriodChange = useCallback((p) => {
    setPeriod(p);
    if (dataCache.current[p]) {
      setData(dataCache.current[p]);
      fetchData(p, true);   // refresh silencieux
    } else {
      setData(null);
      fetchData(p, false);  // spinner bloquant
    }
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(period, true);
  }, [fetchData, period]);

  const totaux = data?.totaux ?? {};
  const activeMode = MODES.find(m2 => m2.key === mode);

  const rankList = (() => {
    if (!data) return [];
    if (mode === 'ventes_qte') return data.topVentes ?? [];
    if (mode === 'ventes_ca')  return data.topChiffre ?? [];
    if (mode === 'vues')       return data.topVues ?? [];
    return data.topFavoris ?? [];
  })();

  const periodLabel = PERIODES.find(p => p.value === period)?.label ?? '';

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 0 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <View style={s.heroWrap}>
        {/* Sélecteur période */}
        <View style={s.periodRow}>
          {PERIODES.map(p => (
            <TouchableOpacity
              key={p.value}
              onPress={() => handlePeriodChange(p.value)}
              style={[
                s.periodPill,
                { borderColor: period === p.value ? colors.border : 'transparent',
                  backgroundColor: period === p.value ? colors.bgCard : 'transparent' },
              ]}
            >
              <Text style={[s.periodText, { color: period === p.value ? colors.text : colors.textMuted }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          {isOffline && (
            <View style={s.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={12} color="#fff" />
              <Text style={s.offlineBadgeText}>Hors ligne</Text>
            </View>
          )}
        </View>

        {/* Card hero — même style que Dashboard */}
        {loading
          ? <View style={[s.heroSkel, { backgroundColor: colors.bgHover }]} />
          : (
            <LinearGradient
              colors={['#30A08B', '#1e7a6b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.heroCard}
            >
              {/* Ligne principale : CA total + icône */}
              <View style={s.heroRow}>
                <View>
                  <Text style={s.heroCaption}>Chiffre d'affaires · {periodLabel}</Text>
                  <Text style={s.heroTotal}>{fmtMoney(totaux.chiffre)}</Text>
                </View>
                <View style={[s.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="trending-up-outline" size={22} color="#fff" />
                </View>
              </View>

              {/* Séparateur */}
              <View style={s.heroDivider} />

              {/* POS / Marketplace */}
              <View style={s.heroSub}>
                <View>
                  <Text style={s.heroSubLabel}>Caisse POS</Text>
                  <Text style={s.heroSubVal}>{fmtMoney(totaux.pos?.chiffre)}</Text>
                </View>
                <View style={s.heroSubRight}>
                  <View style={s.heroChip}>
                    <Ionicons name="storefront-outline" size={11} color="#fff" />
                    <Text style={s.heroChipText}>{fmtNum(totaux.pos?.quantite)} vente{(totaux.pos?.quantite ?? 0) !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={s.heroPanier}>Marketplace · {fmtMoney(totaux.marketplace?.chiffre)}</Text>
                </View>
              </View>

              {/* Séparateur */}
              <View style={s.heroDivider} />

              {/* Stats engagement */}
              <View style={s.heroStatRow}>
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{fmtNum(totaux.quantite)}</Text>
                  <Text style={s.heroStatLabel}>vendus</Text>
                </View>
                <View style={s.heroStatSep} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{fmtNum(totaux.views)}</Text>
                  <Text style={s.heroStatLabel}>vues</Text>
                </View>
                <View style={s.heroStatSep} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{fmtNum(totaux.favorites)}</Text>
                  <Text style={s.heroStatLabel}>favoris</Text>
                </View>
                <View style={s.heroStatSep} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatVal}>{fmtNum(totaux.produitsActifs)}</Text>
                  <Text style={s.heroStatLabel}>actifs</Text>
                </View>
              </View>
            </LinearGradient>
          )
        }
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {error && (
          <View style={[s.errorBox, { borderColor: '#FECACA' }]}>
            <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Classement ──────────────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {/* Titre + mode pills */}
          <View style={s.cardHead}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Classement produits</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.modePills}
          >
            {MODES.map(m2 => {
              const active = mode === m2.key;
              return (
                <TouchableOpacity
                  key={m2.key}
                  onPress={() => setMode(m2.key)}
                  style={[
                    s.modePill,
                    { borderColor: active ? m2.color : colors.border,
                      backgroundColor: active ? m2.color : colors.bgHover },
                  ]}
                >
                  <Ionicons name={m2.icon} size={13} color={active ? '#fff' : colors.textMuted} />
                  <Text style={[s.modePillText, { color: active ? '#fff' : colors.textMuted }]}>
                    {m2.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Liste */}
          {loading
            ? [1, 2, 3, 4, 5].map(i => (
                <View key={i} style={[s.skeletonRow, { backgroundColor: colors.bgHover }]} />
              ))
            : rankList.length === 0
              ? (
                <View style={s.emptyWrap}>
                  <Ionicons name={activeMode.icon} size={32} color={colors.textDisabled} />
                  <Text style={[s.emptyText, { color: colors.textMuted }]}>
                    Aucune donnée pour l'instant
                  </Text>
                </View>
              )
              : rankList.map((p, i) => (
                  <RankRow key={String(p.id ?? i)} rank={i + 1} produit={p} mode={mode} colors={colors} />
                ))
          }
        </View>

        {/* ── Produits dormants ────────────────────────────────────────────── */}
        {!loading && (data?.dormants ?? []).length > 0 && (
          <View style={[s.dormCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={s.dormHeader}>
              <Ionicons name="moon-outline" size={14} color={colors.textMuted} />
              <Text style={[s.dormTitle, { color: colors.textMuted }]}>
                {data.dormants.length} produit{data.dormants.length > 1 ? 's' : ''} sans vente sur cette période
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dormRow}>
              {data.dormants.slice(0, 10).map(p => (
                <View key={String(p.id)} style={[s.dormItem, { backgroundColor: colors.bgHover }]}>
                  {p.image
                    ? <Image source={{ uri: p.image }} style={s.dormThumb} />
                    : <View style={[s.dormThumb, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="cube-outline" size={14} color={colors.textDisabled} />
                      </View>
                  }
                  <Text style={[s.dormName, { color: colors.textMuted }]} numberOfLines={2}>{p.nom}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Hero — même design que DashboardScreen
  heroWrap:     { paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  periodRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, alignItems: 'center' },
  periodPill:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  periodText:      { fontSize: 13, fontWeight: '700' },
  offlineBadge:    { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6B7280', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  offlineBadgeText:{ fontSize: 10, fontWeight: '700', color: '#fff' },
  heroSkel:        { height: 180, borderRadius: 18 },
  heroCard:     { borderRadius: 18, padding: 18, gap: 14 },
  heroRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroCaption:  { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
  heroTotal:    { fontSize: 28, fontWeight: '800', color: '#fff' },
  heroIcon:     { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  heroDivider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroSub:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  heroSubVal:   { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroSubRight: { alignItems: 'flex-end', gap: 4 },
  heroChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  heroChipText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  heroPanier:   { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  heroStatRow:  { flexDirection: 'row', alignItems: 'center' },
  heroStat:     { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 8 },
  heroStatSep:  { width: 6 },
  heroStatVal:  { fontSize: 14, fontWeight: '800', color: '#fff' },
  heroStatLabel:{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14, backgroundColor: '#FEF2F2' },
  errorText: { flex: 1, fontSize: 13, color: '#EF4444' },

  // Card classement
  card: { borderRadius: 18, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },

  // Mode pills (scroll horizontal)
  modePills: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  modePillText: { fontSize: 12, fontWeight: '700' },

  // Rank row
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  rankBadge: { width: 28, alignItems: 'center' },
  medal: { fontSize: 18 },
  rankNum: { fontSize: 12, fontWeight: '800' },
  thumb: { width: 40, height: 40, borderRadius: 10, resizeMode: 'cover' },
  thumbEmpty: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankInfo: { flex: 1, gap: 2 },
  rankNom: { fontSize: 13, fontWeight: '600' },
  rankSub: { fontSize: 11 },
  rankValueWrap: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  rankValue: { fontSize: 12, fontWeight: '800' },

  // Skeleton
  skeletonRow: { height: 58, marginHorizontal: 14, marginVertical: 5, borderRadius: 12 },

  // Empty
  emptyWrap: { paddingVertical: 36, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13 },

  // Dormants
  dormCard: { borderRadius: 14, borderWidth: 1, marginBottom: 14, paddingBottom: 14 },
  dormHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 12 },
  dormTitle: { fontSize: 12, fontWeight: '600' },
  dormRow: { paddingHorizontal: 14, gap: 10 },
  dormItem: { width: 76, borderRadius: 12, padding: 8, alignItems: 'center', gap: 6 },
  dormThumb: { width: 40, height: 40, borderRadius: 8, resizeMode: 'cover' },
  dormName: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
});
