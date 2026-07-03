import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform, Dimensions, Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import CachedImage from '../components/CachedImage';
import apiClient from '../config/api';
import Toast from 'react-native-toast-message';

const { width: W, height: H } = Dimensions.get('window');
const SHEET_H = H * 0.72;

// ─── Pays (même structure que RegisterScreen) ─────────────────────────────────
const COUNTRIES = [
  { code: 'NE', name: 'Niger',          dial: '+227', flag: '🇳🇪', format: 'XX XX XX XX',    digits: 8  },
  { code: 'BF', name: 'Burkina Faso',   dial: '+226', flag: '🇧🇫', format: 'XX XX XX XX',    digits: 8  },
  { code: 'ML', name: 'Mali',           dial: '+223', flag: '🇲🇱', format: 'XX XX XX XX',    digits: 8  },
  { code: 'SN', name: 'Sénégal',        dial: '+221', flag: '🇸🇳', format: 'XX XXX XX XX',   digits: 9  },
  { code: 'CI', name: "Côte d'Ivoire",  dial: '+225', flag: '🇨🇮', format: 'XX XX XX XX XX', digits: 10 },
  { code: 'GH', name: 'Ghana',          dial: '+233', flag: '🇬🇭', format: 'XX XXX XXXX',    digits: 9  },
  { code: 'NG', name: 'Nigeria',        dial: '+234', flag: '🇳🇬', format: 'XXX XXX XXXX',   digits: 10 },
  { code: 'CM', name: 'Cameroun',       dial: '+237', flag: '🇨🇲', format: 'X XX XX XX XX',  digits: 9  },
  { code: 'TG', name: 'Togo',           dial: '+228', flag: '🇹🇬', format: 'XX XX XX XX',    digits: 8  },
  { code: 'BJ', name: 'Bénin',          dial: '+229', flag: '🇧🇯', format: 'XX XX XX XX',    digits: 8  },
  { code: 'GN', name: 'Guinée',         dial: '+224', flag: '🇬🇳', format: 'XXX XX XX XX',   digits: 9  },
  { code: 'MR', name: 'Mauritanie',     dial: '+222', flag: '🇲🇷', format: 'XX XX XX XX',    digits: 8  },
  { code: 'MA', name: 'Maroc',          dial: '+212', flag: '🇲🇦', format: 'X XX XX XX XX',  digits: 9  },
  { code: 'DZ', name: 'Algérie',        dial: '+213', flag: '🇩🇿', format: 'XXX XX XX XX',   digits: 9  },
  { code: 'TN', name: 'Tunisie',        dial: '+216', flag: '🇹🇳', format: 'XX XXX XXX',     digits: 8  },
  { code: 'FR', name: 'France',         dial: '+33',  flag: '🇫🇷', format: 'X XX XX XX XX',  digits: 9  },
  { code: 'US', name: 'États-Unis',     dial: '+1',   flag: '🇺🇸', format: 'XXX XXX XXXX',   digits: 10 },
];
const DEFAULT_COUNTRY = COUNTRIES[0];

const formatPhoneNumber = (raw, pattern) => {
  const digits = raw.replace(/\D/g, '');
  let result = '', di = 0;
  for (let i = 0; i < pattern.length && di < digits.length; i++) {
    if (pattern[i] === 'X') result += digits[di++];
    else if (di > 0) result += pattern[i];
  }
  return result;
};
const stripFormatting = (str) => str.replace(/\D/g, '');

function parsePhone(full) {
  if (!full) return { digits: '', country: DEFAULT_COUNTRY };
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find(c => full.startsWith(c.dial));
  if (match) return { digits: full.slice(match.dial.length).replace(/\D/g, ''), country: match };
  return { digits: full.replace(/^\+\d{1,4}/, '').replace(/\D/g, ''), country: DEFAULT_COUNTRY };
}

// ─── CountryPicker — bottom sheet animé + recherche (même pattern que Register) ─
function CountryPicker({ selected, onSelect, colors }) {
  const [mounted,  setMounted]  = useState(false);
  const [search,   setSearch]   = useState('');
  const slideAnim    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const show = () => setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    slideAnim.setValue(SHEET_H);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim,    { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mounted]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,       duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setSearch(''); cb?.(); });
  };

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );

  return (
    <>
      <TouchableOpacity
        style={[s.dialBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
        onPress={show}
        activeOpacity={0.7}
      >
        <Text style={s.dialFlag}>{selected.flag}</Text>
        <Text style={[s.dialCode, { color: colors.text }]}>{selected.dial}</Text>
        <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
      </TouchableOpacity>

      {mounted && (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
          <TouchableWithoutFeedback onPress={() => dismiss()}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.65)', opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>
          <View style={{ flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' }}>
            <Animated.View style={[s.sheet, { backgroundColor: colors.bgCard, maxHeight: SHEET_H, transform: [{ translateY: slideAnim }] }]}>
              <View style={s.sheetHandle}><View style={[s.handle, { backgroundColor: colors.border }]} /></View>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Indicatif pays</Text>
              <View style={[s.searchWrap, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={[s.searchInput, { color: colors.text }]}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Pays ou indicatif…"
                  placeholderTextColor={colors.textMuted}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={c => c.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.sheetRow, { borderBottomColor: colors.border }, item.code === selected.code && { backgroundColor: colors.primary + '12' }]}
                    onPress={() => dismiss(() => onSelect(item))}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sheetRowLabel, { color: colors.text }, item.code === selected.code && { color: colors.primary }]}>{item.name}</Text>
                      <Text style={[s.sheetRowSub, { color: colors.textMuted }]}>{item.dial} · {item.format}</Text>
                    </View>
                    {item.code === selected.code && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── PhoneField — formatage live + border animée + compteur (identique Register) ─
function PhoneField({ label, digits, country, onChangeDigits, onChangeCountry, required, optional, error, colors }) {
  const focusAnim = useRef(new Animated.Value(0)).current;
  const formatted = formatPhoneNumber(digits, country.format);
  const rawDigits = stripFormatting(digits);
  const isValid   = rawDigits.length === country.digits;
  const hasInput  = rawDigits.length > 0;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? '#FCA5A5' : (hasInput && !isValid ? '#FCA5A5' : colors.border),
      error ? '#EF4444' : (hasInput && !isValid ? '#EF4444' : colors.primary),
    ],
  });

  return (
    <View style={s.fieldWrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Ionicons name="call-outline" size={13} color={colors.textMuted} />
        <Text style={[s.label, { color: colors.textSub }]}>{label}</Text>
        {required && <Text style={{ fontSize: 12, color: '#EF4444' }}>*</Text>}
        {optional && <Text style={[s.optLabel, { color: colors.textMuted }]}>(optionnel)</Text>}
      </View>
      <Animated.View style={[s.phoneWrap, { borderColor }, hasInput && isValid && { borderColor: colors.primary }]}>
        <CountryPicker selected={country} onSelect={(c) => { onChangeCountry(c); onChangeDigits(''); }} colors={colors} />
        <View style={[s.phoneDivider, { backgroundColor: colors.border }]} />
        <TextInput
          style={[s.phoneInput, { color: colors.text }]}
          value={formatted}
          onChangeText={v => onChangeDigits(stripFormatting(v))}
          keyboardType="phone-pad"
          placeholder={country.format.replace(/X/g, '0')}
          placeholderTextColor={colors.textMuted}
          maxLength={country.format.length}
          onFocus={() => Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() =>  Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
        {hasInput && isValid  && <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginRight: 12 }} />}
        {hasInput && !isValid && <Text style={[s.phoneCounter, { color: colors.textMuted }]}>{rawDigits.length}/{country.digits}</Text>}
      </Animated.View>
      {(hasInput && !isValid) && !error && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={s.fieldError}>{country.digits} chiffres attendus pour {country.name}</Text>
        </View>
      )}
      {error && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={s.fieldError}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Champ texte générique ────────────────────────────────────────────────────
function Field({ label, value, onChangeText, error, placeholder, multiline, keyboardType, secureTextEntry, hint, required, optional, colors, editable = true, icon }) {
  const focusAnim  = useRef(new Animated.Value(0)).current;
  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? '#FCA5A5' : colors.border, error ? '#EF4444' : colors.primary],
  });

  return (
    <View style={s.fieldWrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {icon && <Ionicons name={icon} size={13} color={colors.textMuted} />}
        <Text style={[s.label, { color: colors.textSub }]}>{label}</Text>
        {required && <Text style={{ fontSize: 12, color: '#EF4444' }}>*</Text>}
        {optional && <Text style={[s.optLabel, { color: colors.textMuted }]}>(optionnel)</Text>}
      </View>
      <Animated.View style={[
        s.inputWrap,
        multiline && s.inputWrapMulti,
        { borderColor, backgroundColor: colors.bgHover },
        !editable && { opacity: 0.5 },
      ]}>
        <TextInput
          style={[s.input, multiline && s.inputMulti, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() =>  Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
      </Animated.View>
      {hint && !error && <Text style={[s.fieldHint, { color: colors.textMuted }]}>{hint}</Text>}
      {error && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={s.fieldError}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Sélecteur liste ─────────────────────────────────────────────────────────
function SelectField({ label, value, options, onChange, error, colors }) {
  const [mounted,  setMounted]  = useState(false);
  const [search,   setSearch]   = useState('');
  const slideAnim    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const current = options.find(o => o.value === value);

  const show = () => setMounted(true);
  useEffect(() => {
    if (!mounted) return;
    slideAnim.setValue(SHEET_H); backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim,    { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mounted]);
  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,       duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setSearch(''); cb?.(); });
  };
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={s.fieldWrap}>
      <Text style={[s.label, { color: colors.textSub }]}>{label}</Text>
      <TouchableOpacity
        style={[s.selectBtn, { backgroundColor: colors.bgHover, borderColor: error ? '#EF4444' : colors.border }]}
        onPress={show}
        activeOpacity={0.7}
      >
        <Text style={[s.selectBtnText, { color: current ? colors.text : colors.textMuted }]}>
          {current ? current.label : 'Sélectionner…'}
        </Text>
        <Ionicons name="chevron-down-outline" size={14} color={colors.textMuted} />
      </TouchableOpacity>
      {error && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={s.fieldError}>{error}</Text>
        </View>
      )}
      {mounted && (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
          <TouchableWithoutFeedback onPress={() => dismiss()}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.65)', opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>
          <View style={{ flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' }}>
            <Animated.View style={[s.sheet, { backgroundColor: colors.bgCard, maxHeight: SHEET_H, transform: [{ translateY: slideAnim }] }]}>
              <View style={s.sheetHandle}><View style={[s.handle, { backgroundColor: colors.border }]} /></View>
              <Text style={[s.sheetTitle, { color: colors.text }]}>{label}</Text>
              <View style={[s.searchWrap, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput style={[s.searchInput, { color: colors.text }]} value={search} onChangeText={setSearch} placeholder="Rechercher…" placeholderTextColor={colors.textMuted} />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={o => o.value}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.sheetRow, { borderBottomColor: colors.border }, item.value === value && { backgroundColor: colors.primary + '12' }]}
                    onPress={() => dismiss(() => onChange(item.value))}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.sheetRowLabel, { color: colors.text }, item.value === value && { color: colors.primary }]}>{item.label}</Text>
                    {item.value === value && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Données statiques ────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'mode',         label: 'Mode & Vêtements' },
  { value: 'electronique', label: 'Électronique' },
  { value: 'maison',       label: 'Maison & Jardin' },
  { value: 'beaute',       label: 'Beauté & Bien-être' },
  { value: 'sports',       label: 'Sports & Loisirs' },
  { value: 'artisanat',    label: 'Artisanat' },
  { value: 'bijoux',       label: 'Bijoux & Accessoires' },
  { value: 'alimentation', label: 'Alimentation' },
  { value: 'livres',       label: 'Livres & Médias' },
  { value: 'services',     label: 'Services' },
];

const STORE_TYPES = [
  { value: 'physique', label: 'Boutique Physique' },
  { value: 'enligne',  label: 'Boutique en Ligne' },
  { value: 'hybride',  label: 'Hybride (Physique & En ligne)' },
];

const BUSINESS_PROFILES = [
  { value: 'commercant', icon: '🏪', label: 'Commerçant', desc: 'Vous revendez des produits existants (alimentation, import…).' },
  { value: 'createur',   icon: '🎨', label: 'Créateur',   desc: 'Vous fabriquez vos propres produits (couture, bijoux, art…).' },
  { value: 'hybride',    icon: '🔄', label: 'Hybride',    desc: 'Vous combinez créations personnelles et revente.' },
];

const TABS = [
  { key: 'profil',       label: 'Profil',   icon: 'person-outline' },
  { key: 'boutique',     label: 'Boutique', icon: 'storefront-outline' },
  { key: 'localisation', label: 'Lieu',     icon: 'location-outline' },
  { key: 'contact',      label: 'Contact',  icon: 'globe-outline' },
];

// ═════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export default function SellerSettingsScreen() {
  const { colors } = useTheme();
  const { seller, updateSeller } = useAuthStore();
  const { isOffline } = useSync();
  const headerHeight = useHeaderHeight();

  const [activeTab, setActiveTab] = useState('profil');
  const pagerRef = useRef(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState({});

  // ── Champs texte ──────────────────────────────────────────────────────────
  const [name,             setName]             = useState('');
  const [userName2,        setUserName2]        = useState('');
  const [email,            setEmail]            = useState('');
  const [emailp,           setEmailp]           = useState('');
  const [storeName,        setStoreName]        = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [category,         setCategory]         = useState('');
  const [storeType,        setStoreType]        = useState('');
  const [businessProfile,  setBusinessProfile]  = useState('hybride');
  const [openingHours,     setOpeningHours]     = useState('');
  const [region,           setRegion]           = useState('');
  const [city,             setCity]             = useState('');
  const [address,          setAddress]          = useState('');
  const [postalCode,       setPostalCode]       = useState('');
  const [facebook,         setFacebook]         = useState('');
  const [instagram,        setInstagram]        = useState('');
  const [website,          setWebsite]          = useState('');

  // ── Téléphones — digits + country object (identique Register) ────────────
  const [phoneDigits,    setPhoneDigits]    = useState('');
  const [phoneCountry,   setPhoneCountry]   = useState(DEFAULT_COUNTRY);
  const [bizDigits,      setBizDigits]      = useState('');
  const [bizCountry,     setBizCountry]     = useState(DEFAULT_COUNTRY);
  const [waDigits,       setWaDigits]       = useState('');
  const [waCountry,      setWaCountry]      = useState(DEFAULT_COUNTRY);

  // ── Images ────────────────────────────────────────────────────────────────
  const [logoPreview,      setLogoPreview]      = useState(null);
  const [newLogoAsset,     setNewLogoAsset]     = useState(null);
  const [identityPreview,  setIdentityPreview]  = useState(null);
  const [newIdentityAsset, setNewIdentityAsset] = useState(null);
  const [isvalid,          setIsvalid]          = useState(false);

  // ── Mot de passe ──────────────────────────────────────────────────────────
  const [showPassword,    setShowPassword]    = useState(false);
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Hydratation ───────────────────────────────────────────────────────────
  const populate = useCallback((data) => {
    const ph = parsePhone(data.phone);
    const bh = parsePhone(data.businessPhone);
    const wh = parsePhone(data.whatsapp);
    setName(data.name || '');
    setUserName2(data.userName2 || '');
    setEmail(data.email || '');
    setEmailp(data.emailp || '');
    setStoreName(data.storeName || '');
    setStoreDescription(data.storeDescription || '');
    setCategory(data.category || '');
    setStoreType(data.storeType || '');
    setBusinessProfile(data.businessProfile || 'hybride');
    setOpeningHours(data.openingHours || '');
    setRegion(data.region || '');
    setCity(data.city || '');
    setAddress(data.address || '');
    setPostalCode(data.postalCode || '');
    setFacebook(data.facebook || '');
    setInstagram(data.instagram || '');
    setWebsite(data.website || '');
    setPhoneDigits(ph.digits);  setPhoneCountry(ph.country);
    setBizDigits(bh.digits);    setBizCountry(bh.country);
    setWaDigits(wh.digits);     setWaCountry(wh.country);
    setLogoPreview(data.logo || null);
    setIdentityPreview(data.ownerIdentity || null);
    setIsvalid(!!data.isvalid);
  }, []);

  useEffect(() => {
    const sellerId = seller?.id || seller?._id;
    if (!sellerId) { setLoading(false); return; }
    populate(seller);
    if (isOffline) { setLoading(false); return; }
    apiClient.get(`/getSeller/${sellerId}`)
      .then(r => { if (r.data?.data) populate(r.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  // ── Pickers image ─────────────────────────────────────────────────────────
  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Permission refusée' }); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8, allowsEditing: true, aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]) {
      setLogoPreview(res.assets[0].uri);
      setNewLogoAsset(res.assets[0]);
    }
  };

  const pickIdentity = async () => {
    if (isvalid) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Permission refusée' }); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      setIdentityPreview(res.assets[0].uri);
      setNewIdentityAsset(res.assets[0]);
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (name && name.length < 3)      e.name     = 'Minimum 3 caractères.';
    if (userName2 && userName2.length < 2) e.userName2 = 'Minimum 2 caractères.';
    if (email && !emailReg.test(email)) e.email   = 'Adresse e-mail invalide.';
    if (emailp && !emailReg.test(emailp)) e.emailp = 'Email secondaire invalide.';
    const pd = stripFormatting(phoneDigits);
    if (pd && pd.length !== phoneCountry.digits) e.phone = `${phoneCountry.digits} chiffres attendus pour ${phoneCountry.name}.`;
    const bd = stripFormatting(bizDigits);
    if (bd && bd.length !== bizCountry.digits)   e.businessPhone = `${bizCountry.digits} chiffres attendus pour ${bizCountry.name}.`;
    const wd = stripFormatting(waDigits);
    if (wd && wd.length !== waCountry.digits)     e.whatsapp = `${waCountry.digits} chiffres attendus pour ${waCountry.name}.`;
    if (storeDescription && storeDescription.length < 20) e.storeDescription = 'Minimum 20 caractères.';
    if (showPassword) {
      if (password && password.length < 6) e.password = 'Minimum 6 caractères.';
      if (password !== confirmPassword)    e.confirmPassword = 'Les mots de passe ne correspondent pas.';
    }
    ['website', 'facebook', 'instagram'].forEach(f => {
      const val = f === 'website' ? website : f === 'facebook' ? facebook : instagram;
      if (val && !/^https?:\/\/[^\s/$.?#].[^\s]*$/.test(val)) e[f] = 'URL invalide — utilisez https://…';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Soumission ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isOffline) { Toast.show({ type: 'error', text1: 'Hors ligne', text2: 'Reconnectez-vous pour sauvegarder.' }); return; }
    if (!validate()) { Toast.show({ type: 'error', text1: 'Formulaire invalide', text2: 'Corrigez les erreurs.' }); return; }
    const sellerId = seller?.id || seller?._id;
    if (!sellerId) return;
    setSaving(true);
    try {
      const form = new FormData();
      const pd = stripFormatting(phoneDigits);
      const bd = stripFormatting(bizDigits);
      const wd = stripFormatting(waDigits);
      const fields = {
        name, userName2, email, emailp,
        phone:         pd ? `${phoneCountry.dial}${pd}` : '',
        storeName, storeDescription, category, storeType, businessProfile, openingHours,
        region, city, address, postalCode,
        businessPhone: bd ? `${bizCountry.dial}${bd}` : '',
        whatsapp:      wd ? `${waCountry.dial}${wd}` : '',
        facebook, instagram, website,
      };
      if (showPassword && password) fields.password = password;
      Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) form.append(k, v); });
      if (newLogoAsset) {
        form.append('logo', { uri: newLogoAsset.uri, name: newLogoAsset.fileName || 'logo.jpg', type: newLogoAsset.mimeType || 'image/jpeg' });
      }
      if (newIdentityAsset && !isvalid) {
        form.append('ownerIdentity', { uri: newIdentityAsset.uri, name: newIdentityAsset.fileName || 'identity.jpg', type: newIdentityAsset.mimeType || 'image/jpeg' });
      }
      const res = await apiClient.put(`/updateSeller/${sellerId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.status === 200) {
        const fresh = await apiClient.get(`/getSeller/${sellerId}`);
        if (fresh.data?.data) { populate(fresh.data.data); updateSeller(fresh.data.data); }
        Toast.show({ type: 'success', text1: 'Profil mis à jour', text2: 'Modifications enregistrées.' });
        setPassword(''); setConfirmPassword(''); setShowPassword(false);
        setNewLogoAsset(null); setNewIdentityAsset(null); setErrors({});
      }
    } catch (err) {
      if (err.response?.data?.errors) {
        const apiErrors = {};
        err.response.data.errors.forEach(e => { apiErrors[e.field] = e.message; });
        setErrors(apiErrors);
      } else if (err.response?.data?.error) {
        const { field, message } = err.response.data.error;
        setErrors({ [field]: message });
      }
      Toast.show({ type: 'error', text1: 'Erreur', text2: err.response?.data?.message || 'Impossible de sauvegarder.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[s.loadingText, { color: colors.textMuted }]}>Chargement du profil…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={Platform.OS === 'android' ? headerHeight : 0}
    >

      {isOffline && (
        <View style={[s.offlineBanner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
          <Text style={[s.offlineBannerText, { color: colors.textMuted }]}>
            Hors ligne — données affichées depuis le cache local. La sauvegarde sera disponible en ligne.
          </Text>
        </View>
      )}

      {isvalid && (
        <View style={[s.infoBanner, { backgroundColor: colors.bgHover, borderColor: colors.primary + '30' }]}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
          <Text style={[s.infoBannerText, { color: colors.primary }]}>
            Compte validé — la pièce d'identité ne peut pas être modifiée.
          </Text>
        </View>
      )}

      {/* Onglets */}
      <View style={[s.tabBar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        {TABS.map((tab, i) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => {
                setActiveTab(tab.key);
                pagerRef.current?.scrollTo({ x: i * W, animated: true });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name={tab.icon} size={15} color={active ? colors.primary : colors.textMuted} />
              <Text style={[s.tabLabel, { color: active ? colors.primary : colors.textMuted, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Pager horizontal */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setActiveTab(TABS[idx]?.key ?? 'profil');
        }}
        style={{ flex: 1 }}
      >
        {/* ── PAGE PROFIL ──────────────────────────────────────────────────── */}
        <ScrollView
          style={{ width: W }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={s.section}>
            <SectionCard title="Informations personnelles" icon="person-outline" colors={colors}>

              {/* Logo */}
              <View style={s.logoWrap}>
                <TouchableOpacity onPress={pickLogo} activeOpacity={0.8} style={s.logoTouchable}>
                  {logoPreview
                    ? <CachedImage uri={logoPreview} style={s.logoImg} contentFit="cover" />
                    : <View style={[s.logoPlaceholder, { backgroundColor: colors.bgHover }]}>
                        <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                      </View>
                  }
                  <View style={[s.logoCameraBtn, { backgroundColor: colors.primary }]}>
                    <Ionicons name="camera-outline" size={13} color="#fff" />
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[s.logoLabel, { color: colors.text }]}>Logo de boutique</Text>
                  <Text style={[s.logoHint, { color: colors.textMuted }]}>JPG ou PNG</Text>
                  <TouchableOpacity style={[s.uploadBtn, { borderColor: colors.primary }]} onPress={pickLogo} activeOpacity={0.7}>
                    <Ionicons name="cloud-upload-outline" size={13} color={colors.primary} />
                    <Text style={[s.uploadBtnText, { color: colors.primary }]}>
                      {newLogoAsset ? 'Nouveau logo sélectionné' : 'Choisir une image'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Nom" value={name} onChangeText={setName} error={errors.name} required colors={colors} icon="person-outline" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Prénom" value={userName2} onChangeText={setUserName2} error={errors.userName2} required colors={colors} icon="person-outline" />
                </View>
              </View>

              <Field
                label="Email principal" icon="mail-outline" required
                value={email}
                onChangeText={v => { setEmail(v.trim().toLowerCase()); setErrors(prev => ({ ...prev, email: undefined })); }}
                error={errors.email} keyboardType="email-address" colors={colors}
              />
              <Field
                label="Email secondaire" icon="mail-outline" optional
                value={emailp}
                onChangeText={v => { setEmailp(v.trim().toLowerCase()); setErrors(prev => ({ ...prev, emailp: undefined })); }}
                error={errors.emailp} keyboardType="email-address" placeholder="pro@maboutique.com" colors={colors}
              />

              <PhoneField
                label="Téléphone personnel" required
                digits={phoneDigits} country={phoneCountry}
                onChangeDigits={v => { setPhoneDigits(v); setErrors(prev => ({ ...prev, phone: undefined })); }}
                onChangeCountry={setPhoneCountry}
                error={errors.phone} colors={colors}
              />
            </SectionCard>

            {/* Pièce d'identité */}
            <SectionCard title="Pièce d'identité" icon="card-outline" colors={colors}>
              <View style={[s.identityStatus, { backgroundColor: isvalid ? colors.bgHover : '#FEF3C7', borderColor: isvalid ? colors.border : '#FDE68A' }]}>
                <Ionicons name={isvalid ? 'lock-closed-outline' : 'pencil-outline'} size={14} color={isvalid ? colors.textMuted : '#D97706'} />
                <Text style={[s.identityStatusText, { color: isvalid ? colors.textMuted : '#92400E' }]}>
                  {isvalid ? 'Document verrouillé — compte validé' : 'Modification autorisée — compte en attente'}
                </Text>
              </View>
              {identityPreview && <CachedImage uri={identityPreview} style={s.identityPreview} contentFit="cover" />}
              <TouchableOpacity
                style={[s.uploadArea, { borderColor: isvalid ? colors.border : colors.primary, backgroundColor: isvalid ? colors.bgHover : colors.primary + '08', opacity: isvalid ? 0.5 : 1 }]}
                onPress={pickIdentity} disabled={isvalid} activeOpacity={0.7}
              >
                <Ionicons name="cloud-upload-outline" size={22} color={isvalid ? colors.textMuted : colors.primary} />
                <Text style={[s.uploadAreaTitle, { color: isvalid ? colors.textMuted : colors.text }]}>
                  {newIdentityAsset ? 'Nouveau document sélectionné' : (identityPreview ? 'Remplacer le document' : 'Ajouter un document')}
                </Text>
                <Text style={[s.uploadAreaSub, { color: colors.textMuted }]}>JPG · PNG</Text>
              </TouchableOpacity>
              {newIdentityAsset && (
                <Text style={[s.fieldHint, { color: '#10B981' }]}>✓ {newIdentityAsset.fileName || 'Document sélectionné'} — sera envoyé à la sauvegarde</Text>
              )}
            </SectionCard>

            {/* Sécurité */}
            <SectionCard title="Sécurité du compte" icon="shield-outline" colors={colors}>
              <TouchableOpacity
                style={[s.togglePasswordBtn, { borderColor: colors.border, backgroundColor: colors.bgHover }]}
                onPress={() => setShowPassword(p => !p)} activeOpacity={0.7}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'key-outline'} size={15} color={colors.primary} />
                <Text style={[s.togglePasswordText, { color: colors.primary }]}>
                  {showPassword ? 'Annuler le changement' : 'Changer le mot de passe'}
                </Text>
              </TouchableOpacity>
              {showPassword && (
                <View style={s.passwordFields}>
                  <Field label="Nouveau mot de passe" icon="lock-closed-outline" value={password} onChangeText={setPassword} error={errors.password} secureTextEntry hint="Minimum 6 caractères" colors={colors} />
                  <Field label="Confirmer le mot de passe" icon="lock-closed-outline" value={confirmPassword} onChangeText={setConfirmPassword} error={errors.confirmPassword} secureTextEntry colors={colors} />
                </View>
              )}
            </SectionCard>

          </View>
          <SaveButton saving={saving} isOffline={isOffline} onPress={handleSave} colors={colors} />
        </ScrollView>

        {/* ── PAGE BOUTIQUE ────────────────────────────────────────────────── */}
        <ScrollView
          style={{ width: W }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={s.section}>
            <SectionCard title="Informations de la boutique" icon="storefront-outline" colors={colors}>
              <Field label="Nom de la boutique" icon="storefront-outline" value={storeName} onChangeText={setStoreName} error={errors.storeName} required colors={colors} />
              <Field label="Description" icon="document-text-outline" value={storeDescription} onChangeText={setStoreDescription} error={errors.storeDescription} multiline hint="Minimum 20 caractères" required colors={colors} />
              <SelectField label="Catégorie" value={category} options={CATEGORIES} onChange={setCategory} error={errors.category} colors={colors} />
              <SelectField label="Type de boutique" value={storeType} options={STORE_TYPES} onChange={setStoreType} error={errors.storeType} colors={colors} />
              <View style={s.fieldWrap}>
                <Text style={[s.label, { color: colors.textSub }]}>Profil d'activité</Text>
                <View style={s.profileGrid}>
                  {BUSINESS_PROFILES.map(p => {
                    const sel = businessProfile === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[s.profileCard, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary + '10' : colors.bgHover }]}
                        onPress={() => setBusinessProfile(p.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={s.profileIcon}>{p.icon}</Text>
                        <Text style={[s.profileLabel, { color: colors.text }]}>{p.label}</Text>
                        {sel && <View style={[s.profileCheck, { backgroundColor: colors.primary }]}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {businessProfile && <Text style={[s.profileDesc, { color: colors.textMuted }]}>{BUSINESS_PROFILES.find(p => p.value === businessProfile)?.desc}</Text>}
              </View>
              <Field label="Heures d'ouverture" icon="time-outline" value={openingHours} onChangeText={setOpeningHours} placeholder="Lun-Ven: 9h-18h, Sam: 10h-16h" colors={colors} optional />
            </SectionCard>
          </View>
          <SaveButton saving={saving} isOffline={isOffline} onPress={handleSave} colors={colors} />
        </ScrollView>

        {/* ── PAGE LOCALISATION ───────────────────────────────────────────── */}
        <ScrollView
          style={{ width: W }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={s.section}>
            <SectionCard title="Localisation" icon="location-outline" colors={colors}>
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Pays" icon="earth-outline" value={region} onChangeText={setRegion} error={errors.region} required colors={colors} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Région / Ville" icon="map-outline" value={city} onChangeText={setCity} error={errors.city} required colors={colors} />
                </View>
              </View>
              <Field label="Adresse" icon="location-outline" value={address} onChangeText={setAddress} error={errors.address} colors={colors} optional />
              <Field label="Code postal" icon="mail-outline" value={postalCode} onChangeText={setPostalCode} error={errors.postalCode} keyboardType="numeric" colors={colors} optional />
            </SectionCard>
          </View>
          <SaveButton saving={saving} isOffline={isOffline} onPress={handleSave} colors={colors} />
        </ScrollView>

        {/* ── PAGE CONTACT ────────────────────────────────────────────────── */}
        <ScrollView
          style={{ width: W }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={s.section}>
            <SectionCard title="Coordonnées professionnelles" icon="call-outline" colors={colors}>
              <PhoneField
                label="Téléphone professionnel" required
                digits={bizDigits} country={bizCountry}
                onChangeDigits={v => { setBizDigits(v); setErrors(prev => ({ ...prev, businessPhone: undefined })); }}
                onChangeCountry={setBizCountry}
                error={errors.businessPhone} colors={colors}
              />
              <PhoneField
                label="WhatsApp" optional
                digits={waDigits} country={waCountry}
                onChangeDigits={v => { setWaDigits(v); setErrors(prev => ({ ...prev, whatsapp: undefined })); }}
                onChangeCountry={setWaCountry}
                error={errors.whatsapp} colors={colors}
              />
            </SectionCard>
            <SectionCard title="Réseaux sociaux & web" icon="globe-outline" colors={colors}>
              <Field label="Facebook" icon="logo-facebook" value={facebook} onChangeText={setFacebook} error={errors.facebook} placeholder="https://facebook.com/…" keyboardType="url" colors={colors} optional />
              <Field label="Instagram" icon="logo-instagram" value={instagram} onChangeText={setInstagram} error={errors.instagram} placeholder="https://instagram.com/…" keyboardType="url" colors={colors} optional />
              <Field label="Site web" icon="globe-outline" value={website} onChangeText={setWebsite} error={errors.website} placeholder="https://…" keyboardType="url" colors={colors} optional />
            </SectionCard>
          </View>
          <SaveButton saving={saving} isOffline={isOffline} onPress={handleSave} colors={colors} />
        </ScrollView>

      </ScrollView>{/* fin pager horizontal */}
    </KeyboardAvoidingView>
  );
}

// ─── Bouton sauvegarder (réutilisé dans chaque page) ─────────────────────────
function SaveButton({ saving, isOffline, onPress, colors }) {
  return (
    <TouchableOpacity
      style={[s.saveBtn, { backgroundColor: colors.primary, opacity: (saving || isOffline) ? 0.55 : 1 }]}
      onPress={onPress} disabled={saving || isOffline} activeOpacity={0.8}
    >
      {saving
        ? <ActivityIndicator size="small" color="#fff" />
        : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={s.saveBtnText}>Enregistrer les modifications</Text></>
      }
    </TouchableOpacity>
  );
}

// ─── Card section ─────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, colors }) {
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[s.cardHead, { borderBottomColor: colors.border }]}>
        <Ionicons name={icon} size={15} color={colors.primary} />
        <Text style={[s.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13 },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  offlineBannerText: { fontSize: 12, flex: 1 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  infoBannerText: { fontSize: 12, flex: 1, fontWeight: '600' },

  tabBar:  { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:{ fontSize: 11 },

  scroll:  { padding: 14, gap: 14, paddingBottom: 120 },
  section: { gap: 14 },

  card:      { borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2, overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: 12, borderBottomWidth: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardBody:  { padding: 14, gap: 14 },

  row2: { flexDirection: 'row', gap: 10 },

  fieldWrap: { gap: 0 },
  label:     { fontSize: 12, fontWeight: '700' },
  optLabel:  { fontSize: 11, fontStyle: 'italic' },

  // Input générique (wrapped dans Animated.View)
  inputWrap:      { borderWidth: 1.5, borderRadius: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  inputWrapMulti: { alignItems: 'flex-start', minHeight: 96 },
  input:          { flex: 1, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14 },
  inputMulti:     { paddingTop: 10, textAlignVertical: 'top' },

  fieldHint:  { fontSize: 11, marginTop: 4 },
  errorRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  fieldError: { fontSize: 12, color: '#DC2626', fontWeight: '500' },

  // Téléphone
  phoneWrap:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, overflow: 'hidden', minHeight: 48 },
  dialBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 0 },
  dialFlag:      { fontSize: 18 },
  dialCode:      { fontSize: 12, fontWeight: '700' },
  phoneDivider:  { width: 1, height: 28 },
  phoneInput:    { flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 14 },
  phoneCounter:  { fontSize: 11, marginRight: 12 },

  // Select
  selectBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  selectBtnText: { fontSize: 14, flex: 1 },

  // Bottom sheet (CountryPicker + SelectField)
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
  sheetHandle:  { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:       { width: 40, height: 4, borderRadius: 2 },
  sheetTitle:   { fontSize: 16, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 10 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 14, paddingVertical: 0 },
  sheetRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetRowLabel:{ flex: 1, fontSize: 14, fontWeight: '500' },
  sheetRowSub:  { fontSize: 12, marginTop: 1 },

  // Logo
  logoWrap:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoTouchable:   { position: 'relative' },
  logoImg:         { width: 72, height: 72, borderRadius: 16 },
  logoPlaceholder: { width: 72, height: 72, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  logoCameraBtn:   { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  logoLabel:       { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  logoHint:        { fontSize: 11, marginBottom: 8 },
  uploadBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', borderStyle: 'dashed' },
  uploadBtnText:   { fontSize: 12, fontWeight: '600' },

  // Pièce identité
  identityStatus:     { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 8, borderWidth: 1, padding: 10 },
  identityStatusText: { fontSize: 12, flex: 1, fontWeight: '600' },
  identityPreview:    { width: '100%', height: 180, borderRadius: 12 },
  uploadArea:         { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center', gap: 6 },
  uploadAreaTitle:    { fontSize: 13, fontWeight: '700' },
  uploadAreaSub:      { fontSize: 11 },

  // Mot de passe
  togglePasswordBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  togglePasswordText: { fontSize: 13, fontWeight: '600' },
  passwordFields:     { gap: 14 },

  // Profil activité
  profileGrid: { flexDirection: 'row', gap: 8, marginTop: 6 },
  profileCard: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: 'center', gap: 4, position: 'relative' },
  profileIcon: { fontSize: 22 },
  profileLabel:{ fontSize: 10, fontWeight: '700', textAlign: 'center' },
  profileCheck:{ position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  profileDesc: { fontSize: 11, lineHeight: 16, marginTop: 2 },

  // Bouton sauvegarde
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
