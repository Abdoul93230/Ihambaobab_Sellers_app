import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, RefreshControl, Dimensions,
  Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { syncService } from '../services/syncService';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import CachedImage from '../components/CachedImage';

const { width: W } = Dimensions.get('window');
const PRIMARY  = '#30A08B';
const SECONDARY = '#B17236';
const INDIGO   = '#6366F1';
const ORANGE   = '#F97316';
const AMBER    = '#F59E0B';
const EMERALD  = '#10B981';

const QUICK_PERIODS = [
  { label: "Aujourd'hui", value: 'today' },
  { label: '7 jours',     value: '7d' },
  { label: '30 jours',    value: '30d' },
  { label: 'Personnalisé',value: 'custom' },
];

function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('fr-FR') + ' F';
}
function fmtNum(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState({ msg: '', visible: false, type: 'success' });
  const timerRef = useRef(null);
  const notify = useCallback((msg, type = 'success') => {
    clearTimeout(timerRef.current);
    setToast({ msg, visible: true, type });
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2800);
  }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { toast, notify };
}

function Toast({ msg, visible, type }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }, [visible]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        type === 'error' ? styles.toastError : styles.toastSuccess,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
      ]}
    >
      <Ionicons name={type === 'error' ? 'close-circle' : 'checkmark-circle'} size={16} color="#fff" />
      <Text style={styles.toastText}>{msg}</Text>
    </Animated.View>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, iconBg, colors }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={[styles.statLabel, { color: colors.textDisabled }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      {sub ? <Text style={[styles.statSub, { color: colors.textDisabled }]}>{sub}</Text> : null}
    </View>
  );
}

// ─── Wheel picker (même logique que Dashboard) ───────────────────────────────
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const ITEM_H = 40;

function WheelPicker({ items, selectedIndex, onChange, colors }) {
  const ref = useRef(null);
  const PAD = 2;
  const padded = [...Array(PAD).fill(null), ...items, ...Array(PAD).fill(null)];
  useEffect(() => {
    setTimeout(() => ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false }), 60);
  }, [selectedIndex]);
  return (
    <View style={{ height: ITEM_H * 5, overflow: 'hidden', width: 76 }}>
      <View pointerEvents="none" style={[bStyles.band, { top: ITEM_H * 2, borderColor: colors.primary + '50' }]} />
      <ScrollView ref={ref} showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast"
        onMomentumScrollEnd={e => { const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H); onChange(Math.max(0, Math.min(idx, items.length - 1))); }}>
        {padded.map((item, i) => {
          const ri = i - PAD; const isSel = ri === selectedIndex;
          return (
            <TouchableOpacity key={i} style={bStyles.wheelCell}
              onPress={() => { if (ri >= 0 && ri < items.length) { onChange(ri); ref.current?.scrollTo({ y: ri * ITEM_H, animated: true }); } }} activeOpacity={0.7}>
              <Text style={{ color: item === null ? 'transparent' : isSel ? colors.primary : colors.textMuted, fontWeight: isSel ? '800' : '400', fontSize: isSel ? 16 : 13, textAlign: 'center' }}>{item ?? '·'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DateWheelPicker({ label, value, onChange, colors }) {
  const today = new Date();
  const cur   = value ? new Date(value + 'T12:00:00') : today;
  const maxY  = today.getFullYear();
  const years = Array.from({ length: maxY - 2020 + 1 }, (_, i) => String(2020 + i));
  const [selYear,  setSelYear]  = useState(Math.max(0, years.indexOf(String(cur.getFullYear()))));
  const [selMonth, setSelMonth] = useState(cur.getMonth());
  const daysInMonth = new Date(parseInt(years[selYear] || today.getFullYear()), selMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const [selDay, setSelDay] = useState(Math.min(cur.getDate() - 1, daysInMonth - 1));
  useEffect(() => { const newMax = new Date(parseInt(years[selYear] || today.getFullYear()), selMonth + 1, 0).getDate(); if (selDay >= newMax) setSelDay(newMax - 1); }, [selMonth, selYear]);
  useEffect(() => { const y = years[selYear] || String(today.getFullYear()); const m = String(selMonth + 1).padStart(2, '0'); const d = days[Math.min(selDay, days.length - 1)] || '01'; onChange(`${y}-${m}-${d}`); }, [selDay, selMonth, selYear]);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[bStyles.wheelLabel, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={[bStyles.wheelRow, { backgroundColor: colors.bgHover }]}>
        <WheelPicker items={days}      selectedIndex={selDay}   onChange={setSelDay}   colors={colors} />
        <Text style={[bStyles.wheelSep, { color: colors.border }]}>|</Text>
        <WheelPicker items={MONTHS_FR} selectedIndex={selMonth} onChange={setSelMonth} colors={colors} />
        <Text style={[bStyles.wheelSep, { color: colors.border }]}>|</Text>
        <WheelPicker items={years}     selectedIndex={selYear}  onChange={setSelYear}  colors={colors} />
      </View>
    </View>
  );
}

// ─── Date range picker modal (bottom sheet style) ─────────────────────────────
function DateModal({ visible, from, to, onConfirm, onClose, colors }) {
  const [lFrom, setLFrom] = useState(from || new Date().toISOString().split('T')[0]);
  const [lTo, setLTo]     = useState(to   || new Date().toISOString().split('T')[0]);
  const slideAnim    = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setLFrom(from || new Date().toISOString().split('T')[0]);
      setLTo(to   || new Date().toISOString().split('T')[0]);
      setMounted(true);
      slideAnim.setValue(600); backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { setMounted(false); cb?.(); });
  };

  const canApply = lFrom && lTo && lFrom <= lTo;

  if (!mounted) return null;
  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(onClose)}>
      <TouchableWithoutFeedback onPress={() => dismiss(onClose)}>
        <Animated.View style={[bStyles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[bStyles.sheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        <View style={bStyles.handle}><View style={[bStyles.handleBar, { backgroundColor: colors.border }]} /></View>
        <Text style={[bStyles.sheetTitle, { color: colors.text }]}>Plage de dates</Text>
        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <DateWheelPicker label="Du"  value={lFrom} onChange={setLFrom} colors={colors} />
          <DateWheelPicker label="Au"  value={lTo}   onChange={setLTo}   colors={colors} />
        </View>
        {!canApply && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ color: AMBER, fontSize: 12, fontWeight: '600' }}>La date de début doit être avant la date de fin</Text>
          </View>
        )}
        <View style={bStyles.sheetBtns}>
          <TouchableOpacity style={[bStyles.cancelBtn, { borderColor: colors.border }]} onPress={() => dismiss(onClose)}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSub }}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[bStyles.confirmBtn, { backgroundColor: PRIMARY }, !canApply && { opacity: 0.4 }]}
            onPress={() => canApply && dismiss(() => onConfirm(lFrom, lTo))}
            disabled={!canApply}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Appliquer</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const bStyles = StyleSheet.create({
  band:       { position: 'absolute', left: 4, right: 4, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1 },
  wheelCell:  { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  wheelLabel: { fontSize: 12, fontWeight: '700' },
  wheelRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  wheelSep:   { fontSize: 18, marginHorizontal: 4 },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, gap: 16 },
  handle:     { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar:  { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 20 },
  sheetBtns:  { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  confirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14 },
});

// ─── Top Produit Row ──────────────────────────────────────────────────────────
function TopProduitRow({ produit, rank, colors }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={[styles.topRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.topRank, { color: rank <= 3 ? AMBER : colors.textDisabled }]}>
        {medals[rank - 1] || `#${rank}`}
      </Text>
      {produit.image
        ? <CachedImage uri={produit.image} style={styles.topImg} contentFit="cover" />
        : (
          <View style={[styles.topImgPlaceholder, { backgroundColor: colors.bgHover }]}>
            <Ionicons name="cube-outline" size={14} color={colors.textDisabled} />
          </View>
        )
      }
      <View style={{ flex: 1 }}>
        <Text style={[styles.topName, { color: colors.text }]} numberOfLines={1}>{produit.nom}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.topQty, { color: colors.text }]}>{produit.quantite} unités</Text>
        <Text style={[styles.topTotal, { color: PRIMARY }]}>{fmtNum(produit.total)} F</Text>
      </View>
    </View>
  );
}

// ─── PeriodSheet (bottom sheet modal) ────────────────────────────────────────
function PeriodSheet({ visible, current, onSelect, onClose, colors }) {
  const slideAnim    = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(400); backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start(() => { setMounted(false); cb?.(); });
  };

  if (!mounted) return null;

  const PERIOD_ICONS = { today: 'sunny-outline', '7d': 'calendar-outline', '30d': 'calendar-clear-outline', custom: 'options-outline' };

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(onClose)}>
      <TouchableWithoutFeedback onPress={() => dismiss(onClose)}>
        <Animated.View style={[bStyles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[bStyles.sheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        <View style={bStyles.handle}><View style={[bStyles.handleBar, { backgroundColor: colors.border }]} /></View>
        <Text style={[bStyles.sheetTitle, { color: colors.text }]}>Période d'analyse</Text>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
          {QUICK_PERIODS.map(p => {
            const isActive = current === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.periodOption,
                  { backgroundColor: isActive ? PRIMARY + '15' : colors.bgHover, borderColor: isActive ? PRIMARY + '50' : colors.border },
                ]}
                onPress={() => dismiss(() => onSelect(p.value))}
                activeOpacity={0.75}
              >
                <View style={[styles.periodOptionIcon, { backgroundColor: isActive ? PRIMARY + '20' : colors.bgCard }]}>
                  <Ionicons name={PERIOD_ICONS[p.value]} size={16} color={isActive ? PRIMARY : colors.textMuted} />
                </View>
                <Text style={[styles.periodOptionText, { color: isActive ? PRIMARY : colors.text, fontWeight: isActive ? '800' : '500' }]}>
                  {p.label}
                </Text>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={PRIMARY} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function BilanVentesScreen() {
  const { colors } = useTheme();
  const { toast, notify } = useToast();
  const { triggerSync, isSyncing, isOffline } = useSync();

  // ── Store Zustand — bilanToday réactif (mis à jour par VenteScreen) ────────
  const bilanToday = useSyncStore(s => s.bilanToday);

  const [period, setPeriod]         = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showDateModal, setShowDateModal]     = useState(false);
  const [tablePage, setTablePage]   = useState(0);
  const TABLE_PAGE_SIZE = 7;

  // bilanData = objet agrégé (today/custom)  |  historyData = tableau jour-par-jour (7d/30d)
  const [bilanData,   setBilanData]   = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [fromCache,   setFromCache]   = useState(false);
  const [stale,       setStale]       = useState(false);
  const [customOffline, setCustomOffline] = useState(false);

  // Cache mémoire — switch de période instantané sans spinner
  const prefetchCache = useRef({});
  const prevOnlineRef = useRef(isOffline);

  // ── bilanToday réactif : une vente POS en caisse met à jour immédiatement ──
  useEffect(() => {
    if (period === 'today' && bilanToday) {
      setBilanData(bilanToday);
      setDataLoading(false);
    }
  }, [bilanToday, period]);

  // ── Fonction de chargement centrale ───────────────────────────────────────
  const loadData = useCallback(async (p, from, to, force = false) => {
    setCustomOffline(false);

    const cacheKey = p === 'custom' ? `custom_${from}_${to}` : p;

    // Cache mémoire hit → affichage instantané, pas de spinner
    if (!force && prefetchCache.current[cacheKey]) {
      const cached = prefetchCache.current[cacheKey];
      setBilanData(cached.bilan ?? null);
      setHistoryData(cached.history ?? null);
      setFromCache(true);
      setStale(false);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setBilanData(null);
    setHistoryData(null);

    try {
      if (p === '7d' || p === '30d') {
        // ── Historique : un seul appel → tableau de jours, pas d'objet agrégé
        const days = p === '30d' ? 30 : 7;
        const histRes = await syncService.pullBilanHistory(days, force);
        if (!histRes) { setDataLoading(false); return; }
        setHistoryData(histRes.data ?? null);
        setFromCache(histRes.fromCache || false);
        setStale(histRes.stale || false);
        prefetchCache.current[cacheKey] = { bilan: null, history: histRes.data ?? null };

      } else {
        // ── Today / Custom : objet agrégé via pullBilanWidget
        const bilanRes = await syncService.pullBilanWidget(p, from, to, force);
        if (!bilanRes) {
          if (p === 'custom') setCustomOffline(true);
          setDataLoading(false);
          return;
        }
        setBilanData(bilanRes.data ?? null);
        setFromCache(bilanRes.fromCache || false);
        setStale(bilanRes.stale || false);

        // Custom range : charge aussi le tableau jour-par-jour pour la section détail
        let hist = null;
        if (p === 'custom' && from && to) {
          const histRes = await syncService.pullBilanHistory(from, to, force);
          if (histRes?.data) hist = histRes.data;
        }
        setHistoryData(hist);
        prefetchCache.current[cacheKey] = { bilan: bilanRes.data ?? null, history: hist };
      }

    } catch {
      notify('Erreur de chargement', 'error');
      setBilanData(null);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Préchargement silencieux 7j/30j au montage ────────────────────────────
  useEffect(() => {
    (async () => {
      await Promise.all(['7d', '30d'].map(async (p) => {
        try {
          const days = p === '30d' ? 30 : 7;
          const histRes = await syncService.pullBilanHistory(days, false);
          if (!histRes?.data) return;
          prefetchCache.current[p] = { bilan: null, history: histRes.data };
        } catch (_) {}
      }));
    })();
  }, []);

  // ── Charge la période courante au montage + changement de période ─────────
  useEffect(() => {
    if (period === 'custom') return; // géré dans confirmCustom
    loadData(period, '', '');
  }, [period]);

  // ── Retour online → invalide le cache mémoire et recharge ─────────────────
  useEffect(() => {
    const wasOffline = prevOnlineRef.current === false;
    const nowOnline  = !isOffline;
    if (nowOnline && wasOffline) {
      prefetchCache.current = {};
      loadData(period, customFrom, customTo, true);
    }
    prevOnlineRef.current = isOffline;
  }, [isOffline, period, customFrom, customTo]);

  // ── Pull-to-refresh — identique Dashboard ─────────────────────────────────
  const onRefresh = useCallback(() => {
    prefetchCache.current = {}; // vide le cache mémoire
    triggerSync();              // sync globale (produits, commandes, etc.)
    loadData(period, customFrom, customTo, true); // force bilan frais
  }, [period, customFrom, customTo]);

  // ── Period helpers ─────────────────────────────────────────────────────────
  function selectPeriod(p) {
    setShowPeriodSheet(false);
    setTablePage(0);
    if (p === 'custom') { setShowDateModal(true); return; }
    setPeriod(p);
    setCustomFrom('');
    setCustomTo('');
  }

  function confirmCustom(from, to) {
    setShowDateModal(false);
    setCustomFrom(from);
    setCustomTo(to);
    setPeriod('custom');
    setTablePage(0);
    loadData('custom', from, to); // appel direct, pas de dépendance aux setState
  }

  const periodLabel = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      const f = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `${f(customFrom)} – ${f(customTo)}`;
    }
    return QUICK_PERIODS.find(p => p.value === period)?.label || '';
  }, [period, customFrom, customTo]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isHistory = period !== 'today' && period !== 'custom';
  const isRange   = period === 'custom' && customFrom && customTo;
  const todayData = !isHistory ? bilanData : null;

  const histTotal    = historyData ? historyData.reduce((s, d) => s + (d.totalGeneral  || 0), 0) : 0;
  const histPos      = historyData ? historyData.reduce((s, d) => s + (d.posTotal       || 0), 0) : 0;
  const histCmd      = historyData ? historyData.reduce((s, d) => s + (d.commandeTotal  || 0), 0) : 0;
  const histArticles = historyData ? historyData.reduce((s, d) => s + (d.articlesVendus || 0), 0) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderSkeleton = () => (
    <View style={styles.skeletonWrap}>
      {[1,2,3,4].map(i => (
        <View key={i} style={[styles.skeletonCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.skeletonLine, { width: '50%', backgroundColor: colors.bgHover }]} />
          <View style={[styles.skeletonLine, { width: '70%', height: 24, marginTop: 6, backgroundColor: colors.bgHover }]} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Banners offline / cache stale */}
      {stale && (
        <View style={[styles.banner, { backgroundColor: AMBER }]}>
          <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
          <Text style={styles.bannerText}>Données en cache — connectez-vous pour actualiser</Text>
        </View>
      )}
      {isOffline && !stale && (
        <View style={[styles.banner, { backgroundColor: '#6B7280' }]}>
          <Ionicons name="wifi-outline" size={13} color="#fff" />
          <Text style={styles.bannerText}>Hors ligne</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        {/* ── Gradient header ── */}
        <LinearGradient colors={[PRIMARY, '#267a6b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradHeader}>
          <View style={styles.gradHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.gradTitle}>Bilan des ventes</Text>
              <Text style={styles.gradSub}>Vue consolidée POS + marketplace</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
              {isSyncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="refresh-outline" size={18} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          {/* Sélecteur de période */}
          <TouchableOpacity
            style={styles.periodSelector}
            onPress={() => setShowPeriodSheet(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.periodSelectorText}>{periodLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* Total général */}
          {!dataLoading && (bilanData || historyData) && (
            <Text style={styles.gradTotal}>
              {fmt(todayData?.totalGeneral ?? histTotal)}
            </Text>
          )}
        </LinearGradient>

        {/* Badge plage personnalisée */}
        {period === 'custom' && customFrom && customTo && (
          <View style={styles.customBadgeRow}>
            <View style={[styles.customBadge, { backgroundColor: PRIMARY + '15', borderColor: PRIMARY + '40' }]}>
              <Ionicons name="calendar-outline" size={12} color={PRIMARY} />
              <Text style={[styles.customBadgeText, { color: PRIMARY }]}>{periodLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => { setPeriod('today'); setCustomFrom(''); setCustomTo(''); }}>
              <Text style={[styles.resetText, { color: colors.textDisabled }]}>✕ Réinitialiser</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attente sélection dates custom */}
        {period === 'custom' && !customFrom && (
          <View style={[styles.datePrompt, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={36} color={colors.textDisabled} />
            <Text style={[styles.datePromptText, { color: colors.textSub }]}>
              Sélectionnez une plage de dates
            </Text>
            <TouchableOpacity style={[styles.datePromptBtn, { backgroundColor: PRIMARY }]} onPress={() => setShowDateModal(true)}>
              <Text style={styles.datePromptBtnText}>Choisir les dates</Text>
            </TouchableOpacity>
          </View>
        )}

        {dataLoading ? renderSkeleton() : (
          <View style={styles.content}>

            {/* ── Custom offline sans cache ── */}
            {customOffline && (
              <View style={[styles.emptySection, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Ionicons name="cloud-offline-outline" size={40} color={colors.textDisabled} />
                <Text style={[styles.emptySectionTitle, { color: colors.textSub }]}>Données non disponibles hors ligne</Text>
                <Text style={[styles.emptySectionSub, { color: colors.textDisabled }]}>
                  Cette plage n'a pas été chargée. Connectez-vous pour voir les données.
                </Text>
              </View>
            )}

            {/* ── Vide : online mais pas de données / période jamais chargée ── */}
            {!customOffline && !todayData && !historyData && period !== 'custom' && (
              <View style={[styles.emptySection, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Ionicons
                  name={isOffline ? 'cloud-offline-outline' : 'bar-chart-outline'}
                  size={40} color={colors.textDisabled}
                />
                <Text style={[styles.emptySectionTitle, { color: colors.textSub }]}>
                  {isOffline ? 'Données non disponibles hors ligne' : 'Aucune donnée disponible'}
                </Text>
                <Text style={[styles.emptySectionSub, { color: colors.textDisabled }]}>
                  {isOffline
                    ? 'Cette période n\'a pas encore été chargée. Connectez-vous pour voir les données.'
                    : 'Aucune vente enregistrée sur cette période.'}
                </Text>
                {!isOffline && (
                  <TouchableOpacity style={[styles.datePromptBtn, { backgroundColor: PRIMARY, marginTop: 8 }]} onPress={onRefresh}>
                    <Text style={styles.datePromptBtnText}>Actualiser</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Vue AUJOURD'HUI / CUSTOM ── */}
            {todayData && (
              <>
                {/* 4 stats */}
                <View style={styles.statsGrid}>
                  <StatCard
                    icon={<Ionicons name="trending-up-outline" size={18} color={PRIMARY} />}
                    label="Total" value={fmt(todayData.totalGeneral)}
                    iconBg={PRIMARY + '15'} colors={colors}
                  />
                  <StatCard
                    icon={<Ionicons name="cart-outline" size={18} color={INDIGO} />}
                    label="Caisse POS" value={fmt(todayData.pos?.total)}
                    sub={`${todayData.pos?.ventes ?? 0} vente(s)`}
                    iconBg={INDIGO + '15'} colors={colors}
                  />
                  <StatCard
                    icon={<Ionicons name="globe-outline" size={18} color={ORANGE} />}
                    label="Marketplace" value={fmt(todayData.marketplace?.total)}
                    sub={`${todayData.marketplace?.commandes ?? 0} cmd`}
                    iconBg={ORANGE + '15'} colors={colors}
                  />
                  <StatCard
                    icon={<Ionicons name="star-outline" size={18} color={AMBER} />}
                    label="Articles" value={String(todayData.articlesVendus ?? 0)}
                    iconBg={AMBER + '15'} colors={colors}
                  />
                </View>

                {/* Top produits */}
                {todayData.topProduits?.length > 0 && (
                  <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>🏆 Top produits</Text>
                    </View>
                    {todayData.topProduits.map((p, i) => (
                      <TopProduitRow key={p.id || i} produit={p} rank={i + 1} colors={colors} />
                    ))}
                  </View>
                )}

                {todayData.totalGeneral === 0 && (
                  <View style={[styles.emptySection, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <Ionicons name="bar-chart-outline" size={40} color={colors.textDisabled} />
                    <Text style={[styles.emptySectionTitle, { color: colors.textSub }]}>Aucune vente sur cette période</Text>
                    <Text style={[styles.emptySectionSub, { color: colors.textDisabled }]}>Les ventes POS et commandes apparaîtront ici</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Vue HISTORIQUE (7j / 30j) — stats agrégées calculées côté JS ── */}
            {historyData && (
              <>
                {/* 4 stats agrégées — seulement pour 7j/30j, pas pour custom (déjà affiché via todayData) */}
                {isHistory && (
                  <View style={styles.statsGrid}>
                    <StatCard
                      icon={<Ionicons name="trending-up-outline" size={18} color={PRIMARY} />}
                      label="Total période" value={fmt(histTotal)}
                      iconBg={PRIMARY + '15'} colors={colors}
                    />
                    <StatCard
                      icon={<Ionicons name="cart-outline" size={18} color={INDIGO} />}
                      label="POS" value={fmt(histPos)}
                      iconBg={INDIGO + '15'} colors={colors}
                    />
                    <StatCard
                      icon={<Ionicons name="globe-outline" size={18} color={ORANGE} />}
                      label="Marketplace" value={fmt(histCmd)}
                      iconBg={ORANGE + '15'} colors={colors}
                    />
                    <StatCard
                      icon={<Ionicons name="star-outline" size={18} color={AMBER} />}
                      label="Articles" value={String(histArticles)}
                      iconBg={AMBER + '15'} colors={colors}
                    />
                  </View>
                )}

                {/* Table jour par jour paginée */}
                {(() => {
                  const rows = [...historyData].reverse();
                  const totalPages = Math.ceil(rows.length / TABLE_PAGE_SIZE);
                  const pageRows = rows.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE);
                  return (
                    <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      {/* Header section avec compteur */}
                      <View style={[styles.sectionHeader, { borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Évolution jour par jour</Text>
                        <Text style={[styles.pageCount, { color: colors.textDisabled }]}>{rows.length} jours</Text>
                      </View>
                      {/* En-tête colonnes */}
                      <View style={[styles.tableHead, { backgroundColor: colors.bgHover, borderBottomColor: colors.border }]}>
                        <Text style={[styles.thDate, { color: colors.textDisabled }]}>Date</Text>
                        <Text style={[styles.thNum, { color: INDIGO }]}>POS</Text>
                        <Text style={[styles.thNum, { color: ORANGE }]}>Marché</Text>
                        <Text style={[styles.thTotal, { color: colors.text }]}>Total</Text>
                        <Text style={[styles.thArticles, { color: colors.textDisabled }]}>Art.</Text>
                      </View>
                      {/* Lignes de la page courante */}
                      {pageRows.map((d, i) => (
                        <View
                          key={d.date}
                          style={[
                            styles.tableRow,
                            { borderBottomColor: colors.border },
                            d.totalGeneral === 0 && { opacity: 0.45 },
                            i % 2 === 0 && { backgroundColor: colors.bgHover + '50' },
                          ]}
                        >
                          <Text style={[styles.tdDate, { color: colors.textSub }]} numberOfLines={1}>{formatDate(d.date)}</Text>
                          <Text style={[styles.tdNum, { color: INDIGO }]}>{fmtNum(d.posTotal)}</Text>
                          <Text style={[styles.tdNum, { color: ORANGE }]}>{fmtNum(d.commandeTotal)}</Text>
                          <Text style={[styles.tdTotal, { color: colors.text }]}>{fmtNum(d.totalGeneral)}</Text>
                          <Text style={[styles.tdArticles, { color: colors.textDisabled }]}>{d.articlesVendus}</Text>
                        </View>
                      ))}
                      {/* Contrôles pagination */}
                      {totalPages > 1 && (
                        <View style={[styles.paginationRow, { borderTopColor: colors.border }]}>
                          <TouchableOpacity
                            style={[styles.pageBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }, tablePage === 0 && { opacity: 0.35 }]}
                            onPress={() => setTablePage(p => Math.max(0, p - 1))}
                            disabled={tablePage === 0}
                          >
                            <Ionicons name="chevron-back" size={16} color={colors.textSub} />
                          </TouchableOpacity>
                          <Text style={[styles.pageInfo, { color: colors.textSub }]}>
                            Page {tablePage + 1} / {totalPages}
                          </Text>
                          <TouchableOpacity
                            style={[styles.pageBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }, tablePage >= totalPages - 1 && { opacity: 0.35 }]}
                            onPress={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={tablePage >= totalPages - 1}
                          >
                            <Ionicons name="chevron-forward" size={16} color={colors.textSub} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Sheet sélecteur de période ── */}
      <PeriodSheet
        visible={showPeriodSheet}
        current={period}
        onSelect={selectPeriod}
        onClose={() => setShowPeriodSheet(false)}
        colors={colors}
      />

      {/* ── Sheet date range ── */}
      <DateModal
        visible={showDateModal}
        from={customFrom}
        to={customTo}
        onConfirm={confirmCustom}
        onClose={() => setShowDateModal(false)}
        colors={colors}
      />

      <Toast msg={toast.msg} visible={toast.visible} type={toast.type} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 6, paddingHorizontal: 16,
  },
  bannerText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Gradient header
  gradHeader: { padding: 20, paddingBottom: 24, gap: 10 },
  gradHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  gradTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  gradSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginTop: 2 },
  refreshBtn: { padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  gradTotal: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 4 },

  // Period selector
  periodSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  periodSelectorText: { fontSize: 13, color: '#fff', fontWeight: '600', maxWidth: 160 },

  // Period sheet options
  periodOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
  },
  periodOptionIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  periodOptionText: { flex: 1, fontSize: 15 },

  // Custom period badge
  customBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  customBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  customBadgeText: { fontSize: 12, fontWeight: '700' },
  resetText: { fontSize: 12 },

  // Date prompt (custom + no dates yet)
  datePrompt: {
    margin: 16, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', paddingVertical: 40, gap: 10,
  },
  datePromptText: { fontSize: 13, fontWeight: '500' },
  datePromptBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  datePromptBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Skeleton
  skeletonWrap: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skeletonCard: {
    width: (W - 48) / 2, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  skeletonLine: { height: 10, borderRadius: 6 },

  // Content
  content: { padding: 16, gap: 14 },

  // Stats grid 2×2
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: (W - 48) / 2, borderRadius: 14, borderWidth: 1, padding: 14, gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statSub:   { fontSize: 11 },

  // Section card
  section: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sectionTitle:  { fontSize: 15, fontWeight: '800' },
  pageCount:     { fontSize: 11, fontWeight: '600' },

  // Pagination
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  pageBtn:  { width: 34, height: 34, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  pageInfo: { fontSize: 13, fontWeight: '600' },

  // Top produits
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  topRank:           { width: 24, textAlign: 'center', fontSize: 14 },
  topImg:            { width: 36, height: 36, borderRadius: 8 },
  topImgPlaceholder: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  topName:           { fontSize: 13, fontWeight: '700' },

  topQty:            { fontSize: 12, fontWeight: '700' },
  topTotal:          { fontSize: 12, fontWeight: '800' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1,
  },
  thDate:     { flex: 2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum:      { flex: 1.2, fontSize: 10, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  thTotal:    { flex: 1.5, fontSize: 10, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  thArticles: { flex: 0.7, fontSize: 10, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },

  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  tdDate:     { flex: 2, fontSize: 11, fontWeight: '600' },
  tdNum:      { flex: 1.2, fontSize: 11, fontWeight: '600', textAlign: 'right' },
  tdTotal:    { flex: 1.5, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  tdArticles: { flex: 0.7, fontSize: 11, textAlign: 'right' },

  // Empty section
  emptySection: { borderRadius: 16, borderWidth: 1, alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptySectionTitle: { fontSize: 14, fontWeight: '700' },
  emptySectionSub:   { fontSize: 12, textAlign: 'center', maxWidth: 220 },

  // Toast
  toast: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 8,
  },
  toastSuccess: { backgroundColor: '#111827' },
  toastError:   { backgroundColor: '#EF4444' },
  toastText:    { fontSize: 13, fontWeight: '700', color: '#fff' },
});
