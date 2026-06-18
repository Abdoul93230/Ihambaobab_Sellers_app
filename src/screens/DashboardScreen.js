import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, Modal, Animated,
  TouchableWithoutFeedback, PanResponder,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import { useModules } from '../hooks/useModules';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';

const { width: W } = Dimensions.get('window');
const ITEM_H = 44;

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('fr-FR') + ' ₣';
}
function fmtShort(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toAxisLabel(isoStr) {
  if (!isoStr) return '';
  const [, m, d] = (isoStr || '').split('-');
  return `${d}/${m}`;
}

// ─── Périodes ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { label: "Auj.",  value: 'today' },
  { label: '7j',    value: '7d'    },
  { label: '30j',   value: '30d'   },
  { label: 'Perso', value: 'custom' },
];
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const SHEET_H = 530;

// ─── Wheel picker ─────────────────────────────────────────────────────────────
function WheelPicker({ items, selectedIndex, onChange, colors }) {
  const ref  = useRef(null);
  const PAD  = 2;
  const padded = [...Array(PAD).fill(null), ...items, ...Array(PAD).fill(null)];

  useEffect(() => {
    setTimeout(() => ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false }), 60);
  }, [selectedIndex]);

  return (
    <View style={{ height: ITEM_H * 5, overflow: 'hidden', width: 76 }}>
      <View pointerEvents="none" style={[styles.wheelBand, { top: ITEM_H * 2, borderColor: colors.primary + '50' }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onChange(Math.max(0, Math.min(idx, items.length - 1)));
        }}
      >
        {padded.map((item, i) => {
          const ri = i - PAD;
          const isSel = ri === selectedIndex;
          return (
            <TouchableOpacity
              key={i}
              style={styles.wheelCell}
              onPress={() => {
                if (ri >= 0 && ri < items.length) {
                  onChange(ri);
                  ref.current?.scrollTo({ y: ri * ITEM_H, animated: true });
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={{
                color:      item === null ? 'transparent' : isSel ? colors.primary : colors.textMuted,
                fontWeight: isSel ? '800' : '400',
                fontSize:   isSel ? 16 : 13,
                textAlign:  'center',
              }}>
                {item ?? '·'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Sélecteur de date à 3 roues ──────────────────────────────────────────────
function DateWheelPicker({ label, value, onChange, colors, maxDate }) {
  const today  = new Date();
  const cur    = value ? new Date(value + 'T12:00:00') : today;
  const maxY   = maxDate ? new Date(maxDate + 'T12:00:00').getFullYear() : today.getFullYear();
  const years  = Array.from({ length: maxY - 2020 + 1 }, (_, i) => String(2020 + i));

  const [selYear,  setSelYear]  = useState(Math.max(0, years.indexOf(String(cur.getFullYear()))));
  const [selMonth, setSelMonth] = useState(cur.getMonth());

  const daysInMonth = new Date(parseInt(years[selYear] || today.getFullYear()), selMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const [selDay, setSelDay] = useState(Math.min(cur.getDate() - 1, daysInMonth - 1));

  useEffect(() => {
    const newMax = new Date(parseInt(years[selYear] || today.getFullYear()), selMonth + 1, 0).getDate();
    if (selDay >= newMax) setSelDay(newMax - 1);
  }, [selMonth, selYear]);

  useEffect(() => {
    const y = years[selYear] || String(today.getFullYear());
    const m = String(selMonth + 1).padStart(2, '0');
    const d = days[Math.min(selDay, days.length - 1)] || '01';
    onChange(`${y}-${m}-${d}`);
  }, [selDay, selMonth, selYear]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.wheelLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.wheelRow, { backgroundColor: colors.bgHover, borderRadius: 14 }]}>
        <WheelPicker items={days}   selectedIndex={selDay}   onChange={setSelDay}   colors={colors} />
        <Text style={[styles.wheelSep, { color: colors.border }]}>|</Text>
        <WheelPicker items={MONTHS_FR} selectedIndex={selMonth} onChange={setSelMonth} colors={colors} />
        <Text style={[styles.wheelSep, { color: colors.border }]}>|</Text>
        <WheelPicker items={years}  selectedIndex={selYear}  onChange={setSelYear}  colors={colors} />
      </View>
    </View>
  );
}

// ─── Modal période ────────────────────────────────────────────────────────────
function PeriodModal({ visible, current, customFrom, customTo, onSelect, onClose, colors }) {
  const [tab,   setTab]   = useState(current);
  const [from,  setFrom]  = useState(customFrom || dateStr(new Date()));
  const [to,    setTo]    = useState(customTo   || dateStr(new Date()));
  const [mounted, setMounted] = useState(false);

  const slideAnim    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (visible) { setTab(current); setMounted(true); } }, [visible]);
  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      slideAnim.setValue(SHEET_H); backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim,    { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [mounted, visible]);

  const dismiss = cb => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: SHEET_H, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,       duration: 200, useNativeDriver: true }),
    ]).start(() => { setMounted(false); cb?.(); });
  };

  const apply = () => {
    if (tab === 'custom' && (!from || !to || from > to)) return;
    dismiss(() => onSelect(tab, tab === 'custom' ? from : '', tab === 'custom' ? to : ''));
  };

  if (!mounted) return null;
  const today = dateStr(new Date());

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(onClose)}>
      <TouchableWithoutFeedback onPress={() => dismiss(onClose)}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Filtrer la période</Text>

        {/* Pills */}
        <View style={[styles.pillRow, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.pill, tab === p.value && { backgroundColor: colors.primary }]}
              onPress={() => setTab(p.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: tab === p.value ? '#fff' : colors.textMuted }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'custom' ? (
          <View style={{ paddingHorizontal: 20, gap: 18, marginTop: 18 }}>
            <DateWheelPicker label="Du"  value={from} onChange={setFrom} colors={colors} maxDate={today} />
            <DateWheelPicker label="Au"  value={to}   onChange={setTo}   colors={colors} maxDate={today} />
          </View>
        ) : (
          <View style={[styles.periodPreview, { backgroundColor: colors.primaryLight, borderColor: `${colors.primary}30` }]}>
            <Ionicons name="calendar-outline" size={15} color={colors.primary} />
            <Text style={[styles.periodPreviewText, { color: colors.primary }]}>
              {tab === 'today' ? "Données d'aujourd'hui" : tab === '7d' ? '7 derniers jours' : '30 derniers jours'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: colors.primary }, tab === 'custom' && from > to && { opacity: 0.4 }]}
          onPress={apply}
          disabled={tab === 'custom' && from > to}
        >
          <Text style={styles.applyBtnText}>Appliquer</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Tooltip persistant ───────────────────────────────────────────────────────
function TooltipBar({ selected, onClear, color, formatVal, colors }) {
  if (!selected) return null;
  return (
    <View style={[styles.tooltipBar, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
      <View style={[styles.tooltipDot, { backgroundColor: color }]} />
      <Text style={[styles.tooltipDate, { color: colors.textMuted }]}>{selected.label}</Text>
      <Text style={[styles.tooltipVal, { color }]}>{formatVal(selected.value)}</Text>
      <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Header inline (affiché dans le scroll des vues) ─────────────────────────
function DashboardHeader({ planName, isTrial, daysLeft, mkStats, period, customFrom, customTo, onPressPeriod, loading, colors }) {
  const label = period === 'custom' && customFrom && customTo
    ? `${toAxisLabel(customFrom)} → ${toAxisLabel(customTo)}`
    : period === 'today' ? "Aujourd'hui"
    : period === '7d'    ? '7 derniers jours'
    :                      '30 derniers jours';

  return (
    <View style={{ gap: 12 }}>
      {/* Badges plan */}
      <View style={styles.badgeRow}>
        <View style={[styles.planBadge, { backgroundColor: colors.primaryLight, borderColor: `${colors.primary}30` }]}>
          <View style={[styles.planDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.planText, { color: colors.primary }]}>Plan {planName}</Text>
          {isTrial && <View style={[styles.trialChip, { backgroundColor: `${colors.primary}20` }]}><Text style={[styles.trialText, { color: colors.primary }]}>Essai</Text></View>}
        </View>
        {daysLeft !== null && daysLeft <= 10 && (
          <View style={[styles.daysBadge, { backgroundColor: colors.bgDanger, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={10} color={colors.dangerText} />
            <Text style={[styles.daysText, { color: colors.dangerText }]}>{daysLeft}j</Text>
          </View>
        )}
      </View>

      {/* Quick stats catalogue */}
      <View style={styles.quickStatsRow}>
        <View style={[styles.quickStat, { backgroundColor: colors.bgHover }]}>
          <Ionicons name="cube-outline" size={13} color={colors.primary} />
          <Text style={[styles.quickStatVal, { color: colors.text }]}>{mkStats.activeProducts}</Text>
          <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>actifs</Text>
        </View>
        <View style={[styles.quickStat, { backgroundColor: mkStats.lowStock > 0 ? colors.bgWarning : colors.bgHover }]}>
          <Ionicons
            name={mkStats.lowStock > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
            size={13}
            color={mkStats.lowStock > 0 ? colors.warningText : colors.success}
          />
          <Text style={[styles.quickStatVal, { color: mkStats.lowStock > 0 ? colors.warningText : colors.text }]}>
            {mkStats.lowStock}
          </Text>
          <Text style={[styles.quickStatLabel, { color: mkStats.lowStock > 0 ? colors.warningText : colors.textMuted }]}>
            stock bas
          </Text>
        </View>
        {mkStats.cancelRate !== null && (
          <View style={[styles.quickStat, { backgroundColor: mkStats.cancelRate > 15 ? colors.bgDanger : colors.bgHover }]}>
            <Ionicons name="close-circle-outline" size={13} color={mkStats.cancelRate > 15 ? colors.dangerText : colors.textMuted} />
            <Text style={[styles.quickStatVal, { color: mkStats.cancelRate > 15 ? colors.dangerText : colors.text }]}>
              {mkStats.cancelRate}%
            </Text>
            <Text style={[styles.quickStatLabel, { color: mkStats.cancelRate > 15 ? colors.dangerText : colors.textMuted }]}>
              annulées
            </Text>
          </View>
        )}
      </View>

      {/* Barre période */}
      <TouchableOpacity
        style={[styles.periodBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={onPressPeriod}
        activeOpacity={0.8}
      >
        <View style={[styles.periodBarLeft, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="calendar-outline" size={14} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.periodBarCaption, { color: colors.textMuted }]}>Période</Text>
          <Text style={[styles.periodBarValue, { color: colors.text }]}>{label}</Text>
        </View>
        {loading && <Ionicons name="sync-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />}
        <View style={[styles.periodBarChip, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.periodBarChipText, { color: colors.primary }]}>Modifier</Text>
          <Ionicons name="chevron-down" size={11} color={colors.primary} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── VUE POS ──────────────────────────────────────────────────────────────────
function ViewPOS({ bilanData, historyData, loading, colors }) {
  const [selPoint, setSelPoint] = useState(null);
  useEffect(() => { setSelPoint(null); }, [historyData]);

  const pos      = bilanData?.pos ?? {};
  const posTotal = pos.total  ?? 0;
  const posCount = pos.ventes ?? 0;
  const totalGen = bilanData?.totalGeneral ?? 0;
  const modeP    = pos.modePaiement ?? {};
  const topProds = bilanData?.topProduits ?? [];

  const totalPaid = (modeP.ESPECES || 0) + (modeP.MOBILE_MONEY || 0) + (modeP.AUTRE || 0);
  const modes = [
    { key: 'ESPECES',      label: 'Espèces',      icon: 'cash-outline',           color: '#10B981', val: modeP.ESPECES      || 0 },
    { key: 'MOBILE_MONEY', label: 'Mobile Money', icon: 'phone-portrait-outline',  color: '#F59E0B', val: modeP.MOBILE_MONEY || 0 },
    { key: 'AUTRE',        label: 'Autre',         icon: 'ellipsis-horizontal',    color: '#8B5CF6', val: modeP.AUTRE        || 0 },
  ].filter(m => m.val > 0);

  const n = (historyData || []).length;
  const every = n > 14 ? 5 : n > 7 ? 2 : 1;
  const lineData = (historyData || []).map((d, i) => ({
    value: d.posTotal ?? 0,
    label: i % every === 0 ? toAxisLabel(d.date) : '',
  }));
  const hasChart = lineData.some(d => d.value > 0);
  const chartW   = W - 80;

  if (loading) return <ViewSkeleton colors={colors} />;

  return (
    <View style={{ gap: 14 }}>
      {/* Carte récap total */}
      <LinearGradient colors={['#30A08B', '#1e7a6b']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroCaption}>Total général (toutes sources)</Text>
            <Text style={styles.heroTotal}>{fmt(totalGen)}</Text>
          </View>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="storefront-outline" size={22} color="#fff" />
          </View>
        </View>
        {/* Ligne séparateur */}
        <View style={styles.heroDivider} />
        {/* POS focus */}
        <View style={styles.heroSub}>
          <View>
            <Text style={styles.heroSubLabel}>CA Caisse POS</Text>
            <Text style={styles.heroSubVal}>{fmt(posTotal)}</Text>
          </View>
          <View style={styles.heroSubRight}>
            <View style={styles.heroChip}>
              <Ionicons name="receipt-outline" size={11} color="#fff" />
              <Text style={styles.heroChipText}>{posCount} vente{posCount !== 1 ? 's' : ''}</Text>
            </View>
            <Text style={styles.heroPanier}>
              Panier moy. {posCount > 0 ? `${fmtShort(Math.round(posTotal / posCount))} ₣` : '—'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Modes de paiement */}
      {modes.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHead}>
            <Ionicons name="card-outline" size={15} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Répartition des paiements</Text>
          </View>
          <View style={{ gap: 12 }}>
            {modes.map(m => {
              const pct = totalPaid > 0 ? Math.round((m.val / totalPaid) * 100) : 0;
              return (
                <View key={m.key} style={styles.modeRow}>
                  <View style={[styles.modeIcon, { backgroundColor: `${m.color}20` }]}>
                    <Ionicons name={m.icon} size={14} color={m.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.modeTopRow}>
                      <Text style={[styles.modeName, { color: colors.text }]}>{m.label}</Text>
                      <Text style={[styles.modeAmt, { color: colors.text }]}>{fmtShort(m.val)} ₣</Text>
                    </View>
                    <View style={[styles.modeBarBg, { backgroundColor: colors.bgHover }]}>
                      <View style={[styles.modeBarFg, { width: `${pct}%`, backgroundColor: m.color }]} />
                    </View>
                  </View>
                  <Text style={[styles.modePct, { color: colors.textMuted }]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Graphique tendance POS */}
      {hasChart && (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHead}>
            <Ionicons name="trending-up-outline" size={15} color="#30A08B" />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tendance CA POS</Text>
          </View>
          <TooltipBar
            selected={selPoint}
            onClear={() => setSelPoint(null)}
            color="#30A08B"
            formatVal={v => `${fmtShort(v)} ₣`}
            colors={colors}
          />
          <View style={styles.chartWrap}>
            <LineChart
              key={`pos-${lineData.length}-${lineData[0]?.value ?? 0}`}
              data={lineData.map((d, i) => ({
                ...d,
                dataPointColor:       '#30A08B',
                dataPointRadius:      selPoint?.index === i ? 6 : 3,
                dataPointBorderColor: selPoint?.index === i ? '#fff' : 'transparent',
                dataPointBorderWidth: selPoint?.index === i ? 2 : 0,
              }))}
              width={chartW}
              height={160}
              color="#30A08B"
              thickness={2.5}
              curved
              areaChart
              startFillColor="rgba(48,160,139,0.25)"
              startOpacity={1}
              endFillColor="rgba(48,160,139,0)"
              endOpacity={0}
              xAxisColor={colors.border}
              yAxisColor="transparent"
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 8, width: 44 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 8 }}
              yAxisLabelWidth={44}
              rulesColor={colors.border}
              rulesType="solid"
              noOfSections={3}
              backgroundColor={colors.bgCard}
              hideDataPoints={false}
              dataPointsColor="#30A08B"
              dataPointsRadius={3}
              onDataPointClick={({ index, value }) =>
                setSelPoint(s => s?.index === index ? null : { index, value, label: lineData[index]?.label || '' })
              }
              isAnimated
              animationDuration={500}
            />
          </View>
        </View>
      )}

      {/* Top produits POS */}
      {topProds.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHead}>
            <Ionicons name="podium-outline" size={15} color="#F59E0B" />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Top produits vendus</Text>
          </View>
          {topProds.slice(0, 5).map((prod, i) => (
            <View key={String(prod.id || i)} style={[styles.topRow, { borderBottomColor: colors.border }]}>
              <View style={styles.topImgWrap}>
                {prod.image ? (
                  <>
                    <CachedImage
                      uri={prod.image}
                      style={styles.topImg}
                      contentFit="cover"
                    />
                    <View style={[styles.topRankBadge, { backgroundColor: i === 0 ? '#F59E0B' : '#6B7280' }]}>
                      <Text style={styles.topRankBadgeText}>{i+1}</Text>
                    </View>
                  </>
                ) : (
                  <View style={[styles.topImg, styles.topImgFallback, { backgroundColor: i === 0 ? '#FCD34D30' : colors.bgHover }]}>
                    <Text style={[styles.topRankText, { color: i === 0 ? '#D97706' : colors.textMuted }]}>#{i+1}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.topName, { color: colors.text }]} numberOfLines={1}>{prod.nom}</Text>
                <Text style={[styles.topSub,  { color: colors.textMuted }]}>{fmtShort(prod.total)} ₣ de CA</Text>
              </View>
              <View style={[styles.topBadge, { backgroundColor: '#30A08B20' }]}>
                <Text style={styles.topBadgeText}>{prod.quantite} vdu</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {posCount === 0 && !hasChart && (
        <View style={styles.emptyBlock}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.bgHover }]}>
            <Ionicons name="storefront-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucune vente POS</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Aucune vente enregistrée en caisse sur cette période.</Text>
        </View>
      )}
    </View>
  );
}

// ─── Répartition statuts pour "aujourd'hui" ───────────────────────────────────
function TodayStatusBreakdown({ commandes, mkTotal, mkCount, colors }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const todayOrders = useMemo(() =>
    commandes.filter(o => {
      const d = new Date(o.date || o.createdAt || 0);
      const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return s === todayStr;
    }),
    [commandes, todayStr]
  );

  const total = todayOrders.length;

  const STATUTS = [
    { label: 'Traité',      color: '#10B981', match: o => ['livraison reçu','Traité'].includes(o.etatTraitement) || o.statusLivraison === 'livré' },
    { label: 'En cours',    color: '#F59E0B', match: o => !['livraison reçu','Traité'].includes(o.etatTraitement) && o.statusLivraison !== 'livré' && !String(o.etatTraitement||'').toLowerCase().includes('annul') && o.statusLivraison !== 'annulé' },
    { label: 'Annulé',      color: '#EF4444', match: o => String(o.etatTraitement||'').toLowerCase().includes('annul') || o.statusLivraison === 'annulé' },
  ];

  const counts = STATUTS.map(s => ({ ...s, count: todayOrders.filter(s.match).length }));

  if (total === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center', gap: 6 }}>
        <Ionicons name="storefront-outline" size={28} color={colors.textMuted} />
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>Aucune commande marketplace aujourd'hui.</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Sélectionnez 7j ou 30j pour voir l'évolution.</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>
        RÉPARTITION DES {total} COMMANDE{total > 1 ? 'S' : ''} DU JOUR
      </Text>
      {counts.map(s => {
        const pct = total > 0 ? s.count / total : 0;
        return (
          <View key={s.label} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{s.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: s.color }}>{s.count}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bgHover, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: s.color, minWidth: s.count > 0 ? 8 : 0 }} />
            </View>
          </View>
        );
      })}
      {mkTotal > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>Panier moyen du jour</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>
            {mkCount > 0 ? Number(Math.round(mkTotal / mkCount)).toLocaleString('fr-FR') + ' ₣' : '—'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── VUE MARKETPLACE ─────────────────────────────────────────────────────────
const MK_CHART_TABS = [
  { key: 'revenus',   label: 'Revenus',   color: '#30A08B' },
  { key: 'commandes', label: 'Commandes', color: '#267a6b' },
];

function ViewMarketplace({ bilanData, historyData, commandesLocal, cancelRate, loading, period, colors }) {
  const [chartTab, setChartTab] = useState('revenus');
  const [selPoint, setSelPoint] = useState(null);
  useEffect(() => { setSelPoint(null); }, [historyData, chartTab]);

  const CHART_W = W - 48;
  const chartScrollRef = useRef(null);
  const switchChartTab = (tab) => {
    setChartTab(tab);
    chartScrollRef.current?.scrollTo({ x: tab === 'revenus' ? 0 : CHART_W, animated: true });
  };

  const mkTotal  = bilanData?.marketplace?.total              ?? 0;
  const mkCount  = bilanData?.marketplace?.commandes          ?? 0;
  // Utilise les articles spécifiques marketplace (pas le total qui inclut le POS)
  const articles = bilanData?.marketplace?.articlesVendus     ?? bilanData?.articlesVendus ?? 0;

  // ── Données graphique ──────────────────────────────────────────────────────
  // Le graphe nécessite une série temporelle (7j, 30j, ou custom avec dates)
  // Pour "today" seul → pas de graphe, les KPI suffisent
  const hasTimeSeries = period === '7d' || period === '30d' || period === 'custom';
  const n     = (historyData || []).length;
  const every = n > 14 ? 5 : n > 7 ? 2 : 1;

  let revenusData = [], commandesData = [];

  if (hasTimeSeries && n > 0) {
    revenusData   = historyData.map((d, i) => ({
      value: d.commandeTotal  ?? 0,
      label: i % every === 0 ? toAxisLabel(d.date) : '',
    }));
    commandesData = historyData.map((d, i) => ({
      value:      d.commandeCount ?? 0,
      label:      i % every === 0 ? toAxisLabel(d.date) : '',
      frontColor: '#30A08B',
    }));
  }

  const activeData  = chartTab === 'revenus' ? revenusData : commandesData;
  const activeColor = MK_CHART_TABS.find(t => t.key === chartTab)?.color || '#30A08B';
  const hasData     = activeData.length > 0 && activeData.some(d => (d.value ?? 0) > 0);
  const chartW      = CHART_W;

  // Y-axis entier pour le BarChart commandes (évite 0.3, 0.6, etc.)
  const maxCmdVal   = commandesData.length > 0 ? Math.max(...commandesData.map(d => d.value ?? 0)) : 0;
  const cmdStep     = Math.max(1, Math.ceil(maxCmdVal / 4));
  const cmdSections = maxCmdVal > 0 ? Math.min(maxCmdVal, 4) : 4;

  // Commandes récentes
  const recentOrders = useMemo(() =>
    [...commandesLocal]
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
      .slice(0, 5),
    [commandesLocal]
  );

  if (loading) return <ViewSkeleton colors={colors} />;

  const barW = Math.max(Math.floor((chartW - 80) / Math.max(activeData.length, 1) - 8), 16);

  return (
    <View style={{ gap: 14 }}>
      {/* Carte récap Marketplace */}
      <LinearGradient colors={['#30A08B', '#1e7a6b']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroCaption}>CA Marketplace</Text>
            <Text style={styles.heroTotal}>{fmt(mkTotal)}</Text>
          </View>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="globe-outline" size={22} color="#fff" />
          </View>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStatRow}>
          {[
            { icon: 'cart-outline',        val: String(mkCount),   label: 'Commandes' },
            { icon: 'cube-outline',        val: String(articles),  label: 'Articles vendus' },
            { icon: 'trending-up-outline', val: mkCount > 0 ? `${fmtShort(Math.round(mkTotal / mkCount))} ₣` : '—', label: 'Panier moy.' },
            ...(cancelRate !== null ? [{ icon: 'close-circle-outline', val: `${cancelRate}%`, label: 'Annulées' }] : []),
          ].map((s, i, arr) => (
            <React.Fragment key={s.label}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{s.val}</Text>
                <Text style={styles.heroStatLabel}>{s.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.heroStatSep} />}
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>

      {/* Graphique avec switch */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.cardHead}>
          <Ionicons name="analytics-outline" size={15} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Évolution</Text>
        </View>
        {/* Switch tab */}
        <View style={[styles.switchRowFull, { borderBottomColor: colors.border }]}>
          {MK_CHART_TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.switchBtnFull, chartTab === t.key && { borderBottomColor: t.color }]}
              onPress={() => switchChartTab(t.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.switchText, { color: chartTab === t.key ? t.color : colors.textMuted, fontWeight: chartTab === t.key ? '700' : '500' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TooltipBar
          selected={selPoint}
          onClear={() => setSelPoint(null)}
          color={activeColor}
          formatVal={v => chartTab === 'revenus' ? `${fmtShort(v)} ₣` : `${v} cmd`}
          colors={colors}
        />

        {!hasTimeSeries ? (
          <TodayStatusBreakdown commandes={commandesLocal} mkTotal={mkTotal} mkCount={mkCount} colors={colors} />
        ) : !hasData ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Aucune donnée sur cette période</Text>
          </View>
        ) : (
          <ScrollView
            ref={chartScrollRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={{ width: CHART_W }}
          >
            {/* Page Revenus */}
            <View style={[styles.chartWrap, { width: CHART_W }]}>
              <LineChart
                key={`mk-rev-${revenusData.length}-${revenusData[0]?.value ?? 0}`}
                data={revenusData.map((d, i) => ({
                  ...d,
                  dataPointColor:       '#30A08B',
                  dataPointRadius:      selPoint?.index === i ? 6 : 4,
                  dataPointBorderColor: selPoint?.index === i ? '#fff' : 'transparent',
                  dataPointBorderWidth: selPoint?.index === i ? 2 : 0,
                }))}
                width={chartW}
                height={180}
                color="#30A08B"
                thickness={2.5}
                curved
                areaChart
                startFillColor="rgba(48,160,139,0.25)"
                startOpacity={1}
                endFillColor="rgba(48,160,139,0)"
                endOpacity={0}
                xAxisColor={colors.border}
                yAxisColor="transparent"
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 9, width: 48 }}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                yAxisLabelWidth={48}
                rulesColor={colors.border}
                rulesType="solid"
                noOfSections={4}
                backgroundColor={colors.bgCard}
                hideDataPoints={false}
                dataPointsColor="#30A08B"
                dataPointsRadius={4}
                onDataPointClick={({ index, value }) =>
                  setSelPoint(s => s?.index === index ? null : { index, value, label: revenusData[index]?.label || '' })
                }
                isAnimated
                animationDuration={600}
              />
            </View>
            {/* Page Commandes */}
            <View style={[styles.chartWrap, { width: CHART_W }]}>
              <BarChart
                key={`mk-cmd-${commandesData.length}-${commandesData[0]?.value ?? 0}`}
                data={commandesData.map((d, i) => ({
                  ...d,
                  frontColor: selPoint?.index === i ? '#267a6b' : '#30A08B',
                  onPress: () => setSelPoint(s => s?.index === i ? null : { index: i, value: d.value, label: d.label || '' }),
                }))}
                width={chartW}
                height={180}
                barWidth={barW}
                spacing={Math.max(Math.floor((chartW - 80) / Math.max(commandesData.length, 1) - barW), 4)}
                roundedTop
                xAxisColor={colors.border}
                yAxisColor="transparent"
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 9, width: 48 }}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                yAxisLabelWidth={48}
                rulesColor={colors.border}
                rulesType="solid"
                noOfSections={cmdSections}
                stepValue={cmdStep}
                backgroundColor={colors.bgCard}
                isAnimated
                animationDuration={500}
              />
            </View>
          </ScrollView>
        )}
      </View>

      {/* Commandes récentes */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.cardHead}>
          <Ionicons name="time-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Commandes récentes</Text>
        </View>
        {recentOrders.length === 0
          ? <View style={styles.emptyBlock}>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>Aucune commande.</Text>
            </View>
          : recentOrders.map((o, i) => <OrderRow key={String(o._id || i)} order={o} colors={colors} />)
        }
      </View>
    </View>
  );
}

// ─── Squelette de chargement ──────────────────────────────────────────────────
function ViewSkeleton({ colors }) {
  return (
    <View style={{ gap: 14, paddingBottom: 20 }}>
      {[130, 80, 200, 100].map((h, i) => (
        <View key={i} style={[styles.skBlock, { backgroundColor: colors.bgHover, height: h }]} />
      ))}
    </View>
  );
}

// ─── Ligne commande ───────────────────────────────────────────────────────────
function OrderRow({ order, colors }) {
  const client = order.livraisonDetails?.nom
    ? `${order.livraisonDetails.nom}${order.livraisonDetails.prenom ? ' ' + order.livraisonDetails.prenom : ''}`
    : order.reference || 'Commande';
  const date = new Date(order.date || order.createdAt || Date.now()).toLocaleDateString('fr-FR');
  const etat = order.etatTraitement || '';
  const livraison = order.statusLivraison || '';
  const isAnnule  = livraison === 'annulé' || etat.toLowerCase().includes('annul');
  const isDone    = ['livraison reçu', 'Traité'].includes(etat) || livraison === 'livré';
  const statusBg    = isAnnule ? colors.bgDanger  : isDone ? colors.bgSuccess  : colors.bgWarning;
  const statusColor = isAnnule ? colors.dangerText : isDone ? colors.successText: colors.warningText;

  return (
    <View style={[styles.orderRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.orderIconWrap, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="bag-outline" size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.orderClient, { color: colors.text }]} numberOfLines={1}>{client}</Text>
        <Text style={[styles.orderDate,   { color: colors.textMuted }]}>{date}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.orderTotal, { color: colors.text }]}>{fmtShort(order.sellerTotal || 0)} ₣</Text>
        <View style={[styles.orderBadge, { backgroundColor: statusBg }]}>
          <Text style={[styles.orderBadgeText, { color: statusColor }]} numberOfLines={1}>
            {etat || livraison || 'En attente'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── DASHBOARD PRINCIPAL ──────────────────────────────────────────────────────
const VIEWS = [
  { key: 'pos',         label: 'Caisse POS',  icon: 'storefront-outline', color: '#30A08B' },
  { key: 'marketplace', label: 'Marketplace', icon: 'globe-outline',       color: '#267a6b' },
];

export default function DashboardScreen() {
  const commandes      = useSyncStore(s => s.commandes)      ?? [];
  const produits       = useSyncStore(s => s.produits)       ?? [];
  const produitsStats  = useSyncStore(s => s.produitsStats);
  const commandesStats = useSyncStore(s => s.commandesStats);
  const bilanToday     = useSyncStore(s => s.bilanToday);
  const { triggerSync, isSyncing, isOffline } = useSync();
  const { colors }     = useTheme();
  const { subscription } = useAuthStore();

  // ── Vue active ────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('pos');
  const slideAnim = useRef(new Animated.Value(0)).current;

  const activeViewRef = useRef('pos');
  const switchView = (key) => {
    const toX = key === 'pos' ? 0 : -W;
    Animated.spring(slideAnim, { toValue: toX, tension: 70, friction: 14, useNativeDriver: true }).start();
    setActiveView(key);
    activeViewRef.current = key;
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        slideAnim.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        const base = activeViewRef.current === 'pos' ? 0 : -W;
        const next = base + g.dx;
        const clamped = Math.max(-W, Math.min(0, next));
        slideAnim.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const isPos = activeViewRef.current === 'pos';
        const threshold = W * 0.3;
        if (isPos && g.dx < -threshold) {
          switchView('marketplace');
        } else if (!isPos && g.dx > threshold) {
          switchView('pos');
        } else {
          // Revenir à la position courante
          const base = activeViewRef.current === 'pos' ? 0 : -W;
          Animated.spring(slideAnim, { toValue: base, tension: 70, friction: 14, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: (_, g) => {
        const base = activeViewRef.current === 'pos' ? 0 : -W;
        Animated.spring(slideAnim, { toValue: base, tension: 70, friction: 14, useNativeDriver: true }).start();
      },
    })
  ).current;

  // ── Période globale ───────────────────────────────────────────────────────
  const [period,     setPeriod]     = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [showPeriod, setShowPeriod] = useState(false);

  // ── Données centralisées ──────────────────────────────────────────────────
  const [bilanData,      setBilanData]      = useState(null);
  const [historyData,    setHistoryData]    = useState(null);
  const [dataLoading,    setDataLoading]    = useState(true);
  const [customOffline,  setCustomOffline]  = useState(false);
  const prefetchCache = useRef({});

  // Quand une vente POS est faite offline, VenteScreen met à jour bilanToday
  // dans le store → on reflète immédiatement sur le dashboard sans recharger
  useEffect(() => {
    if (period === 'today' && bilanToday) {
      setBilanData(bilanToday);
    }
  }, [bilanToday, period]);

  const loadData = useCallback(async (p, from, to, force = false) => {
    setCustomOffline(false);

    // Cache hit — affiche instantanément sans spinner
    if (prefetchCache.current[p] && !force) {
      const { bilan, history } = prefetchCache.current[p];
      if (bilan) setBilanData(bilan);
      setHistoryData(history ?? null);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setHistoryData(null);
    try {
      const { syncService } = require('../services/syncService');
      const bilanRes = await syncService.pullBilanWidget(p, from, to, force);

      // Offline + custom + pas de cache → on signale l'indisponibilité
      if (!bilanRes && p === 'custom') {
        setCustomOffline(true);
        setDataLoading(false);
        return;
      }

      if (bilanRes?.data) setBilanData(bilanRes.data);

      let hist = null;
      if (p === '7d' || p === '30d') {
        const days = p === '30d' ? 30 : 7;
        const histRes = await syncService.pullBilanHistory(days, force);
        if (histRes?.data) hist = histRes.data;
      } else if (p === 'custom' && from && to) {
        const histRes = await syncService.pullBilanHistory(from, to, force);
        if (histRes?.data) hist = histRes.data;
      }
      if (hist !== null) setHistoryData(hist);

      // Mettre en cache pour accès instantané au prochain switch
      if (p !== 'custom') {
        prefetchCache.current[p] = { bilan: bilanRes?.data ?? null, history: hist };
      }
    } catch (_) {}
    setDataLoading(false);
  }, []);

  // Préchargement silencieux de 7j et 30j dès le montage
  useEffect(() => {
    const prefetch = async () => {
      const { syncService } = require('../services/syncService');
      await Promise.all(['7d', '30d'].map(async (p) => {
        try {
          const bilanRes = await syncService.pullBilanWidget(p, '', '', false);
          if (!bilanRes?.data) return;
          const days = p === '30d' ? 30 : 7;
          const histRes = await syncService.pullBilanHistory(days, false);
          prefetchCache.current[p] = {
            bilan: bilanRes.data,
            history: histRes?.data ?? null,
          };
        } catch (_) {}
      }));
    };
    prefetch();
  }, []);

  useEffect(() => {
    loadData(period, customFrom, customTo, false);
  }, [period, customFrom, customTo]);

  const handlePeriod = (p, from, to) => {
    setShowPeriod(false);
    setPeriod(p); setCustomFrom(from); setCustomTo(to);
  };

  // ── Stats KPI locales (Marketplace, mois courant) ─────────────────────────
  const mkStats = useMemo(() => {
    const activeProducts = produitsStats?.totalPublished ?? produits.filter(p => p.isPublished === 'Published').length;
    let lowStock = 0;
    produits.forEach(p => {
      if (p.variants?.length > 0) p.variants.forEach(v => { if ((v.stock ?? 0) < 5) lowStock++; });
      else if ((p.quantite ?? 0) < 5) lowStock++;
    });
    // Taux d'annulation sur les 50 dernières commandes disponibles en local
    const total     = commandes.length;
    const annulees  = commandes.filter(o => {
      const liv = (o.statusLivraison || '').toLowerCase();
      const eta = (o.etatTraitement  || '').toLowerCase();
      return liv === 'annulé' || eta.includes('annul');
    }).length;
    const cancelRate = total > 0 ? Math.round((annulees / total) * 100) : null;
    return { activeProducts, lowStock, cancelRate };
  }, [commandes, produits, produitsStats]);

  const planName = subscription?.planName || 'Starter';
  const isTrial  = subscription?.status === 'trial';
  const daysLeft = subscription?.daysRemaining;

  const headerProps = {
    planName, isTrial, daysLeft, mkStats,
    period, customFrom, customTo,
    onPressPeriod: () => setShowPeriod(true),
    loading: dataLoading,
    colors,
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* ── Sélecteur de vue fixe (POS / Marketplace) ──────────────────────── */}
      <View style={[styles.viewSelectorWrap, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        <View style={[styles.viewSelector, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
          {VIEWS.map(v => {
            const isActive = activeView === v.key;
            return (
              <TouchableOpacity
                key={v.key}
                style={[styles.viewTab, isActive && { backgroundColor: colors.bgCard, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 }]}
                onPress={() => switchView(v.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={v.icon} size={14} color={isActive ? v.color : colors.textMuted} />
                <Text style={[styles.viewTabText, { color: isActive ? v.color : colors.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                  {v.label}
                </Text>
                {isActive && <View style={[styles.viewTabDot, { backgroundColor: v.color }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Contenu des vues (slide) ──────────────────────────────────────── */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {customOffline ? (
          /* Période custom demandée hors ligne et absente du cache */
          <ScrollView
            contentContainerStyle={styles.viewScroll}
            refreshControl={
              <RefreshControl refreshing={isSyncing} onRefresh={() => { triggerSync(); loadData(period, customFrom, customTo, true); }} tintColor="#30A08B" />
            }
          >
            <DashboardHeader {...headerProps} />
            <View style={styles.offlineCustomWrap}>
              <View style={[styles.offlineCustomCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.offlineCustomTitle, { color: colors.text }]}>
                  Période non disponible hors ligne
                </Text>
                <Text style={[styles.offlineCustomSub, { color: colors.textMuted }]}>
                  Cette plage de dates n'a pas été chargée avant la perte de connexion.{'\n'}
                  Reconnectez-vous pour afficher ces données.
                </Text>
                <TouchableOpacity
                  style={[styles.offlineCustomBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
                  onPress={() => handlePeriod('today', '', '')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="today-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.offlineCustomBtnText, { color: colors.textMuted }]}>
                    Revenir à Aujourd'hui
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        ) : (
          <Animated.View style={[styles.slidingContainer, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
            {/* Vue POS */}
            <View style={styles.viewPane}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isSyncing}
                    onRefresh={() => { triggerSync(); loadData(period, customFrom, customTo, true); }}
                    tintColor="#30A08B"
                  />
                }
                contentContainerStyle={styles.viewScroll}
              >
                <DashboardHeader {...headerProps} />
                <ViewPOS
                  bilanData={bilanData}
                  historyData={historyData}
                  loading={dataLoading}
                  colors={colors}
                />
              </ScrollView>
            </View>

            {/* Vue Marketplace */}
            <View style={styles.viewPane}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isSyncing}
                    onRefresh={() => { triggerSync(); loadData(period, customFrom, customTo, true); }}
                    tintColor="#267a6b"
                  />
                }
                contentContainerStyle={styles.viewScroll}
              >
                <DashboardHeader {...headerProps} />
                <ViewMarketplace
                  bilanData={bilanData}
                  historyData={historyData}
                  commandesLocal={commandes}
                  cancelRate={mkStats.cancelRate}
                  loading={dataLoading}
                  period={period}
                  colors={colors}
                />
              </ScrollView>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Modal période */}
      <PeriodModal
        visible={showPeriod}
        current={period}
        customFrom={customFrom}
        customTo={customTo}
        onSelect={handlePeriod}
        onClose={() => setShowPeriod(false)}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Sélecteur de vue fixe
  viewSelectorWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1 },

  // (ancien header supprimé — le contenu est maintenant dans le scroll)
  badgeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickStatsRow:  { flexDirection: 'row', gap: 8 },
  quickStat:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  quickStatVal:   { fontSize: 13, fontWeight: '800' },
  quickStatLabel: { fontSize: 10, fontWeight: '500' },
  planBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  planDot:      { width: 6, height: 6, borderRadius: 3 },
  planText:     { fontSize: 11, fontWeight: '700' },
  trialChip:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  trialText:    { fontSize: 9, fontWeight: '800' },
  commBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  commText:     { fontSize: 10, fontWeight: '600' },
  daysBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  daysText:     { fontSize: 10, fontWeight: '600' },

  // Barre période
  periodBar:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  periodBarLeft:    { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  periodBarCaption: { fontSize: 10, fontWeight: '500', marginBottom: 1 },
  periodBarValue:   { fontSize: 13, fontWeight: '700' },
  periodBarChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  periodBarChipText:{ fontSize: 11, fontWeight: '700' },

  // Sélecteur de vue
  viewSelector: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  viewTab:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, position: 'relative' },
  viewTabText:  { fontSize: 13 },
  viewTabDot:   { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2 },

  // Conteneur slide
  slidingContainer: { flexDirection: 'row', width: W * 2 },
  viewPane:         { width: W },
  viewScroll:       { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, gap: 14 },

  // Sheet modal
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:       { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 24 },
  handleArea:  { alignItems: 'center', paddingTop: 14, paddingBottom: 8 },
  handle:      { width: 40, height: 4, borderRadius: 2 },
  sheetTitle:  { fontSize: 16, fontWeight: '800', paddingHorizontal: 24, marginBottom: 16 },
  pillRow:     { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  pill:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  pillText:    { fontSize: 13, fontWeight: '700' },
  periodPreview:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1 },
  periodPreviewText: { fontSize: 14, fontWeight: '600' },
  applyBtn:     { marginHorizontal: 20, marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Wheel
  wheelBand:    { position: 'absolute', left: 0, right: 0, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1 },
  wheelRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 4 },
  wheelCell:    { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  wheelSep:     { fontSize: 18, marginHorizontal: 2, opacity: 0.3 },
  wheelLabel:   { fontSize: 12, fontWeight: '700', marginLeft: 2 },

  // Hero card
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
  // Marketplace hero stats
  heroStatRow:  { flexDirection: 'row', alignItems: 'center' },
  heroStat:     { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 8 },
  heroStatSep:  { width: 6 },
  heroStatVal:  { fontSize: 14, fontWeight: '800', color: '#fff' },
  heroStatLabel:{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },

  // Card générique
  card:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: 12 },
  cardTitle:{ fontSize: 14, fontWeight: '700', flex: 1 },

  // Switch tab inline (ancien usage éventuel)
  switchRow:  { flexDirection: 'row', borderRadius: 9, borderWidth: 1, overflow: 'hidden' },
  switchBtn:  { paddingHorizontal: 10, paddingVertical: 5 },
  switchText: { fontSize: 13, fontWeight: '700' },
  // Switch tab pleine largeur (sous le titre de carte)
  switchRowFull:  { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: 0 },
  switchBtnFull:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },

  // Tooltip
  tooltipBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  tooltipDot:  { width: 8, height: 8, borderRadius: 4 },
  tooltipDate: { fontSize: 12, fontWeight: '600', flex: 1 },
  tooltipVal:  { fontSize: 14, fontWeight: '800' },

  // Modes paiement
  modeRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  modeIcon:   { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  modeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeName:   { fontSize: 13, fontWeight: '600' },
  modeAmt:    { fontSize: 13, fontWeight: '700' },
  modeBarBg:  { height: 5, borderRadius: 3 },
  modeBarFg:  { height: 5, borderRadius: 3, minWidth: 4 },
  modePct:    { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },

  // Top produits
  topRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  topImgWrap:      { position: 'relative', width: 42, height: 42, flexShrink: 0 },
  topImg:          { width: 42, height: 42, borderRadius: 10 },
  topImgFallback:  { justifyContent: 'center', alignItems: 'center' },
  topRankBadge:    { position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  topRankBadgeText:{ fontSize: 9, fontWeight: '900', color: '#fff' },
  topRank:         { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  topRankText:     { fontSize: 11, fontWeight: '800' },
  topName:         { fontSize: 13, fontWeight: '700' },
  topSub:          { fontSize: 10, marginTop: 1 },
  topBadge:        { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  topBadgeText:    { fontSize: 11, fontWeight: '700', color: '#30A08B' },

  // Charts
  chartWrap:  { paddingTop: 8, paddingBottom: 8, paddingLeft: 4, overflow: 'hidden' },

  // Orders
  orderRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  orderIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  orderClient:   { fontSize: 13, fontWeight: '700' },
  orderDate:     { fontSize: 11, marginTop: 1 },
  orderTotal:    { fontSize: 13, fontWeight: '800' },
  orderBadge:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  orderBadgeText:{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Skeleton
  skBlock: { borderRadius: 14, marginBottom: 0 },

  // Offline custom
  offlineCustomWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  offlineCustomCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', gap: 12 },
  offlineCustomTitle:{ fontSize: 16, fontWeight: '700', textAlign: 'center' },
  offlineCustomSub:  { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  offlineCustomBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  offlineCustomBtnText: { fontSize: 13, fontWeight: '600' },

  // Empty
  emptyBlock:   { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyIconWrap:{ width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:   { fontSize: 15, fontWeight: '700' },
  emptySub:     { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
});
