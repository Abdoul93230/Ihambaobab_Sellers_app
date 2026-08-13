/**
 * RegisterScreen — Inscription vendeur en 4 étapes
 *
 * Étape 1 — Vérification OTP : l'utilisateur choisit email ou téléphone,
 *            reçoit un code, le valide → obtient un verifiedToken JWT 15min
 * Étape 2 — Identité : nom, prénom, mot de passe
 *            + second contact (email si phone choisi, et inversement)
 * Étape 3 — Boutique + Localisation : nom boutique, catégorie, type,
 *            profil, pays, région
 * Étape 4 — Documents : pièce d'identité (obligatoire), logo (optionnel)
 *            → récapitulatif + soumission
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, StatusBar, Modal, FlatList, Animated, Dimensions,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { BACKEND_URL } from '../config/constants';

const { width: W, height: H } = Dimensions.get('window');

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DARK      = '#0F172A';
const MUTED     = '#64748B';
const BORDER    = '#E2E8F0';
const BG        = '#F8FAFC';
const WHITE     = '#FFFFFF';
const ERROR     = '#DC2626';

const STEP_GRADIENTS = [
  ['#30A08B', '#1D7A6A'],
  ['#B17236', '#8B5A2B'],
  ['#B2905F', '#8B6B3A'],
  ['#30A08B', '#B17236'],
];

// ─── Pays & téléphones ────────────────────────────────────────────────────────
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

// SMS OTP disponible uniquement pour ces préfixes (coût réel)
const SMS_COUNTRIES = ['+227', '+229'];

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

// ─── Catégories / Types ───────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'mode',         label: 'Mode',        icon: '👗' },
  { value: 'electronique', label: 'Électronique',icon: '📱' },
  { value: 'maison',       label: 'Maison',      icon: '🏠' },
  { value: 'beaute',       label: 'Beauté',      icon: '💄' },
  { value: 'sports',       label: 'Sports',      icon: '⚽' },
  { value: 'artisanat',    label: 'Artisanat',   icon: '🎨' },
  { value: 'bijoux',       label: 'Bijoux',      icon: '💍' },
  { value: 'alimentation', label: 'Alimentaire', icon: '🍎' },
  { value: 'livres',       label: 'Livres',      icon: '📚' },
  { value: 'services',     label: 'Services',    icon: '💼' },
  { value: 'autre',        label: 'Autre',       icon: '✏️' },
];

const STORE_TYPES = [
  { value: 'physique', label: 'Physique',  icon: 'storefront-outline',      desc: 'Boutique physique' },
  { value: 'enligne',  label: 'En ligne',  icon: 'globe-outline',           desc: 'Commerce digital' },
  { value: 'hybride',  label: 'Hybride',   icon: 'swap-horizontal-outline', desc: 'Les deux canaux' },
];

const BUSINESS_PROFILES = [
  { value: 'commercant', icon: '🏪', label: 'Commerçant', desc: 'Vous revendez des produits.', color: '#B17236' },
  { value: 'createur',   icon: '🎨', label: 'Artisan',    desc: 'Vous créez vos produits.',    color: '#B2905F' },
  { value: 'hybride',    icon: '🔄', label: 'Hybride',    desc: 'Créations + importés.',        color: '#30A08B' },
];

const PAYS_DATA = [
  { name: 'Niger',         flag: '🇳🇪', regions: ['Agadez','Diffa','Dosso','Maradi','Niamey','Tahoua','Tillabéri','Zinder'] },
  { name: 'Bénin',         flag: '🇧🇯', regions: ['Alibori','Atacora','Atlantique','Borgou','Collines','Couffo','Donga','Littoral (Cotonou)','Mono','Ouémé','Plateau','Zou'] },
  { name: 'Burkina Faso',  flag: '🇧🇫', regions: ['Boucle du Mouhoun','Cascades','Centre (Ouagadougou)','Centre-Est','Centre-Nord','Centre-Ouest','Centre-Sud','Est','Hauts-Bassins (Bobo-Dioulasso)','Nord','Plateau Central','Sahel','Sud-Ouest'] },
  { name: 'Mali',          flag: '🇲🇱', regions: ['Bamako','Gao','Kayes','Kidal','Koulikoro','Mopti','Ségou','Sikasso'] },
  { name: 'Sénégal',       flag: '🇸🇳', regions: ['Dakar','Diourbel','Fatick','Kaolack','Kolda','Louga','Matam','Saint-Louis','Thiès','Ziguinchor'] },
  { name: "Côte d'Ivoire", flag: '🇨🇮', regions: ['Abidjan','Bas-Sassandra','Comoé','Lagunes','Montagnes','Savanes','Yamoussoukro'] },
  { name: 'Togo',          flag: '🇹🇬', regions: ['Centrale','Kara','Maritime','Plateaux','Savanes'] },
  { name: 'Guinée',        flag: '🇬🇳', regions: ['Boké','Conakry','Faranah','Kankan','Kindia','Labé','Mamou','Nzérékoré'] },
  { name: 'Cameroun',      flag: '🇨🇲', regions: ['Adamaoua','Centre (Yaoundé)','Est','Extrême-Nord','Littoral (Douala)','Nord','Ouest','Sud'] },
  { name: 'Mauritanie',    flag: '🇲🇷', regions: ['Adrar','Brakna','Dakhlet Nouadhibou','Gorgol','Hodh Ech Chargui','Nouakchott Nord','Trarza'] },
  { name: 'Ghana',         flag: '🇬🇭', regions: ['Ashanti','Central','Eastern','Greater Accra','Northern','Upper East','Upper West','Volta','Western'] },
  { name: 'Nigeria',       flag: '🇳🇬', regions: ['Abuja (FCT)','Kano','Lagos','Ogun','Oyo','Rivers'] },
  { name: 'France',        flag: '🇫🇷', regions: ['Île-de-France','Normandie','Nouvelle-Aquitaine','Occitanie',"Provence-Alpes-Côte d'Azur"] },
  { name: 'Maroc',         flag: '🇲🇦', regions: ['Casablanca-Settat','Fès-Meknès','Marrakech-Safi','Rabat-Salé-Kénitra','Tanger-Tétouan-Al Hoceïma'] },
  { name: 'Algérie',       flag: '🇩🇿', regions: ['Alger','Annaba','Constantine','Oran','Sétif'] },
  { name: 'États-Unis',    flag: '🇺🇸', regions: ['California','Florida','New York','Texas'] },
];

const TOTAL_STEPS = 4;
const STEP_META = [
  { title: 'Vérification',  subtitle: 'Confirmez votre email ou téléphone', icon: 'shield-checkmark-outline' },
  { title: 'Identité',      subtitle: 'Vos informations personnelles',       icon: 'person-outline' },
  { title: 'Votre boutique',subtitle: 'Activité et localisation',            icon: 'storefront-outline' },
  { title: 'Documents',     subtitle: 'Pièce d\'identité et logo',           icon: 'document-text-outline' },
];

// ─── Composant Stepper ────────────────────────────────────────────────────────
function Stepper({ current, total }) {
  const anim = useRef(new Animated.Value((current - 1) / (total - 1))).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: (current - 1) / (total - 1), tension: 80, friction: 14, useNativeDriver: false }).start();
  }, [current]);
  const barW = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={st.stepper}>
      <View style={st.stepTrack}>
        <Animated.View style={[st.stepFill, { width: barW }]} />
      </View>
      {Array.from({ length: total }, (_, i) => {
        const done = i + 1 < current, active = i + 1 === current;
        return (
          <View key={i} style={[st.stepNode, { left: `${(i / (total - 1)) * 100}%`, marginLeft: i === 0 ? 0 : i === total - 1 ? -20 : -10 }]}>
            <LinearGradient
              colors={done || active ? STEP_GRADIENTS[i] : ['#E2E8F0', '#CBD5E1']}
              style={[st.stepDot, active && st.stepDotActive]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              {done
                ? <Ionicons name="checkmark" size={10} color="#fff" />
                : <Text style={[st.stepNum, { color: active ? '#fff' : '#94A3B8' }]}>{i + 1}</Text>}
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

// ─── OTP Input 6 cases ───────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const chars = (value || '').split('');

  const handleKey = (i, v) => {
    const digits = v.replace(/\D/g, '').slice(-1);
    const arr = chars.slice();
    arr[i] = digits;
    const next = arr.join('');
    onChange(next);
    if (digits && i < 5) refs.current[i + 1]?.focus();
  };
  const handleBackspace = (i, v) => {
    if (v === '' && i > 0) {
      const arr = chars.slice();
      arr[i - 1] = '';
      onChange(arr.join(''));
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <View style={st.otpRow}>
      {Array.from({ length: 6 }, (_, i) => (
        <TextInput
          key={i}
          ref={r => refs.current[i] = r}
          style={[st.otpCell, chars[i] && st.otpCellFilled, disabled && { opacity: 0.5 }]}
          value={chars[i] || ''}
          onChangeText={v => handleKey(i, v)}
          onKeyPress={({ nativeEvent }) => nativeEvent.key === 'Backspace' && handleBackspace(i, chars[i] || '')}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

// ─── Picker drapeau pays téléphone ───────────────────────────────────────────
function PhoneCountryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search));
  return (
    <>
      <TouchableOpacity style={st.dialBtn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={st.dialFlag}>{value.flag}</Text>
        <Text style={st.dialCode}>{value.dial}</Text>
        <Ionicons name="chevron-down" size={12} color={MUTED} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <TouchableWithoutFeedback>
              <View style={[st.pickerSheet, { maxHeight: H * 0.65 }]}>
                <View style={st.sheetHandle}><View style={st.handle} /></View>
                <Text style={st.sheetTitle}>Indicatif téléphonique</Text>
                <View style={st.searchWrap}>
                  <Ionicons name="search-outline" size={16} color={MUTED} />
                  <TextInput style={st.searchInput} placeholder="Rechercher..." value={search} onChangeText={setSearch} autoFocus />
                </View>
                <FlatList
                  data={filtered}
                  keyExtractor={i => i.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={st.sheetRow} onPress={() => { onChange(item); setOpen(false); setSearch(''); }} activeOpacity={0.7}>
                      <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={st.sheetRowLabel}>{item.name}</Text>
                      </View>
                      <Text style={{ color: MUTED, fontWeight: '700', fontSize: 13 }}>{item.dial}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ─── List picker (pays / région) ─────────────────────────────────────────────
// items : string[]  OU  { name: string, flag: string }[]
function ListPicker({ visible, title, items, selected, onSelect, onClose }) {
  const [search,  setSearch]  = useState('');
  const searchRef = useRef(null);
  const insets    = useSafeAreaInsets();

  const getLabel = (i) => typeof i === 'string' ? i : i.name;
  const getFlag  = (i) => typeof i === 'string' ? null : (i.flag ?? null);

  useEffect(() => { if (visible) setSearch(''); }, [visible]);

  const close = (selectCb) => {
    Keyboard.dismiss();
    selectCb?.();
    onClose();
  };

  const filtered = items.filter(i => getLabel(i).toLowerCase().includes(search.toLowerCase()));

  // Plein écran opaque → le clavier apparaît en dessous sans déplacer la vue
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
          <TouchableOpacity onPress={() => close()} style={{ padding: 4, marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#111" />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#111', flex: 1 }}>{title}</Text>
        </View>

        {/* Barre de recherche */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
            <Ionicons name="search-outline" size={16} color={MUTED} />
            <TextInput
              ref={searchRef}
              style={{ flex: 1, fontSize: 15, color: '#111', paddingVertical: 11 }}
              placeholder="Rechercher..."
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); searchRef.current?.focus(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={17} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Liste */}
        <FlatList
          data={filtered}
          keyExtractor={i => getLabel(i)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          renderItem={({ item }) => {
            const label = getLabel(item);
            const flag  = getFlag(item);
            const isSel = label === selected;
            return (
              <TouchableOpacity
                style={[st.sheetRow, isSel && { backgroundColor: `${PRIMARY}12` }]}
                onPress={() => close(() => onSelect(label))}
                activeOpacity={0.65}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  {flag != null
                    ? <Text style={{ fontSize: 26, lineHeight: 32 }}>{flag}</Text>
                    : <View style={{ width: 26 }} />
                  }
                  <Text style={[st.sheetRowLabel, isSel && { color: PRIMARY, fontWeight: '800' }]}>{label}</Text>
                </View>
                {isSel && <Ionicons name="checkmark" size={20} color={PRIMARY} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Ionicons name="search-outline" size={32} color={MUTED} />
              <Text style={{ color: MUTED, marginTop: 10, fontSize: 14 }}>Aucun résultat</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

// ─── Upload bouton ────────────────────────────────────────────────────────────
function UploadBtn({ label, hint, value, onPress, required }) {
  return (
    <TouchableOpacity style={[st.uploadBtn, value && st.uploadBtnFilled]} onPress={onPress} activeOpacity={0.85}>
      {value ? (
        <View style={st.uploadPreview}>
          <Image source={{ uri: value.uri }} style={st.uploadThumb} />
          <View style={{ flex: 1 }}>
            <Text style={st.uploadFileName} numberOfLines={1}>{value.name}</Text>
            <Text style={st.uploadChange}>Appuyer pour changer</Text>
          </View>
          <View style={st.uploadCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>
        </View>
      ) : (
        <View style={st.uploadEmpty}>
          <View style={[st.uploadIconBg, { backgroundColor: required ? '#FEF2F2' : `${PRIMARY}12` }]}>
            <Ionicons name="cloud-upload-outline" size={26} color={required ? ERROR : PRIMARY} />
          </View>
          <Text style={st.uploadEmptyTitle}>{label}</Text>
          <Text style={st.uploadEmptyHint}>{hint}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Champ label ─────────────────────────────────────────────────────────────
function FieldLabel({ label, required, optional }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 7 }}>
      <Text style={st.label}>{label}</Text>
      {required && <Text style={st.reqMark}>*</Text>}
      {optional && <Text style={st.optMark}>(optionnel)</Text>}
    </View>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
      <Ionicons name="alert-circle-outline" size={13} color={ERROR} />
      <Text style={st.fieldError}>{msg}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 1 — Vérification OTP
// ═══════════════════════════════════════════════════════════════════════════════
function Step1({ form, setField, errors, onOtpVerified }) {
  const [method, setMethod]       = useState(form.otpMethod || 'email');
  const [country, setCountry]     = useState(COUNTRIES[0]);
  const [phoneRaw, setPhoneRaw]   = useState('');
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent]     = useState(false);
  const [otpCode, setOtpCode]     = useState('');
  const [cooldown, setCooldown]   = useState(0);
  const [localErr, setLocalErr]   = useState('');
  const timerRef = useRef(null);

  const smsAvailable = SMS_COUNTRIES.includes(country.dial);
  const phoneDigits = strip(phoneRaw);
  const identifier = method === 'email'
    ? form.email
    : phoneDigits.length === country.digits ? `${country.dial}${phoneDigits}` : '';

  const startCooldown = (secs) => {
    setCooldown(secs);
    timerRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  const canSend = () => {
    if (method === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    return phoneDigits.length === country.digits;
  };

  const sendCode = async () => {
    if (!canSend()) {
      setLocalErr(method === 'email' ? 'Email invalide.' : `Numéro incomplet (${country.digits} chiffres requis).`);
      return;
    }
    if (method === 'phone' && !smsAvailable) {
      setLocalErr('SMS disponible uniquement pour Niger (+227) et Bénin (+229). Utilisez email.');
      return;
    }
    setLocalErr('');
    setSending(true);
    try {
      const endpoint = otpSent ? '/auth/register-otp/resend' : '/auth/register-otp/send';
      const res = await axios.post(`${BACKEND_URL}${endpoint}`, { identifier, method });
      setOtpSent(true);
      startCooldown(res.data.cooldown || 60);
      Toast.show({ type: 'success', text1: res.data.message });
    } catch (e) {
      const msg = e.response?.data?.message || "Erreur d'envoi.";
      const wait = e.response?.data?.wait;
      if (wait) startCooldown(wait);
      if (e.response?.status === 409) {
        setLocalErr(msg);
      } else {
        setLocalErr(msg);
      }
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (otpCode.length !== 6) { setLocalErr('Entrez les 6 chiffres du code.'); return; }
    setLocalErr('');
    setVerifying(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/auth/register-otp/verify`, { identifier, method, otp: otpCode });
      setField('verifiedToken', res.data.verifiedToken);
      setField('otpMethod', method);
      if (method === 'email') setField('email', identifier);
      else setField('phone', identifier);
      onOtpVerified();
    } catch (e) {
      setLocalErr(e.response?.data?.message || 'Code incorrect.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={{ gap: 20 }}>
      {/* Choix méthode — masqué une fois le code envoyé */}
      {!otpSent && (
        <View style={st.methodRow}>
          {[{ v: 'email', icon: 'mail-outline', label: 'Email' }, { v: 'phone', icon: 'phone-portrait-outline', label: 'Téléphone' }].map(m => (
            <TouchableOpacity
              key={m.v}
              style={[st.methodBtn, method === m.v && st.methodBtnActive]}
              onPress={() => {
                if (m.v === method) return;
                setMethod(m.v);
                setOtpCode('');
                setLocalErr('');
                if (m.v === 'email') setPhoneRaw('');
                else setField('email', '');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={m.icon} size={18} color={method === m.v ? WHITE : MUTED} />
              <Text style={[st.methodLabel, { color: method === m.v ? WHITE : MUTED }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Champ identifiant — remplacé par un chip résumé une fois envoyé */}
      {otpSent ? (
        <View style={st.identifierChip}>
          <View style={st.identifierChipLeft}>
            <Ionicons name={method === 'email' ? 'mail-outline' : 'phone-portrait-outline'} size={16} color={PRIMARY} />
            <Text style={st.identifierChipText} numberOfLines={1}>
              {method === 'email' ? form.email : `${country.dial} ${phoneRaw}`}
            </Text>
          </View>
          <TouchableOpacity
            style={st.identifierChipEdit}
            onPress={() => {
              setOtpSent(false);
              setOtpCode('');
              setCooldown(0);
              clearInterval(timerRef.current);
              setLocalErr('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={14} color={SECONDARY} />
            <Text style={st.identifierChipEditText}>Modifier</Text>
          </TouchableOpacity>
        </View>
      ) : method === 'email' ? (
        <View>
          <FieldLabel label="Adresse email" required />
          <View style={[st.inputWrap, errors.email && st.inputWrapError]}>
            <Ionicons name="mail-outline" size={18} color={MUTED} style={{ marginLeft: 14 }} />
            <TextInput
              style={[st.input, { paddingLeft: 10 }]}
              placeholder="vous@email.com"
              value={form.email}
              onChangeText={v => setField('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>
          <FieldError msg={errors.email || localErr} />
        </View>
      ) : (
        <View>
          <FieldLabel label="Numéro de téléphone" required />
          <View style={[st.phoneWrap, localErr && st.inputWrapError]}>
            <PhoneCountryPicker value={country} onChange={c => { setCountry(c); setPhoneRaw(''); }} />
            <View style={st.phoneDivider} />
            <TextInput
              style={st.phoneInput}
              placeholder={country.format.replace(/X/g, '0')}
              value={phoneRaw}
              onChangeText={v => setPhoneRaw(formatPhone(v, country.format))}
              keyboardType="phone-pad"
              maxLength={country.format.length}
            />
          </View>
          {!smsAvailable && (
            <Text style={{ fontSize: 11, color: '#F59E0B', marginTop: 5 }}>
              SMS uniquement pour Niger (+227) et Bénin (+229). Utilisez email pour les autres pays.
            </Text>
          )}
          <FieldError msg={localErr} />
        </View>
      )}

      {/* Bouton envoyer */}
      <TouchableOpacity
        style={[st.sendBtn, (!canSend() || cooldown > 0 || sending) && { opacity: 0.6 }]}
        onPress={sendCode}
        disabled={!canSend() || cooldown > 0 || sending}
        activeOpacity={0.85}
      >
        <LinearGradient colors={STEP_GRADIENTS[0]} style={st.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          {sending
            ? <ActivityIndicator color={WHITE} size="small" />
            : <Text style={st.sendBtnText}>
                {otpSent
                  ? (cooldown > 0 ? `Renvoyer dans ${cooldown}s` : 'Renvoyer le code')
                  : 'Envoyer le code'}
              </Text>
          }
        </LinearGradient>
      </TouchableOpacity>

      {/* Saisie OTP */}
      {otpSent && (
        <View style={st.otpSection}>
          <Text style={st.otpSentMsg}>
            Code envoyé à <Text style={{ fontWeight: '800', color: PRIMARY }}>{method === 'email' ? form.email : `${country.dial} ${phoneRaw}`}</Text>
          </Text>
          <OtpInput value={otpCode} onChange={setOtpCode} disabled={verifying} />
          {localErr ? <FieldError msg={localErr} /> : null}
          <TouchableOpacity
            style={[st.verifyBtn, (otpCode.length < 6 || verifying) && { opacity: 0.6 }]}
            onPress={verifyCode}
            disabled={otpCode.length < 6 || verifying}
            activeOpacity={0.85}
          >
            <LinearGradient colors={STEP_GRADIENTS[0]} style={st.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {verifying
                ? <ActivityIndicator color={WHITE} size="small" />
                : <>
                    <Ionicons name="shield-checkmark-outline" size={16} color={WHITE} />
                    <Text style={st.sendBtnText}>Vérifier le code</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 2 — Identité
// ═══════════════════════════════════════════════════════════════════════════════
function Step2({ form, setField, errors }) {
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [altCountry, setAltCountry] = useState(COUNTRIES[0]);
  const [altPhone, setAltPhone] = useState('');

  // Synchro du téléphone alternatif dans le formulaire
  useEffect(() => {
    const d = strip(altPhone);
    if (d.length === altCountry.digits) setField('phone', `${altCountry.dial}${d}`);
    else if (!d) setField('phone', '');
  }, [altPhone, altCountry]);

  const strength = (() => {
    const p = form.password || '';
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();
  const strengthColor = ['#E2E8F0', '#EF4444', '#F59E0B', '#3B82F6', '#10B981'][strength];
  const strengthLabel = ['', 'Trop faible', 'Faible', 'Moyen', 'Fort'][strength];

  return (
    <View style={{ gap: 20 }}>
      {/* Nom */}
      <View>
        <FieldLabel label="Nom de famille" required />
        <View style={[st.inputWrap, errors.name && st.inputWrapError]}>
          <Ionicons name="person-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
          <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="Ex : Diallo" value={form.name} onChangeText={v => setField('name', v)} autoCapitalize="words" />
        </View>
        <FieldError msg={errors.name} />
      </View>

      {/* Prénom */}
      <View>
        <FieldLabel label="Prénom" required />
        <View style={[st.inputWrap, errors.userName2 && st.inputWrapError]}>
          <Ionicons name="person-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
          <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="Ex : Moussa" value={form.userName2} onChangeText={v => setField('userName2', v)} autoCapitalize="words" />
        </View>
        <FieldError msg={errors.userName2} />
      </View>

      {/* Second contact (inverse de la méthode OTP) */}
      {form.otpMethod === 'phone' ? (
        <View>
          <FieldLabel label="Adresse email" optional />
          <View style={[st.inputWrap, errors.email && st.inputWrapError]}>
            <Ionicons name="mail-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
            <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="vous@email.com" value={form.email} onChangeText={v => setField('email', v)} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <FieldError msg={errors.email} />
        </View>
      ) : (
        <View>
          <FieldLabel label="Numéro de téléphone" optional />
          <View style={[st.phoneWrap, errors.phone && st.inputWrapError]}>
            <PhoneCountryPicker value={altCountry} onChange={c => { setAltCountry(c); setAltPhone(''); }} />
            <View style={st.phoneDivider} />
            <TextInput style={st.phoneInput} placeholder={altCountry.format.replace(/X/g, '0')} value={altPhone} onChangeText={v => setAltPhone(formatPhone(v, altCountry.format))} keyboardType="phone-pad" maxLength={altCountry.format.length} />
          </View>
          <FieldError msg={errors.phone} />
        </View>
      )}

      {/* Mot de passe */}
      <View>
        <FieldLabel label="Mot de passe" required />
        <View style={[st.inputWrap, errors.password && st.inputWrapError]}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
          <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="Min 8 caractères" value={form.password} onChangeText={v => setField('password', v)} secureTextEntry={!showPass} />
          <TouchableOpacity style={{ padding: 14 }} onPress={() => setShowPass(s => !s)}>
            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
          </TouchableOpacity>
        </View>
        {form.password?.length > 0 && (
          <View style={{ marginTop: 7, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4].map(i => (
                <View key={i} style={[st.strengthSeg, { backgroundColor: i <= strength ? strengthColor : '#E2E8F0' }]} />
              ))}
            </View>
            <Text style={[st.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
          </View>
        )}
        <FieldError msg={errors.password} />
      </View>

      {/* Confirmation */}
      <View>
        <FieldLabel label="Confirmer le mot de passe" required />
        <View style={[st.inputWrap, errors.confirmPassword && st.inputWrapError]}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
          <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="Répétez le mot de passe" value={form.confirmPassword} onChangeText={v => setField('confirmPassword', v)} secureTextEntry={!showConf} />
          <TouchableOpacity style={{ padding: 14 }} onPress={() => setShowConf(s => !s)}>
            <Ionicons name={showConf ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
          </TouchableOpacity>
        </View>
        <FieldError msg={errors.confirmPassword} />
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 3 — Boutique + Localisation
// ═══════════════════════════════════════════════════════════════════════════════
function Step3({ form, setField, errors }) {
  const [paysOpen, setPaysOpen]     = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const paysList   = PAYS_DATA.map(p => p.name);
  const regionList = form.pays ? (PAYS_DATA.find(p => p.name === form.pays)?.regions || []) : [];
  const paysFlag   = PAYS_DATA.find(p => p.name === form.pays)?.flag || '🌍';

  return (
    <View style={{ gap: 20 }}>
      {/* Nom boutique */}
      <View>
        <FieldLabel label="Nom de la boutique" required />
        <View style={[st.inputWrap, errors.storeName && st.inputWrapError]}>
          <Ionicons name="storefront-outline" size={17} color={MUTED} style={{ marginLeft: 14 }} />
          <TextInput style={[st.input, { paddingLeft: 10 }]} placeholder="Ex : Boutique Ama" value={form.storeName} onChangeText={v => setField('storeName', v)} />
        </View>
        <FieldError msg={errors.storeName} />
      </View>

      {/* Catégorie */}
      <View>
        <FieldLabel label="Catégorie" required />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[st.chip, form.category === c.value && st.chipActive]}
              onPress={() => setField('category', c.value)}
              activeOpacity={0.75}
            >
              <Text style={st.chipIcon}>{c.icon}</Text>
              <Text style={[st.chipLabel, form.category === c.value && { color: PRIMARY, fontWeight: '700' }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {form.category === 'autre' && (
          <TextInput style={[st.inputWrap, { marginTop: 10, paddingHorizontal: 14, minHeight: 48, fontSize: 14, color: DARK }]}
            placeholder="Précisez votre catégorie" value={form.categoryCustom} onChangeText={v => setField('categoryCustom', v)} />
        )}
        <FieldError msg={errors.category} />
      </View>

      {/* Type boutique */}
      <View>
        <FieldLabel label="Type de boutique" required />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {STORE_TYPES.map(t => (
            <TouchableOpacity key={t.value} style={[st.typeCard, form.storeType === t.value && st.typeCardActive]} onPress={() => setField('storeType', t.value)} activeOpacity={0.8}>
              <Ionicons name={t.icon} size={20} color={form.storeType === t.value ? PRIMARY : MUTED} />
              <Text style={[st.typeLabel, form.storeType === t.value && { color: PRIMARY }]}>{t.label}</Text>
              <Text style={st.typeDesc}>{t.desc}</Text>
              {form.storeType === t.value && <View style={st.typeCheck}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
            </TouchableOpacity>
          ))}
        </View>
        <FieldError msg={errors.storeType} />
      </View>

      {/* Profil */}
      <View>
        <FieldLabel label="Profil vendeur" required />
        <View style={{ gap: 10 }}>
          {BUSINESS_PROFILES.map(p => (
            <TouchableOpacity key={p.value} style={[st.profileCard, form.businessProfile === p.value && { borderColor: p.color }]} onPress={() => setField('businessProfile', p.value)} activeOpacity={0.8}>
              <Text style={{ fontSize: 24 }}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.profileLabel, form.businessProfile === p.value && { color: p.color }]}>{p.label}</Text>
                <Text style={st.profileDesc}>{p.desc}</Text>
              </View>
              <View style={[st.profileRadio, form.businessProfile === p.value && { borderColor: p.color, backgroundColor: p.color }]}>
                {form.businessProfile === p.value && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <FieldError msg={errors.businessProfile} />
      </View>

      {/* Pays */}
      <View>
        <FieldLabel label="Pays" required />
        <TouchableOpacity style={[st.pickerBtn, errors.pays && st.inputWrapError]} onPress={() => setPaysOpen(true)} activeOpacity={0.8}>
          {form.pays ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Text style={{ fontSize: 20 }}>{paysFlag}</Text>
              <Text style={[st.pickerBtnText, { color: DARK }]}>{form.pays}</Text>
            </View>
          ) : <Text style={st.pickerBtnText}>Sélectionner un pays</Text>}
          <Ionicons name="chevron-down" size={16} color={MUTED} />
        </TouchableOpacity>
        <FieldError msg={errors.pays} />
      </View>

      {/* Région */}
      <View>
        <FieldLabel label="Région / Ville" required />
        <TouchableOpacity style={[st.pickerBtn, (!form.pays || errors.region) && st.inputWrapError]} onPress={() => form.pays && setRegionOpen(true)} activeOpacity={0.8} disabled={!form.pays}>
          <Text style={[st.pickerBtnText, form.region ? { color: DARK } : {}]}>{form.region || (form.pays ? 'Sélectionner une région' : 'Choisissez d\'abord un pays')}</Text>
          <Ionicons name="chevron-down" size={16} color={MUTED} />
        </TouchableOpacity>
        <FieldError msg={errors.region} />
      </View>

      <ListPicker visible={paysOpen} title="Sélectionner un pays" items={PAYS_DATA} selected={form.pays}
        onSelect={v => { setField('pays', v); setField('region', ''); }} onClose={() => setPaysOpen(false)} />
      <ListPicker visible={regionOpen} title="Sélectionner une région" items={regionList} selected={form.region}
        onSelect={v => setField('region', v)} onClose={() => setRegionOpen(false)} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 4 — Documents + Récapitulatif
// ═══════════════════════════════════════════════════════════════════════════════
function Step4({ form, setField, errors, onPickFile }) {
  return (
    <View style={{ gap: 22 }}>
      {/* Pièce d'identité */}
      <View>
        <FieldLabel label="Pièce d'identité" required />
        <Text style={st.uploadHint}>CNI, Passeport ou Permis de conduire (recto)</Text>
        <UploadBtn
          label="Importer ma pièce d'identité"
          hint="JPG, PNG — requis pour la validation"
          value={form.ownerIdentity}
          onPress={() => onPickFile('ownerIdentity')}
          required
        />
        <FieldError msg={errors.ownerIdentity} />
      </View>

      {/* Logo */}
      <View>
        <FieldLabel label="Logo de la boutique" optional />
        <UploadBtn
          label="Importer mon logo"
          hint="JPG, PNG — recommandé pour votre vitrine"
          value={form.logo}
          onPress={() => onPickFile('logo')}
        />
      </View>

      {/* Récapitulatif */}
      <View style={st.recap}>
        <Text style={st.recapTitle}>Récapitulatif</Text>
        {[
          { icon: 'shield-checkmark-outline', label: form.otpMethod === 'email' ? 'Email vérifié' : 'Téléphone vérifié',
            value: form.otpMethod === 'email' ? form.email : form.phone },
          { icon: 'person-outline',   label: 'Nom', value: `${form.name} ${form.userName2}`.trim() },
          { icon: 'storefront-outline', label: 'Boutique', value: form.storeName },
          { icon: 'grid-outline',     label: 'Catégorie', value: CATEGORIES.find(c => c.value === form.category)?.label || '' },
          { icon: 'location-outline', label: 'Localisation', value: [form.pays, form.region].filter(Boolean).join(' · ') },
        ].map((row, i) => row.value ? (
          <View key={i} style={st.recapRow}>
            <View style={st.recapIcon}><Ionicons name={row.icon} size={14} color={PRIMARY} /></View>
            <Text style={st.recapLabel}>{row.label}</Text>
            <Text style={st.recapValue} numberOfLines={1}>{row.value}</Text>
          </View>
        ) : null)}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL SUCCÈS
// ═══════════════════════════════════════════════════════════════════════════════
function SuccessModal({ visible, storeName, onGoLogin }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={st.successOverlay}>
        <View style={st.successCard}>
          <LinearGradient colors={['#30A08B', '#B17236']} style={st.successHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={st.successCheckCircle}>
              <Ionicons name="checkmark" size={36} color="#fff" />
            </View>
            <Text style={st.successTitle}>Dossier soumis !</Text>
            <Text style={st.successSub}>
              <Text style={{ fontWeight: '800' }}>{storeName}</Text> est en cours de validation.
              Vous serez notifié dans 24–48h.
            </Text>
          </LinearGradient>
          <View style={{ padding: 20, gap: 12 }}>
            {['Vérification de vos documents', 'Validation par notre équipe', 'Activation de votre boutique'].map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[st.successStep, { backgroundColor: i === 0 ? PRIMARY : '#E2E8F0' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: i === 0 ? '#fff' : MUTED }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 13, color: DARK, flex: 1 }}>{s}</Text>
                {i === 0 && <View style={[st.successBadge, { backgroundColor: `${PRIMARY}15` }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: PRIMARY }}>En cours</Text>
                </View>}
              </View>
            ))}
            <TouchableOpacity style={st.successCTA} onPress={onGoLogin} activeOpacity={0.85}>
              <LinearGradient colors={['#30A08B', '#1D7A6A']} style={st.successCTAGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={st.successCTAText}>Aller à la connexion</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const INITIAL_FORM = {
  // OTP
  otpMethod: 'email', verifiedToken: '',
  // Identifiant vérifié
  email: '', phone: '',
  // Identité
  name: '', userName2: '', confirmPassword: '', password: '',
  // Boutique
  storeName: '', category: '', categoryCustom: '', storeType: '', businessProfile: '',
  // Localisation
  pays: '', region: '',
  // Documents
  ownerIdentity: null, logo: null,
};

export default function RegisterScreen({ navigation }) {
  const insets   = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [step,        setStep]        = useState(1);
  const [form,        setForm]        = useState(INITIAL_FORM);
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const setField = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  // ── Animation slide ────────────────────────────────────────────────────────
  const animateStep = (dir) => {
    const from = dir === 'next' ? W : -W;
    slideAnim.setValue(from);
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 16, useNativeDriver: true }).start();
  };

  // ── Validation par étape ──────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (step === 1) {
      // La vérification OTP est gérée dans Step1 directement via onOtpVerified
      // — on ne devrait pas pouvoir avancer sans le token
      if (!form.verifiedToken) e.verifiedToken = 'Vérifiez votre identifiant avant de continuer.';
    }
    if (step === 2) {
      if (!form.name || form.name.trim().length < 3) e.name = 'Minimum 3 caractères.';
      if (!form.userName2 || form.userName2.trim().length < 2) e.userName2 = 'Minimum 2 caractères.';
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email invalide.';
      if (!form.password || form.password.length < 8) e.password = 'Minimum 8 caractères.';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Les mots de passe ne correspondent pas.';
    }
    if (step === 3) {
      if (!form.storeName || form.storeName.trim().length < 2) e.storeName = 'Minimum 2 caractères.';
      if (!form.category) e.category = 'Sélectionnez une catégorie.';
      if (form.category === 'autre' && !form.categoryCustom?.trim()) e.category = 'Précisez votre catégorie.';
      if (!form.storeType) e.storeType = 'Sélectionnez un type.';
      if (!form.businessProfile) e.businessProfile = 'Sélectionnez un profil.';
      if (!form.pays) e.pays = 'Sélectionnez un pays.';
      if (!form.region) e.region = 'Sélectionnez une région.';
    }
    if (step === 4) {
      if (!form.ownerIdentity) e.ownerIdentity = "La pièce d'identité est obligatoire.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Pick image ────────────────────────────────────────────────────────────
  const pickFile = async (field) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Permission refusée' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setField(field, { uri: a.uri, name: a.fileName || `${field}-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    }
  };

  // ── Navigation étapes ─────────────────────────────────────────────────────
  const goNext = async () => {
    if (!validate()) { scrollRef.current?.scrollTo({ y: 0, animated: true }); return; }
    if (step < TOTAL_STEPS) {
      animateStep('next');
      setStep(s => s + 1);
      setErrors({});
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      await submit();
    }
  };

  const goPrev = () => {
    setErrors({});
    if (step === 1) { navigation.goBack(); return; }
    animateStep('prev');
    setStep(s => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // ── OTP vérifié → passe à l'étape 2 automatiquement ──────────────────────
  const handleOtpVerified = () => {
    animateStep('next');
    setStep(2);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // ── Soumission ────────────────────────────────────────────────────────────
  const submit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      const skip = new Set(['ownerIdentity', 'logo', 'categoryCustom', 'pays', 'confirmPassword', 'otpMethod']);
      Object.entries(form).forEach(([k, v]) => {
        if (skip.has(k) || v === null || v === undefined || v === '') return;
        fd.append(k, String(v));
      });
      // Pays → city (attendu par le backend)
      fd.append('city', form.pays);
      // Catégorie custom
      if (form.category === 'autre' && form.categoryCustom?.trim()) fd.set('category', form.categoryCustom.trim());
      fd.append('planType', 'Starter');
      if (form.ownerIdentity) fd.append('ownerIdentity', form.ownerIdentity);
      if (form.logo) fd.append('logo', form.logo);

      await axios.post(`${BACKEND_URL}/createSeller`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      setShowSuccess(true);
    } catch (e) {
      const msg   = e.response?.data?.error?.message || e.response?.data?.message || 'Erreur lors de la création.';
      const field = e.response?.data?.error?.field;
      const code  = e.response?.data?.code;

      if (code === 'INVALID_VERIFIED_TOKEN') {
        setStep(1);
        setField('verifiedToken', '');
        Toast.show({ type: 'error', text1: 'Session expirée', text2: 'Recommencez la vérification OTP.', visibilityTime: 5000 });
        return;
      }
      if (field) {
        const stepOf = { email: 1, phone: 1, storeName: 3 };
        const target = stepOf[field];
        if (target && target !== step) setStep(target);
        setErrors({ [field]: msg });
      }
      Toast.show({ type: 'error', text1: 'Erreur', text2: msg, visibilityTime: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const grad = STEP_GRADIENTS[step - 1];
  const meta = STEP_META[step - 1];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" backgroundColor={grad[0]} />

      <SuccessModal
        visible={showSuccess}
        storeName={form.storeName}
        onGoLogin={() => navigation.replace('Login')}
      />

      {/* ── HEADER ── */}
      <LinearGradient colors={grad} style={[st.hero, { paddingTop: insets.top + 8 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={st.heroBubble1} /><View style={st.heroBubble2} />

        <View style={st.heroNav}>
          <TouchableOpacity onPress={goPrev} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={st.logoPill}>
            <Image source={require('../../assets/logo.png')} style={[st.logo, { transform: [{ scale: 2.8 }] }]} resizeMode="contain" />
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 }}>
          <Stepper current={step} total={TOTAL_STEPS} />
        </View>

        <View style={st.heroContent}>
          <LinearGradient colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.12)']} style={st.heroIconWrap}>
            <Ionicons name={meta.icon} size={24} color={WHITE} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={st.heroStep}>Étape {step}/{TOTAL_STEPS}</Text>
            <Text style={st.heroTitle}>{meta.title}</Text>
            <Text style={st.heroSub}>{meta.subtitle}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── CONTENU ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>

          {Object.values(errors).some(Boolean) && (
            <View style={st.errBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={st.errBannerText}>Veuillez corriger les erreurs indiquées.</Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            {step === 1 && <Step1 form={form} setField={setField} errors={errors} onOtpVerified={handleOtpVerified} />}
            {step === 2 && <Step2 form={form} setField={setField} errors={errors} />}
            {step === 3 && <Step3 form={form} setField={setField} errors={errors} />}
            {step === 4 && <Step4 form={form} setField={setField} errors={errors} onPickFile={pickFile} />}
          </Animated.View>

          {/* CTA — masqué à l'étape 1 (la progression se fait via le bouton "Vérifier le code") */}
          {step > 1 && (
            <TouchableOpacity style={[st.cta, loading && { opacity: 0.7 }]} onPress={goNext} disabled={loading} activeOpacity={0.88}>
              <LinearGradient colors={grad} style={st.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={st.ctaText}>{step === TOTAL_STEPS ? 'Créer ma boutique' : 'Continuer'}</Text>
                      <View style={st.ctaIcon}>
                        <Ionicons name={step === TOTAL_STEPS ? 'checkmark' : 'arrow-forward'} size={16} color={grad[0]} />
                      </View>
                    </View>
                }
              </LinearGradient>
            </TouchableOpacity>
          )}

          {step === 1 && (
            <TouchableOpacity style={st.loginLink} onPress={() => navigation.navigate('Login')}>
              <Text style={st.loginLinkText}>Déjà inscrit ? <Text style={{ color: PRIMARY, fontWeight: '800' }}>Se connecter</Text></Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  hero:         { paddingBottom: 22, overflow: 'hidden' },
  heroBubble1:  { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  heroBubble2:  { position: 'absolute', width: 120, height: 120, borderRadius: 60,  backgroundColor: 'rgba(255,255,255,0.08)', bottom: -30, left: 20 },
  heroNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 4 },
  backBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  logoPill:     { backgroundColor: WHITE, borderRadius: 20, width: 132, height: 42, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', elevation: 5 },
  logo:         { width: 130, height: 39 },
  heroContent:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14 },
  heroIconWrap: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  heroStep:     { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  heroTitle:    { fontSize: 20, fontWeight: '900', color: WHITE, letterSpacing: -0.3 },
  heroSub:      { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  stepper:      { height: 32, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  stepTrack:    { position: 'absolute', left: 10, right: 10, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2 },
  stepFill:     { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  stepNode:     { position: 'absolute', alignItems: 'center' },
  stepDot:      { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepDotActive:{ width: 24, height: 24, borderRadius: 12, elevation: 4 },
  stepNum:      { fontSize: 9, fontWeight: '800' },

  body:         { padding: 20, paddingBottom: 40 },

  errBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, padding: 13, marginBottom: 16 },
  errBannerText: { fontSize: 13, color: '#B91C1C', flex: 1, fontWeight: '600' },

  label:    { fontSize: 13, fontWeight: '700', color: DARK },
  reqMark:  { fontSize: 12, color: ERROR, fontWeight: '700' },
  optMark:  { fontSize: 11, color: MUTED },
  fieldError:{ fontSize: 12, color: ERROR, fontWeight: '500' },

  inputWrap:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, minHeight: 52, overflow: 'hidden' },
  inputWrapError: { borderColor: '#FECACA' },
  input:          { flex: 1, paddingVertical: 14, fontSize: 14, color: DARK },

  phoneWrap:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, overflow: 'hidden' },
  dialBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14 },
  dialFlag:      { fontSize: 18 },
  dialCode:      { fontSize: 13, fontWeight: '800', color: DARK },
  phoneDivider:  { width: 1, height: 26, backgroundColor: BORDER },
  phoneInput:    { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 14, color: DARK, letterSpacing: 0.5 },

  // OTP Step 1
  methodRow:    { flexDirection: 'row', gap: 12 },
  methodBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE },
  methodBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  methodLabel:  { fontSize: 14, fontWeight: '700' },

  identifierChip:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: `${PRIMARY}08`, borderWidth: 1.5, borderColor: `${PRIMARY}30`, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  identifierChipLeft:     { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  identifierChipText:     { fontSize: 14, fontWeight: '700', color: DARK, flex: 1 },
  identifierChipEdit:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12 },
  identifierChipEditText: { fontSize: 12, fontWeight: '700', color: SECONDARY },

  sendBtn:      { borderRadius: 16, overflow: 'hidden', elevation: 4 },
  sendBtnGrad:  { paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  sendBtnText:  { fontSize: 15, fontWeight: '800', color: WHITE },

  otpSection:   { gap: 14, backgroundColor: `${PRIMARY}08`, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: `${PRIMARY}20` },
  otpSentMsg:   { fontSize: 13, color: MUTED, textAlign: 'center' },
  otpRow:       { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  otpCell:      { width: 44, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE, textAlign: 'center', fontSize: 22, fontWeight: '800', color: DARK },
  otpCellFilled:{ borderColor: PRIMARY, backgroundColor: `${PRIMARY}08` },
  verifyBtn:    { borderRadius: 14, overflow: 'hidden', elevation: 3 },

  // Step 3
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: WHITE },
  chipActive:   { borderColor: PRIMARY, backgroundColor: `${PRIMARY}10` },
  chipIcon:     { fontSize: 13 },
  chipLabel:    { fontSize: 12, fontWeight: '600', color: MUTED },

  typeCard:     { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, padding: 12, alignItems: 'center', backgroundColor: WHITE, position: 'relative', overflow: 'hidden' },
  typeCardActive:{ borderColor: PRIMARY },
  typeLabel:    { fontSize: 12, fontWeight: '800', color: DARK, textAlign: 'center', marginTop: 6 },
  typeDesc:     { fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 2, lineHeight: 14 },
  typeCheck:    { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },

  profileCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: BORDER, borderRadius: 16, padding: 14, backgroundColor: WHITE },
  profileLabel: { fontSize: 14, fontWeight: '800', color: DARK, marginBottom: 2 },
  profileDesc:  { fontSize: 12, color: MUTED, lineHeight: 16 },
  profileRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, justifyContent: 'center', alignItems: 'center' },

  pickerBtn:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, paddingHorizontal: 14, minHeight: 52 },
  pickerBtnText: { flex: 1, fontSize: 14, color: MUTED, fontWeight: '500' },

  // Step 4
  uploadHint:   { fontSize: 11, color: MUTED, marginBottom: 8 },
  uploadBtn:    { borderWidth: 2, borderColor: BORDER, borderRadius: 16, borderStyle: 'dashed', overflow: 'hidden', backgroundColor: WHITE },
  uploadBtnFilled:{ borderStyle: 'solid', borderColor: PRIMARY },
  uploadEmpty:  { alignItems: 'center', paddingVertical: 26, gap: 8 },
  uploadIconBg: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  uploadEmptyTitle:{ fontSize: 13, fontWeight: '700', color: DARK },
  uploadEmptyHint: { fontSize: 11, color: MUTED, textAlign: 'center', paddingHorizontal: 20 },
  uploadPreview:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: `${PRIMARY}0D` },
  uploadThumb:  { width: 52, height: 52, borderRadius: 12 },
  uploadFileName:{ fontSize: 13, fontWeight: '700', color: DARK },
  uploadChange: { fontSize: 11, color: PRIMARY, marginTop: 2 },
  uploadCheck:  { width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },

  recap:        { borderRadius: 16, borderWidth: 1.5, borderColor: `${PRIMARY}25`, padding: 16, backgroundColor: `${PRIMARY}05`, gap: 10 },
  recapTitle:   { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  recapRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recapIcon:    { width: 26, height: 26, borderRadius: 8, backgroundColor: `${PRIMARY}15`, justifyContent: 'center', alignItems: 'center' },
  recapLabel:   { fontSize: 12, color: MUTED, width: 90, fontWeight: '500' },
  recapValue:   { flex: 1, fontSize: 12, fontWeight: '700', color: DARK },

  // Strength
  strengthSeg:   { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700' },

  // CTA
  cta:     { marginTop: 28, borderRadius: 18, overflow: 'hidden', elevation: 8 },
  ctaGrad: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: WHITE, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  ctaIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

  loginLink:     { alignItems: 'center', marginTop: 20 },
  loginLinkText: { fontSize: 13, color: MUTED },

  // Pickers sheets
  pickerSheet: { backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, elevation: 30 },
  sheetHandle: { alignItems: 'center', paddingTop: 14, paddingBottom: 6 },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER },
  sheetTitle:  { fontSize: 17, fontWeight: '800', color: DARK, paddingHorizontal: 20, marginBottom: 14 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, backgroundColor: BG, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, height: 46, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: DARK },
  sheetRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  sheetRowLabel:{ fontSize: 14, fontWeight: '600', color: DARK, flex: 1 },

  // Success
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  successCard:    { width: '100%', maxWidth: 400, backgroundColor: WHITE, borderRadius: 28, overflow: 'hidden', elevation: 24 },
  successHero:    { alignItems: 'center', padding: 32, gap: 12 },
  successCheckCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  successTitle:   { fontSize: 22, fontWeight: '900', color: WHITE },
  successSub:     { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 19 },
  successStep:    { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E2E8F0' },
  successBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  successCTA:     { borderRadius: 14, overflow: 'hidden', elevation: 6, marginTop: 8 },
  successCTAGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  successCTAText: { fontSize: 15, fontWeight: '900', color: WHITE },
});
