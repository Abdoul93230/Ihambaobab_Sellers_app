import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, StatusBar, Modal, FlatList, Animated,
  TouchableWithoutFeedback, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { BACKEND_URL } from '../config/constants';

const { width: W } = Dimensions.get('window');

// ─── Couleurs de marque ───────────────────────────────────────────────────────
const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DARK      = '#0F172A';
const MUTED     = '#64748B';
const BORDER    = '#E2E8F0';
const BG        = '#F8FAFC';
const WHITE     = '#FFFFFF';

// ─── Dégradés par étape — palette marque uniquement ─────────────────────────
const STEP_GRADIENTS = [
  ['#30A08B', '#1D7A6A'],   // turquoise profond
  ['#B17236', '#8B5A2B'],   // bois de baobab
  ['#B2905F', '#8B6B3A'],   // sable sahara
  ['#3AB39D', '#30A08B'],   // turquoise clair → profond
  ['#30A08B', '#B17236'],   // turquoise → bois (dégradé héro de marque)
];

// ─── Pays ─────────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: 'NE', name: 'Niger',          dial: '+227', flag: '🇳🇪', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BF', name: 'Burkina Faso',   dial: '+226', flag: '🇧🇫', format: 'XX XX XX XX',    digits: 8 },
  { code: 'ML', name: 'Mali',           dial: '+223', flag: '🇲🇱', format: 'XX XX XX XX',    digits: 8 },
  { code: 'SN', name: 'Sénégal',        dial: '+221', flag: '🇸🇳', format: 'XX XXX XX XX',   digits: 9 },
  { code: 'CI', name: "Côte d'Ivoire",  dial: '+225', flag: '🇨🇮', format: 'XX XX XX XX XX', digits: 10 },
  { code: 'GH', name: 'Ghana',          dial: '+233', flag: '🇬🇭', format: 'XX XXX XXXX',    digits: 9 },
  { code: 'NG', name: 'Nigeria',        dial: '+234', flag: '🇳🇬', format: 'XXX XXX XXXX',   digits: 10 },
  { code: 'CM', name: 'Cameroun',       dial: '+237', flag: '🇨🇲', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'TG', name: 'Togo',           dial: '+228', flag: '🇹🇬', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BJ', name: 'Bénin',          dial: '+229', flag: '🇧🇯', format: 'XX XX XX XX',    digits: 8 },
  { code: 'GN', name: 'Guinée',         dial: '+224', flag: '🇬🇳', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'MR', name: 'Mauritanie',     dial: '+222', flag: '🇲🇷', format: 'XX XX XX XX',    digits: 8 },
  { code: 'FR', name: 'France',         dial: '+33',  flag: '🇫🇷', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'MA', name: 'Maroc',          dial: '+212', flag: '🇲🇦', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'DZ', name: 'Algérie',        dial: '+213', flag: '🇩🇿', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'TN', name: 'Tunisie',        dial: '+216', flag: '🇹🇳', format: 'XX XXX XXX',     digits: 8 },
  { code: 'US', name: 'États-Unis',     dial: '+1',   flag: '🇺🇸', format: 'XXX XXX XXXX',   digits: 10 },
];

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

// ─── Données statiques ────────────────────────────────────────────────────────
const BUSINESS_CATEGORIES = [
  { value: 'mode',         label: 'Mode',           icon: '👗' },
  { value: 'electronique', label: 'Électronique',   icon: '📱' },
  { value: 'maison',       label: 'Maison',         icon: '🏠' },
  { value: 'beaute',       label: 'Beauté',         icon: '💄' },
  { value: 'sports',       label: 'Sports',         icon: '⚽' },
  { value: 'artisanat',    label: 'Artisanat',      icon: '🎨' },
  { value: 'bijoux',       label: 'Bijoux',         icon: '💍' },
  { value: 'alimentation', label: 'Alimentaire',    icon: '🍎' },
  { value: 'livres',       label: 'Livres',         icon: '📚' },
  { value: 'services',     label: 'Services',       icon: '💼' },
  { value: 'autre',        label: 'Autre',          icon: '✏️' },
];

const STORE_TYPES = [
  { value: 'physique', label: 'Physique',   icon: 'storefront-outline',      desc: 'Boutique\nphysique' },
  { value: 'enligne',  label: 'En ligne',   icon: 'globe-outline',           desc: 'Commerce\ndigital' },
  { value: 'hybride',  label: 'Hybride',    icon: 'swap-horizontal-outline', desc: 'Les deux\ncanaux' },
];

const BUSINESS_PROFILES = [
  { value: 'commercant', icon: '🏪', label: 'Commerçant', desc: 'Vous revendez des produits existants.', examples: 'Épicerie · Import/Export', color: '#B17236', bg: '#FBF4EC' },
  { value: 'createur',   icon: '🎨', label: 'Artisan',    desc: 'Vous fabriquez ou créez vos produits.', examples: 'Tisserand · Bijoutier', color: '#B2905F', bg: '#F9F1E8' },
  { value: 'hybride',    icon: '🔄', label: 'Hybride',    desc: 'Créations ET produits importés.', examples: 'Boutique mode + import', color: '#30A08B', bg: '#E6F5F2' },
];

const PAYS_DATA = [
  { name: 'Niger',          flag: '🇳🇪', regions: ['Agadez', 'Diffa', 'Dosso', 'Maradi', 'Niamey', 'Tahoua', 'Tillabéri', 'Zinder'] },
  { name: 'Burkina Faso',   flag: '🇧🇫', regions: ['Boucle du Mouhoun', 'Cascades', 'Centre (Ouagadougou)', 'Centre-Est', 'Centre-Nord', 'Centre-Ouest', 'Centre-Sud', 'Est', 'Hauts-Bassins (Bobo-Dioulasso)', 'Nord', 'Plateau Central', 'Sahel', 'Sud-Ouest'] },
  { name: 'Mali',           flag: '🇲🇱', regions: ['Bamako', 'Gao', 'Kayes', 'Kidal', 'Koulikoro', 'Mopti', 'Ségou', 'Sikasso', 'Taoudenit', 'Ménaka'] },
  { name: 'Sénégal',        flag: '🇸🇳', regions: ['Dakar', 'Diourbel', 'Fatick', 'Kaffrine', 'Kaolack', 'Kédougou', 'Kolda', 'Louga', 'Matam', 'Saint-Louis', 'Sédhiou', 'Tambacounda', 'Thiès', 'Ziguinchor'] },
  { name: "Côte d'Ivoire",  flag: '🇨🇮', regions: ['Abidjan', 'Bas-Sassandra', 'Comoé', 'Denguélé', 'Gôh-Djiboua', 'Lacs', 'Lagunes', 'Montagnes', 'Sassandra-Marahoué', 'Savanes', 'Vallée du Bandama', 'Woroba', 'Yamoussoukro', 'Zanzan'] },
  { name: 'Nigeria',        flag: '🇳🇬', regions: ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger State', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'] },
  { name: 'Ghana',          flag: '🇬🇭', regions: ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'] },
  { name: 'Togo',           flag: '🇹🇬', regions: ['Centrale', 'Kara', 'Maritime', 'Plateaux', 'Savanes'] },
  { name: 'Bénin',          flag: '🇧🇯', regions: ['Alibori', 'Atacora', 'Atlantique', 'Borgou', 'Collines', 'Couffo', 'Donga', 'Littoral (Cotonou)', 'Mono', 'Ouémé', 'Plateau', 'Zou'] },
  { name: 'Cameroun',       flag: '🇨🇲', regions: ['Adamaoua', 'Centre (Yaoundé)', 'Est', 'Extrême-Nord', 'Littoral (Douala)', 'Nord', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Ouest'] },
  { name: 'Guinée',         flag: '🇬🇳', regions: ['Boké', 'Conakry', 'Faranah', 'Kankan', 'Kindia', 'Labé', 'Mamou', 'Nzérékoré'] },
  { name: 'Mauritanie',     flag: '🇲🇷', regions: ['Adrar', 'Assaba', 'Brakna', 'Dakhlet Nouadhibou', 'Gorgol', 'Guidimaka', 'Hodh Ech Chargui', 'Hodh El Gharbi', 'Inchiri', 'Nouakchott Nord', 'Nouakchott Ouest', 'Nouakchott Sud', 'Tagant', 'Tiris Zemmour', 'Trarza'] },
  { name: 'France',         flag: '🇫🇷', regions: ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur"] },
  { name: 'Maroc',          flag: '🇲🇦', regions: ['Casablanca-Settat', 'Dakhla-Oued Ed-Dahab', 'Drâa-Tafilalet', 'Fès-Meknès', 'Guelmim-Oued Noun', 'Laâyoune-Sakia El Hamra', "L'Oriental", 'Marrakech-Safi', 'Rabat-Salé-Kénitra', 'Souss-Massa', 'Tanger-Tétouan-Al Hoceïma'] },
  { name: 'Algérie',        flag: '🇩🇿', regions: ['Adrar', 'Aïn Defla', 'Aïn Témouchent', 'Alger', 'Annaba', 'Batna', 'Béchar', 'Béjaïa', 'Biskra', 'Blida', 'Bordj Bou Arréridj', 'Bouira', 'Boumerdès', 'Chlef', 'Constantine', 'Djelfa', 'El Bayadh', 'El Oued', 'El Tarf', 'Ghardaïa', 'Guelma', 'Illizi', 'Jijel', 'Khenchela', 'Laghouat', 'Mascara', 'Médéa', 'Mila', 'Mostaganem', 'Msila', 'Naâma', 'Oran', 'Ouargla', 'Oum El Bouaghi', 'Relizane', 'Saïda', 'Sétif', 'Sidi Bel Abbès', 'Skikda', 'Souk Ahras', 'Tamanrasset', 'Tébessa', 'Tiaret', 'Tindouf', 'Tipaza', 'Tissemsilt', 'Tizi Ouzou', 'Tlemcen'] },
];

const getPaysFlag    = (name) => PAYS_DATA.find(p => p.name === name)?.flag    || '🌍';
const getPaysRegions = (name) => PAYS_DATA.find(p => p.name === name)?.regions || [];

const TOTAL_STEPS = 5;
const STEP_META = [
  { title: 'Identité',    subtitle: 'Vos informations personnelles',           icon: 'person-outline' },
  { title: 'Boutique',    subtitle: 'Décrivez votre activité',                 icon: 'storefront-outline' },
  { title: 'Localisation',subtitle: 'Où se trouve votre boutique ?',           icon: 'location-outline' },
  { title: 'Contact',     subtitle: 'Coordonnées et documents',                icon: 'document-text-outline' },
  { title: 'Sécurité',    subtitle: 'Mot de passe et récapitulatif',           icon: 'shield-checkmark-outline' },
];

const SHEET_H = Dimensions.get('window').height * 0.72;

// ═══════════════════════════════════════════════════════════════════════════════
// STEPPER PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════
function Stepper({ current, total, gradients }) {
  const progressAnim = useRef(new Animated.Value((current - 1) / (total - 1))).current;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: (current - 1) / (total - 1),
      tension: 80, friction: 14, useNativeDriver: false,
    }).start();
  }, [current]);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={st.stepper}>
      {/* Track de fond */}
      <View style={st.stepperTrack}>
        <Animated.View style={[st.stepperFill, { width: barWidth, backgroundColor: gradients[current - 1][0] }]} />
      </View>
      {/* Noeuds */}
      {Array.from({ length: total }, (_, i) => {
        const done    = i + 1 < current;
        const active  = i + 1 === current;
        const color   = gradients[i][0];
        const pct     = (i / (total - 1)) * 100;
        return (
          <View key={i} style={[st.stepNode, { left: `${pct}%`, marginLeft: i === 0 ? 0 : i === total - 1 ? -20 : -10 }]}>
            <LinearGradient
              colors={done || active ? gradients[i] : ['#E2E8F0', '#CBD5E1']}
              style={[st.stepDot, active && st.stepDotActive]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              {done
                ? <Ionicons name="checkmark" size={10} color="#fff" />
                : <Text style={[st.stepNum, { color: active ? '#fff' : '#94A3B8' }]}>{i + 1}</Text>
              }
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOTTOM SHEET PICKER (Pays / Région)
// ═══════════════════════════════════════════════════════════════════════════════
function ListPickerSheet({ visible, title, items, selected, onSelect, onClose, isPays }) {
  const [mounted, setMounted] = useState(false);
  const [search,  setSearch]  = useState('');
  const slideAnim    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

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
    ]).start(() => { setMounted(false); setSearch(''); onClose(); cb?.(); });
  };

  const filtered = items.filter(i =>
    isPays ? i.name.toLowerCase().includes(search.toLowerCase())
           : i.toLowerCase().includes(search.toLowerCase())
  );

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
      <TouchableWithoutFeedback onPress={() => dismiss()}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.65)', opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>
      <View style={{ flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' }}>
        <Animated.View style={[st.sheet, { maxHeight: SHEET_H, transform: [{ translateY: slideAnim }] }]}>
          <View style={st.sheetHandle}><View style={st.handle} /></View>
          <Text style={st.sheetTitle}>{title}</Text>
          <View style={st.searchWrap}>
            <Ionicons name="search-outline" size={16} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput style={st.searchInput} value={search} onChangeText={setSearch} placeholder="Rechercher…" placeholderTextColor={MUTED} />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={i => isPays ? i.name : i}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const label    = isPays ? item.name : item;
              const isActive = label === selected;
              return (
                <TouchableOpacity
                  style={[st.sheetRow, isActive && { backgroundColor: PRIMARY + '12' }]}
                  onPress={() => dismiss(() => onSelect(label))}
                  activeOpacity={0.7}
                >
                  {isPays && <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>}
                  <View style={{ flex: 1 }}>
                    <Text style={[st.sheetRowLabel, isActive && { color: PRIMARY }]}>{label}</Text>
                    {isPays && <Text style={st.sheetRowSub}>{item.regions.length} régions</Text>}
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: BORDER }} />}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PICKER INDICATIF TÉLÉPHONIQUE
// ═══════════════════════════════════════════════════════════════════════════════
function CountryPicker({ selected, onSelect }) {
  const [mounted, setMounted] = useState(false);
  const [search,  setSearch]  = useState('');
  const slideAnim    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

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

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );

  return (
    <>
      <TouchableOpacity style={st.dialBtn} onPress={show} activeOpacity={0.7}>
        <Text style={st.dialFlag}>{selected.flag}</Text>
        <Text style={st.dialCode}>{selected.dial}</Text>
        <Ionicons name="chevron-down" size={11} color={MUTED} />
      </TouchableOpacity>

      {mounted && (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
          <TouchableWithoutFeedback onPress={() => dismiss()}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.65)', opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>
          <View style={{ flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' }}>
            <Animated.View style={[st.sheet, { maxHeight: SHEET_H, transform: [{ translateY: slideAnim }] }]}>
              <View style={st.sheetHandle}><View style={st.handle} /></View>
              <Text style={st.sheetTitle}>Indicatif pays</Text>
              <View style={st.searchWrap}>
                <Ionicons name="search-outline" size={16} color={MUTED} style={{ marginRight: 8 }} />
                <TextInput style={st.searchInput} value={search} onChangeText={setSearch} placeholder="Pays ou indicatif…" placeholderTextColor={MUTED} />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={MUTED} />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={c => c.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[st.sheetRow, item.code === selected.code && { backgroundColor: PRIMARY + '12' }]}
                    onPress={() => dismiss(() => onSelect(item))}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.sheetRowLabel, item.code === selected.code && { color: PRIMARY }]}>{item.name}</Text>
                      <Text style={st.sheetRowSub}>{item.dial} · {item.format}</Text>
                    </View>
                    {item.code === selected.code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: BORDER }} />}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAMP INPUT PREMIUM (avec focus animé)
// ═══════════════════════════════════════════════════════════════════════════════
function PremiumInput({ label, icon, required, optional, error, hint, children }) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? '#FCA5A5' : BORDER, error ? '#EF4444' : PRIMARY],
  });
  const shadowOpacity = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });

  return (
    <View style={{ marginBottom: 18 }}>
      {label && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          {icon && <Ionicons name={icon} size={13} color={error ? '#EF4444' : MUTED} />}
          <Text style={[st.label, error && { color: '#DC2626' }]}>{label}</Text>
          {required && <Text style={st.required}>*</Text>}
          {optional && <Text style={st.optional}>(optionnel)</Text>}
        </View>
      )}
      <Animated.View style={[st.inputWrap, { borderColor, shadowOpacity, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, elevation: 0 }]}>
        {React.Children.map(children, child =>
          child ? React.cloneElement(child, {
            onFocus: (e) => { Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start(); child.props.onFocus?.(e); },
            onBlur:  (e) => { Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(); child.props.onBlur?.(e); },
          }) : null
        )}
      </Animated.View>
      {error && (
        <View style={st.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={st.fieldError}>{error}</Text>
        </View>
      )}
      {hint && !error && <Text style={st.fieldHint}>{hint}</Text>}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAMP TÉLÉPHONE
// ═══════════════════════════════════════════════════════════════════════════════
function PhoneField({ label, value, country, onChangeValue, onChangeCountry, required, optional }) {
  const focusAnim  = useRef(new Animated.Value(0)).current;
  const formatted  = formatPhoneNumber(value, country.format);
  const digits     = stripFormatting(value);
  const isValid    = digits.length === country.digits;
  const hasInput   = digits.length > 0;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [hasInput && !isValid ? '#FCA5A5' : BORDER, hasInput && !isValid ? '#EF4444' : PRIMARY],
  });

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
        <Ionicons name="call-outline" size={13} color={MUTED} />
        <Text style={st.label}>{label}</Text>
        {required && <Text style={st.required}>*</Text>}
        {optional && <Text style={st.optional}>(optionnel)</Text>}
      </View>
      <Animated.View style={[st.phoneWrap, { borderColor }, hasInput && isValid && { borderColor: PRIMARY }]}>
        <CountryPicker selected={country} onSelect={(c) => { onChangeCountry(c); onChangeValue(''); }} />
        <View style={st.phoneDivider} />
        <TextInput
          style={st.phoneInput}
          value={formatted}
          onChangeText={v => onChangeValue(stripFormatting(v))}
          keyboardType="phone-pad"
          placeholder={country.format.replace(/X/g, '0')}
          placeholderTextColor={MUTED}
          maxLength={country.format.length}
          onFocus={() => Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() => Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
        {hasInput && isValid && <Ionicons name="checkmark-circle" size={18} color={PRIMARY} style={{ marginRight: 12 }} />}
        {hasInput && !isValid && (
          <Text style={[st.phoneCounter, { marginRight: 12 }]}>{digits.length}/{country.digits}</Text>
        )}
      </Animated.View>
      {hasInput && !isValid && (
        <View style={st.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={st.fieldError}>{country.digits} chiffres attendus pour {country.name}</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAMP MOT DE PASSE
// ═══════════════════════════════════════════════════════════════════════════════
function PasswordField({ label, value, onChange, placeholder, required, showStrength }) {
  const [show,    setShow]    = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const strength = (() => {
    if (!value) return null;
    let score = 0;
    if (value.length >= 8)          score++;
    if (value.length >= 12)         score++;
    if (/[A-Z]/.test(value))        score++;
    if (/[0-9]/.test(value))        score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    if (score <= 1) return { label: 'Faible',  color: '#EF4444', segments: 1 };
    if (score <= 3) return { label: 'Moyen',   color: '#B2905F', segments: 2 };
    return               { label: 'Fort',    color: PRIMARY,   segments: 3 };
  })();

  const borderColor = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [BORDER, PRIMARY] });

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
        <Ionicons name="lock-closed-outline" size={13} color={MUTED} />
        <Text style={st.label}>{label}</Text>
        {required && <Text style={st.required}>*</Text>}
      </View>
      <Animated.View style={[st.inputWrap, { borderColor }]}>
        <TextInput
          style={[st.input, { paddingLeft: 14 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          secureTextEntry={!show}
          onFocus={() => Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() => Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
        <TouchableOpacity onPress={() => setShow(v => !v)} style={{ paddingHorizontal: 14 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
        </TouchableOpacity>
      </Animated.View>
      {showStrength && strength && (
        <View style={{ marginTop: 8, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[1, 2, 3].map(seg => (
              <View key={seg} style={[st.strengthSeg, { backgroundColor: seg <= strength.segments ? strength.color : BORDER }]} />
            ))}
          </View>
          <Text style={[st.strengthLabel, { color: strength.color }]}>Force : {strength.label}</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════
function FileField({ label, hint, file, onPick, required }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
        <Ionicons name="image-outline" size={13} color={MUTED} />
        <Text style={st.label}>{label}</Text>
        {required && <Text style={st.required}>*</Text>}
      </View>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[st.uploadBtn, file && st.uploadBtnFilled]}
          onPress={onPick}
          onPressIn={pressIn}
          onPressOut={pressOut}
          activeOpacity={1}
        >
          {file ? (
            <View style={st.uploadPreview}>
              <Image source={{ uri: file.uri }} style={st.uploadThumb} />
              <View style={{ flex: 1 }}>
                <Text style={st.uploadFileName} numberOfLines={1}>{file.name}</Text>
                <Text style={st.uploadChange}>Appuyer pour changer</Text>
              </View>
              <View style={st.uploadCheck}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            </View>
          ) : (
            <View style={st.uploadEmpty}>
              <LinearGradient colors={[PRIMARY + '20', PRIMARY + '08']} style={st.uploadIconBg}>
                <Ionicons name="cloud-upload-outline" size={28} color={PRIMARY} />
              </LinearGradient>
              <Text style={st.uploadEmptyTitle}>Appuyer pour sélectionner</Text>
              <Text style={st.uploadEmptyHint}>{hint}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPES
// ═══════════════════════════════════════════════════════════════════════════════

function Step1({ form, setField, errors }) {
  return (
    <View>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <PremiumInput label="Nom" icon="person-outline" required error={errors.name}>
            <TextInput style={st.input} value={form.name} onChangeText={v => setField('name', v)} placeholder="Abdoul Aziz" placeholderTextColor={MUTED} autoCapitalize="words" />
          </PremiumInput>
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <PremiumInput label="Prénom" icon="person-outline" required error={errors.userName2}>
            <TextInput style={st.input} value={form.userName2} onChangeText={v => setField('userName2', v)} placeholder="Abdou" placeholderTextColor={MUTED} autoCapitalize="words" />
          </PremiumInput>
        </View>
      </View>

      <PremiumInput label="Email" icon="mail-outline" required error={errors.email}>
        <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.email} onChangeText={v => setField('email', v.trim().toLowerCase())} placeholder="vendeur@email.com" placeholderTextColor={MUTED} autoCapitalize="none" keyboardType="email-address" />
      </PremiumInput>

      <PhoneField
        label="Téléphone"
        value={form.phone}
        country={form.phoneCountry}
        onChangeValue={v => setField('phone', v)}
        onChangeCountry={c => setField('phoneCountry', c)}
        required
      />
    </View>
  );
}

function Step2({ form, setField, errors }) {
  return (
    <View>
      <PremiumInput label="Nom de la boutique" icon="storefront-outline" required error={errors.storeName}>
        <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.storeName} onChangeText={v => setField('storeName', v)} placeholder="Ma Super Boutique" placeholderTextColor={MUTED} />
      </PremiumInput>

      {/* Catégorie */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
          <Ionicons name="grid-outline" size={13} color={errors.category ? '#EF4444' : MUTED} />
          <Text style={[st.label, errors.category && { color: '#DC2626' }]}>Catégorie principale</Text>
          <Text style={st.required}>*</Text>
        </View>
        {errors.category && (
          <View style={[st.errorRow, { marginBottom: 8 }]}>
            <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
            <Text style={st.fieldError}>{errors.category}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BUSINESS_CATEGORIES.map(c => {
            const active = form.category === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[st.catChip, active && st.catChipActive]}
                onPress={() => setField('category', c.value)}
                activeOpacity={0.75}
              >
                <Text style={st.catChipIcon}>{c.icon}</Text>
                <Text style={[st.catChipLabel, active && { color: PRIMARY }]}>{c.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={13} color={PRIMARY} />}
              </TouchableOpacity>
            );
          })}
        </View>
        {form.category === 'autre' && (
          <View style={[st.inputWrap, { marginTop: 10 }]}>
            <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.categoryCustom || ''} onChangeText={v => setField('categoryCustom', v)} placeholder="Précisez votre catégorie…" placeholderTextColor={MUTED} autoFocus />
          </View>
        )}
      </View>

      {/* Type de boutique */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
          <Ionicons name="business-outline" size={13} color={errors.storeType ? '#EF4444' : MUTED} />
          <Text style={[st.label, errors.storeType && { color: '#DC2626' }]}>Type de boutique</Text>
          <Text style={st.required}>*</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {STORE_TYPES.map(t => {
            const active = form.storeType === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[st.typeCard, active && st.typeCardActive]}
                onPress={() => setField('storeType', t.value)}
                activeOpacity={0.8}
              >
                {active && (
                  <LinearGradient colors={[PRIMARY + '18', PRIMARY + '06']} style={StyleSheet.absoluteFillObject} borderRadius={14} />
                )}
                <View style={[st.typeIconWrap, active && { backgroundColor: PRIMARY + '20' }]}>
                  <Ionicons name={t.icon} size={20} color={active ? PRIMARY : MUTED} />
                </View>
                <Text style={[st.typeLabel, active && { color: PRIMARY }]}>{t.label}</Text>
                <Text style={st.typeDesc}>{t.desc}</Text>
                {active && <View style={st.typeCheck}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Profil d'activité */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 4 }}>
          <Ionicons name="briefcase-outline" size={13} color={errors.businessProfile ? '#EF4444' : MUTED} />
          <Text style={[st.label, errors.businessProfile && { color: '#DC2626' }]}>Profil d'activité</Text>
          <Text style={st.required}>*</Text>
        </View>
        <View style={{ gap: 10 }}>
          {BUSINESS_PROFILES.map(p => {
            const sel = form.businessProfile === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                style={[st.profileCard, sel && { borderColor: p.color, backgroundColor: p.bg }]}
                onPress={() => setField('businessProfile', p.value)}
                activeOpacity={0.8}
              >
                <View style={[st.profileIconWrap, { backgroundColor: sel ? p.color + '25' : '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>{p.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.profileLabel, sel && { color: p.color }]}>{p.label}</Text>
                  <Text style={st.profileDesc}>{p.desc}</Text>
                  <Text style={[st.profileExamples, sel && { color: p.color + 'AA' }]}>{p.examples}</Text>
                </View>
                <View style={[st.profileRadio, sel && { borderColor: p.color, backgroundColor: p.color }]}>
                  {sel && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Description */}
      <View style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          <Ionicons name="document-text-outline" size={13} color={MUTED} />
          <Text style={st.label}>Description</Text>
          <Text style={st.optional}>(optionnel)</Text>
        </View>
        <TextInput
          style={st.textarea}
          value={form.storeDescription}
          onChangeText={v => setField('storeDescription', v)}
          placeholder="Décrivez vos produits, votre spécialité…"
          placeholderTextColor={MUTED}
          multiline numberOfLines={4}
        />
      </View>
    </View>
  );
}

function Step3({ form, setField, errors }) {
  const [showPays,   setShowPays]   = useState(false);
  const [showRegion, setShowRegion] = useState(false);
  const regions = getPaysRegions(form.pays);

  return (
    <View>
      {/* Pays */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          <Ionicons name="earth-outline" size={13} color={errors.pays ? '#EF4444' : MUTED} />
          <Text style={[st.label, errors.pays && { color: '#DC2626' }]}>Pays</Text>
          <Text style={st.required}>*</Text>
        </View>
        <TouchableOpacity
          style={[st.pickerBtn, errors.pays && { borderColor: '#FCA5A5' }]}
          onPress={() => setShowPays(true)}
          activeOpacity={0.8}
        >
          {form.pays
            ? <Text style={{ fontSize: 20, marginRight: 10 }}>{getPaysFlag(form.pays)}</Text>
            : <Ionicons name="earth-outline" size={16} color={MUTED} style={{ marginRight: 10 }} />
          }
          <Text style={[st.pickerBtnText, !form.pays && { color: MUTED }]}>
            {form.pays || 'Choisissez votre pays'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={MUTED} />
        </TouchableOpacity>
        {errors.pays && <View style={st.errorRow}><Ionicons name="alert-circle-outline" size={12} color="#DC2626" /><Text style={st.fieldError}>{errors.pays}</Text></View>}
      </View>

      {/* Région */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          <Ionicons name="map-outline" size={13} color={errors.region ? '#EF4444' : MUTED} />
          <Text style={[st.label, errors.region && { color: '#DC2626' }]}>Région</Text>
          <Text style={st.required}>*</Text>
        </View>
        <TouchableOpacity
          style={[st.pickerBtn, errors.region && { borderColor: '#FCA5A5' }, !form.pays && st.pickerBtnDisabled]}
          onPress={() => form.pays && setShowRegion(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={16} color={form.pays ? MUTED : '#CBD5E1'} style={{ marginRight: 10 }} />
          <Text style={[st.pickerBtnText, !form.region && { color: form.pays ? MUTED : '#CBD5E1' }]}>
            {form.region || (form.pays ? 'Choisissez votre région' : "Choisissez d'abord le pays")}
          </Text>
          <Ionicons name="chevron-down" size={14} color={form.pays ? MUTED : '#CBD5E1'} />
        </TouchableOpacity>
        {errors.region && <View style={st.errorRow}><Ionicons name="alert-circle-outline" size={12} color="#DC2626" /><Text style={st.fieldError}>{errors.region}</Text></View>}
      </View>

      {/* Adresse */}
      <View style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          <Ionicons name="location-outline" size={13} color={MUTED} />
          <Text style={st.label}>Adresse complète</Text>
          <Text style={st.optional}>(optionnel)</Text>
        </View>
        <TextInput
          style={[st.textarea, { height: 80 }]}
          value={form.address}
          onChangeText={v => setField('address', v)}
          placeholder="Quartier, point de repère, lieu-dit…"
          placeholderTextColor={MUTED}
          multiline numberOfLines={3}
        />
      </View>

      <ListPickerSheet visible={showPays} title="Choisir le pays" items={PAYS_DATA} isPays selected={form.pays} onSelect={v => { setField('pays', v); setField('region', ''); }} onClose={() => setShowPays(false)} />
      <ListPickerSheet visible={showRegion} title={`Régions — ${form.pays}`} items={regions} selected={form.region} onSelect={v => setField('region', v)} onClose={() => setShowRegion(false)} />
    </View>
  );
}

function Step4({ form, setField, errors, pickFile }) {
  return (
    <View>
      <PhoneField label="WhatsApp" value={form.whatsapp} country={form.whatsappCountry} onChangeValue={v => setField('whatsapp', v)} onChangeCountry={c => setField('whatsappCountry', c)} optional />

      <PremiumInput label="Email professionnel" icon="mail-outline" optional hint="Email dédié à votre boutique" error={errors.emailp}>
        <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.emailp} onChangeText={v => setField('emailp', v.trim().toLowerCase())} placeholder="pro@maboutique.com" placeholderTextColor={MUTED} autoCapitalize="none" keyboardType="email-address" />
      </PremiumInput>

      {errors.ownerIdentity && (
        <View style={[st.errorRow, { marginBottom: 8 }]}>
          <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
          <Text style={st.fieldError}>{errors.ownerIdentity}</Text>
        </View>
      )}
      <FileField label="Pièce d'identité" hint="CNI, passeport ou permis · JPG, PNG (max 5 MB)" file={form.ownerIdentity} onPick={() => pickFile('ownerIdentity')} required />
      <FileField label="Logo de la boutique" hint="Optionnel · JPG, PNG recommandé (min 200×200 px)" file={form.logo} onPick={() => pickFile('logo')} />
    </View>
  );
}

function Step5({ form, setField, errors }) {
  return (
    <View>
      {/* Horaires */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 4 }}>
          <Ionicons name="time-outline" size={13} color={MUTED} />
          <Text style={st.label}>Horaires d'ouverture</Text>
          <Text style={st.optional}>(optionnel)</Text>
        </View>
        <TextInput
          style={[st.textarea, { height: 70 }]}
          value={form.openingHours}
          onChangeText={v => setField('openingHours', v)}
          placeholder="Ex: Lun-Ven: 9h-18h, Sam: 9h-13h"
          placeholderTextColor={MUTED}
          multiline numberOfLines={2}
        />
      </View>

      {/* Réseaux sociaux */}
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <PremiumInput label="Facebook" icon="logo-facebook" optional>
            <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.facebook} onChangeText={v => setField('facebook', v)} placeholder="@page" autoCapitalize="none" placeholderTextColor={MUTED} />
          </PremiumInput>
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <PremiumInput label="Instagram" icon="logo-instagram" optional>
            <TextInput style={[st.input, { paddingLeft: 14 }]} value={form.instagram} onChangeText={v => setField('instagram', v)} placeholder="@compte" autoCapitalize="none" placeholderTextColor={MUTED} />
          </PremiumInput>
        </View>
      </View>

      {/* Mot de passe */}
      <View style={[st.divider, { marginVertical: 8 }]} />

      <PasswordField label="Mot de passe" value={form.password} onChange={v => setField('password', v)} placeholder="Minimum 8 caractères" required showStrength />
      {errors.password && <View style={[st.errorRow, { marginTop: -10, marginBottom: 12 }]}><Ionicons name="alert-circle-outline" size={12} color="#DC2626" /><Text style={st.fieldError}>{errors.password}</Text></View>}

      <PasswordField label="Confirmer le mot de passe" value={form.confirmPassword} onChange={v => setField('confirmPassword', v)} placeholder="Répétez votre mot de passe" required />
      {errors.confirmPassword && <View style={[st.errorRow, { marginTop: -10, marginBottom: 12 }]}><Ionicons name="alert-circle-outline" size={12} color="#DC2626" /><Text style={st.fieldError}>{errors.confirmPassword}</Text></View>}

      {/* Récapitulatif */}
      <View style={st.summaryCard}>
        <LinearGradient colors={[PRIMARY + '12', SECONDARY + '08']} style={st.summaryGrad} />
        <View style={st.summaryHeader}>
          <Image source={require('../../assets/logo.png')} style={st.summaryLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={st.summaryTitle}>Récapitulatif de votre boutique</Text>
            <Text style={st.summaryTitleSub}>Vérifiez vos informations avant de soumettre</Text>
          </View>
          <View style={[st.summaryBadge, { backgroundColor: PRIMARY + '18' }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color={PRIMARY} />
          </View>
        </View>
        {[
          { icon: 'person-outline',     label: 'Nom',          val: `${form.name} ${form.userName2}` },
          { icon: 'mail-outline',       label: 'Email',        val: form.email },
          { icon: 'call-outline',       label: 'Téléphone',    val: `${form.phoneCountry.dial} ${formatPhoneNumber(form.phone, form.phoneCountry.format)}` },
          { icon: 'storefront-outline', label: 'Boutique',     val: form.storeName },
          { icon: 'location-outline',   label: 'Localisation', val: [form.region, form.pays].filter(Boolean).join(', ') },
        ].filter(r => r.val && r.val.trim() !== ',').map((r, i) => (
          <View key={i} style={st.summaryRow}>
            <View style={st.summaryIconWrap}><Ionicons name={r.icon} size={13} color={PRIMARY} /></View>
            <Text style={st.summaryLabel}>{r.label}</Text>
            <Text style={st.summaryValue} numberOfLines={1}>{r.val}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL SUCCÈS DE CRÉATION DE COMPTE
// ═══════════════════════════════════════════════════════════════════════════════
const VALIDATION_STEPS = [
  { label: 'Inscription',                icon: 'person-outline',          done: true  },
  { label: 'Vérification des documents', icon: 'document-text-outline',   done: true  },
  { label: 'Validation admin',           icon: 'shield-checkmark-outline', done: false, active: true },
  { label: 'Activation de la boutique', icon: 'storefront-outline',       done: false },
];

function SuccessModal({ visible, storeName, category, onGoHome }) {
  const scaleAnim    = useRef(new Animated.Value(0.85)).current;
  const opacityAnim  = useRef(new Animated.Value(0)).current;
  const checkAnim    = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    // Entrée du modal
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1,    tension: 70, friction: 12, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1,    duration: 280, useNativeDriver: true }),
    ]).start();

    // Checkmark apparaît avec rebond
    setTimeout(() => {
      Animated.spring(checkAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
    }, 200);

    // Pulsation sur l'étape "En cours"
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[st.successOverlay, { opacity: opacityAnim }]}>
        <Animated.View style={[st.successCard, { transform: [{ scale: scaleAnim }] }]}>

          {/* ── HERO ─────────────────────────────────────── */}
          <LinearGradient
            colors={['#30A08B', '#B17236']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.successHero}
          >
            <View style={st.successHeroBubble1} />
            <View style={st.successHeroBubble2} />

            {/* Logo */}
            <View style={st.successLogoWrap}>
              <Image source={require('../../assets/logo.png')} style={st.successLogo} resizeMode="contain" />
            </View>

            {/* Checkmark animé */}
            <Animated.View style={[st.successCheckCircle, { transform: [{ scale: checkAnim }] }]}>
              <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.15)']} style={st.successCheckInner}>
                <Ionicons name="checkmark" size={32} color={WHITE} />
              </LinearGradient>
            </Animated.View>

            <Text style={st.successHeroTitle}>Demande envoyée !</Text>
            <Text style={st.successHeroSub}>Votre dossier est en cours d'examen</Text>
          </LinearGradient>

          {/* ── CORPS ────────────────────────────────────── */}
          <ScrollView
            contentContainerStyle={st.successBody}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Infos boutique */}
            <View style={st.successStoreCard}>
              <LinearGradient colors={[PRIMARY + '10', PRIMARY + '04']} style={StyleSheet.absoluteFillObject} borderRadius={16} />
              <View style={st.successStoreIcon}>
                <Ionicons name="storefront-outline" size={18} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.successStoreLabel}>VOTRE BOUTIQUE</Text>
                <Text style={st.successStoreName}>{storeName || 'Ma boutique'}</Text>
                {category ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <Ionicons name="shield-outline" size={11} color={MUTED} />
                    <Text style={st.successStoreCat}>{category}</Text>
                  </View>
                ) : null}
              </View>
              <View style={st.successStatusBadge}>
                <Ionicons name="time-outline" size={11} color={SECONDARY} />
                <Text style={[st.successStatusText, { color: SECONDARY }]}>En attente</Text>
              </View>
            </View>

            {/* Étapes de validation */}
            <View style={st.successStepsCard}>
              <Text style={st.successSectionTitle}>Processus de validation</Text>
              {VALIDATION_STEPS.map((s, i) => (
                <View key={i} style={[st.successStep, i < VALIDATION_STEPS.length - 1 && st.successStepBorder]}>
                  {/* Indicateur */}
                  <View style={{ alignItems: 'center', width: 28 }}>
                    {s.done ? (
                      <View style={[st.successStepDot, { backgroundColor: PRIMARY }]}>
                        <Ionicons name="checkmark" size={12} color={WHITE} />
                      </View>
                    ) : s.active ? (
                      <Animated.View style={[st.successStepDot, st.successStepDotActive, { transform: [{ scale: pulseAnim }] }]}>
                        <Ionicons name="ellipsis-horizontal" size={12} color={WHITE} />
                      </Animated.View>
                    ) : (
                      <View style={[st.successStepDot, { backgroundColor: BORDER }]}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8' }}>{i + 1}</Text>
                      </View>
                    )}
                    {/* Ligne de connexion */}
                    {i < VALIDATION_STEPS.length - 1 && (
                      <View style={[st.successStepLine, { backgroundColor: s.done ? PRIMARY + '40' : BORDER }]} />
                    )}
                  </View>

                  {/* Texte */}
                  <View style={st.successStepContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons
                        name={s.icon}
                        size={13}
                        color={s.done ? PRIMARY : s.active ? SECONDARY : '#94A3B8'}
                      />
                      <Text style={[
                        st.successStepLabel,
                        s.done   && { color: PRIMARY, fontWeight: '700' },
                        s.active && { color: SECONDARY, fontWeight: '700' },
                        !s.done && !s.active && { color: '#94A3B8' },
                      ]}>
                        {s.label}
                      </Text>
                    </View>
                    {s.done && (
                      <View style={[st.successBadge, { backgroundColor: PRIMARY + '15' }]}>
                        <Text style={[st.successBadgeText, { color: PRIMARY }]}>Complété</Text>
                      </View>
                    )}
                    {s.active && (
                      <View style={[st.successBadge, { backgroundColor: SECONDARY + '18' }]}>
                        <Text style={[st.successBadgeText, { color: SECONDARY }]}>En cours</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Message délai */}
            <View style={st.successInfoBox}>
              <View style={st.successInfoIcon}>
                <Ionicons name="information-circle-outline" size={18} color={PRIMARY} />
              </View>
              <Text style={st.successInfoText}>
                Notre équipe vérifie votre dossier sous <Text style={{ fontWeight: '800', color: PRIMARY }}>24 à 48h ouvrées</Text>. Vous recevrez une notification dès que votre boutique sera activée.
              </Text>
            </View>

            {/* Contact */}
            <View style={st.successContactRow}>
              <Text style={st.successContactLabel}>Questions ?</Text>
              <TouchableOpacity style={st.successContactBtn}>
                <Ionicons name="call-outline" size={13} color={PRIMARY} />
                <Text style={st.successContactBtnText}>Appeler</Text>
              </TouchableOpacity>
              <View style={{ width: 1, height: 16, backgroundColor: BORDER }} />
              <TouchableOpacity style={st.successContactBtn}>
                <Ionicons name="mail-outline" size={13} color={PRIMARY} />
                <Text style={st.successContactBtnText}>Email</Text>
              </TouchableOpacity>
            </View>

            {/* Bouton Accueil */}
            <TouchableOpacity style={st.successCTAWrap} onPress={onGoHome} activeOpacity={0.88}>
              <LinearGradient colors={['#30A08B', '#B17236']} style={st.successCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="home-outline" size={18} color={WHITE} />
                <Text style={st.successCTAText}>Retour à l'accueil</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_COUNTRY = COUNTRIES[0];

export default function RegisterScreen({ navigation }) {
  const insets   = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [step,        setStep]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [errors,      setErrors]      = useState({});
  const [showSuccess, setShowSuccess] = useState(false);

  const [form, setFormState] = useState({
    name: '', userName2: '', email: '', phone: '',
    phoneCountry: DEFAULT_COUNTRY,
    storeName: '', storeDescription: '', category: '', categoryCustom: '', storeType: '', businessProfile: '',
    pays: '', region: '', address: '',
    emailp: '', whatsapp: '',
    whatsappCountry: DEFAULT_COUNTRY,
    ownerIdentity: null, logo: null,
    openingHours: '', facebook: '', instagram: '',
    password: '', confirmPassword: '',
  });

  const setField = useCallback((field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  // Animation slide entre étapes
  const animateStep = (direction) => {
    const fromVal = direction === 'next' ? W : -W;
    slideAnim.setValue(fromVal);
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 16, useNativeDriver: true }).start();
  };

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!form.name || form.name.trim().length < 3)       e.name = 'Minimum 3 caractères.';
      if (!form.userName2 || form.userName2.trim().length < 2) e.userName2 = 'Minimum 2 caractères.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Adresse e-mail invalide.';
      const d = stripFormatting(form.phone);
      if (d.length !== form.phoneCountry.digits)           e.phone = `Numéro incomplet (${form.phoneCountry.digits} chiffres).`;
    }
    if (step === 2) {
      if (!form.storeName || form.storeName.trim().length < 2) e.storeName = 'Minimum 2 caractères.';
      if (!form.category)                                  e.category = 'Sélectionnez une catégorie.';
      if (form.category === 'autre' && !form.categoryCustom?.trim()) e.category = 'Précisez votre catégorie.';
      if (!form.storeType)                                 e.storeType = 'Sélectionnez un type.';
      if (!form.businessProfile)                           e.businessProfile = 'Sélectionnez un profil.';
    }
    if (step === 3) {
      if (!form.pays)   e.pays   = 'Sélectionnez un pays.';
      if (!form.region) e.region = 'Sélectionnez une région.';
    }
    if (step === 4) {
      if (form.emailp && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailp)) e.emailp = 'Email invalide.';
      if (!form.ownerIdentity) e.ownerIdentity = "La pièce d'identité est obligatoire.";
    }
    if (step === 5) {
      if (!form.password || form.password.length < 8) e.password = 'Minimum 8 caractères.';
      if (form.password !== form.confirmPassword)     e.confirmPassword = 'Les mots de passe ne correspondent pas.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const pickFile = async (field) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Permission refusée' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setField(field, { uri: a.uri, name: a.fileName || `${field}-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    }
  };

  const goNext = async () => {
    if (!validateStep()) { scrollRef.current?.scrollTo({ y: 0, animated: true }); return; }
    if (step < TOTAL_STEPS) {
      animateStep('next');
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      await submit();
    }
  };

  const goPrev = () => {
    setErrors({});
    if (step === 1) navigation.goBack();
    else {
      animateStep('prev');
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      const skip = new Set(['ownerIdentity', 'logo', 'phoneCountry', 'whatsappCountry', 'categoryCustom', 'pays']);
      Object.entries(form).forEach(([k, v]) => {
        if (skip.has(k)) return;
        if (v !== null && v !== undefined && v !== '') fd.append(k, String(v));
      });
      fd.append('city', form.pays);
      fd.set('phone', `${form.phoneCountry.dial}${stripFormatting(form.phone)}`);
      if (form.whatsapp) fd.set('whatsapp', `${form.whatsappCountry.dial}${stripFormatting(form.whatsapp)}`);
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
      const msg = e.response?.data?.error?.message || e.response?.data?.message || 'Erreur lors de la création.';
      const field = e.response?.data?.error?.field;
      if (field) {
        const stepOfField = { email: 1, phone: 1, storeName: 2 };
        const targetStep = stepOfField[field];
        if (targetStep && targetStep !== step) setStep(targetStep);
        setErrors({ [field]: msg });
      }
      Toast.show({ type: 'error', text1: 'Erreur', text2: msg, visibilityTime: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const grad  = STEP_GRADIENTS[step - 1];
  const meta  = STEP_META[step - 1];
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" backgroundColor={grad[0]} />

      <SuccessModal
        visible={showSuccess}
        storeName={form.storeName}
        category={form.category === 'autre' ? (form.categoryCustom || 'Autre') : BUSINESS_CATEGORIES.find(c => c.value === form.category)?.label || ''}
        onGoHome={() => navigation.replace('Login')}
      />

      {/* ── HERO HEADER ── */}
      <LinearGradient colors={grad} style={[st.hero, { paddingTop: insets.top + 8 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/* Cercles décoratifs */}
        <View style={st.heroBubble1} />
        <View style={st.heroBubble2} />
        <View style={st.heroBubble3} />

        {/* Barre nav */}
        <View style={st.heroNav}>
          <TouchableOpacity onPress={goPrev} style={st.heroBackBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          {/* Logo centré — pilule blanche pour contraste garanti */}
          <View style={st.heroLogoWrap}>
            <View style={st.heroLogoPill}>
              <Image
                source={require('../../assets/logo.png')}
                style={[st.heroLogo, { transform: [{ scale: 2.8 }] }]}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={{ width: 36 }} />
        </View>

        {/* Stepper */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 }}>
          <Stepper current={step} total={TOTAL_STEPS} gradients={STEP_GRADIENTS} />
        </View>

        {/* Titre étape */}
        <View style={st.heroContent}>
          <LinearGradient
            colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.12)']}
            style={st.heroIconWrap}
          >
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
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={st.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {hasErrors && (
            <View style={st.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={st.errorBannerText}>Veuillez corriger les erreurs indiquées.</Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            {step === 1 && <Step1 form={form} setField={setField} errors={errors} />}
            {step === 2 && <Step2 form={form} setField={setField} errors={errors} />}
            {step === 3 && <Step3 form={form} setField={setField} errors={errors} />}
            {step === 4 && <Step4 form={form} setField={setField} errors={errors} pickFile={pickFile} />}
            {step === 5 && <Step5 form={form} setField={setField} errors={errors} />}
          </Animated.View>

          {/* CTA */}
          <TouchableOpacity
            style={[st.ctaWrap, loading && { opacity: 0.7 }]}
            onPress={goNext}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient colors={grad} style={st.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={st.ctaText}>
                    {step === TOTAL_STEPS ? 'Créer ma boutique' : 'Continuer'}
                  </Text>
                  <View style={st.ctaIconWrap}>
                    <Ionicons name={step === TOTAL_STEPS ? 'checkmark' : 'arrow-forward'} size={16} color={grad[0]} />
                  </View>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

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

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: { paddingBottom: 22, overflow: 'hidden' },
  heroBubble1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  heroBubble2: { position: 'absolute', width: 120, height: 120, borderRadius: 60,  backgroundColor: 'rgba(255,255,255,0.08)', bottom: -30, left: 20 },
  heroBubble3: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40,  backgroundColor: 'rgba(255,255,255,0.05)', top: 20, left: W * 0.45 },
  heroNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 4 },
  heroBackBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  heroLogoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroLogoPill: {
    backgroundColor: WHITE,
    borderRadius: 20,
    width: 132,
    height: 42,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  heroLogo: { width: 130, height: 39 },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14 },
  heroIconWrap: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  heroStep: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: WHITE, letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  // ── Stepper ───────────────────────────────────────────────────────────────
  stepper: { height: 32, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  stepperTrack: { position: 'absolute', left: 10, right: 10, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2 },
  stepperFill: { height: 3, borderRadius: 2 },
  stepNode: { position: 'absolute', alignItems: 'center' },
  stepDot: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { width: 24, height: 24, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  stepNum: { fontSize: 9, fontWeight: '800' },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: { padding: 20, paddingBottom: 40 },

  // ── Error banner ──────────────────────────────────────────────────────────
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, padding: 13, marginBottom: 16 },
  errorBannerText: { fontSize: 13, color: '#B91C1C', flex: 1, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  fieldError: { fontSize: 12, color: '#DC2626', fontWeight: '500' },
  fieldHint: { fontSize: 11, color: MUTED, marginTop: 4 },

  // ── Labels ────────────────────────────────────────────────────────────────
  label:    { fontSize: 13, fontWeight: '700', color: DARK },
  required: { fontSize: 12, color: '#EF4444', fontWeight: '700' },
  optional: { fontSize: 11, color: MUTED, fontWeight: '400' },

  // ── Input ─────────────────────────────────────────────────────────────────
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, minHeight: 52, overflow: 'hidden' },
  input: { flex: 1, paddingVertical: 14, fontSize: 14, color: DARK },
  textarea: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13, fontSize: 14, color: DARK, height: 100, textAlignVertical: 'top' },

  // ── Picker btn ────────────────────────────────────────────────────────────
  pickerBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, paddingHorizontal: 14, minHeight: 52 },
  pickerBtnDisabled: { backgroundColor: BG, borderColor: BORDER },
  pickerBtnText: { flex: 1, fontSize: 14, color: DARK, fontWeight: '500' },

  // ── Téléphone ─────────────────────────────────────────────────────────────
  phoneWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, backgroundColor: WHITE, overflow: 'hidden' },
  dialBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14 },
  dialFlag: { fontSize: 18 },
  dialCode: { fontSize: 13, fontWeight: '800', color: DARK },
  phoneDivider: { width: 1, height: 26, backgroundColor: BORDER },
  phoneInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 14, color: DARK, letterSpacing: 0.5 },
  phoneCounter: { fontSize: 11, color: MUTED, fontVariant: ['tabular-nums'] },

  // ── Catégorie chips ───────────────────────────────────────────────────────
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: WHITE },
  catChipActive: { borderColor: PRIMARY, backgroundColor: PRIMARY + '10' },
  catChipIcon: { fontSize: 13 },
  catChipLabel: { fontSize: 12, fontWeight: '600', color: MUTED },

  // ── Type boutique cards ───────────────────────────────────────────────────
  typeCard: { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, padding: 12, alignItems: 'center', backgroundColor: WHITE, position: 'relative', overflow: 'hidden' },
  typeCardActive: { borderColor: PRIMARY },
  typeIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  typeLabel: { fontSize: 12, fontWeight: '800', color: DARK, textAlign: 'center' },
  typeDesc: { fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 2, lineHeight: 14 },
  typeCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },

  // ── Profil cards ──────────────────────────────────────────────────────────
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: BORDER, borderRadius: 16, padding: 14, backgroundColor: WHITE },
  profileIconWrap: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  profileLabel: { fontSize: 14, fontWeight: '800', color: DARK, marginBottom: 2 },
  profileDesc: { fontSize: 12, color: MUTED, lineHeight: 16 },
  profileExamples: { fontSize: 10, color: MUTED, marginTop: 3, fontStyle: 'italic' },
  profileRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, justifyContent: 'center', alignItems: 'center' },

  // ── Strength ──────────────────────────────────────────────────────────────
  strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700' },

  // ── Upload ────────────────────────────────────────────────────────────────
  uploadBtn: { borderWidth: 2, borderColor: BORDER, borderRadius: 16, borderStyle: 'dashed', overflow: 'hidden', backgroundColor: WHITE },
  uploadBtnFilled: { borderStyle: 'solid', borderColor: PRIMARY },
  uploadEmpty: { alignItems: 'center', paddingVertical: 26, gap: 8 },
  uploadIconBg: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  uploadEmptyTitle: { fontSize: 13, fontWeight: '700', color: DARK },
  uploadEmptyHint: { fontSize: 11, color: MUTED, textAlign: 'center', paddingHorizontal: 20 },
  uploadPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: PRIMARY + '0D' },
  uploadThumb: { width: 52, height: 52, borderRadius: 12 },
  uploadFileName: { fontSize: 13, fontWeight: '700', color: DARK },
  uploadChange: { fontSize: 11, color: PRIMARY, marginTop: 2 },
  uploadCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },

  // ── Récapitulatif ─────────────────────────────────────────────────────────
  summaryCard: { borderRadius: 18, borderWidth: 1.5, borderColor: PRIMARY + '30', overflow: 'hidden', marginTop: 8, backgroundColor: WHITE },
  summaryGrad: { ...StyleSheet.absoluteFillObject },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: PRIMARY + '20' },
  summaryLogo: { width: 44, height: 28 },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: PRIMARY },
  summaryTitleSub: { fontSize: 10, color: MUTED, marginTop: 1 },
  summaryBadge: { width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: PRIMARY + '12', justifyContent: 'center', alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: MUTED, width: 80, fontWeight: '500' },
  summaryValue: { flex: 1, fontSize: 12, fontWeight: '700', color: DARK },

  // ── Bottom sheets ─────────────────────────────────────────────────────────
  sheet: { backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 30 },
  sheetHandle: { alignItems: 'center', paddingTop: 14, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: DARK, paddingHorizontal: 20, marginBottom: 14 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, backgroundColor: BG, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: DARK },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  sheetRowLabel: { fontSize: 14, fontWeight: '600', color: DARK },
  sheetRowSub: { fontSize: 11, color: MUTED, marginTop: 2 },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaWrap: { marginTop: 28, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8 },
  cta: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: WHITE, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  ctaIconWrap: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

  // ── Modal succès ──────────────────────────────────────────────────────────
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  successCard: { width: '100%', maxWidth: 420, backgroundColor: WHITE, borderRadius: 28, overflow: 'hidden', maxHeight: '92%', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 24 },

  // Hero du modal
  successHero: { alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24, position: 'relative', overflow: 'hidden' },
  successHeroBubble1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40 },
  successHeroBubble2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -30, left: 10 },
  successLogoWrap: { backgroundColor: WHITE, borderRadius: 16, width: 132, height: 46, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  successLogo: { width: 100, height: 30, transform: [{ scale: 2.8 }] },
  successCheckCircle: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  successCheckInner: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 40 },
  successHeroTitle: { fontSize: 22, fontWeight: '900', color: WHITE, letterSpacing: -0.3, marginBottom: 6 },
  successHeroSub: { fontSize: 13, color: 'rgba(255,255,255,0.80)', textAlign: 'center' },

  // Corps du modal
  successBody: { padding: 18, paddingBottom: 28, gap: 14 },

  // Card boutique
  successStoreCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, borderColor: PRIMARY + '25', padding: 14, overflow: 'hidden' },
  successStoreIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: PRIMARY + '15', justifyContent: 'center', alignItems: 'center' },
  successStoreLabel: { fontSize: 9, fontWeight: '800', color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  successStoreName: { fontSize: 15, fontWeight: '800', color: DARK },
  successStoreCat: { fontSize: 11, color: MUTED },
  successStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SECONDARY + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  successStatusText: { fontSize: 10, fontWeight: '700' },

  // Étapes
  successStepsCard: { borderRadius: 16, borderWidth: 1.5, borderColor: BORDER, padding: 16, backgroundColor: WHITE },
  successSectionTitle: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  successStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14 },
  successStepBorder: { borderBottomWidth: 0 },
  successStepDot: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  successStepDotActive: { backgroundColor: SECONDARY },
  successStepLine: { width: 2, flex: 1, minHeight: 20, marginTop: 4 },
  successStepContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingTop: 4, gap: 6 },
  successStepLabel: { fontSize: 13, fontWeight: '500', color: DARK, flex: 1 },
  successBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  successBadgeText: { fontSize: 10, fontWeight: '700' },

  // Info box
  successInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: PRIMARY + '0C', borderRadius: 14, borderWidth: 1, borderColor: PRIMARY + '20', padding: 13 },
  successInfoIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: PRIMARY + '18', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  successInfoText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 18 },

  // Contact
  successContactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG, borderRadius: 14, padding: 12 },
  successContactLabel: { flex: 1, fontSize: 12, color: MUTED, fontWeight: '600' },
  successContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  successContactBtnText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  // CTA
  successCTAWrap: { borderRadius: 16, overflow: 'hidden', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8, marginTop: 4 },
  successCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  successCTAText: { fontSize: 15, fontWeight: '900', color: WHITE, letterSpacing: 0.2 },

  // ── Divers ────────────────────────────────────────────────────────────────
  row: { flexDirection: 'row' },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },
  loginLink: { alignItems: 'center', marginTop: 20, marginBottom: 8 },
  loginLinkText: { fontSize: 13, color: MUTED },
});
