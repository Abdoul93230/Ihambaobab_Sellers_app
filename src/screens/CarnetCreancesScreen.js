import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ScrollView, Alert, ActivityIndicator, Animated, Modal,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions, Linking,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSyncStore } from '../stores/syncStore';
import { syncService } from '../services/syncService';
import { useSync } from '../hooks/useSync';
import { upsertMany, getDB } from '../db/database';

const { width: W, height: H } = Dimensions.get('window');
const PRIMARY  = '#30A08B';
const DANGER   = '#EF4444';
const AMBER    = '#F59E0B';
const LITIGE   = '#8B5CF6';
const EMERALD  = '#10B981';

// ─── Pays sous-région ────────────────────────────────────────────────────────
const PAYS = [
  { code: '+227', flag: '🇳🇪', nom: 'Niger',        digits: 8 },
  { code: '+223', flag: '🇲🇱', nom: 'Mali',         digits: 8 },
  { code: '+226', flag: '🇧🇫', nom: 'Burkina Faso', digits: 8 },
  { code: '+229', flag: '🇧🇯', nom: 'Bénin',        digits: 8 },
  { code: '+228', flag: '🇹🇬', nom: 'Togo',         digits: 8 },
  { code: '+225', flag: '🇨🇮', nom: "Côte d'Ivoire",digits: 10 },
  { code: '+221', flag: '🇸🇳', nom: 'Sénégal',      digits: 9 },
  { code: '+224', flag: '🇬🇳', nom: 'Guinée',       digits: 9 },
  { code: '+33',  flag: '🇫🇷', nom: 'France',       digits: 9 },
];

const STATUT_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'en_cours',  label: 'En cours' },
  { value: 'rembourse', label: 'Remboursés' },
  { value: 'litige',    label: 'Litiges' },
];

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const ITEM_H = 40;

// ─── Wheel picker ─────────────────────────────────────────────────────────────
function WheelPicker({ items, selectedIndex, onChange, colors }) {
  const ref = useRef(null);
  const PAD = 2;
  const padded = [...Array(PAD).fill(null), ...items, ...Array(PAD).fill(null)];
  useEffect(() => {
    setTimeout(() => ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false }), 60);
  }, [selectedIndex]);
  return (
    <View style={{ height: ITEM_H * 5, overflow: 'hidden', width: 76 }}>
      <View pointerEvents="none" style={[wStyles.band, { top: ITEM_H * 2, borderColor: colors.primary + '50' }]} />
      <ScrollView ref={ref} showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast"
        onMomentumScrollEnd={e => { const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H); onChange(Math.max(0, Math.min(idx, items.length - 1))); }}>
        {padded.map((item, i) => {
          const ri = i - PAD; const isSel = ri === selectedIndex;
          return (
            <TouchableOpacity key={i} style={wStyles.cell}
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
  const maxY  = today.getFullYear() + 5;
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
      <Text style={[wStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={[wStyles.row, { backgroundColor: colors.bgHover }]}>
        <WheelPicker items={days}      selectedIndex={selDay}   onChange={setSelDay}   colors={colors} />
        <Text style={[wStyles.sep, { color: colors.border }]}>|</Text>
        <WheelPicker items={MONTHS_FR} selectedIndex={selMonth} onChange={setSelMonth} colors={colors} />
        <Text style={[wStyles.sep, { color: colors.border }]}>|</Text>
        <WheelPicker items={years}     selectedIndex={selYear}  onChange={setSelYear}  colors={colors} />
      </View>
    </View>
  );
}

// ─── Modal sélecteur de date ──────────────────────────────────────────────────
function DatePickerModal({ visible, value, onConfirm, onClose, label, colors }) {
  const [picked, setPicked] = useState(value || new Date().toISOString().split('T')[0]);
  const slideAnim    = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setPicked(value || new Date().toISOString().split('T')[0]);
      slideAnim.setValue(500); backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => cb?.());
  };
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(onClose)}>
      <TouchableWithoutFeedback onPress={() => dismiss(onClose)}>
        <Animated.View style={[wStyles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[wStyles.sheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        <View style={wStyles.handle}><View style={[wStyles.handleBar, { backgroundColor: colors.border }]} /></View>
        <Text style={[wStyles.sheetTitle, { color: colors.text }]}>{label || 'Sélectionner une date'}</Text>
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <DateWheelPicker label="" value={picked} onChange={setPicked} colors={colors} />
        </View>
        <TouchableOpacity
          style={[wStyles.applyBtn, { backgroundColor: PRIMARY }]}
          onPress={() => dismiss(() => onConfirm(picked))}
        >
          <Text style={wStyles.applyBtnText}>Confirmer</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const wStyles = StyleSheet.create({
  band: { position: 'absolute', left: 4, right: 4, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1 },
  cell: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  sep:   { fontSize: 18, marginHorizontal: 4 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, gap: 16 },
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 20 },
  applyBtn: { marginHorizontal: 20, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function isOverdue(c) { return c.statut === 'en_cours' && c.dateEcheance && new Date(c.dateEcheance) < new Date(); }

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

// ─── PhoneInput avec sélecteur de pays ───────────────────────────────────────
function PhoneInput({ value, onChange, colors }) {
  const [showCountry, setShowCountry] = useState(false);
  const [country, setCountry]         = useState(PAYS[0]);
  const [local, setLocal]             = useState('');

  useEffect(() => {
    if (!local) { onChange(''); return; }
    const pattern = new RegExp(`^[0-9]{${country.digits}}$`);
    if (pattern.test(local)) onChange(`${country.code}${local}`);
    else onChange('__invalid__');
  }, [local, country]);

  useEffect(() => {
    if (!value || value === '__invalid__') return;
    const found = PAYS.find(p => value.startsWith(p.code));
    if (found) { setCountry(found); setLocal(value.slice(found.code.length)); }
  }, []);

  const isValid = new RegExp(`^[0-9]{${country.digits}}$`).test(local);
  const isEmpty = local === '';

  const borderColor = isEmpty ? colors.border : isValid ? EMERALD : DANGER;

  return (
    <View>
      <View style={[styles.phoneRow, { borderColor }]}>
        {/* Sélecteur pays */}
        <TouchableOpacity
          style={[styles.phoneFlag, { backgroundColor: colors.bgHover, borderRightColor: colors.border }]}
          onPress={() => setShowCountry(v => !v)}
        >
          <Text style={{ fontSize: 16 }}>{country.flag}</Text>
          <Text style={[styles.phoneFlagCode, { color: colors.textSub }]}>{country.code}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textDisabled} />
        </TouchableOpacity>

        {/* Champ */}
        <TextInput
          style={[styles.phoneInput, { color: colors.text }]}
          value={local}
          onChangeText={t => setLocal(t.replace(/\D/g, '').slice(0, country.digits))}
          placeholder={`${'X'.repeat(country.digits)} (${country.digits} chiffres)`}
          placeholderTextColor={colors.textDisabled}
          keyboardType="phone-pad"
        />

        {/* Indicateur */}
        {!isEmpty && (
          <Text style={[styles.phoneValid, { color: isValid ? EMERALD : DANGER }]}>
            {isValid ? '✓' : `${local.length}/${country.digits}`}
          </Text>
        )}
      </View>

      {/* Dropdown pays */}
      {showCountry && (
        <View style={[styles.countryDropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {PAYS.map(p => (
            <TouchableOpacity
              key={p.code}
              style={[
                styles.countryRow,
                p.code === country.code && { backgroundColor: PRIMARY + '12' },
                { borderBottomColor: colors.border },
              ]}
              onPress={() => { setCountry(p); setLocal(''); setShowCountry(false); }}
            >
              <Text style={{ fontSize: 16 }}>{p.flag}</Text>
              <Text style={[styles.countryName, { color: p.code === country.code ? PRIMARY : colors.text }]}>{p.nom}</Text>
              <Text style={[styles.countryCode, { color: colors.textDisabled }]}>{p.code}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!isEmpty && !isValid && (
        <Text style={styles.phoneError}>
          Numéro incomplet — {country.digits} chiffres requis pour {country.nom}
        </Text>
      )}
    </View>
  );
}

// ─── Badge statut ─────────────────────────────────────────────────────────────
function StatutBadge({ statut }) {
  const MAP = {
    en_cours:  { bg: '#FEF3C7', color: '#92400E', dot: AMBER,   label: 'En cours' },
    rembourse: { bg: '#D1FAE5', color: '#065F46', dot: EMERALD, label: 'Remboursé' },
    litige:    { bg: '#EDE9FE', color: '#5B21B6', dot: LITIGE,  label: 'Litige' },
  };
  const s = MAP[statut] || MAP.en_cours;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: s.dot }]} />
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ visible, onClose, title, colors, children }) {
  const anim = useRef(new Animated.Value(H)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 0 : H, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { backgroundColor: colors.bgCard, transform: [{ translateY: anim }] }]}>
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: colors.border }]} />
        </View>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity style={[styles.sheetClose, { backgroundColor: colors.bgHover }]} onPress={onClose}>
            <Ionicons name="close" size={16} color={colors.textSub} />
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {children}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ─── CreditCard ───────────────────────────────────────────────────────────────
function CreditCard({ credit, onPressEncaisser, onPressRappel, onPressEdit, onPressStatut, colors }) {
  const [showTranches, setShowTranches] = useState(false);
  const overdue = isOverdue(credit);
  const isPending = String(credit._id).startsWith('local_');
  const pct = credit.montantInitial > 0
    ? Math.min(100, Math.round(((credit.montantInitial - credit.montantDu) / credit.montantInitial) * 100))
    : 0;
  const tranches = (credit.paiements || []).filter(p => p.montant > 0);
  const lastRappel = credit.rappels?.length ? credit.rappels[credit.rappels.length - 1] : null;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.bgCard,
        borderColor: isPending ? AMBER + '80' : overdue ? AMBER + '60' : colors.border,
        borderStyle: isPending ? 'dashed' : 'solid',
      },
    ]}>
      {/* Badge en attente de sync */}
      {isPending && (
        <View style={[styles.pendingBadge, { backgroundColor: AMBER + '18' }]}>
          <Ionicons name="cloud-upload-outline" size={11} color={AMBER} />
          <Text style={[styles.pendingBadgeText, { color: AMBER }]}>En attente de synchronisation</Text>
        </View>
      )}
      {/* Header */}
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.cardNameRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{credit.clientNom}</Text>
            <StatutBadge statut={credit.statut} />
            <TouchableOpacity onPress={onPressEdit} style={styles.editIconBtn}>
              <Ionicons name="pencil-outline" size={13} color={colors.textDisabled} />
            </TouchableOpacity>
          </View>
          {credit.produitLabel
            ? <Text style={[styles.cardProduct, { color: colors.textDisabled }]} numberOfLines={1}>{credit.produitLabel}</Text>
            : null}
          {credit.clientTel
            ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${credit.clientTel}`)}
                style={styles.cardTelRow}
              >
                <Ionicons name="call-outline" size={11} color={PRIMARY} />
                <Text style={[styles.cardTel, { color: PRIMARY }]}>{credit.clientTel}</Text>
              </TouchableOpacity>
            ) : null}
        </View>

        {/* Montant + menu statut */}
        <View style={styles.cardAmountWrap}>
          <Text style={[styles.cardAmountLabel, { color: colors.textDisabled }]}>Restant dû</Text>
          <Text style={[
            styles.cardAmount,
            {
              color: credit.statut === 'rembourse' ? EMERALD
                : credit.statut === 'litige' ? DANGER
                : overdue ? AMBER
                : colors.text,
            },
          ]}>
            {fmt(credit.montantDu)} F
          </Text>
          <Text style={[styles.cardAmountTotal, { color: colors.textDisabled }]}>/ {fmt(credit.montantInitial)} F</Text>

          {/* Bouton actions statut */}
          <TouchableOpacity
            style={[styles.statutDotBtn, { backgroundColor: colors.bgHover }]}
            onPress={() => onPressStatut(credit)}
          >
            <Ionicons name="ellipsis-vertical" size={14} color={colors.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Barre de progression */}
      {credit.statut !== 'rembourse' && pct > 0 && (
        <View style={{ marginVertical: 8, gap: 3 }}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: colors.textDisabled }]}>Remboursé</Text>
            <Text style={[styles.progressPct, { color: EMERALD }]}>{pct}%</Text>
          </View>
          <View style={[styles.progressBg, { backgroundColor: colors.bgHover }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: EMERALD }]} />
          </View>
        </View>
      )}

      {/* Échéance */}
      {credit.dateEcheance && (
        <View style={styles.echeanceRow}>
          <Ionicons name={overdue ? 'warning-outline' : 'time-outline'} size={12} color={overdue ? AMBER : colors.textDisabled} />
          <Text style={[styles.echeanceText, { color: overdue ? AMBER : colors.textDisabled }]}>
            Échéance : {fmtDate(credit.dateEcheance)}{overdue ? ' — En retard' : ''}
          </Text>
        </View>
      )}

      {/* Actions (statut en cours seulement) */}
      {credit.statut === 'en_cours' && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.encaisserBtn} onPress={() => onPressEncaisser(credit)} activeOpacity={0.85}>
            <Ionicons name="cash-outline" size={14} color="#fff" />
            <Text style={styles.encaisserBtnText}>Encaisser</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.rappelBtn, { backgroundColor: colors.bgHover }]} onPress={() => onPressRappel(credit)} activeOpacity={0.85}>
            <Ionicons name="send-outline" size={13} color={colors.textSub} />
            <Text style={[styles.rappelBtnText, { color: colors.textSub }]}>Rappel</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textDisabled} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tranches */}
      {tranches.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <TouchableOpacity
            style={styles.trancheToggle}
            onPress={() => setShowTranches(v => !v)}
          >
            <Text style={[styles.trancheToggleText, { color: colors.textDisabled }]}>
              {tranches.length} tranche{tranches.length > 1 ? 's' : ''} payée{tranches.length > 1 ? 's' : ''}
            </Text>
            <Ionicons name={showTranches ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textDisabled} />
          </TouchableOpacity>
          {showTranches && (
            <View style={{ marginTop: 4, gap: 4 }}>
              {tranches.map((p, i) => (
                <View key={i} style={[styles.trancheRow, { backgroundColor: colors.bgHover }]}>
                  <Text style={[styles.trancheDate, { color: colors.textDisabled }]}>
                    {p.date ? fmtDateShort(p.date) : `Tranche ${i + 1}`}
                  </Text>
                  {p.note ? <Text style={[styles.trancheNote, { color: colors.textDisabled }]} numberOfLines={1}>{p.note}</Text> : null}
                  <Text style={[styles.trancheMontant, { color: EMERALD }]}>+{fmt(p.montant)} F</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Dernier rappel */}
      {lastRappel && (
        <Text style={[styles.lastRappel, { color: colors.textDisabled }]}>
          {credit.rappels.length} rappel(s) — dernier : {lastRappel.canal === 'sms' ? 'SMS' : lastRappel.canal === 'whatsapp' ? 'WhatsApp' : 'Manuel'} le {fmtDateShort(lastRappel.date)}
        </Text>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CarnetCreancesScreen() {
  const { colors } = useTheme();
  const creances = useSyncStore(s => s.creances) || [];
  const { toast, notify } = useToast();
  const { triggerSync, isSyncing, isOffline } = useSync();
  const prevOfflineRef = useRef(isOffline);
  const [filtreStatut, setFiltreStatut] = useState('en_cours');

  // ── Sheets ────────────────────────────────────────────────────────────────
  // "create" | "edit" | "encaisser" | "rappel" | "statut"
  const [sheet, setSheet]     = useState(null);
  const [selected, setSelected] = useState(null);

  // Formulaire crédit
  const [fNom, setFNom]         = useState('');
  const [fTel, setFTel]         = useState('');
  const [fMontant, setFMontant] = useState('');
  const [fDejaPaye, setFDejaPaye] = useState('');
  const [fProduit, setFProduit] = useState('');
  const [fNote, setFNote]       = useState('');
  const [fEcheance, setFEcheance] = useState('');

  // Formulaire encaissement
  const [eMontant, setEMontant] = useState('');
  const [eNote, setENote]       = useState('');

  // Sélecteurs de date
  const [showDatePicker, setShowDatePicker]     = useState(false);
  const [datepickerTarget, setDatepickerTarget] = useState(null); // 'echeance'

  const [saving, setSaving] = useState(false);

  // ── Fetch initial si le store est vide ────────────────────────────────────
  useEffect(() => {
    if (creances.length === 0) {
      syncService.invalidateAndFetch('creances').catch(() => {});
    }
  }, []); // eslint-disable-line

  // ── Retour online → resync automatique ────────────────────────────────────
  useEffect(() => {
    const wasOffline = prevOfflineRef.current;
    if (!isOffline && wasOffline) {
      syncService.invalidateAndFetch('creances').catch(() => {});
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline]);

  const localStats = useMemo(() => ({
    totalDu:   creances.filter(c => c.statut === 'en_cours').reduce((s, c) => s + (c.montantDu || 0), 0),
    enCours:   creances.filter(c => c.statut === 'en_cours').length,
    rembourse: creances.filter(c => c.statut === 'rembourse').length,
    litige:    creances.filter(c => c.statut === 'litige').length,
  }), [creances]);

  // ── Filtrés ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return creances
      .filter(c => !filtreStatut || c.statut === filtreStatut)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [creances, filtreStatut]);

  // ── Refresh — identique Dashboard : triggerSync + invalidate ciblé ────────
  const onRefresh = useCallback(() => {
    triggerSync();
    syncService.invalidateAndFetch('creances').catch(() => {});
  }, [triggerSync]);

  // ── Helpers form ──────────────────────────────────────────────────────────
  const telInvalid = fTel === '__invalid__';
  const montantNum = Number(fMontant) || 0;
  const dejaPayeNum = Math.min(Number(fDejaPaye) || 0, montantNum);
  const restantDu = Math.max(0, montantNum - dejaPayeNum);

  function resetForm() {
    setFNom(''); setFTel(''); setFMontant(''); setFDejaPaye('');
    setFProduit(''); setFNote(''); setFEcheance('');
    setEMontant(''); setENote('');
  }

  function openCreate() {
    resetForm(); setSelected(null); setSheet('create');
  }

  function openEdit(c) {
    setSelected(c);
    setFNom(c.clientNom || '');
    setFTel(c.clientTel || '');
    setFMontant(String(c.montantInitial || ''));
    setFDejaPaye('');
    setFProduit(c.produitLabel || '');
    setFNote(c.note || '');
    setFEcheance(c.dateEcheance ? new Date(c.dateEcheance).toISOString().split('T')[0] : '');
    setEMontant(''); setENote('');
    setSheet('edit');
  }

  function closeSheet() { setSheet(null); setTimeout(() => { setSelected(null); resetForm(); }, 350); }

  function queueAndFlush(type, payload) {
    syncService.queueMutation(type, payload);
    if (!isOffline) syncService.pushPendingMutations().catch(() => {});
  }

  function optimisticUpdate(updater) {
    const current = useSyncStore.getState().creances || [];
    useSyncStore.getState().setStoreData('creances', updater(current));
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!fNom.trim()) { notify('Nom du client obligatoire', 'error'); return; }
    if (!fMontant || montantNum <= 0) { notify('Montant invalide', 'error'); return; }
    if (telInvalid) { notify('Numéro de téléphone incomplet', 'error'); return; }

    setSaving(true);
    // payload envoyé au backend — sans _id (le serveur génère son ObjectId)
    const payload = {
      clientNom: fNom.trim(),
      clientTel: fTel && fTel !== '__invalid__' ? fTel : '',
      montantInitial: montantNum,
      montantDu: restantDu,
      produitLabel: fProduit.trim(),
      note: fNote.trim(),
      dateEcheance: fEcheance || undefined,
    };

    const tempId = `local_${Date.now()}`;
    const localEntry = {
      _id: tempId,
      ...payload,
      statut: 'en_cours',
      paiements: dejaPayeNum > 0
        ? [{ montant: dejaPayeNum, note: 'Acompte à la création', date: new Date().toISOString() }]
        : [],
      rappels: [],
      createdAt: new Date().toISOString(),
      _pendingSync: true,
    };

    // Optimiste store mémoire
    optimisticUpdate(list => [localEntry, ...list]);

    // Persistance SQLite — survit à un redémarrage offline
    upsertMany('creances', [localEntry], () => tempId).catch(() => {});

    // Queue mutation (payload propre sans _id ni _pendingSync)
    queueAndFlush('CREATE_CREANCE', payload);
    notify('Crédit enregistré' + (!isOffline ? ' ✓' : ' (sera sync en ligne)'));
    closeSheet();
    setSaving(false);
  }

  // ── EDIT ───────────────────────────────────────────────────────────────────
  async function handleEdit() {
    if (!selected) return;
    if (!fNom.trim()) { notify('Nom obligatoire', 'error'); return; }
    if (telInvalid) { notify('Numéro de téléphone incomplet', 'error'); return; }

    const isLocal = String(selected._id).startsWith('local_');

    setSaving(true);
    const updated = {
      clientNom: fNom.trim(),
      clientTel: fTel && fTel !== '__invalid__' ? fTel : '',
      montantInitial: montantNum || selected.montantInitial,
      produitLabel: fProduit.trim(),
      note: fNote.trim(),
      dateEcheance: fEcheance || undefined,
    };

    // Mise à jour optimiste store + SQLite
    optimisticUpdate(list => list.map(c => c._id === selected._id ? { ...c, ...updated } : c));
    upsertMany('creances', [{ ...selected, ...updated }], c => String(c._id)).catch(() => {});

    if (!isLocal) {
      // Seulement si l'ID est réel — sinon le backend ne connaît pas encore cette créance
      queueAndFlush('UPDATE_CREANCE', { creanceId: selected._id, ...updated });
    }
    notify('Crédit mis à jour' + (!isOffline ? ' ✓' : ' (offline)'));
    closeSheet();
    setSaving(false);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!selected) return;
    const isLocal = String(selected._id).startsWith('local_');
    Alert.alert(
      'Supprimer le crédit',
      `Supprimer le crédit de "${selected.clientNom}" ? Action irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            // Suppression optimiste store + SQLite
            optimisticUpdate(list => list.filter(c => c._id !== selected._id));
            getDB().runAsync(`DELETE FROM creances WHERE id = ?`, [selected._id]).catch(() => {});
            if (!isLocal) {
              // Si local, on supprime juste la mutation CREATE en queue aussi
              queueAndFlush('DELETE_CREANCE', { creanceId: selected._id });
            }
            notify('Crédit supprimé' + (isOffline ? ' (offline)' : ''));
            closeSheet();
          },
        },
      ]
    );
  }

  // ── ENCAISSER ──────────────────────────────────────────────────────────────
  async function handleEncaisser() {
    if (!selected) return;
    const isLocal = String(selected._id).startsWith('local_');
    if (isLocal) {
      notify('Synchronisez d\'abord ce crédit pour encaisser', 'error');
      return;
    }
    const montant = Number(eMontant) || 0;
    if (montant <= 0) { notify('Montant invalide', 'error'); return; }
    if (montant > selected.montantDu) { notify(`Maximum : ${fmt(selected.montantDu)} F`, 'error'); return; }

    setSaving(true);
    const newDu = Math.max(0, selected.montantDu - montant);
    const newStatut = newDu === 0 ? 'rembourse' : selected.statut;
    const newEntry = {
      ...selected,
      montantDu: newDu,
      statut: newStatut,
      paiements: [...(selected.paiements || []), { montant, note: eNote, date: new Date().toISOString() }],
    };

    optimisticUpdate(list => list.map(c => c._id === selected._id ? newEntry : c));
    upsertMany('creances', [newEntry], c => String(c._id)).catch(() => {});
    queueAndFlush('ADD_PAIEMENT_CREANCE', { creanceId: selected._id, montant, note: eNote });
    notify(`Paiement de ${fmt(montant)} F enregistré` + (!isOffline ? ' ✓' : ' (offline)'));
    closeSheet();
    setSaving(false);
  }

  // ── RAPPEL ─────────────────────────────────────────────────────────────────
  function handleRappel(canal) {
    if (!selected) return;
    closeSheet();

    // Mise à jour optimiste du compteur de rappels
    const newEntry = {
      ...selected,
      rappels: [...(selected.rappels || []), { canal, date: new Date().toISOString() }],
    };
    optimisticUpdate(list => list.map(c => c._id === selected._id ? newEntry : c));
    upsertMany('creances', [newEntry], c => String(c._id)).catch(() => {});

    // Enregistrement backend seulement si l'ID est réel (offline-safe via queue)
    const isLocal = String(selected._id).startsWith('local_');
    if (!isLocal) {
      queueAndFlush('SEND_RAPPEL_CREANCE', { creanceId: selected._id, canal });
    }

    if (canal === 'whatsapp' && selected.clientTel) {
      const msg = encodeURIComponent(
        `Bonjour ${selected.clientNom}, vous avez un crédit de ${fmt(selected.montantDu)} ₣ en cours. Merci de vous en acquitter.`
      );
      const num = selected.clientTel.replace(/\D/g, '');
      Linking.openURL(`https://wa.me/${num}?text=${msg}`).catch(() => {});
      notify('Rappel WhatsApp envoyé ✓');
      return;
    }
    if (canal === 'appel' && selected.clientTel) {
      Linking.openURL(`tel:${selected.clientTel}`).catch(() => {});
      notify('Appel lancé ✓');
      return;
    }
    if (canal === 'sms' && selected.clientTel) {
      Linking.openURL(`sms:${selected.clientTel}`).catch(() => {});
      notify('SMS ouvert ✓');
      return;
    }
    notify('Rappel enregistré ✓');
  }

  // ── STATUT ─────────────────────────────────────────────────────────────────
  function handleStatut(statut) {
    if (!selected) return;
    const isLocal = String(selected._id).startsWith('local_');
    const newEntry = { ...selected, statut };
    optimisticUpdate(list => list.map(c => c._id === selected._id ? newEntry : c));
    upsertMany('creances', [newEntry], c => String(c._id)).catch(() => {});
    if (!isLocal) {
      queueAndFlush('CHANGE_STATUT_CREANCE', { creanceId: selected._id, statut });
    }
    notify('Statut mis à jour' + (!isOffline ? ' ✓' : ' (offline)'));
    closeSheet();
  }

  // ── Render forms ──────────────────────────────────────────────────────────
  const encMontant = Number(eMontant) || 0;
  const encRestant = selected ? Math.max(0, selected.montantDu - Math.min(encMontant, selected.montantDu)) : 0;
  const encSolde = selected && encMontant >= selected.montantDu;
  const tranches = selected ? (selected.paiements || []).filter(p => p.montant > 0) : [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineBannerText}>Mode hors ligne — actions en attente de sync</Text>
        </View>
      )}

      {/* ── Header sticky ── */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.bgCard + 'F5', borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Carnet de Créances</Text>
            <Text style={[styles.screenSub, { color: colors.textDisabled }]}>Gérez les dettes de vos clients</Text>
          </View>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: PRIMARY }]} onPress={openCreate} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnText}>Nouveau</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: AMBER }]}>{fmt(localStats.totalDu)} F</Text>
            <Text style={[styles.statLabel, { color: colors.textDisabled }]}>Total dû</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: AMBER }]}>{localStats.enCours}</Text>
            <Text style={[styles.statLabel, { color: colors.textDisabled }]}>En cours</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: EMERALD }]}>{localStats.rembourse}</Text>
            <Text style={[styles.statLabel, { color: colors.textDisabled }]}>Remboursés</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: DANGER }]}>{localStats.litige}</Text>
            <Text style={[styles.statLabel, { color: colors.textDisabled }]}>Litiges</Text>
          </View>
        </ScrollView>

        {/* Filtres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {STATUT_FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.chip,
                filtreStatut === f.value
                  ? { backgroundColor: PRIMARY }
                  : { backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setFiltreStatut(f.value)}
            >
              <Text style={[styles.chipText, { color: filtreStatut === f.value ? '#fff' : colors.textSub }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Liste ── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item._id}
        contentContainerStyle={[styles.listContent, filtered.length === 0 && { flex: 1 }]}
        renderItem={({ item }) => (
          <CreditCard
            credit={item}
            onPressEncaisser={c => { setSelected(c); setSheet('encaisser'); }}
            onPressRappel={c => { setSelected(c); setSheet('rappel'); }}
            onPressEdit={c => openEdit(c)}
            onPressStatut={c => { setSelected(c); setSheet('statut'); }}
            colors={colors}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: PRIMARY + '15' }]}>
              <Ionicons name="book-outline" size={28} color={PRIMARY} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {filtreStatut === 'en_cours' ? 'Aucun crédit en cours' : 'Aucune entrée pour ce filtre'}
            </Text>
            {filtreStatut === 'en_cours' && (
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: PRIMARY }]} onPress={openCreate}>
                <Text style={styles.emptyBtnText}>Enregistrer un crédit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={isSyncing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* ── Sheet Créer ── */}
      <BottomSheet visible={sheet === 'create'} onClose={closeSheet} title="Nouveau crédit" colors={colors}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>NOM DU CLIENT <Text style={{ color: DANGER }}>*</Text></Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fNom} onChangeText={setFNom} placeholder="Ex: Mamadou Issaka" placeholderTextColor={colors.textDisabled} />
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSub }]}>TÉLÉPHONE</Text>
            <PhoneInput value={fTel} onChange={setFTel} colors={colors} />
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>MONTANT TOTAL (F CFA) <Text style={{ color: DANGER }}>*</Text></Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fMontant} onChangeText={setFMontant} placeholder="5000" placeholderTextColor={colors.textDisabled} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>DÉJÀ REÇU (optionnel)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fDejaPaye} onChangeText={setFDejaPaye} placeholder="0" placeholderTextColor={colors.textDisabled} keyboardType="numeric" />
            </View>
          </View>
          {montantNum > 0 && (
            <View style={[styles.restantWrap, { backgroundColor: AMBER + '12', borderColor: AMBER + '30' }]}>
              <Text style={[styles.restantLabel, { color: colors.textDisabled }]}>Restant dû</Text>
              <Text style={[styles.restantValue, { color: AMBER }]}>{restantDu.toLocaleString('fr-FR')} F</Text>
            </View>
          )}
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>PRODUIT / MOTIF</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fProduit} onChangeText={setFProduit} placeholder="Ex: Riz 25kg" placeholderTextColor={colors.textDisabled} />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>DATE D'ÉCHÉANCE</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
                onPress={() => { setDatepickerTarget('echeance'); setShowDatePicker(true); }}
              >
                <Ionicons name="calendar-outline" size={15} color={fEcheance ? PRIMARY : colors.textDisabled} />
                <Text style={{ color: fEcheance ? colors.text : colors.textDisabled, fontSize: 14, flex: 1 }}>
                  {fEcheance ? new Date(fEcheance + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choisir une date'}
                </Text>
                {fEcheance ? <TouchableOpacity onPress={() => setFEcheance('')}><Ionicons name="close-circle" size={15} color={colors.textDisabled} /></TouchableOpacity> : null}
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>NOTE</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fNote} onChangeText={setFNote} placeholder="Note interne..." placeholderTextColor={colors.textDisabled} />
            </View>
          </View>
        </ScrollView>
        <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.bgCard }]}>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
            <Text style={styles.saveBtnText}>Enregistrer le crédit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={closeSheet}>
            <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Sheet Éditer ── */}
      <BottomSheet visible={sheet === 'edit'} onClose={closeSheet} title="Modifier le crédit" colors={colors}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSub }]}>NOM DU CLIENT <Text style={{ color: DANGER }}>*</Text></Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fNom} onChangeText={setFNom} placeholderTextColor={colors.textDisabled} />
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSub }]}>TÉLÉPHONE</Text>
            <PhoneInput value={fTel} onChange={setFTel} colors={colors} />
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSub }]}>MONTANT INITIAL (F CFA)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fMontant} onChangeText={setFMontant} keyboardType="numeric" placeholderTextColor={colors.textDisabled} />
            {selected && selected.montantInitial !== montantNum && montantNum > 0 && (
              <Text style={[styles.warnText, { color: AMBER }]}>Le restant dû sera recalculé</Text>
            )}
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>PRODUIT / MOTIF</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fProduit} onChangeText={setFProduit} placeholderTextColor={colors.textDisabled} />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>DATE D'ÉCHÉANCE</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
                onPress={() => { setDatepickerTarget('echeance'); setShowDatePicker(true); }}
              >
                <Ionicons name="calendar-outline" size={15} color={fEcheance ? PRIMARY : colors.textDisabled} />
                <Text style={{ color: fEcheance ? colors.text : colors.textDisabled, fontSize: 14, flex: 1 }}>
                  {fEcheance ? new Date(fEcheance + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choisir une date'}
                </Text>
                {fEcheance ? <TouchableOpacity onPress={() => setFEcheance('')}><Ionicons name="close-circle" size={15} color={colors.textDisabled} /></TouchableOpacity> : null}
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>NOTE</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]} value={fNote} onChangeText={setFNote} placeholderTextColor={colors.textDisabled} />
            </View>
          </View>
        </ScrollView>
        <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.bgCard }]}>
          <View style={styles.detailFooterRow}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleEdit} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
              <Text style={styles.saveBtnText}>Sauvegarder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, { borderColor: '#FECACA' }]} onPress={handleDelete} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={16} color={DANGER} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={closeSheet}>
            <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Sheet Encaisser ── */}
      <BottomSheet visible={sheet === 'encaisser'} onClose={closeSheet} title="Encaisser un paiement" colors={colors}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {selected && (
            <>
              {/* Résumé */}
              <View style={[styles.encSummary, { backgroundColor: AMBER + '12', borderColor: AMBER + '30' }]}>
                <Text style={[styles.encSummaryLabel, { color: colors.textDisabled }]}>Client : <Text style={[styles.encSummaryValue, { color: colors.text }]}>{selected.clientNom}</Text></Text>
                <View style={styles.encSummaryRow}>
                  <Text style={[styles.encSummaryLabel, { color: colors.textDisabled }]}>Restant dû</Text>
                  <Text style={[styles.encSummaryBig, { color: AMBER }]}>{fmt(selected.montantDu)} F</Text>
                </View>
                <View style={styles.encSummaryRow}>
                  <Text style={[styles.encSummaryLabel, { color: colors.textDisabled }]}>Montant initial</Text>
                  <Text style={[styles.encSummaryLabel, { color: colors.textDisabled }]}>{fmt(selected.montantInitial)} F</Text>
                </View>
              </View>

              {/* Historique tranches */}
              {tranches.length > 0 && (
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSub }]}>TRANCHES PRÉCÉDENTES ({tranches.length})</Text>
                  <View style={{ gap: 4, maxHeight: 120 }}>
                    {tranches.map((p, i) => (
                      <View key={i} style={[styles.trancheRow, { backgroundColor: colors.bgHover }]}>
                        <Text style={[styles.trancheDate, { color: colors.textDisabled }]}>{p.date ? fmtDateShort(p.date) : `Tranche ${i + 1}`}</Text>
                        {p.note ? <Text style={[styles.trancheNote, { color: colors.textDisabled }]} numberOfLines={1}>{p.note}</Text> : null}
                        <Text style={[styles.trancheMontant, { color: EMERALD }]}>+{fmt(p.montant)} F</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Champ montant */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textSub }]}>MONTANT ENCAISSÉ (F CFA)</Text>
                <View style={styles.encRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]}
                    value={eMontant} onChangeText={setEMontant}
                    placeholder={`Max ${fmt(selected.montantDu)}`}
                    placeholderTextColor={colors.textDisabled}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={[styles.toutBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
                    onPress={() => setEMontant(String(selected.montantDu))}
                  >
                    <Text style={[styles.toutBtnText, { color: colors.textSub }]}>Tout régler</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Aperçu après paiement */}
              {encMontant > 0 && (
                <View style={[styles.encPreview, { backgroundColor: encSolde ? EMERALD + '12' : '#3B82F612', borderColor: encSolde ? EMERALD + '40' : '#3B82F640' }]}>
                  <Text style={[styles.encPreviewLabel, { color: encSolde ? EMERALD : '#3B82F6' }]}>
                    {encSolde ? '✓ Solde entièrement remboursé' : 'Restant après ce paiement'}
                  </Text>
                  {!encSolde && <Text style={[styles.encPreviewValue, { color: '#3B82F6' }]}>{fmt(encRestant)} F</Text>}
                </View>
              )}

              {/* Note */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textSub }]}>NOTE (optionnelle)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]}
                  value={eNote} onChangeText={setENote}
                  placeholder="Ex: espèces, mobile money, tranche 2..."
                  placeholderTextColor={colors.textDisabled}
                />
              </View>
            </>
          )}
        </ScrollView>
        <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.bgCard }]}>
          <TouchableOpacity
            style={[encSolde ? styles.saveBtnEmerald : styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleEncaisser} disabled={saving} activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cash-outline" size={16} color="#fff" />}
            <Text style={styles.saveBtnText}>
              {encSolde ? 'Clôturer le crédit' : 'Confirmer la tranche'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={closeSheet}>
            <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Sheet Rappel ── */}
      <BottomSheet visible={sheet === 'rappel'} onClose={closeSheet} title="Envoyer un rappel" colors={colors}>
        <View style={styles.formContent}>
          <Text style={[styles.rappelIntro, { color: colors.textSub }]}>
            Choisissez comment contacter {selected?.clientNom}
          </Text>
          {selected?.clientTel && (
            <>
              <TouchableOpacity style={[styles.rappelOption, { backgroundColor: '#22C55E12', borderColor: '#22C55E30' }]} onPress={() => handleRappel('whatsapp')}>
                <Text style={{ fontSize: 22 }}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rappelOptionTitle, { color: colors.text }]}>WhatsApp</Text>
                  <Text style={[styles.rappelOptionSub, { color: colors.textDisabled }]}>{selected.clientTel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rappelOption, { backgroundColor: '#3B82F612', borderColor: '#3B82F630' }]} onPress={() => handleRappel('sms')}>
                <Text style={{ fontSize: 22 }}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rappelOptionTitle, { color: colors.text }]}>SMS</Text>
                  <Text style={[styles.rappelOptionSub, { color: colors.textDisabled }]}>{selected.clientTel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rappelOption, { backgroundColor: PRIMARY + '12', borderColor: PRIMARY + '30' }]} onPress={() => handleRappel('appel')}>
                <Text style={{ fontSize: 22 }}>📞</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rappelOptionTitle, { color: colors.text }]}>Appel téléphonique</Text>
                  <Text style={[styles.rappelOptionSub, { color: colors.textDisabled }]}>{selected.clientTel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={[styles.rappelOption, { backgroundColor: colors.bgHover, borderColor: colors.border }]} onPress={() => handleRappel('manuel')}>
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.textSub} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rappelOptionTitle, { color: colors.text }]}>Noté manuellement</Text>
              <Text style={[styles.rappelOptionSub, { color: colors.textDisabled }]}>Marquer comme rappel effectué</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Sheet Statut ── */}
      <BottomSheet visible={sheet === 'statut'} onClose={closeSheet} title="Changer le statut" colors={colors}>
        <View style={styles.formContent}>
          {[
            { key: 'en_cours',  label: 'En cours',       icon: 'time-outline',             color: AMBER,   desc: 'Crédit actif, non soldé' },
            { key: 'rembourse', label: 'Marquer remboursé', icon: 'checkmark-circle-outline', color: EMERALD, desc: 'Crédit entièrement soldé' },
            { key: 'litige',    label: 'Marquer en litige', icon: 'shield-outline',           color: DANGER,  desc: 'Problème ou contentieux' },
          ].filter(a => a.key !== selected?.statut).map(a => (
            <TouchableOpacity
              key={a.key}
              style={[styles.statutOption, { backgroundColor: a.color + '10', borderColor: a.color + '30' }]}
              onPress={() => handleStatut(a.key)}
              activeOpacity={0.85}
            >
              <View style={[styles.statutOptionIcon, { backgroundColor: a.color + '18' }]}>
                <Ionicons name={a.icon} size={20} color={a.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statutOptionTitle, { color: colors.text }]}>{a.label}</Text>
                <Text style={[styles.statutOptionSub, { color: colors.textDisabled }]}>{a.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
            </TouchableOpacity>
          ))}
          {/* Supprimer */}
          <TouchableOpacity
            style={[styles.statutOption, { backgroundColor: DANGER + '08', borderColor: DANGER + '20', marginTop: 8 }]}
            onPress={() => { closeSheet(); setTimeout(() => { setSelected(selected); setSheet('edit'); }, 400); }}
          >
            <View style={[styles.statutOptionIcon, { backgroundColor: DANGER + '12' }]}>
              <Ionicons name="trash-outline" size={20} color={DANGER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statutOptionTitle, { color: DANGER }]}>Supprimer</Text>
              <Text style={[styles.statutOptionSub, { color: colors.textDisabled }]}>Action irréversible</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Sélecteur de date ── */}
      <DatePickerModal
        visible={showDatePicker}
        value={fEcheance}
        label="Date d'échéance"
        onConfirm={date => { setFEcheance(date); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        colors={colors}
      />

      <Toast msg={toast.msg} visible={toast.visible} type={toast.type} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: AMBER, paddingVertical: 7, paddingHorizontal: 16,
  },
  offlineBannerText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Header
  stickyHeader: { borderBottomWidth: 1, paddingTop: 12, paddingBottom: 8, gap: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  screenTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  screenSub:   { fontSize: 12, fontWeight: '500', marginTop: 1 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, elevation: 4,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  statCard: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Filters
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 2 },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText:  { fontSize: 12, fontWeight: '700' },

  // List
  listContent: { padding: 16, paddingTop: 12 },

  // Card
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 4 },
  pendingBadgeText: { fontSize: 11, fontWeight: '700' },
  cardHead: { flexDirection: 'row', gap: 10 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName: { fontSize: 15, fontWeight: '800', flex: 1 },
  editIconBtn: { padding: 4 },
  cardProduct: { fontSize: 11 },
  cardTelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTel: { fontSize: 12, fontWeight: '600' },
  cardAmountWrap: { alignItems: 'flex-end', gap: 2 },
  cardAmountLabel: { fontSize: 10 },
  cardAmount: { fontSize: 20, fontWeight: '900' },
  cardAmountTotal: { fontSize: 10 },
  statutDotBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 4 },

  // Progress
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11 },
  progressPct:   { fontSize: 11, fontWeight: '700' },
  progressBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Échéance
  echeanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  echeanceText: { fontSize: 11, fontWeight: '600' },

  // Card actions
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  encaisserBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: EMERALD, borderRadius: 10, paddingVertical: 9,
  },
  encaisserBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  rappelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14,
  },
  rappelBtnText: { fontSize: 13, fontWeight: '600' },

  // Tranches
  trancheToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  trancheToggleText: { fontSize: 11 },
  trancheRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  trancheDate: { fontSize: 11 },
  trancheNote: { flex: 1, fontSize: 11, fontStyle: 'italic' },
  trancheMontant: { fontSize: 12, fontWeight: '700' },

  lastRappel: { fontSize: 10, marginTop: 4 },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { width: 60, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyBtn:   { marginTop: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, elevation: 20,
  },
  sheetHandle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  sheetHandleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetClose: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sheetFooter: { paddingHorizontal: 20, paddingVertical: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 16, borderTopWidth: 1, gap: 8 },

  // Form
  formContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, color: '#6B7280' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warnText: { fontSize: 11, marginTop: 4 },

  // Restant dû preview
  restantWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  restantLabel: { fontSize: 12 },
  restantValue: { fontSize: 16, fontWeight: '900' },

  // Encaisser
  encSummary: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  encSummaryLabel: { fontSize: 12 },
  encSummaryValue: { fontWeight: '700' },
  encSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  encSummaryBig: { fontSize: 22, fontWeight: '900' },
  encRow: { flexDirection: 'row', gap: 8 },
  toutBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  toutBtnText: { fontSize: 12, fontWeight: '600' },
  encPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  encPreviewLabel: { fontSize: 12, fontWeight: '600' },
  encPreviewValue: { fontSize: 14, fontWeight: '800' },

  // Rappel
  rappelIntro: { fontSize: 13, marginBottom: 4 },
  rappelOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  rappelOptionTitle: { fontSize: 14, fontWeight: '700' },
  rappelOptionSub:   { fontSize: 12 },

  // Statut options
  statutOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  statutOptionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statutOptionTitle: { fontSize: 14, fontWeight: '700' },
  statutOptionSub:   { fontSize: 12 },

  // Phone input
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' },
  phoneFlag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 10, borderRightWidth: 1 },
  phoneFlagCode: { fontSize: 13, fontWeight: '600' },
  phoneInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  phoneValid: { paddingHorizontal: 8, fontSize: 12, fontWeight: '700' },
  phoneError: { fontSize: 11, color: DANGER, marginTop: 4 },
  countryDropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
    borderWidth: 1, borderRadius: 14, maxHeight: 220, overflow: 'scroll',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, elevation: 8,
  },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  countryName: { flex: 1, fontSize: 13, fontWeight: '600' },
  countryCode: { fontSize: 12 },

  // Buttons
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, elevation: 4,
  },
  saveBtnEmerald: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: EMERALD, borderRadius: 14, paddingVertical: 14,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 13, fontWeight: '700' },
  detailFooterRow: { flexDirection: 'row', gap: 8 },
  deleteBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  // Toast
  toast: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 8,
  },
  toastSuccess: { backgroundColor: '#111827' },
  toastError:   { backgroundColor: DANGER },
  toastText:    { fontSize: 13, fontWeight: '700', color: '#fff' },
});
