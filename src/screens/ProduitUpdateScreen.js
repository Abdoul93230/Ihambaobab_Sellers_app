import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, Animated, PanResponder,
  TouchableWithoutFeedback, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSyncStore } from '../stores/syncStore';
import apiClient from '../config/api';
import Toast from 'react-native-toast-message';
import ColorPickerModal from '../components/ColorPickerModal';

const W = Dimensions.get('window').width;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, colors }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.primaryLight, borderColor: `${colors.primary}30` }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={[styles.sectionHeaderText, { color: colors.primary }]}>{title}</Text>
    </View>
  );
}

function Field({ label, required, error, colors, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSub }]}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
      {hint && !error ? <Text style={[styles.fieldHint, { color: colors.textMuted }]}>{hint}</Text> : null}
      {error ? <Text style={[styles.fieldError, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

function Input({ value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, colors, error, editable = true }) {
  return (
    <TextInput
      style={[
        styles.input,
        { borderColor: error ? colors.danger : colors.border, backgroundColor: colors.bgInput, color: colors.text },
        multiline && { height: numberOfLines ? numberOfLines * 22 + 16 : 88, textAlignVertical: 'top' },
        !editable && { opacity: 0.5 },
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textPlaceholder}
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      editable={editable}
    />
  );
}

function ImageSlot({ label, uri, onPick, onRemove, required, colors }) {
  return (
    <View style={styles.imgSlotWrap}>
      <Text style={[styles.imgSlotLabel, { color: colors.textMuted }]}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.imgSlot, { borderColor: colors.border, backgroundColor: colors.bgHover }]}
        onPress={onPick} activeOpacity={0.8}
      >
        {uri ? (
          <>
            <CachedImage uri={uri} style={styles.imgSlotImg} contentFit="cover" />
            <TouchableOpacity style={styles.imgSlotRemove} onPress={onRemove} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={22} color="#EF4444" />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.imgSlotEmpty}>
            <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.imgSlotEmptyText, { color: colors.textMuted }]}>Ajouter</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
// La clé : TouchableOpacity occupe flex:1 (espace AU-DESSUS du sheet uniquement)
// Le sheet est en dessous dans le flux — absoluteFill ne doit PAS être utilisé
function BottomSheet({ visible, onClose, title, colors, children, maxHeight = '65%' }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        {/* flex:1 = remplit l'espace DESSUS du sheet seulement */}
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        {/* Sheet positionné naturellement en bas du flex */}
        <View style={[styles.sheet, { backgroundColor: colors.bgCard, maxHeight, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity activeOpacity={1} style={styles.handleArea} onPress={onClose}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </TouchableOpacity>
          {title ? <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

// ─── Palette de couleurs prédéfinies (identique au web) ──────────────────────
const COLOR_PRESETS = [
  { hex: '#000000', name: 'Noir' },
  { hex: '#FFFFFF', name: 'Blanc' },
  { hex: '#6B7280', name: 'Gris' },
  { hex: '#EF4444', name: 'Rouge' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Jaune' },
  { hex: '#22C55E', name: 'Vert' },
  { hex: '#3B82F6', name: 'Bleu' },
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#EC4899', name: 'Rose' },
  { hex: '#06B6D4', name: 'Cyan' },
  { hex: '#30A08B', name: 'Teal' },
  { hex: '#A16207', name: 'Marron' },
  { hex: '#F9FAFB', name: 'Crème' },
  { hex: '#1E3A5F', name: 'Marine' },
  { hex: '#7C2D12', name: 'Bordeaux' },
  { hex: '#064E3B', name: 'Kaki' },
  { hex: '#D4A574', name: 'Camel' },
  { hex: '#9CA3AF', name: 'Argent' },
  { hex: '#D97706', name: 'Or' },
];

// ─── Modal variante ───────────────────────────────────────────────────────────
// Types et options identiques au web (SizeSelector.jsx)
const SIZE_TYPES = [
  { key: 'clothing', label: 'Vêtements (XS–3XL)' },
  { key: 'shoes',    label: 'Chaussures (36–46)'  },
  { key: 'numeric',  label: 'Numérique (30–50)'   },
  { key: 'oneSize',  label: 'Taille unique'        },
  { key: 'custom',   label: 'Personnalisées'       },
];
const SIZE_OPTIONS = {
  clothing: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  shoes:    ['36','37','38','39','40','41','42','43','44','45','46'],
  numeric:  ['30','32','34','36','38','40','42','44','46','48','50'],
  oneSize:  ['Taille Unique'],
  custom:   [],
};

// Auto-détecte le type de taille depuis un array de tailles (identique au web handleEditVariant)
function detectSizeType(sizes) {
  if (!sizes || sizes.length === 0) return 'clothing';
  if (sizes.every(s => ['XS','S','M','L','XL','XXL','3XL'].includes(s))) return 'clothing';
  if (sizes.every(s => parseInt(s) >= 36 && parseInt(s) <= 46)) return 'shoes';
  if (sizes.every(s => parseInt(s) >= 30 && parseInt(s) <= 50)) return 'numeric';
  if (sizes.length === 1 && sizes[0] === 'Taille Unique') return 'oneSize';
  return 'custom';
}

function VarianteSheet({ visible, initial, defaultPrice, defaultPromoPrice, onSave, onClose, colors }) {
  const [colorHex, setColorHex]       = useState('#30A08B');
  const [colorName, setColorName]     = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [sizeType, setSizeType]       = useState('clothing');
  const [sizes, setSizes]             = useState([]);
  const [stock, setStock]             = useState('1');
  const [hasCustomPrice, setHasCustomPrice] = useState(false);
  const [price, setPrice]             = useState('');
  const [hasPromo, setHasPromo]       = useState(false);
  const [promoPrice, setPromoPrice]   = useState('');
  const [imgUri, setImgUri]           = useState(null);
  const [imgIsNew, setImgIsNew]       = useState(false);

  const [customSizeInput, setCustomSizeInput] = useState('');

  useEffect(() => {
    if (visible && initial) {
      setColorHex(initial.color || '#30A08B');
      setColorName(initial.colorName || '');
      // Auto-détecte le type comme le web (handleEditVariant)
      setSizeType(detectSizeType(initial.sizes));
      setSizes(initial.sizes || []);
      setStock(String(initial.stock ?? 1));
      setHasCustomPrice(!!initial.hasCustomPrice);
      setPrice(String(initial.price || ''));
      setHasPromo(!!initial.isOnPromo);
      setPromoPrice(String(initial.promoPrice || ''));
      setImgUri(initial.imagePreview || initial.imageUrl || null);
      setImgIsNew(false);
      setCustomSizeInput('');
    } else if (visible && !initial) {
      setColorHex('#30A08B'); setColorName(''); setSizeType('clothing');
      setSizes([]); setStock('1'); setHasCustomPrice(false);
      setPrice(defaultPrice || ''); setHasPromo(false);
      setPromoPrice(defaultPromoPrice || ''); setImgUri(null); setImgIsNew(false);
      setCustomSizeInput('');
    }
  }, [visible, initial]);

  const pickImg = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 0.8 });
    if (!r.canceled) { setImgUri(r.assets[0].uri); setImgIsNew(true); }
  };

  const toggleSize = (s) => setSizes(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const addCustomSize = () => {
    const s = customSizeInput.trim();
    if (s && !sizes.includes(s)) toggleSize(s);
    setCustomSizeInput('');
  };

  const handleSave = () => {
    if (!colorName.trim()) {
      Toast.show({ type: 'error', text1: 'Nom de couleur requis' });
      return;
    }
    // Identique au web : colorName ET sizes.length > 0 obligatoires
    if (sizes.length === 0) {
      Toast.show({ type: 'error', text1: 'Sélectionnez au moins une taille' });
      return;
    }
    onSave({
      id: initial?.id || `var_${Date.now()}`,
      _id: initial?._id,
      color: colorHex, colorName: colorName.trim(),
      sizeType, sizes, stock: parseInt(stock) || 0,
      hasCustomPrice, price: parseFloat(price) || 0,
      isOnPromo: hasPromo, promoPrice: parseFloat(promoPrice) || 0,
      imagePreview: imgUri, imageUrl: imgIsNew ? null : (initial?.imageUrl || null),
      imageFile: imgIsNew ? imgUri : null,
    });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={initial ? 'Modifier la variante' : 'Ajouter une variante'} colors={colors} maxHeight="90%">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        {/* Couleur || Variante */}
        <Field label="Couleur || Variante" required colors={colors}>
          {/* Ligne : aperçu couleur + bouton ouvrir picker + nom */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Carré couleur cliquable — ouvre le picker */}
            <TouchableOpacity
              onPress={() => setShowColorPicker(true)}
              activeOpacity={0.8}
              style={{
                width: 44, height: 44, borderRadius: 8,
                backgroundColor: colorHex,
                borderWidth: 2, borderColor: colors.border,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15, elevation: 3,
              }}
            />
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bgInput, color: colors.text }]}
                value={colorName}
                onChangeText={setColorName}
                placeholder="Nom de la couleur ou variante"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
          </View>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
            Appuyez sur le carré de couleur pour ouvrir le sélecteur
          </Text>
        </Field>

        {/* Color Picker modal */}
        <ColorPickerModal
          visible={showColorPicker}
          initialHex={colorHex}
          onSave={(hex) => { setColorHex(hex); setShowColorPicker(false); }}
          onClose={() => setShowColorPicker(false)}
          colors={colors}
        />

        {/* Image */}
        <Field label="Image variante (optionnel)" colors={colors}>
          <TouchableOpacity style={[styles.varImgSlot, { borderColor: colors.border, backgroundColor: colors.bgHover }]} onPress={pickImg} activeOpacity={0.8}>
            {imgUri ? <CachedImage uri={imgUri} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={{ alignItems: 'center', gap: 4 }}><Ionicons name="camera-outline" size={20} color={colors.textMuted} /><Text style={{ fontSize: 10, color: colors.textMuted }}>Choisir</Text></View>}
          </TouchableOpacity>
        </Field>

        {/* Stock */}
        <Field label="Stock" required colors={colors}>
          <Input value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="ex: 10" colors={colors} />
        </Field>

        {/* Type de tailles — identique au web (select) */}
        <Field label="Type de tailles" required colors={colors}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SIZE_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                onPress={() => { setSizeType(t.key); setSizes([]); setCustomSizeInput(''); }}
                style={[styles.chip, {
                  borderColor: sizeType === t.key ? colors.primary : colors.border,
                  backgroundColor: sizeType === t.key ? colors.primary : colors.bgHover,
                }]}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: sizeType === t.key ? '#fff' : colors.textSub }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Grille de tailles prédéfinies */}
        {SIZE_OPTIONS[sizeType]?.length > 0 && (
          <Field label={`Tailles ${sizes.length > 0 ? `(${sizes.length} sélectionnée${sizes.length > 1 ? 's' : ''})` : ''}`} required colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SIZE_OPTIONS[sizeType].map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleSize(s)}
                  style={[styles.sizeChip, {
                    borderColor: sizes.includes(s) ? colors.primary : colors.border,
                    backgroundColor: sizes.includes(s) ? colors.primary : colors.bgHover,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: sizes.includes(s) ? '#fff' : colors.textSub }}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}

        {/* Tailles personnalisées — champ texte + bouton Ajouter */}
        {sizeType === 'custom' && (
          <Field label={`Tailles personnalisées ${sizes.length > 0 ? `(${sizes.length})` : ''}`} required colors={colors}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.bgInput, color: colors.text }]}
                value={customSizeInput}
                onChangeText={setCustomSizeInput}
                placeholder="ex: 52, XXS, 6 ans..."
                placeholderTextColor={colors.textPlaceholder}
                onSubmitEditing={addCustomSize}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={addCustomSize}
                disabled={!customSizeInput.trim()}
                style={[{
                  paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
                  backgroundColor: customSizeInput.trim() ? colors.primary : colors.bgHover,
                }]}
              >
                <Text style={{ color: customSizeInput.trim() ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
                  Ajouter
                </Text>
              </TouchableOpacity>
            </View>
            {/* Affichage des tailles custom avec bouton suppression */}
            {sizes.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sizes.map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => toggleSize(s)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 20, backgroundColor: colors.bgHover,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>{s}</Text>
                    <Text style={{ fontSize: 14, color: colors.textMuted }}>×</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Field>
        )}

        {/* Prix custom */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Prix spécifique à cette variante</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>Remplace le prix principal</Text>
          </View>
          <TouchableOpacity onPress={() => setHasCustomPrice(v => !v)} style={[styles.toggle, { backgroundColor: hasCustomPrice ? colors.primary : colors.bgHover }]}>
            <View style={[styles.toggleThumb, { transform: [{ translateX: hasCustomPrice ? 18 : 2 }] }]} />
          </TouchableOpacity>
        </View>
        {hasCustomPrice && (
          <Field label="Prix (₣)" colors={colors}>
            <Input value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="ex: 5000" colors={colors} />
          </Field>
        )}

        {/* Promo */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Prix promotionnel</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>Appliquer une réduction</Text>
          </View>
          <TouchableOpacity onPress={() => setHasPromo(v => !v)} style={[styles.toggle, { backgroundColor: hasPromo ? colors.primary : colors.bgHover }]}>
            <View style={[styles.toggleThumb, { transform: [{ translateX: hasPromo ? 18 : 2 }] }]} />
          </TouchableOpacity>
        </View>
        {hasPromo && (
          <Field label="Prix promo (₣)" colors={colors}>
            <Input value={promoPrice} onChangeText={setPromoPrice} keyboardType="numeric" placeholder="ex: 3500" colors={colors} />
          </Field>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.85}>
          <Text style={styles.submitBtnText}>{initial ? 'Mettre à jour' : 'Ajouter la variante'}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── Générateur de description (identique au web) ─────────────────────────────
function generateDescription({ name, brand, typeName, prix, prixPromo, quantite, variantes }) {
  if (!name?.trim()) return '';
  const lines = [];

  if (brand?.trim()) {
    lines.push(`${name} — par ${brand}`);
    lines.push('');
    lines.push(`Découvrez ${name}, un article de qualité signé ${brand}. Sélectionné avec soin pour allier style, durabilité et rapport qualité-prix exceptionnel, ce produit saura répondre à toutes vos attentes.`);
  } else {
    lines.push(name);
    lines.push('');
    lines.push(`Découvrez ${name}, un article soigneusement sélectionné pour vous offrir le meilleur rapport qualité-prix du marché. Un produit fiable, durable et adapté à vos besoins du quotidien.`);
  }

  if (typeName) {
    lines.push('');
    lines.push('📦 TYPE DE PRODUIT');
    lines.push(`• Type de produit : ${typeName}`);
  }

  if (variantes?.length > 0) {
    const colors = [...new Set(variantes.map(v => v.colorName).filter(Boolean))];
    const allSizes = [...new Set(variantes.flatMap(v => v.sizes || []).filter(s => s && s !== 'Taille unique'))];
    const hasOneSize = variantes.some(v => v.sizes?.includes('Taille unique'));
    const totalStock = variantes.reduce((s, v) => s + Number(v.stock || 0), 0);
    lines.push('');
    lines.push('🎨 DISPONIBILITÉ & VARIANTES');
    if (colors.length > 0) lines.push(`• Coloris disponibles (${colors.length}) : ${colors.join(', ')}`);
    if (allSizes.length > 0) lines.push(`• Tailles disponibles : ${allSizes.join(', ')}`);
    else if (hasOneSize) lines.push('• Taille : Universelle (convient à tous)');
    lines.push(`• Quantité totale en stock : ${totalStock} unité(s)`);
    if (variantes.filter(v => v.hasCustomPrice).length > 0) lines.push('• Certaines variantes disposent de tarifs spécifiques.');
  } else if (quantite) {
    lines.push('');
    lines.push(`📦 Stock disponible : ${Number(quantite).toLocaleString()} unité(s)`);
  }

  if (prix) {
    lines.push('');
    lines.push('💰 TARIFS');
    lines.push(`• Prix de vente : ${Number(prix).toLocaleString()} ₣`);
    if (prixPromo && Number(prixPromo) > 0) {
      const discount = Math.round((1 - Number(prixPromo) / Number(prix)) * 100);
      lines.push(`• 🔥 Prix promotionnel : ${Number(prixPromo).toLocaleString()} ₣ — Vous économisez ${discount}% !`);
    }
  }

  lines.push('');
  lines.push('✅ NOS ENGAGEMENTS');
  lines.push('• Produit 100% authentique, soigneusement vérifié');
  lines.push('• Livraison rapide et soignée dans toutes nos zones de livraison');
  lines.push('• Service client disponible pour toute question avant et après achat');
  lines.push('• Paiement sécurisé — Satisfait ou remboursé');

  return lines.join('\n');
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function ProduitUpdateScreen({ route, navigation }) {
  const { produit: initialProduit } = route.params || {};
  const { colors } = useTheme();
  const { seller } = useAuthStore();
  const insets = useSafeAreaInsets();
  const isEdit = !!initialProduit;
  const sellerId = seller?._id || seller?.id;

  // ── Champs formulaire ───────────────────────────────────────────────────────
  const [name, setName]           = useState('');
  const [prix, setPrix]           = useState('');
  const [prixPromo, setPrixPromo] = useState('0');
  const [quantite, setQuantite]   = useState('');
  const [marque, setMarque]       = useState('');
  const [description, setDescription] = useState('');
  const [prixF, setPrixF]         = useState('0');
  const [weight, setWeight]       = useState('');
  const [typeId, setTypeId]       = useState('');
  // origine calculé automatiquement depuis seller.region/city — pas affiché à l'utilisateur
  const origineRef = React.useRef('');
  const [typeName, setTypeName]   = useState('');

  // Images
  const [img1, setImg1] = useState(null);
  const [img2, setImg2] = useState(null);
  const [img3, setImg3] = useState(null);
  const [imagesToDelete, setImagesToDelete] = useState([]);

  // Variantes
  const [variantes, setVariantes]               = useState([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState([]);
  const [varianteEdit, setVarianteEdit]         = useState(null);
  const [showVarianteSheet, setShowVarianteSheet] = useState(false);

  // Types + catégories lus depuis le store SQLite — disponibles offline
  const storeTypes      = useSyncStore((s) => s.types) ?? [];
  const storeCategories = useSyncStore((s) => s.categories) ?? [];
  const [showTypes, setShowTypes] = useState(false);

  // États
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState({});
  const [generating, setGenerating] = useState(false);

  const descLength = description.replace(/<[^>]*>/g, '').length;

  // ── Initialisation ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Calcule origine depuis seller.region/city exactement comme le web
    // seller.region || seller.city || "Niger"
    origineRef.current = seller?.region || seller?.city || initialProduit?.shipping?.origine || 'Niger';

    if (isEdit && initialProduit) fillForm(initialProduit);
    // Si types/catégories absents du store (jamais synchronisés),
    // on les fetche maintenant et ils seront stockés dans SQLite pour la prochaine fois
    if (storeTypes.length === 0 || storeCategories.length === 0) {
      const { syncService } = require('../services/syncService');
      Promise.allSettled([
        storeTypes.length === 0 ? syncService.fetchOne('types') : Promise.resolve(),
        storeCategories.length === 0 ? syncService.fetchOne('categories') : Promise.resolve(),
      ]);
    }
  }, []);

  const fillForm = (p) => {
    setName(p.name || '');
    setPrix(String(p.prix || ''));
    setPrixPromo(String(p.prixPromo || '0'));
    setQuantite(String(p.quantite || ''));
    setMarque(p.marque || '');
    setDescription(p.description?.replace(/<[^>]*>/g, '') || '');
    setPrixF(String(p.prixF || p.prixf || '0'));
    setWeight(String(p.shipping?.weight || ''));
    // origine chargé depuis le produit existant dans la ref (pas affiché)
    if (p.shipping?.origine) origineRef.current = p.shipping.origine;
    const tId = p.ClefType?._id || p.ClefType;
    const tName = p.ClefType?.nom || p.ClefType?.name || '';
    if (tId) { setTypeId(String(tId)); setTypeName(tName); }
    if (p.image1) setImg1({ uri: p.image1, isNew: false });
    if (p.image2) setImg2({ uri: p.image2, isNew: false });
    if (p.image3) setImg3({ uri: p.image3, isNew: false });
    if (p.variants?.length) {
      setVariantes(p.variants.map(v => ({
        id: v._id || `var_${Date.now()}_${Math.random()}`,
        _id: v._id,
        color: v.colorCode || v.color,
        colorName: v.color || v.colorName,
        sizeType: detectSizeType(v.sizes),
        sizes: v.sizes || [],
        stock: v.stock || 0,
        hasCustomPrice: v.hasCustomPrice || false,
        price: v.price || v.prix || 0,
        isOnPromo: v.isOnPromo || false,
        promoPrice: v.promoPrice || 0,
        imageUrl: v.imageUrl,
        imagePreview: v.imageUrl,
      })));
    }
  };

  // ── Sélecteur image — stocke base64 pour persistance offline ─────────────────
  const pickImage = useCallback(async (slot) => {
    const setters = { 1: setImg1, 2: setImg2, 3: setImg3 };
    const opts = { allowsEditing: true, aspect: [1, 1], quality: 0.75, base64: true };
    Alert.alert('Ajouter une image', '', [
      { text: 'Galerie', onPress: async () => {
        const r = await ImagePicker.launchImageLibraryAsync(opts);
        if (!r.canceled) {
          const a = r.assets[0];
          const ext = a.uri.split('.').pop()?.toLowerCase() || 'jpg';
          setters[slot]({ uri: a.uri, base64: a.base64, ext, isNew: true });
        }
      }},
      { text: 'Caméra', onPress: async () => {
        const r = await ImagePicker.launchCameraAsync(opts);
        if (!r.canceled) {
          const a = r.assets[0];
          const ext = a.uri.split('.').pop()?.toLowerCase() || 'jpg';
          setters[slot]({ uri: a.uri, base64: a.base64, ext, isNew: true });
        }
      }},
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, []);

  const removeImage = useCallback((slot) => {
    const img = { 1: img1, 2: img2, 3: img3 }[slot];
    const setters = { 1: setImg1, 2: setImg2, 3: setImg3 };
    if (img && !img.isNew) setImagesToDelete(p => [...p, `image${slot}`]);
    setters[slot](null);
  }, [img1, img2, img3]);

  // ── Générateur de description ────────────────────────────────────────────────
  const handleGenerateDescription = () => {
    if (!name.trim()) {
      Toast.show({ type: 'info', text1: 'Remplissez d\'abord le nom du produit' });
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      const generated = generateDescription({ name, brand: marque, typeName, prix, prixPromo, quantite, variantes });
      setDescription(generated);
      Toast.show({ type: 'success', text1: 'Description générée ✨' });
      setGenerating(false);
    }, 300);
  };

  // ── Variantes ───────────────────────────────────────────────────────────────
  const onSaveVariante = (v) => {
    setVariantes(prev => {
      const idx = prev.findIndex(x => x.id === v.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = v; return n; }
      return [...prev, v];
    });
  };

  const removeVariante = (id) => {
    const v = variantes.find(x => x.id === id);
    if (v?._id && /^[0-9a-fA-F]{24}$/.test(v._id)) setDeletedVariantIds(p => [...p, v._id]);
    setVariantes(p => p.filter(x => x.id !== id));
  };

  // ── Sauvegarde offline COMPLÈTE avec images en base64 ────────────────────────
  // base64 stocké dans AsyncStorage → survit à la fermeture de l'app
  // Pas besoin d'expo-file-system
  const handleOfflineSave = async () => {
    const { saveImageDraft } = require('../services/imageDraftService');
    const { syncService } = require('../services/syncService');
    const { upsertMany } = require('../db/database');
    const { useSyncStore } = require('../stores/syncStore');

    // 1. Sauvegarde les images en base64 dans AsyncStorage
    const imageDraftKeys = {};
    for (const [slot, img] of [[1, img1], [2, img2], [3, img3]]) {
      if (img?.isNew && img.base64) {
        const draftKey = await saveImageDraft(img.base64, img.ext || 'jpg');
        imageDraftKeys[`image${slot}`] = draftKey;
      }
    }

    // 2. Sauvegarde les images de variantes
    const variantDraftKeys = {};
    for (const [i, v] of variantes.entries()) {
      if (v.imageFile && v.imageBase64) {
        const draftKey = await saveImageDraft(v.imageBase64, v.imageExt || 'jpg');
        variantDraftKeys[`imageVariante${i}`] = draftKey;
      }
    }

    const payload = {
      productId: initialProduit?._id,
      name: name.trim(),
      prix: Number(prix),
      prixPromo: Number(prixPromo) || 0,
      quantite: Number(quantite),
      marque: marque || 'inconnu',
      description,
      prixF: Number(prixF) || 0,
      weight: Number(weight || 0.5),
      origine: origineRef.current || 'Niger',
      shippingZones: [],
      ClefType: typeId || undefined,
      Clefournisseur: typeof initialProduit?.Clefournisseur === 'object'
        ? initialProduit.Clefournisseur._id || sellerId
        : (initialProduit?.Clefournisseur || sellerId),
      sellerOrAdmin: 'seller',
      sellerOrAdmin_id: sellerId,
      variants: variantes.map((v, i) => ({
        colorName: v.colorName, color: v.color,
        sizes: v.sizes || [], stock: Number(v.stock) || 0,
        hasCustomPrice: !!v.hasCustomPrice, price: Number(v.price) || 0,
        isOnPromo: !!v.isOnPromo, promoPrice: Number(v.promoPrice) || 0,
        imageUrl: v.imageUrl || '',
        _id: v._id, isNew: !v._id || !/^[0-9a-fA-F]{24}$/.test(String(v._id)),
        variantIndex: i,
      })),
      deletedVariantIds,
      // Clés AsyncStorage → lues par pushPendingMutations au retour réseau
      imageDraftKeys: Object.keys(imageDraftKeys).length ? imageDraftKeys : undefined,
      variantDraftKeys: Object.keys(variantDraftKeys).length ? variantDraftKeys : undefined,
    };

    const mutType = isEdit ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT';
    await syncService.queueMutation(mutType, payload);

    // Mise à jour SQLite locale immédiate
    // Les URIs locales (file://) sont utilisées pour l'affichage offline
    const localProduct = {
      ...(initialProduit || {}),
      _id: initialProduit?._id || `local_${Date.now()}`,
      name: payload.name,
      prix: payload.prix,
      prixPromo: payload.prixPromo,
      quantite: payload.quantite,
      marque: payload.marque,
      description: payload.description,
      variants: variantes,
      // URIs locales pour affichage immédiat dans la liste même offline
      image1: img1?.uri || initialProduit?.image1 || null,
      image2: img2?.uri || initialProduit?.image2 || null,
      image3: img3?.uri || initialProduit?.image3 || null,
      isPublished: initialProduit?.isPublished || 'Attente',
      _pendingSync: true, // badge "en attente de sync" possible dans la liste
    };
    await upsertMany('produits', [localProduct], p => String(p._id)).catch(() => {});

    // Met à jour le store mémoire → produit visible dans la liste immédiatement
    const current = useSyncStore.getState().produits ?? [];
    const idx = current.findIndex(p => String(p._id) === String(localProduct._id));
    const newList = idx >= 0
      ? current.map((p, i) => i === idx ? localProduct : p)
      : [localProduct, ...current]; // nouveau produit en tête de liste
    useSyncStore.getState().setStoreData('produits', newList);

    // Mise à jour du compteur de mutations en attente
    useSyncStore.getState().setPendingCount(
      (useSyncStore.getState().pendingCount || 0) + 1
    );

    Toast.show({
      type: 'info',
      text1: isEdit ? 'Modifié hors ligne ✓' : 'Produit créé hors ligne ✓',
      text2: 'Sera synchronisé automatiquement dès le retour du réseau.',
    });
    navigation.goBack();
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};

    // Champs obligatoires — mêmes vérifications que le web (AdminStoreProductUpdate)
    if (!name.trim())
      e.name = 'Nom du produit requis';

    if (!prix || isNaN(parseFloat(prix)) || parseFloat(prix) < 40)
      e.prix = 'Prix incorrect (minimum 40 ₣)';

    if (prixPromo && parseFloat(prixPromo) > 0 && parseFloat(prixPromo) >= parseFloat(prix))
      e.prixPromo = 'Le prix promo doit être inférieur au prix normal';

    if (!quantite || isNaN(parseInt(quantite)) || parseInt(quantite) < 1)
      e.quantite = 'Quantité invalide (minimum 1)';

    if (!typeId || typeId === 'Choisir')
      e.typeId = 'Type de produit requis';

    if (!img1)
      e.img1 = 'Image principale requise';

    if (description.trim().length > 0 && description.trim().length < 20)
      e.description = 'Description trop courte (minimum 20 caractères)';

    if (!prixF || isNaN(parseFloat(prixF)) || parseFloat(prixF) <= 0)
      e.prixF = 'Prix fournisseur requis';
    // Poids : pas bloquant — fallback 0.5 comme sur le web (form.weight || 0.5)

    setErrors(e);

    if (Object.keys(e).length > 0) {
      // Affiche le premier message d'erreur précis à l'utilisateur
      const firstMsg = Object.values(e)[0];
      Toast.show({
        type: 'error',
        text1: 'Formulaire incomplet',
        text2: firstMsg,
        visibilityTime: 4000,
      });
      return false;
    }
    return true;
  };

  // ── Soumission (offline-aware) ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    // Détecte la connectivité
    const NetInfo = require('@react-native-community/netinfo').default;
    const { isConnected } = await NetInfo.fetch();

    // Offline → handleOfflineSave gère tous les cas (avec et sans images)
    // Les images sont stockées en base64 dans SQLite — pas besoin de réseau
    if (!isConnected) {
      try {
        await handleOfflineSave();
      } finally {
        setSaving(false);
      }
      return;
    }

    // Online → API directe
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('prix', prix);
      form.append('quantite', quantite);
      form.append('marque', marque || 'inconnu');
      form.append('description', description);
      form.append('prixF', prixF || '0');
      form.append('prixPromo', prixPromo || '0');
      form.append('sellerOrAdmin', 'seller');
      form.append('sellerOrAdmin_id', sellerId);
      form.append('Clefournisseur', typeof initialProduit?.Clefournisseur === 'object' ? initialProduit.Clefournisseur._id || sellerId : (initialProduit?.Clefournisseur || sellerId));
      if (typeId) form.append('ClefType', typeId);
      // Identique au web : Number(form.weight || 0.5) — jamais vide
      form.append('weight', String(Number(weight || 0.5)));
      form.append('origine', origineRef.current || 'Niger');
      form.append('shippingZones', JSON.stringify([]));
      if (deletedVariantIds.length) form.append('deletedVariantIds', JSON.stringify(deletedVariantIds));
      if (imagesToDelete.length) form.append('imagesToDelete', JSON.stringify(imagesToDelete));

      // Images principales
      for (const [slot, img] of [[1, img1], [2, img2], [3, img3]]) {
        if (img?.isNew) {
          const ext = img.uri.split('.').pop()?.toLowerCase() || 'jpg';
          form.append(`image${slot}`, { uri: img.uri, name: `img${slot}.${ext}`, type: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
        }
      }

      // Variantes — format exact attendu par productService.prepareAdvancedUpdateData
      // backend lit: variant.colorName → color, variant.color → colorCode
      const variantsToSend = variantes.map((v, i) => {
        const obj = {
          colorName: v.colorName,   // nom affiché → stocké dans color côté DB
          color: v.color,           // code hex   → stocké dans colorCode côté DB
          sizes: v.sizes || [],
          stock: Number(v.stock) || 0,
          hasCustomPrice: !!v.hasCustomPrice,
          price: Number(v.price) || 0,
          isOnPromo: !!v.isOnPromo,
          promoPrice: Number(v.promoPrice) || 0,
          imageUrl: v.imageUrl || '',
          variantIndex: i,
        };
        // Variante existante (MongoDB _id)
        if (v._id && /^[0-9a-fA-F]{24}$/.test(String(v._id))) {
          obj._id = v._id;
          obj.isNew = false;
        } else {
          obj.isNew = true;
        }
        return obj;
      });

      if (__DEV__) console.log('[submit] variants:', variantsToSend.length, 'variantes');
      form.append('variants', JSON.stringify(variantsToSend));

      // Images variantes nouvelles
      variantes.forEach((v, i) => {
        if (v.imageFile) {
          const uri = v.imageFile;
          const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
          form.append(`imageVariante${i}`, { uri, name: `var${i}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
        }
      });

      const url    = isEdit ? `/Product2/${initialProduit._id}` : '/product';
      const method = isEdit ? 'put' : 'post';

      if (__DEV__) console.log('[submit] URL:', url, 'method:', method);
      const res = await apiClient[method](url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2min pour les uploads images sur réseau mobile
      });
      if (__DEV__) console.log('[submit] status:', res.status);

      if (res.data?.success !== false) {
        const updatedProduit = res.data?.data;
        const { useSyncStore } = require('../stores/syncStore');
        const { upsertMany } = require('../db/database');

        if (updatedProduit?._id) {
          // Met à jour SQLite + store mémoire immédiatement — visible dès goBack()
          await upsertMany('produits', [updatedProduit], p => String(p._id)).catch(() => {});
          const current = useSyncStore.getState().produits ?? [];
          const idx = current.findIndex(p => String(p._id) === String(updatedProduit._id));
          const newList = idx >= 0
            ? current.map((p, i) => i === idx ? updatedProduit : p)
            : [updatedProduit, ...current];
          useSyncStore.getState().setStoreData('produits', newList);
        }

        // Refetch en arrière-plan pour être sûr que tout est frais
        useSyncStore.getState().invalidate('produits').catch(() => {});

        Toast.show({ type: 'success', text1: isEdit ? 'Produit mis à jour !' : 'Produit créé !', text2: res.data?.message || '' });
        navigation.goBack();
      } else {
        Toast.show({ type: 'error', text1: 'Échec', text2: res.data?.message || 'Erreur inconnue' });
      }
    } catch (e) {
      if (__DEV__) console.error('[submit] erreur:', e.response?.data || e.message);
      Toast.show({ type: 'error', text1: 'Erreur', text2: e.response?.data?.message || e.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgCard, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
        </Text>
        <TouchableOpacity style={[styles.headerSaveBtn, saving && { opacity: 0.5 }]} onPress={handleSubmit} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.headerSaveBtnText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Informations de base ─────────────────────────────────── */}
          <SectionHeader icon="cube-outline" title="Informations de base" colors={colors} />

          <Field label="Nom du produit" required colors={colors} error={errors.name}>
            <Input value={name} onChangeText={setName} placeholder="Entrez le nom du produit" colors={colors} error={errors.name} />
          </Field>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Field label="Prix (₣)" required colors={colors} error={errors.prix}>
                <Input value={prix} onChangeText={setPrix} keyboardType="numeric" placeholder="0" colors={colors} error={errors.prix} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Prix promotionnel (₣)" colors={colors} error={errors.prixPromo}>
                <Input value={prixPromo} onChangeText={setPrixPromo} keyboardType="numeric" placeholder="0" colors={colors} error={errors.prixPromo} />
              </Field>
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Field label="Quantité" required colors={colors} error={errors.quantite}>
                <Input value={quantite} onChangeText={setQuantite} keyboardType="numeric" placeholder="1" colors={colors} error={errors.quantite} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Marque" colors={colors}>
                <Input value={marque} onChangeText={setMarque} placeholder="ex: Nike" colors={colors} />
              </Field>
            </View>
          </View>

          <Field label="Prix fournisseur (₣)" required colors={colors} error={errors.prixF}>
            <Input value={prixF} onChangeText={setPrixF} keyboardType="numeric" placeholder="0" colors={colors} error={errors.prixF} />
          </Field>

          {/* Type de produit */}
          <Field label="Type de produits" required colors={colors} error={errors.typeId}>
            <TouchableOpacity
              style={[styles.select, {
                borderColor: errors.typeId ? colors.danger : colors.border,
                backgroundColor: colors.bgInput,
                borderWidth: 1.5,
              }]}
              onPress={() => setShowTypes(true)} activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, flex: 1, color: typeName ? colors.text : colors.textPlaceholder }}>
                {typeName || 'Choisir un type...'}
              </Text>
              {typeName && (
                <View style={[styles.typeSelectedBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>{typeName}</Text>
                </View>
              )}
              <Ionicons name="chevron-down" size={16} color={errors.typeId ? colors.danger : colors.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* ── Images ───────────────────────────────────────────────── */}
          <SectionHeader icon="images-outline" title="Images du produit" colors={colors} />
          {errors.img1 && <Text style={[styles.fieldError, { color: colors.danger, marginBottom: 6 }]}>{errors.img1}</Text>}

          <View style={styles.imagesGrid}>
            <ImageSlot label="Image principale" uri={img1?.uri} onPick={() => pickImage(1)} onRemove={() => removeImage(1)} required colors={colors} />
            <ImageSlot label="Image 2" uri={img2?.uri} onPick={() => pickImage(2)} onRemove={() => removeImage(2)} colors={colors} />
            <ImageSlot label="Image 3" uri={img3?.uri} onPick={() => pickImage(3)} onRemove={() => removeImage(3)} colors={colors} />
          </View>

          {/* ── Description ──────────────────────────────────────────── */}
          <SectionHeader icon="document-text-outline" title="Description" colors={colors} />

          <Field label="" colors={colors} error={errors.description}>
            {/* Header description avec bouton générer */}
            <View style={styles.descHeader}>
              <Text style={[styles.fieldLabel, { color: colors.textSub }]}>
                Description <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(optionnel)</Text>
              </Text>
              {name.trim().length > 0 && (
                <TouchableOpacity
                  style={[styles.generateBtn, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}08` }]}
                  onPress={handleGenerateDescription}
                  disabled={generating}
                  activeOpacity={0.8}
                >
                  {generating
                    ? <ActivityIndicator size={10} color={colors.primary} />
                    : <Ionicons name="sparkles" size={12} color={colors.primary} />
                  }
                  <Text style={[styles.generateBtnText, { color: colors.primary }]}>
                    {generating ? 'Génération...' : 'Générer automatiquement'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={[
                styles.input,
                styles.descInput,
                { borderColor: errors.description ? colors.danger : colors.border, backgroundColor: colors.bgInput, color: colors.text },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Décrivez votre produit ou cliquez sur Générer..."
              placeholderTextColor={colors.textPlaceholder}
              multiline
              textAlignVertical="top"
            />

            {/* Footer description */}
            <View style={styles.descFooter}>
              <View style={styles.descHint}>
                <Ionicons name="flash-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.descHintText, { color: colors.textMuted }]}>Faites défiler pour voir tout le contenu</Text>
              </View>
              <View style={[styles.descCount, { backgroundColor: descLength >= 80 ? colors.primaryLight : colors.bgHover }]}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: descLength >= 80 ? colors.primary : colors.textMuted }}>
                  {descLength} caractères{descLength >= 80 ? ' ✓' : ''}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
              Décrivez votre produit en détail pour aider vos clients à comprendre ses caractéristiques et avantages.
            </Text>
          </Field>

          {/* ── Variantes ─────────────────────────────────────────────── */}
          <SectionHeader icon="color-palette-outline" title="Variantes du produit" colors={colors} />

          {variantes.length === 0 && (
            <Text style={[styles.noVarianteText, { color: colors.textMuted }]}>Aucune variante ajoutée pour l'instant</Text>
          )}

          {variantes.map(v => (
            <View key={v.id} style={[styles.varianteRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[styles.varianteDot, { backgroundColor: v.color || '#ccc' }]} />
              {v.imagePreview ? <CachedImage uri={v.imagePreview} style={styles.varianteThumb} contentFit="cover" /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.varianteName, { color: colors.text }]}>{v.colorName}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                  Stock: {v.stock}
                  {v.hasCustomPrice ? ` · ${v.price} ₣` : ''}
                  {v.sizes?.length ? ` · ${v.sizes.join(', ')}` : ''}
                  {v.isOnPromo ? ` · Promo: ${v.promoPrice} ₣` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setVarianteEdit(v); setShowVarianteSheet(true); }} style={{ padding: 6 }}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeVariante(v.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addVarianteBtn, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
            onPress={() => { setVarianteEdit(null); setShowVarianteSheet(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.addVarianteBtnText, { color: colors.primary }]}>Ajouter une variante</Text>
          </TouchableOpacity>

          {/* ── Livraison ─────────────────────────────────────────────── */}
          <SectionHeader icon="car-outline" title="Livraison" colors={colors} />

          <Field label="Poids (kg)" colors={colors} hint="Optionnel — 0.5 kg par défaut">
            <Input value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="ex: 0.5" colors={colors} />
          </Field>

          {/* ── Bouton final ──────────────────────────────────────────── */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, flex: 2 }, saving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{isEdit ? 'Mettre à jour' : 'Créer le produit'}</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom sheet — sélection type (groupé par catégorie comme sur le web) */}
      <BottomSheet visible={showTypes} onClose={() => setShowTypes(false)} title="Type de produits" colors={colors} maxHeight="75%">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {(() => {
            // Groupe les types par catégorie (identique à la logique web)
            const catMap = Object.fromEntries(storeCategories.map(c => [String(c._id), c.name || c.nom]));
            const grouped = {};
            storeTypes.forEach(t => {
              const catKey = String(t.clefCategories || t.ClefCategorie || 'autres');
              const catLabel = catMap[catKey] || 'Autres';
              if (!grouped[catLabel]) grouped[catLabel] = [];
              grouped[catLabel].push(t);
            });
            return Object.entries(grouped).map(([catLabel, catTypes]) => (
              <View key={catLabel}>
                {/* Header catégorie */}
                <View style={[styles.typeCatHeader, { backgroundColor: colors.bgHover, borderBottomColor: colors.border }]}>
                  <Text style={[styles.typeCatLabel, { color: colors.textMuted }]}>{catLabel.toUpperCase()}</Text>
                </View>
                {catTypes.map(t => (
                  <TouchableOpacity
                    key={String(t._id)}
                    style={[styles.typeRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setTypeId(String(t._id));
                      setTypeName(`${t.nom || t.name} → ${catLabel}`);
                      setShowTypes(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeRowText, { color: colors.text }]}>{t.nom || t.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{catLabel}</Text>
                    </View>
                    {String(t._id) === typeId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            ));
          })()}
        </ScrollView>
      </BottomSheet>

      {/* Bottom sheet — variante */}
      <VarianteSheet
        visible={showVarianteSheet}
        initial={varianteEdit}
        defaultPrice={prix}
        defaultPromoPrice={prixPromo}
        onSave={onSaveVariante}
        onClose={() => { setShowVarianteSheet(false); setVarianteEdit(null); }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headerBackBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  headerSaveBtn: { backgroundColor: '#30A08B', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 44, alignItems: 'center' },
  headerSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Scroll
  scroll: { padding: 16, gap: 4, paddingBottom: 60 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 16, marginBottom: 8 },
  sectionHeaderText: { fontSize: 13, fontWeight: '700' },

  // Field
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldError: { fontSize: 11, marginTop: 4 },
  fieldHint: { fontSize: 11, marginTop: 3 },
  row2: { flexDirection: 'row', gap: 10 },

  // Input
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, gap: 8 },
  typeSelectedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // Images
  imagesGrid: { flexDirection: 'row', gap: 8 },
  imgSlotWrap: { flex: 1, gap: 4 },
  imgSlotLabel: { fontSize: 10, fontWeight: '600' },
  imgSlot: { width: '100%', aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  imgSlotImg: { width: '100%', height: '100%' },
  imgSlotRemove: { position: 'absolute', top: 4, right: 4 },
  imgSlotEmpty: { alignItems: 'center', gap: 4 },
  imgSlotEmptyText: { fontSize: 10 },

  // Description
  descHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  generateBtnText: { fontSize: 11, fontWeight: '600' },
  descInput: { minHeight: 120, textAlignVertical: 'top', paddingTop: 12 },
  descFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  descHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  descHintText: { fontSize: 11 },
  descCount: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },

  // Variantes
  noVarianteText: { fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  varianteRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 10 },
  varianteDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  varianteThumb: { width: 36, height: 36, borderRadius: 8, flexShrink: 0 },
  varianteName: { fontSize: 13, fontWeight: '700' },
  addVarianteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginBottom: 4 },
  addVarianteBtnText: { fontSize: 14, fontWeight: '600' },

  // Boutons bas
  bottomActions: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 20 },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  submitBtn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Bottom sheet
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24 },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 20, marginBottom: 8 },

  // Types
  typeCatHeader: { paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1 },
  typeCatLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1 },
  typeRowText: { fontSize: 14, fontWeight: '500' },

  // Couleurs
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  colorSwatchSelected: { transform: [{ scale: 1.15 }], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, elevation: 4 },

  // Variante sheet
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  sizeChip: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, elevation: 2 },
  varImgSlot: { width: 80, height: 80, borderRadius: 14, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
});
