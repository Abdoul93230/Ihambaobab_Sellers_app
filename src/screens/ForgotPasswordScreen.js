import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Keyboard, KeyboardAvoidingView,
  ScrollView, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { BACKEND_URL } from '../config/constants';

const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DARK      = '#0F172A';
const MUTED     = '#64748B';
const BORDER    = '#E2E8F0';
const WHITE     = '#FFFFFF';
const BG        = '#F8FAFC';

const SMS_ALLOWED = [
  { code: 'NE', name: 'Niger', dial: '+227', flag: '🇳🇪', digits: 8 },
  { code: 'BJ', name: 'Bénin', dial: '+229', flag: '🇧🇯', digits: 8 },
];

const OTP_COOLDOWN_EMAIL = 60;
const OTP_COOLDOWN_SMS   = 120;
const SMS_MAX_SENDS      = 2;
const OTP_LENGTH         = 6;

const maskIdentifier = (v) => {
  if (!v) return '';
  if (v.includes('@')) {
    const [user, domain] = v.split('@');
    return `${user.slice(0, 2)}${'*'.repeat(Math.max(2, user.length - 2))}@${domain}`;
  }
  const clean = v.replace(/\D/g, '');
  return `${'*'.repeat(Math.max(0, clean.length - 3))}${clean.slice(-3)}`;
};

// ─── Champ OTP 6 cases ────────────────────────────────────────────────────────
function OtpInput({ value, onChange, hasError }) {
  const inputs = useRef([]);

  const handleKey = (i, char) => {
    const digits = value.split('');
    if (char === '') {
      digits[i] = '';
      onChange(digits.join(''));
      if (i > 0) inputs.current[i - 1]?.focus();
    } else {
      const d = char.replace(/\D/g, '');
      if (!d) return;
      digits[i] = d[0];
      onChange(digits.join(''));
      if (i < OTP_LENGTH - 1) inputs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (i, text) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (digits.length === OTP_LENGTH) {
      onChange(digits);
      inputs.current[OTP_LENGTH - 1]?.focus();
    }
  };

  return (
    <View style={ot.row}>
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const filled = !!value[i];
        const active = value.length === i;
        return (
          <TextInput
            key={i}
            ref={r => inputs.current[i] = r}
            style={[ot.cell, filled && ot.cellFilled, active && ot.cellActive, hasError && ot.cellError]}
            value={value[i] || ''}
            onChangeText={t => handleKey(i, t)}
            onKeyPress={({ nativeEvent: { key } }) => { if (key === 'Backspace' && !value[i] && i > 0) inputs.current[i - 1]?.focus(); }}
            onFocus={() => { if (i > value.length) inputs.current[value.length]?.focus(); }}
            onChange={({ nativeEvent: { text } }) => { if (text.length > 1) handlePaste(i, text); }}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            textAlign="center"
          />
        );
      })}
    </View>
  );
}

const ot = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 8 },
  cell:      { width: 46, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG, fontSize: 22, fontWeight: '900', color: DARK, textAlign: 'center' },
  cellFilled: { backgroundColor: PRIMARY + '10', borderColor: PRIMARY + '60' },
  cellActive: { borderColor: PRIMARY, backgroundColor: WHITE },
  cellError:  { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
});

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [step,         setStep]         = useState(1);
  const [method,       setMethod]       = useState('email');
  const [identifier,   setIdentifier]   = useState('');
  const [smsCountry,   setSmsCountry]   = useState(SMS_ALLOWED[0]);
  const [otp,          setOtp]          = useState('');
  const [newPassword,  setNewPassword]  = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState(false);
  const [cooldown,     setCooldown]     = useState(0);
  const [smsSendCount, setSmsSendCount] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const startCooldown = (m) => {
    const duration = (m ?? method) === 'sms' ? OTP_COOLDOWN_SMS : OTP_COOLDOWN_EMAIL;
    setCooldown(duration);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(c => { if (c <= 1) { clearInterval(cooldownRef.current); return 0; } return c - 1; });
    }, 1000);
  };

  const sendOtp = async () => {
    setError('');
    const val = identifier.trim();
    if (!val) { setError('Veuillez entrer votre email ou numéro.'); return; }
    if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setError('Adresse email invalide.'); return; }
    if (method === 'sms' && val.replace(/\D/g, '').length !== smsCountry.digits) {
      setError(`Numéro incomplet (${smsCountry.digits} chiffres pour ${smsCountry.name}).`); return;
    }
    setLoading(true);
    try {
      const body = method === 'email'
        ? { email: val.toLowerCase() }
        : { phone: `${smsCountry.dial}${val.replace(/\D/g, '')}` };
      await axios.post(`${BACKEND_URL}/forgotPassword_seller`, body, { timeout: 15000 });
      if (method === 'sms') setSmsSendCount(c => c + 1);
      startCooldown(method);
      setStep(2);
    } catch (e) {
      const status = e.response?.status;
      const data   = e.response?.data || {};
      if (status === 429) {
        if (data.quotaExceeded) {
          setError(data.message || 'Quota SMS atteint. Utilisez votre email.');
        } else {
          // Un OTP valide existe déjà en store — passer à l'étape 2
          const wait = Number(data.message?.match(/\d+/)?.[0] || 0);
          if (wait > 0) {
            setCooldown(wait);
            clearInterval(cooldownRef.current);
            cooldownRef.current = setInterval(() => {
              setCooldown(c => { if (c <= 1) { clearInterval(cooldownRef.current); return 0; } return c - 1; });
            }, 1000);
          }
          setStep(2);
        }
      } else {
        setError(e.response?.data?.message || 'Erreur réseau. Vérifiez votre connexion.');
      }
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    if (cooldown > 0 || (method === 'sms' && smsSendCount >= SMS_MAX_SENDS)) return;
    setError(''); setOtp(''); setAttempts(0);
    setLoading(true);
    try {
      const val = identifier.trim();
      const body = method === 'email'
        ? { email: val.toLowerCase() }
        : { phone: `${smsCountry.dial}${val.replace(/\D/g, '')}` };
      await axios.post(`${BACKEND_URL}/forgotPassword_seller`, body, { timeout: 15000 });
      if (method === 'sms') setSmsSendCount(c => c + 1);
      startCooldown(method);
    } catch (e) {
      const status = e.response?.status;
      if (status === 429) {
        const cd = method === 'sms' ? OTP_COOLDOWN_SMS : OTP_COOLDOWN_EMAIL;
        const wait = e.response?.data?.message?.match(/\d+/)?.[0] || cd;
        setError(`Attendez ${wait}s avant de renvoyer.`);
        setCooldown(Number(wait));
      } else {
        setError(e.response?.data?.message || 'Erreur lors du renvoi.');
      }
    } finally { setLoading(false); }
  };

  const verifyOtp = () => {
    if (otp.length < OTP_LENGTH) { setError(`Entrez les ${OTP_LENGTH} chiffres.`); return; }
    setError('');
    setStep(3);
  };

  const resetPassword = async () => {
    setError('');
    if (newPassword.length < 8) { setError('Minimum 8 caractères.'); return; }
    if (newPassword !== confirmPwd) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      const val = identifier.trim();
      const body = method === 'email'
        ? { email: val.toLowerCase(), otp, newPassword }
        : { phone: `${smsCountry.dial}${val.replace(/\D/g, '')}`, otp, newPassword };
      await axios.post(`${BACKEND_URL}/reset_password_seller`, body, { timeout: 15000 });
      setSuccess(true);
    } catch (e) {
      const msg = e.response?.data?.message || '';
      if (msg.includes('expiré') || msg.includes('invalide')) {
        setError('Code expiré. Recommencez depuis le début.');
        setTimeout(() => { setStep(1); setOtp(''); setError(''); }, 2000);
      } else {
        setError(msg || 'Erreur lors de la réinitialisation.');
      }
    } finally { setLoading(false); }
  };

  const strength = (() => {
    if (!newPassword) return null;
    let score = 0;
    if (newPassword.length >= 8)          score++;
    if (newPassword.length >= 12)         score++;
    if (/[A-Z]/.test(newPassword))        score++;
    if (/[0-9]/.test(newPassword))        score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 1) return { label: 'Faible', color: '#EF4444', segs: 1 };
    if (score <= 3) return { label: 'Moyen',  color: '#B2905F', segs: 2 };
    return               { label: 'Fort',   color: PRIMARY,   segs: 3 };
  })();

  const STEPS_META = [
    { num: 1, label: 'Identifiant' },
    { num: 2, label: 'Code OTP' },
    { num: 3, label: 'Nouveau mot de passe' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#0D2218' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0D2218" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {/* Header gradient */}
          <LinearGradient
            colors={['#30A08B', '#B17236']}
            style={[fp.header, { paddingTop: insets.top + 8 }]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={fp.headerBubble1} />
            <View style={fp.headerBubble2} />

            {/* Bouton retour */}
            <TouchableOpacity style={[fp.backBtn, { top: insets.top + 8 }]} onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>

            {/* Logo */}
            <View style={fp.logoWrap}>
              <Image source={require('../../assets/logo.png')} style={fp.logo} resizeMode="contain" />
            </View>

            <View style={fp.headerIcon}>
              <Ionicons name="lock-open-outline" size={26} color={WHITE} />
            </View>
            <Text style={fp.headerTitle}>Mot de passe oublié</Text>
            <Text style={fp.headerSub}>Récupérez l'accès à votre compte en toute sécurité</Text>
          </LinearGradient>

          {/* Carte blanche */}
          <View style={fp.card}>
            {/* Stepper */}
            <View style={fp.stepper}>
              {STEPS_META.map((s, i) => (
                <React.Fragment key={s.num}>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <LinearGradient
                      colors={s.num < step ? [PRIMARY, PRIMARY] : s.num === step ? [PRIMARY, SECONDARY] : ['#E2E8F0', '#CBD5E1']}
                      style={[fp.stepDot, s.num === step && fp.stepDotActive]}
                    >
                      {s.num < step
                        ? <Ionicons name="checkmark" size={11} color={WHITE} />
                        : <Text style={[fp.stepNum, { color: s.num === step ? WHITE : '#94A3B8' }]}>{s.num}</Text>
                      }
                    </LinearGradient>
                    <Text style={[fp.stepLabel, s.num === step && { color: PRIMARY, fontWeight: '700' }]}>{s.label}</Text>
                  </View>
                  {i < 2 && <View style={[fp.stepLine, { backgroundColor: s.num < step ? PRIMARY : BORDER }]} />}
                </React.Fragment>
              ))}
            </View>

            {/* ── ÉTAPE 1 ── */}
            {step === 1 && !success && (
              <View style={fp.body}>
                <View style={fp.methodRow}>
                  <TouchableOpacity
                    style={[fp.methodBtn, method === 'sms' && fp.methodBtnActive]}
                    onPress={() => { setMethod('sms'); setIdentifier(''); setError(''); }}
                    activeOpacity={0.8}
                  >
                    {method === 'sms' && <LinearGradient colors={[SECONDARY + '18', SECONDARY + '06']} style={StyleSheet.absoluteFillObject} borderRadius={12} />}
                    <Ionicons name="phone-portrait-outline" size={16} color={method === 'sms' ? SECONDARY : MUTED} />
                    <Text style={[fp.methodText, method === 'sms' && { color: SECONDARY }]}>Par SMS</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[fp.methodBtn, method === 'email' && fp.methodBtnActive]}
                    onPress={() => { setMethod('email'); setIdentifier(''); setError(''); }}
                    activeOpacity={0.8}
                  >
                    {method === 'email' && <LinearGradient colors={[PRIMARY + '18', PRIMARY + '06']} style={StyleSheet.absoluteFillObject} borderRadius={12} />}
                    <Ionicons name="mail-outline" size={16} color={method === 'email' ? PRIMARY : MUTED} />
                    <Text style={[fp.methodText, method === 'email' && { color: PRIMARY }]}>Par email</Text>
                  </TouchableOpacity>
                </View>

                {method === 'sms' && (
                  <View style={fp.smsInfo}>
                    <Ionicons name="information-circle-outline" size={14} color={SECONDARY} />
                    <Text style={fp.smsInfoText}>
                      SMS limité aux numéros{' '}
                      <Text style={{ fontWeight: '800', color: SECONDARY }}>Niger (+227)</Text> et{' '}
                      <Text style={{ fontWeight: '800', color: SECONDARY }}>Bénin (+229)</Text>.{' '}
                      Maximum <Text style={{ fontWeight: '800', color: SECONDARY }}>{SMS_MAX_SENDS} SMS</Text> — préférez l'email.
                    </Text>
                  </View>
                )}

                {method === 'email' && (
                  <View>
                    <View style={fp.fieldLabel}>
                      <Ionicons name="mail-outline" size={13} color={MUTED} />
                      <Text style={fp.label}>Adresse email du compte</Text>
                    </View>
                    <View style={[fp.inputWrap, error && { borderColor: '#FCA5A5' }]}>
                      <TextInput
                        style={fp.input}
                        value={identifier}
                        onChangeText={v => { setIdentifier(v); setError(''); }}
                        placeholder="vendeur@email.com"
                        placeholderTextColor={MUTED}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                      />
                    </View>
                  </View>
                )}

                {method === 'sms' && (
                  <View>
                    <View style={fp.fieldLabel}>
                      <Ionicons name="phone-portrait-outline" size={13} color={MUTED} />
                      <Text style={fp.label}>Numéro WhatsApp / Téléphone</Text>
                    </View>
                    <View style={[fp.phoneWrap, error && { borderColor: '#FCA5A5' }]}>
                      <View style={fp.smsCountryRow}>
                        {SMS_ALLOWED.map(c => (
                          <TouchableOpacity
                            key={c.code}
                            style={[fp.smsCountryBtn, smsCountry.code === c.code && fp.smsCountryBtnActive]}
                            onPress={() => { setSmsCountry(c); setIdentifier(''); setError(''); }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                            <Text style={[fp.smsCountryDial, smsCountry.code === c.code && { color: PRIMARY }]}>{c.dial}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={fp.phoneDivider} />
                      <TextInput
                        style={fp.phoneInput}
                        value={identifier}
                        onChangeText={v => { setIdentifier(v.replace(/\D/g, '')); setError(''); }}
                        placeholder={`${'0'.repeat(smsCountry.digits)} chiffres`}
                        placeholderTextColor={MUTED}
                        keyboardType="phone-pad"
                        maxLength={smsCountry.digits}
                      />
                      {identifier.replace(/\D/g, '').length === smsCountry.digits && (
                        <Ionicons name="checkmark-circle" size={18} color={PRIMARY} style={{ marginRight: 12 }} />
                      )}
                    </View>
                  </View>
                )}

                {!!error && <View style={fp.errorBox}><Ionicons name="alert-circle-outline" size={13} color="#DC2626" /><Text style={fp.errorText}>{error}</Text></View>}

                <TouchableOpacity style={[fp.ctaWrap, loading && { opacity: 0.65 }]} onPress={sendOtp} disabled={loading} activeOpacity={0.88}>
                  <LinearGradient colors={['#30A08B', '#B17236']} style={fp.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {loading ? <ActivityIndicator color={WHITE} size="small" /> : <><Text style={fp.ctaText}>Envoyer le code</Text><Ionicons name="send-outline" size={16} color={WHITE} /></>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ── ÉTAPE 2 ── */}
            {step === 2 && !success && (
              <View style={fp.body}>
                <View style={fp.destCard}>
                  <View style={fp.destIcon}><Ionicons name={method === 'email' ? 'mail-outline' : 'phone-portrait-outline'} size={16} color={PRIMARY} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={fp.destLabel}>Code envoyé {method === 'email' ? 'par email' : 'par SMS'}</Text>
                    <Text style={fp.destVal}>{maskIdentifier(method === 'sms' ? `${smsCountry.dial}${identifier}` : identifier)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setStep(1); setOtp(''); setError(''); setAttempts(0); }}>
                    <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: '700' }}>Modifier</Text>
                  </TouchableOpacity>
                </View>

                <Text style={fp.otpHint}>Entrez le code à {OTP_LENGTH} chiffres</Text>
                <OtpInput value={otp} onChange={v => { setOtp(v); setError(''); }} hasError={!!error} />
                <Text style={fp.otpExpiry}>Ce code expire dans <Text style={{ fontWeight: '700', color: PRIMARY }}>10 minutes</Text></Text>

                {!!error && <View style={fp.errorBox}><Ionicons name="alert-circle-outline" size={13} color="#DC2626" /><Text style={fp.errorText}>{error}</Text></View>}

                <TouchableOpacity style={[fp.ctaWrap, otp.length < OTP_LENGTH && { opacity: 0.55 }]} onPress={verifyOtp} disabled={otp.length < OTP_LENGTH} activeOpacity={0.88}>
                  <LinearGradient colors={['#30A08B', '#B17236']} style={fp.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={fp.ctaText}>Continuer</Text>
                    <Ionicons name="arrow-forward" size={16} color={WHITE} />
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', marginTop: 14 }}>
                  {method === 'sms' && smsSendCount >= SMS_MAX_SENDS ? (
                    <View style={fp.smsQuotaBox}>
                      <Ionicons name="warning-outline" size={14} color={SECONDARY} />
                      <Text style={fp.smsQuotaText}>
                        Limite SMS atteinte.{' '}
                        <Text style={{ fontWeight: '800', color: PRIMARY, textDecorationLine: 'underline' }} onPress={() => { setMethod('email'); setStep(1); setOtp(''); setError(''); setSmsSendCount(0); }}>
                          Réessayez par email
                        </Text>
                        {' '}ou contactez le support.
                      </Text>
                    </View>
                  ) : cooldown > 0 ? (
                    <Text style={fp.resendCooldown}>
                      Renvoyer dans <Text style={{ fontWeight: '800', color: method === 'sms' ? SECONDARY : PRIMARY }}>{cooldown}s</Text>
                      {method === 'sms' && smsSendCount < SMS_MAX_SENDS && <Text style={{ color: MUTED, fontSize: 11 }}>  ({SMS_MAX_SENDS - smsSendCount} envoi restant)</Text>}
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={resendOtp} disabled={loading} activeOpacity={0.7}>
                      <Text style={fp.resendBtn}>
                        <Ionicons name="refresh-outline" size={13} /> Renvoyer le code
                        {method === 'sms' && smsSendCount < SMS_MAX_SENDS && <Text style={{ fontSize: 11, fontWeight: '400', color: MUTED }}>  ({SMS_MAX_SENDS - smsSendCount} restant)</Text>}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ── ÉTAPE 3 ── */}
            {step === 3 && !success && (
              <View style={fp.body}>
                <View style={{ marginBottom: 14 }}>
                  <View style={fp.fieldLabel}>
                    <Ionicons name="lock-closed-outline" size={13} color={MUTED} />
                    <Text style={fp.label}>Nouveau mot de passe</Text>
                    <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>*</Text>
                  </View>
                  <View style={fp.inputWrap}>
                    <TextInput
                      style={[fp.input, { flex: 1 }]}
                      value={newPassword}
                      onChangeText={v => { setNewPassword(v); setError(''); }}
                      placeholder="Minimum 8 caractères"
                      placeholderTextColor={MUTED}
                      secureTextEntry={!showPwd}
                    />
                    <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={{ paddingHorizontal: 14 }}>
                      <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
                    </TouchableOpacity>
                  </View>
                  {strength && (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {[1, 2, 3].map(seg => <View key={seg} style={[fp.strengthSeg, { backgroundColor: seg <= strength.segs ? strength.color : BORDER }]} />)}
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: strength.color }}>Force : {strength.label}</Text>
                    </View>
                  )}
                </View>

                <View style={{ marginBottom: 6 }}>
                  <View style={fp.fieldLabel}>
                    <Ionicons name="lock-closed-outline" size={13} color={MUTED} />
                    <Text style={fp.label}>Confirmer le mot de passe</Text>
                    <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>*</Text>
                  </View>
                  <View style={[fp.inputWrap, confirmPwd && newPassword !== confirmPwd && { borderColor: '#FCA5A5' }]}>
                    <TextInput
                      style={[fp.input, { flex: 1 }]}
                      value={confirmPwd}
                      onChangeText={v => { setConfirmPwd(v); setError(''); }}
                      placeholder="Répétez le mot de passe"
                      placeholderTextColor={MUTED}
                      secureTextEntry={!showConfirm}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={{ paddingHorizontal: 14 }}>
                      <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
                    </TouchableOpacity>
                  </View>
                  {confirmPwd && newPassword !== confirmPwd && (
                    <View style={[fp.errorBox, { marginTop: 6 }]}>
                      <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                      <Text style={fp.errorText}>Les mots de passe ne correspondent pas.</Text>
                    </View>
                  )}
                </View>

                {!!error && <View style={fp.errorBox}><Ionicons name="alert-circle-outline" size={13} color="#DC2626" /><Text style={fp.errorText}>{error}</Text></View>}

                <TouchableOpacity style={[fp.ctaWrap, (loading || newPassword.length < 8 || newPassword !== confirmPwd) && { opacity: 0.55 }]} onPress={resetPassword} disabled={loading || newPassword.length < 8 || newPassword !== confirmPwd} activeOpacity={0.88}>
                  <LinearGradient colors={['#30A08B', '#B17236']} style={fp.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {loading ? <ActivityIndicator color={WHITE} size="small" /> : <><Text style={fp.ctaText}>Réinitialiser le mot de passe</Text><Ionicons name="checkmark-circle-outline" size={16} color={WHITE} /></>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ── SUCCÈS ── */}
            {success && (
              <View style={[fp.body, { alignItems: 'center', paddingVertical: 40 }]}>
                <LinearGradient colors={[PRIMARY + '18', PRIMARY + '06']} style={fp.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={56} color={PRIMARY} />
                </LinearGradient>
                <Text style={fp.successTitle}>Mot de passe modifié !</Text>
                <Text style={fp.successSub}>Votre mot de passe a été mis à jour avec succès.{'\n'}Reconnectez-vous avec votre nouveau mot de passe.</Text>
                <TouchableOpacity style={[fp.ctaWrap, { width: '100%', marginTop: 28 }]} onPress={goBack} activeOpacity={0.88}>
                  <LinearGradient colors={['#30A08B', '#B17236']} style={fp.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={fp.ctaText}>Se connecter</Text>
                    <Ionicons name="arrow-forward" size={16} color={WHITE} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const fp = StyleSheet.create({
  header:       { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, overflow: 'hidden', position: 'relative' },
  headerBubble1:{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40 },
  headerBubble2:{ position: 'absolute', width: 90,  height: 90,  borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -20, left: 20 },
  backBtn:      { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  logoWrap:     { backgroundColor: WHITE, borderRadius: 14, width: 120, height: 40, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  logo:         { width: 90, height: 28, transform: [{ scale: 2.8 }] },
  headerIcon:   { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  headerTitle:  { fontSize: 20, fontWeight: '900', color: WHITE, letterSpacing: -0.2 },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 6, textAlign: 'center' },

  card:         { flex: 1, backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -16, paddingTop: 8 },

  stepper:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 18, gap: 0 },
  stepDot:      { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  stepDotActive:{ width: 26, height: 26, borderRadius: 13, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  stepNum:      { fontSize: 10, fontWeight: '800' },
  stepLabel:    { fontSize: 9, color: MUTED, fontWeight: '500', textAlign: 'center', maxWidth: 64, marginTop: 4 },
  stepLine:     { flex: 1, height: 2, marginTop: 11, marginHorizontal: 4 },

  body:         { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  methodRow:    { flexDirection: 'row', gap: 10 },
  methodBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingVertical: 12, overflow: 'hidden', position: 'relative' },
  methodBtnActive: { borderColor: PRIMARY + '60' },
  methodText:   { fontSize: 13, fontWeight: '700', color: MUTED },
  smsInfo:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: SECONDARY + '0E', borderRadius: 12, borderWidth: 1, borderColor: SECONDARY + '25', padding: 11 },
  smsInfoText:  { flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 },
  fieldLabel:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  label:        { fontSize: 13, fontWeight: '700', color: DARK },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: BG, minHeight: 52, overflow: 'hidden' },
  input:        { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: DARK },
  phoneWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: BG, overflow: 'hidden', minHeight: 52 },
  smsCountryRow:{ flexDirection: 'row' },
  smsCountryBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 14 },
  smsCountryBtnActive: { backgroundColor: PRIMARY + '12' },
  smsCountryDial:{ fontSize: 12, fontWeight: '800', color: MUTED },
  phoneDivider: { width: 1, height: 28, backgroundColor: BORDER },
  phoneInput:   { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15, color: DARK, letterSpacing: 1.5 },
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 11 },
  errorText:    { flex: 1, fontSize: 12, color: '#B91C1C', fontWeight: '600', lineHeight: 17 },
  otpHint:      { fontSize: 13, fontWeight: '600', color: MUTED, textAlign: 'center' },
  otpExpiry:    { fontSize: 11, color: MUTED, textAlign: 'center', marginTop: -4 },
  destCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: PRIMARY + '0A', borderRadius: 14, borderWidth: 1, borderColor: PRIMARY + '20', padding: 12 },
  destIcon:     { width: 34, height: 34, borderRadius: 10, backgroundColor: PRIMARY + '18', justifyContent: 'center', alignItems: 'center' },
  destLabel:    { fontSize: 11, color: MUTED, fontWeight: '600' },
  destVal:      { fontSize: 13, fontWeight: '800', color: DARK, marginTop: 1 },
  resendCooldown:{ fontSize: 13, color: MUTED, textAlign: 'center' },
  resendBtn:    { fontSize: 13, fontWeight: '700', color: PRIMARY, textDecorationLine: 'underline' },
  smsQuotaBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: SECONDARY + '0E', borderRadius: 12, borderWidth: 1, borderColor: SECONDARY + '30', padding: 12 },
  smsQuotaText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 18 },
  strengthSeg:  { flex: 1, height: 4, borderRadius: 2 },
  ctaWrap:      { borderRadius: 16, overflow: 'hidden', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 7 },
  cta:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaText:      { color: WHITE, fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  successIconWrap: { width: 100, height: 100, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successTitle: { fontSize: 22, fontWeight: '900', color: DARK, marginBottom: 12, textAlign: 'center' },
  successSub:   { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 },
});
