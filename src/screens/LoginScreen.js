import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Image, StatusBar, Animated, Dimensions,
  Modal, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../stores/authStore';
import ForgotPasswordSheet from './ForgotPasswordSheet';

const SUPPORT_PHONE = '+22787727501';
const SUPPORT_EMAIL = 'ihambaobab@gmail.com';

const { width: W, height: H } = Dimensions.get('window');

const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const SAND      = '#B2905F';
const DARK      = '#0F172A';
const MUTED     = '#64748B';
const BORDER    = '#E2E8F0';
const WHITE     = '#FFFFFF';
const BG        = '#F8FAFC';

// ─── Champ animé ─────────────────────────────────────────────────────────────
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

// ─── Modal compte en attente ──────────────────────────────────────────────────
const PENDING_STEPS = [
  { label: 'Inscription',                icon: 'person-outline',           done: true  },
  { label: 'Vérification des documents', icon: 'document-text-outline',    done: true  },
  { label: 'Validation admin',           icon: 'shield-checkmark-outline',  done: false, active: true },
  { label: 'Activation de la boutique', icon: 'storefront-outline',        done: false },
];

function PendingModal({ visible, onClose }) {
  const scaleAnim   = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, tension: 70, friction: 12, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2,  duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[pm.overlay, { opacity: opacityAnim }]}>
        <Animated.View style={[pm.card, { transform: [{ scale: scaleAnim }] }]}>

          {/* Hero */}
          <LinearGradient colors={['#30A08B', '#B17236']} style={pm.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={pm.heroBubble1} />
            <View style={pm.heroBubble2} />

            {/* Logo */}
            <View style={pm.logoWrap}>
              <Image source={require('../../assets/logo.png')} style={pm.logo} resizeMode="contain" />
            </View>

            {/* Icône horloge animée */}
            <Animated.View style={[pm.clockCircle, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.12)']} style={pm.clockInner}>
                <Ionicons name="time-outline" size={30} color={WHITE} />
              </LinearGradient>
            </Animated.View>

            <Text style={pm.heroTitle}>Compte en attente</Text>
            <Text style={pm.heroSub}>Votre dossier est en cours d'examen par nos équipes</Text>
          </LinearGradient>

          <ScrollView contentContainerStyle={pm.body} showsVerticalScrollIndicator={false} bounces={false}>

            {/* Étapes */}
            <View style={pm.stepsCard}>
              <Text style={pm.sectionTitle}>Processus de validation</Text>
              {PENDING_STEPS.map((step, i) => (
                <View key={i} style={pm.stepRow}>
                  <View style={{ alignItems: 'center', width: 28 }}>
                    {step.done ? (
                      <View style={[pm.stepDot, { backgroundColor: PRIMARY }]}>
                        <Ionicons name="checkmark" size={12} color={WHITE} />
                      </View>
                    ) : step.active ? (
                      <Animated.View style={[pm.stepDot, pm.stepDotActive, { transform: [{ scale: pulseAnim }] }]}>
                        <Ionicons name="ellipsis-horizontal" size={12} color={WHITE} />
                      </Animated.View>
                    ) : (
                      <View style={[pm.stepDot, { backgroundColor: '#E2E8F0' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8' }}>{i + 1}</Text>
                      </View>
                    )}
                    {i < PENDING_STEPS.length - 1 && (
                      <View style={[pm.stepLine, { backgroundColor: step.done ? PRIMARY + '40' : '#E2E8F0' }]} />
                    )}
                  </View>
                  <View style={pm.stepContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons name={step.icon} size={13} color={step.done ? PRIMARY : step.active ? SECONDARY : '#94A3B8'} />
                      <Text style={[
                        pm.stepLabel,
                        step.done   && { color: PRIMARY,   fontWeight: '700' },
                        step.active && { color: SECONDARY, fontWeight: '700' },
                        !step.done && !step.active && { color: '#94A3B8' },
                      ]}>{step.label}</Text>
                    </View>
                    {step.done && (
                      <View style={[pm.badge, { backgroundColor: PRIMARY + '15' }]}>
                        <Text style={[pm.badgeText, { color: PRIMARY }]}>Complété</Text>
                      </View>
                    )}
                    {step.active && (
                      <View style={[pm.badge, { backgroundColor: SECONDARY + '18' }]}>
                        <Text style={[pm.badgeText, { color: SECONDARY }]}>En cours</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Info délai */}
            <View style={pm.infoBox}>
              <View style={pm.infoIcon}>
                <Ionicons name="information-circle-outline" size={18} color={PRIMARY} />
              </View>
              <Text style={pm.infoText}>
                Notre équipe vérifie votre dossier sous{' '}
                <Text style={{ fontWeight: '800', color: PRIMARY }}>24 à 48h ouvrées</Text>.
                Vous recevrez une notification dès que votre boutique sera activée.
              </Text>
            </View>

            {/* Contact */}
            <View style={pm.contactCard}>
              <Text style={pm.contactTitle}>Une question ? Contactez-nous</Text>
              <View style={pm.contactRow}>
                <TouchableOpacity style={pm.contactBtn} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} activeOpacity={0.8}>
                  <LinearGradient colors={[PRIMARY + '18', PRIMARY + '08']} style={pm.contactBtnGrad}>
                    <Ionicons name="call-outline" size={16} color={PRIMARY} />
                    <View>
                      <Text style={pm.contactBtnLabel}>Appeler</Text>
                      <Text style={pm.contactBtnVal}>+227 87 72 75 01</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={pm.contactBtn} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} activeOpacity={0.8}>
                  <LinearGradient colors={[SECONDARY + '18', SECONDARY + '08']} style={pm.contactBtnGrad}>
                    <Ionicons name="mail-outline" size={16} color={SECONDARY} />
                    <View>
                      <Text style={[pm.contactBtnLabel, { color: SECONDARY }]}>Email</Text>
                      <Text style={[pm.contactBtnVal, { color: SECONDARY }]}>ihambaobab@gmail.com</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bouton fermer */}
            <TouchableOpacity style={pm.closeBtn} onPress={onClose} activeOpacity={0.88}>
              <Text style={pm.closeBtnText}>Compris, je patiente</Text>
              <Ionicons name="checkmark-circle-outline" size={18} color={WHITE} />
            </TouchableOpacity>

          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card:         { width: '100%', maxWidth: 420, backgroundColor: WHITE, borderRadius: 28, overflow: 'hidden', maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 24 },

  hero:         { alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 24, overflow: 'hidden', position: 'relative' },
  heroBubble1:  { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40 },
  heroBubble2:  { position: 'absolute', width: 100, height: 100, borderRadius: 50,  backgroundColor: 'rgba(255,255,255,0.07)', bottom: -30, left: 10 },
  logoWrap:     { backgroundColor: WHITE, borderRadius: 16, width: 132, height: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  logo:         { width: 100, height: 30, transform: [{ scale: 2.8 }] },
  clockCircle:  { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  clockInner:   { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', borderRadius: 36 },
  heroTitle:    { fontSize: 20, fontWeight: '900', color: WHITE, letterSpacing: -0.3, marginBottom: 5 },
  heroSub:      { fontSize: 12, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 18 },

  body:         { padding: 16, gap: 12, paddingBottom: 24 },

  stepsCard:    { borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', padding: 14, backgroundColor: WHITE },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 12 },
  stepDot:      { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  stepDotActive:{ backgroundColor: SECONDARY },
  stepLine:     { width: 2, flex: 1, minHeight: 16, marginTop: 3 },
  stepContent:  { flex: 1, flexDirection: 'row', alignItems: 'center', paddingTop: 3, gap: 6 },
  stepLabel:    { fontSize: 13, fontWeight: '500', flex: 1 },
  badge:        { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:    { fontSize: 10, fontWeight: '700' },

  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: PRIMARY + '0C', borderRadius: 14, borderWidth: 1, borderColor: PRIMARY + '20', padding: 13 },
  infoIcon:     { width: 28, height: 28, borderRadius: 9, backgroundColor: PRIMARY + '18', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  infoText:     { flex: 1, fontSize: 12, color: MUTED, lineHeight: 18 },

  contactCard:  { borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', padding: 14 },
  contactTitle: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  contactRow:   { flexDirection: 'row', gap: 10 },
  contactBtn:   { flex: 1, borderRadius: 14, overflow: 'hidden' },
  contactBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14 },
  contactBtnLabel:{ fontSize: 11, fontWeight: '800', color: PRIMARY },
  contactBtnVal:  { fontSize: 10, color: MUTED, marginTop: 1 },

  closeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, backgroundColor: PRIMARY, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  closeBtnText: { fontSize: 15, fontWeight: '900', color: WHITE },
});

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [identifier,    setIdentifier]    = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [showPending,   setShowPending]   = useState(false);
  const [showForgot,    setShowForgot]    = useState(false);
  const { login, loading, error, clearError } = useAuthStore();

  // Animations d'entrée
  const heroAnim  = useRef(new Animated.Value(0)).current;
  const cardAnim  = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim,    { toValue: 1,  duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale,   { toValue: 1,  tension: 60, friction: 10, useNativeDriver: true, delay: 150 }),
      Animated.spring(cardAnim,    { toValue: 0,  tension: 70, friction: 14, useNativeDriver: true, delay: 220 }),
      Animated.timing(cardOpacity, { toValue: 1,  duration: 400, useNativeDriver: true, delay: 220 }),
    ]).start();
  }, []);

  const handleChange = (setter) => (val) => { if (error) clearError(); setter(val); };
  const handleLogin  = async () => {
    const id = identifier.trim();
    const pw = password.trim();
    if (!id || !pw) return;
    const result = await login(id, pw);
    if (!result?.success && result?.error?.toLowerCase().includes('attente')) {
      setShowPending(true);
    }
  };
  const canSubmit = identifier.trim().length > 0 && password.trim().length > 0 && !loading;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <PendingModal visible={showPending} onClose={() => setShowPending(false)} />
      <ForgotPasswordSheet visible={showForgot} onClose={() => setShowForgot(false)} />

      {/* ── FOND DÉGRADÉ PLEIN ÉCRAN ── */}
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

          {/* ── HERO : Logo + Tagline compact ── */}
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
            <Text style={s.heroTagline}>Votre boutique, votre succès</Text>
            <Text style={s.heroSub}>Espace réservé aux vendeurs Ihambaobab</Text>
          </Animated.View>

          {/* ── CARD FORMULAIRE ── */}
          <Animated.View style={[s.card, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

            {/* En-tête card */}
            <View style={s.cardHeader}>
              <LinearGradient colors={[PRIMARY + '18', SECONDARY + '08']} style={StyleSheet.absoluteFillObject} borderRadius={22} />
              <View style={s.cardHeaderIcon}>
                <LinearGradient colors={[PRIMARY, SECONDARY]} style={s.cardHeaderIconGrad}>
                  <Ionicons name="storefront-outline" size={20} color={WHITE} />
                </LinearGradient>
              </View>
              <View>
                <Text style={s.cardTitle}>Connexion</Text>
                <Text style={s.cardSub}>Bienvenue sur votre espace boutique</Text>
              </View>
            </View>

            {/* Champs */}
            <AnimatedField label="Email ou téléphone" icon="person-outline" hasError={!!error}>
              <TextInput
                style={s.input}
                value={identifier}
                onChangeText={handleChange(setIdentifier)}
                placeholder="vendeur@email.com"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
            </AnimatedField>

            <AnimatedField label="Mot de passe" icon="lock-closed-outline" hasError={!!error} errorMsg={error}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={password}
                onChangeText={handleChange(setPassword)}
                placeholder="••••••••"
                placeholderTextColor={MUTED}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={{ paddingHorizontal: 14 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
              </TouchableOpacity>
            </AnimatedField>

            {/* Mot de passe oublié */}
            <TouchableOpacity style={s.forgotRow} onPress={() => setShowForgot(true)} activeOpacity={0.7}>
              <Text style={s.forgotText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>

            {/* Bouton CTA */}
            <TouchableOpacity
              style={[s.ctaWrap, (!canSubmit) && { opacity: 0.55 }]}
              onPress={handleLogin}
              disabled={!canSubmit}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[PRIMARY, SECONDARY]}
                style={s.cta}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={s.ctaText}>Se connecter</Text>
                    <View style={s.ctaArrow}>
                      <Ionicons name="arrow-forward" size={16} color={PRIMARY} />
                    </View>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>Nouveau vendeur ?</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Créer boutique */}
            <TouchableOpacity
              style={s.registerBtn}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.85}
            >
              <Ionicons name="storefront-outline" size={16} color={PRIMARY} />
              <Text style={s.registerBtnText}>Créer ma boutique</Text>
              <Ionicons name="chevron-forward" size={14} color={PRIMARY} />
            </TouchableOpacity>

          </Animated.View>

          {/* Footer + contacts */}
          <View style={[s.footerWrap, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.footerContacts}>
              <TouchableOpacity style={s.footerContactBtn} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}>
                <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.55)" />
                <Text style={s.footerContactText}>+227 87 72 75 01</Text>
              </TouchableOpacity>
              <View style={s.footerDot} />
              <TouchableOpacity style={s.footerContactBtn} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
                <Ionicons name="mail-outline" size={12} color="rgba(255,255,255,0.55)" />
                <Text style={s.footerContactText}>ihambaobab@gmail.com</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.footer}>© Ihambaobab · Tous droits réservés</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16, justifyContent: 'center' },

  // Bulles décoratives fond
  bubble1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(48,160,139,0.12)', top: -80,  right: -80  },
  bubble2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(177,114,54,0.10)',  top: 100,  left: -60  },
  bubble3: { position: 'absolute', width: 140, height: 140, borderRadius: 70,  backgroundColor: 'rgba(48,160,139,0.08)', bottom: 160, right: -30 },
  bubble4: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40,  backgroundColor: 'rgba(178,144,95,0.12)', bottom: 80,  left: 40   },

  // Hero
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },

  logoPill: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: 16,
  },
  logoPillInner: {
    backgroundColor: WHITE,
    borderRadius: 22,
    width: 156,
    height: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 110, height: 36, transform: [{ scale: 2.8 }] },

  heroTagline: { fontSize: 17, fontWeight: '900', color: WHITE, letterSpacing: -0.3, marginBottom: 4, textAlign: 'center' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },

  // Card formulaire
  card: {
    backgroundColor: WHITE,
    borderRadius: 26,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 14,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, padding: 12, borderRadius: 16, overflow: 'hidden' },
  cardHeaderIcon: { width: 46, height: 46, borderRadius: 14, overflow: 'hidden' },
  cardHeaderIconGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 20, fontWeight: '900', color: DARK, letterSpacing: -0.3 },
  cardSub:   { fontSize: 12, color: MUTED, marginTop: 2 },


  // Champs
  label:      { fontSize: 13, fontWeight: '700', color: DARK },
  fieldError: { fontSize: 12, color: '#DC2626', fontWeight: '500' },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: BG, minHeight: 52, overflow: 'hidden' },
  input:      { flex: 1, paddingVertical: 14, paddingHorizontal: 14, fontSize: 14, color: DARK },

  forgotRow: { alignItems: 'flex-end', marginTop: -4, marginBottom: 16 },
  forgotText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  // CTA
  ctaWrap: { borderRadius: 16, overflow: 'hidden', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8, marginBottom: 16 },
  cta:     { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: WHITE, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  ctaArrow: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

  // Divider
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { fontSize: 11, color: MUTED, fontWeight: '600' },

  // Register
  registerBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: PRIMARY + '40', borderRadius: 14, paddingVertical: 11, backgroundColor: PRIMARY + '08' },
  registerBtnText: { fontSize: 14, fontWeight: '800', color: PRIMARY },

  footerWrap:        { alignItems: 'center', marginTop: 16, gap: 8 },
  footerContacts:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerContactBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerContactText: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  footerDot:         { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  footer:            { textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.28)' },
});
