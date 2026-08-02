/**
 * AgentLoginScreen — Connexion espace caissier
 *
 * Design identique à LoginScreen :
 *   - Fond dégradé vert foncé + bulles décoratives
 *   - Card blanche avec ombre
 *   - Champs animés avec picker indicatif
 *   - CTA dégradé PRIMARY → SECONDARY
 *   - Étape 2 : clavier PIN intégré dans la card
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Modal, Animated, FlatList, TouchableWithoutFeedback,
  Dimensions, StatusBar, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAgentStore } from '../stores/agentStore';

const { width: W, height: H } = Dimensions.get('window');

const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DARK      = '#0F172A';
const MUTED     = '#64748B';
const BORDER    = '#E2E8F0';
const WHITE     = '#FFFFFF';
const BG        = '#F8FAFC';

// ─── Pays téléphone ───────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: 'NE', name: 'Niger',         dial: '+227', flag: '🇳🇪', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BJ', name: 'Bénin',         dial: '+229', flag: '🇧🇯', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BF', name: 'Burkina Faso',  dial: '+226', flag: '🇧🇫', format: 'XX XX XX XX',    digits: 8 },
  { code: 'ML', name: 'Mali',          dial: '+223', flag: '🇲🇱', format: 'XX XX XX XX',    digits: 8 },
  { code: 'SN', name: 'Sénégal',       dial: '+221', flag: '🇸🇳', format: 'XX XXX XX XX',   digits: 9 },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: '🇨🇮', format: 'XX XX XX XX XX', digits: 10 },
  { code: 'TG', name: 'Togo',          dial: '+228', flag: '🇹🇬', format: 'XX XX XX XX',    digits: 8 },
  { code: 'GN', name: 'Guinée',        dial: '+224', flag: '🇬🇳', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'CM', name: 'Cameroun',      dial: '+237', flag: '🇨🇲', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'MR', name: 'Mauritanie',    dial: '+222', flag: '🇲🇷', format: 'XX XX XX XX',    digits: 8 },
  { code: 'GH', name: 'Ghana',         dial: '+233', flag: '🇬🇭', format: 'XX XXX XXXX',    digits: 9 },
  { code: 'NG', name: 'Nigeria',       dial: '+234', flag: '🇳🇬', format: 'XXX XXX XXXX',   digits: 10 },
  { code: 'FR', name: 'France',        dial: '+33',  flag: '🇫🇷', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'MA', name: 'Maroc',         dial: '+212', flag: '🇲🇦', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'DZ', name: 'Algérie',       dial: '+213', flag: '🇩🇿', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'US', name: 'États-Unis',    dial: '+1',   flag: '🇺🇸', format: 'XXX XXX XXXX',   digits: 10 },
];

const formatPhone = (raw, pattern) => {
  const digits = raw.replace(/\D/g, '');
  let res = '', di = 0;
  for (let i = 0; i < pattern.length && di < digits.length; i++) {
    if (pattern[i] === 'X') res += digits[di++];
    else if (di > 0) res += pattern[i];
  }
  return res;
};
const strip = (s) => s.replace(/\D/g, '');

// ─── Picker indicatif ─────────────────────────────────────────────────────────
function CountryPicker({ value, onChange }) {
  const insets                = useSafeAreaInsets();
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch]   = useState('');
  const slideAnim = useRef(new Animated.Value(H * 0.72)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (open) setMounted(true); }, [open]);
  useEffect(() => {
    if (!mounted) return;
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mounted]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: H * 0.72, duration: 220, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 0,        duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setOpen(false); cb?.(); });
  };

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );

  return (
    <>
      <TouchableOpacity style={s.dialBtn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={s.dialFlag}>{value.flag}</Text>
        <Text style={s.dialCode}>{value.dial}</Text>
        <Ionicons name="chevron-down" size={11} color={MUTED} />
      </TouchableOpacity>

      {mounted && (
        <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
          <TouchableWithoutFeedback onPress={() => dismiss()}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: bgAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[s.pickerSheet, {
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: H * 0.72,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: slideAnim }],
          }]}>
            <View style={s.sheetHandle}><View style={s.handle} /></View>
            <Text style={s.sheetTitle}>Indicatif téléphonique</Text>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color={MUTED} />
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher..."
                placeholderTextColor={MUTED}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={i => i.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.sheetRow, item.code === value.code && { backgroundColor: `${PRIMARY}10` }]}
                  onPress={() => { dismiss(() => onChange(item)); setSearch(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>
                  <Text style={[s.sheetRowLabel, item.code === value.code && { color: PRIMARY, fontWeight: '800' }]}>
                    {item.name}
                  </Text>
                  <Text style={{ color: MUTED, fontWeight: '700', fontSize: 13 }}>{item.dial}</Text>
                  {item.code === value.code && <Ionicons name="checkmark" size={16} color={PRIMARY} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )}
            />
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

// ─── Champ animé (identique à LoginScreen) ────────────────────────────────────
function AnimatedField({ label, icon, hasError, errorMsg, children }) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [hasError ? '#FCA5A5' : BORDER, hasError ? '#EF4444' : PRIMARY],
  });
  const shadowOpacity = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] });

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        {icon && <Ionicons name={icon} size={13} color={hasError ? '#EF4444' : MUTED} />}
        <Text style={s.label}>{label}</Text>
      </View>
      <Animated.View style={[
        s.inputWrap,
        { borderColor, shadowOpacity, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8 },
      ]}>
        {React.Children.map(children, child =>
          child ? React.cloneElement(child, {
            onFocus: (e) => { Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start(); child.props.onFocus?.(e); },
            onBlur:  (e) => { Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(); child.props.onBlur?.(e); },
          }) : null
        )}
      </Animated.View>
      {hasError && errorMsg && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={s.fieldError}>{errorMsg}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Clavier PIN ──────────────────────────────────────────────────────────────
function PinKeypad({ onPress, onDelete }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={s.pinGrid}>
      {keys.map((k, i) => {
        if (k === '') return <View key={i} style={s.pinKeyEmpty} />;
        const isDelete = k === '⌫';
        return (
          <TouchableOpacity
            key={i}
            style={s.pinKey}
            onPress={() => isDelete ? onDelete() : onPress(k)}
            activeOpacity={0.7}
          >
            <Text style={[s.pinKeyText, isDelete && { color: '#EF4444' }]}>{k}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgentLoginScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { login, loading, error, clearError } = useAgentStore();

  // Animations d'entrée (identiques à LoginScreen)
  const heroAnim    = useRef(new Animated.Value(0)).current;
  const cardAnim    = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim,    { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale,   { toValue: 1, tension: 60, friction: 10, useNativeDriver: true, delay: 150 }),
      Animated.spring(cardAnim,    { toValue: 0, tension: 70, friction: 14, useNativeDriver: true, delay: 220 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true, delay: 220 }),
    ]).start();
  }, []);

  const [storeCountry,  setStoreCountry]  = useState(COUNTRIES[0]);
  const [storePhoneRaw, setStorePhoneRaw] = useState('');
  const [agentCountry,  setAgentCountry]  = useState(COUNTRIES[0]);
  const [agentPhoneRaw, setAgentPhoneRaw] = useState('');
  const [pin,       setPin]       = useState('');
  const [step,      setStep]      = useState(1);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verified,  setVerified]  = useState(null); // { agentName, storeName }

  const handleNext = async () => {
    const storeDigits = strip(storePhoneRaw);
    const agentDigits = strip(agentPhoneRaw);
    if (!storeDigits || !agentDigits) {
      setVerifyError('Veuillez saisir les deux numéros de téléphone.');
      return;
    }
    if (storeDigits.length < storeCountry.digits) {
      setVerifyError(`Numéro boutique incomplet — ${storeCountry.digits} chiffres requis pour ${storeCountry.name}.`);
      return;
    }
    if (agentDigits.length < agentCountry.digits) {
      setVerifyError(`Votre numéro est incomplet — ${agentCountry.digits} chiffres requis pour ${agentCountry.name}.`);
      return;
    }

    setVerifyError('');
    setVerifying(true);
    try {
      const { default: apiClient } = await import('../config/api');
      const res = await apiClient.post('/api/agents/verify', {
        storePhone: `${storeCountry.dial}${storeDigits}`,
        phone:      `${agentCountry.dial}${agentDigits}`,
      });
      setVerified(res.data.data);
      clearError();
      setStep(2);
    } catch (e) {
      setVerifyError(e.response?.data?.message || 'Impossible de vérifier les informations');
    } finally {
      setVerifying(false);
    }
  };

  const handlePinPress  = (digit) => { if (pin.length < 4) setPin(p => p + digit); };
  const handlePinDelete = ()       => setPin(p => p.slice(0, -1));

  const handleLogin = async () => {
    if (pin.length !== 4) return;
    clearError();
    const storePhone = `${storeCountry.dial}${strip(storePhoneRaw)}`;
    const agentPhone = `${agentCountry.dial}${strip(agentPhoneRaw)}`;
    const result = await login(storePhone, agentPhone, pin);
    if (!result.success) setPin('');
  };

  useEffect(() => {
    if (pin.length === 4) handleLogin();
  }, [pin]);

  const canSubmit = strip(storePhoneRaw).length >= storeCountry.digits &&
                    strip(agentPhoneRaw).length >= agentCountry.digits;

  return (
    <View style={{ flex: 1, backgroundColor: '#0D2218' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Fond dégradé */}
      <LinearGradient
        colors={['#0D2218', '#1A3A2A', '#30A08B']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
      />

      {/* Bulles décoratives */}
      <View style={s.bubble1} />
      <View style={s.bubble2} />
      <View style={s.bubble3} />
      <View style={s.bubble4} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Bouton retour */}
          <TouchableOpacity
            style={[s.backBtn, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color={WHITE} />
          </TouchableOpacity>

          {/* Hero */}
          <Animated.View style={[s.hero, { opacity: heroAnim }]}>
            <Animated.View style={[s.logoPill, { transform: [{ scale: logoScale }] }]}>
              <View style={s.logoPillInner}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={s.logo}
                  resizeMode="contain"
                />
              </View>
            </Animated.View>
            <Text style={s.heroTagline}>Espace Caissier</Text>
            <Text style={s.heroSub}>
              {step === 1 ? 'Connectez-vous à votre boutique' : 'Saisissez votre PIN à 4 chiffres'}
            </Text>
          </Animated.View>

          {/* Card formulaire */}
          <Animated.View style={[s.card, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

            {/* En-tête card */}
            <View style={s.cardHeader}>
              <LinearGradient colors={[PRIMARY + '18', SECONDARY + '08']} style={StyleSheet.absoluteFillObject} borderRadius={22} />
              <View style={s.cardHeaderIcon}>
                <LinearGradient colors={[PRIMARY, SECONDARY]} style={s.cardHeaderIconGrad}>
                  <Ionicons name="people-outline" size={20} color={WHITE} />
                </LinearGradient>
              </View>
              <View>
                <Text style={s.cardTitle}>{step === 1 ? 'Connexion' : 'Code PIN'}</Text>
                <Text style={s.cardSub}>
                  {step === 1
                    ? 'Espace réservé aux caissiers'
                    : verified
                      ? `${verified.agentName} · ${verified.storeName}`
                      : `${agentCountry.dial} ${agentPhoneRaw}`}
                </Text>
              </View>
            </View>

            {/* ── Étape 1 : numéros ── */}
            {step === 1 && (
              <>
                <AnimatedField label="Numéro de téléphone de la boutique" icon="storefront-outline" hasError={!!error}>
                  <CountryPicker value={storeCountry} onChange={(c) => { setStoreCountry(c); setStorePhoneRaw(''); }} />
                  <View style={s.phoneDivider} />
                  <TextInput
                    style={[s.input, { paddingLeft: 8 }]}
                    value={storePhoneRaw}
                    onChangeText={(v) => { setStorePhoneRaw(formatPhone(v, storeCountry.format)); if (error) clearError(); }}
                    placeholder={storeCountry.format.replace(/X/g, '0')}
                    placeholderTextColor={MUTED}
                    keyboardType="phone-pad"
                    maxLength={storeCountry.format.length}
                  />
                </AnimatedField>

                <AnimatedField label="Votre numéro de téléphone" icon="person-outline" hasError={!!error} errorMsg={error}>
                  <CountryPicker value={agentCountry} onChange={(c) => { setAgentCountry(c); setAgentPhoneRaw(''); }} />
                  <View style={s.phoneDivider} />
                  <TextInput
                    style={[s.input, { paddingLeft: 8 }]}
                    value={agentPhoneRaw}
                    onChangeText={(v) => { setAgentPhoneRaw(formatPhone(v, agentCountry.format)); if (error) clearError(); }}
                    placeholder={agentCountry.format.replace(/X/g, '0')}
                    placeholderTextColor={MUTED}
                    keyboardType="phone-pad"
                    maxLength={agentCountry.format.length}
                  />
                </AnimatedField>

                {verifyError ? (
                  <View style={s.errorRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
                    <Text style={s.fieldError}>{verifyError}</Text>
                  </View>
                ) : null}

                {/* CTA */}
                <TouchableOpacity
                  style={[s.ctaWrap, (!canSubmit || verifying) && { opacity: 0.55 }]}
                  onPress={handleNext}
                  disabled={!canSubmit || verifying}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[PRIMARY, SECONDARY]}
                    style={s.cta}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {verifying ? (
                      <ActivityIndicator color={WHITE} size="small" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={s.ctaText}>Continuer</Text>
                        <View style={s.ctaArrow}>
                          <Ionicons name="arrow-forward" size={16} color={PRIMARY} />
                        </View>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* ── Étape 2 : PIN ── */}
            {step === 2 && (
              <>
                {/* Points PIN */}
                <View style={s.pinDots}>
                  {[0,1,2,3].map(i => (
                    <View
                      key={i}
                      style={[
                        s.pinDot,
                        i < pin.length
                          ? { backgroundColor: PRIMARY, borderColor: PRIMARY }
                          : { backgroundColor: 'transparent', borderColor: BORDER },
                      ]}
                    />
                  ))}
                </View>

                {error ? (
                  <View style={s.errorRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
                    <Text style={s.fieldError}>{error}</Text>
                  </View>
                ) : null}

                {loading ? (
                  <ActivityIndicator size="large" color={PRIMARY} style={{ marginVertical: 24 }} />
                ) : (
                  <PinKeypad onPress={handlePinPress} onDelete={handlePinDelete} />
                )}

                <TouchableOpacity
                  style={s.backLink}
                  onPress={() => { setStep(1); setPin(''); clearError(); setVerified(null); setVerifyError(''); }}
                >
                  <Ionicons name="arrow-back" size={13} color={MUTED} />
                  <Text style={s.backLinkText}>Modifier les numéros</Text>
                </TouchableOpacity>
              </>
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32, justifyContent: 'center' },

  // Bulles décoratives
  bubble1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(48,160,139,0.12)', top: -80,  right: -80  },
  bubble2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(177,114,54,0.10)',  top: 100,  left: -60  },
  bubble3: { position: 'absolute', width: 140, height: 140, borderRadius: 70,  backgroundColor: 'rgba(48,160,139,0.08)', bottom: 160, right: -30 },
  bubble4: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40,  backgroundColor: 'rgba(178,144,95,0.12)', bottom: 80,  left: 40   },

  backBtn: { position: 'absolute', left: 20, zIndex: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },

  // Hero
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  logoPill: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12, marginBottom: 16 },
  logoPillInner: { backgroundColor: WHITE, borderRadius: 22, width: 156, height: 52, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 110, height: 36, transform: [{ scale: 2.8 }] },
  heroTagline: { fontSize: 17, fontWeight: '900', color: WHITE, letterSpacing: -0.3, marginBottom: 4, textAlign: 'center' },
  heroSub:     { fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },

  // Card
  card: {
    backgroundColor: WHITE, borderRadius: 26, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 14,
  },
  cardHeader:         { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, padding: 12, borderRadius: 16, overflow: 'hidden' },
  cardHeaderIcon:     { width: 46, height: 46, borderRadius: 14, overflow: 'hidden' },
  cardHeaderIconGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardTitle:          { fontSize: 20, fontWeight: '900', color: DARK, letterSpacing: -0.3 },
  cardSub:            { fontSize: 12, color: MUTED, marginTop: 2 },

  // Champs
  label:     { fontSize: 13, fontWeight: '700', color: DARK },
  fieldError:{ fontSize: 12, color: '#DC2626', fontWeight: '500' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: BG, minHeight: 52, overflow: 'hidden' },
  input:     { flex: 1, paddingVertical: 14, paddingHorizontal: 14, fontSize: 14, color: DARK },
  phoneDivider: { width: 1, height: 22, backgroundColor: BORDER, marginVertical: 6 },

  // CTA
  ctaWrap: { borderRadius: 16, overflow: 'hidden', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8, marginTop: 4 },
  cta:     { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: WHITE, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  ctaArrow:{ width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

  // PIN
  pinDots:   { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 20, marginTop: 8 },
  pinDot:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  pinGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginVertical: 8 },
  pinKeyEmpty: { width: 80, height: 58 },
  pinKey:    { width: 80, height: 58, borderRadius: 14, backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, justifyContent: 'center', alignItems: 'center' },
  pinKeyText:{ fontSize: 22, fontWeight: '700', color: DARK },
  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 8 },
  backLink:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 16 },
  backLinkText: { fontSize: 13, fontWeight: '600', color: MUTED },

  // Country picker modal
  dialBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4 },
  dialFlag:     { fontSize: 20 },
  dialCode:     { fontSize: 14, fontWeight: '700', color: DARK, minWidth: 38 },
  pickerSheet:  { backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, elevation: 30 },
  sheetHandle:  { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER },
  sheetTitle:   { fontSize: 16, fontWeight: '900', color: DARK, paddingHorizontal: 20, paddingBottom: 10 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 14, color: DARK },
  sheetRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13 },
  sheetRowLabel:{ flex: 1, fontSize: 14, fontWeight: '600', color: DARK },
});
