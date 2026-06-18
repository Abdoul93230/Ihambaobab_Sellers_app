import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, Modal, ScrollView, Alert, Animated, KeyboardAvoidingView,
  TouchableWithoutFeedback, Linking, Dimensions, Platform, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useSyncStore } from '../stores/syncStore';
import { syncService } from '../services/syncService';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { updateBilanCache } from '../db/database';
import CachedImage from '../components/CachedImage';
import Toast from 'react-native-toast-message';

const W = Dimensions.get('window').width;
const WEB_URL = 'https://ihambaobab.com';

function fmtCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' ₣';
}

// ─── Custom Bottom Sheet ──────────────────────────────────────────────────────
function CustomBottomSheet({ visible, onClose, children, maxHeight = '85%', bgColor }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
          <View style={[cStyles.sheet, { backgroundColor: bgColor, maxHeight, paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity activeOpacity={1} style={cStyles.handleArea} onPress={onClose}>
              <View style={cStyles.handle} />
            </TouchableOpacity>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, elevation: 24,
  },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
});

// ─── Indicatifs pays ──────────────────────────────────────────────────────────
// Identiques au web — avec format pour formatPhoneInput
const COUNTRY_CODES = [
  { code: '+227', flag: '🇳🇪', name: 'Niger',          format: 'XX XX XX XX',    digits: 8  },
  { code: '+223', flag: '🇲🇱', name: 'Mali',           format: 'XX XX XX XX',    digits: 8  },
  { code: '+226', flag: '🇧🇫', name: 'Burkina Faso',   format: 'XX XX XX XX',    digits: 8  },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire",  format: 'XX XX XX XX XX', digits: 10 },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal',        format: 'XX XXX XX XX',   digits: 9  },
  { code: '+229', flag: '🇧🇯', name: 'Bénin',          format: 'XX XX XX XX',    digits: 8  },
  { code: '+228', flag: '🇹🇬', name: 'Togo',           format: 'XX XX XX XX',    digits: 8  },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria',        format: 'XXX XXX XXXX',   digits: 10 },
  { code: '+33',  flag: '🇫🇷', name: 'France',         format: 'X XX XX XX XX',  digits: 10 },
  { code: '+212', flag: '🇲🇦', name: 'Maroc',          format: 'XX XX XX XX XX', digits: 10 },
  { code: '+261', flag: '🇲🇬', name: 'Madagascar',     format: 'XX XX XXX XX',   digits: 9  },
];

// Formate le numéro selon le format du pays — identique au web
function formatPhoneInput(raw, format) {
  const digits = raw.replace(/\D/g, '');
  const groups = format.split(' ').map(g => g.length);
  let result = '';
  let idx = 0;
  for (let g = 0; g < groups.length; g++) {
    const chunk = digits.slice(idx, idx + groups[g]);
    if (!chunk) break;
    result += (g > 0 && result ? ' ' : '') + chunk;
    idx += groups[g];
  }
  return result;
}

// ─── Clé unique d'une ligne panier ────────────────────────────────────────────
const ligneKey = (l) => `${l.produitId}__${l.varianteLabel || ''}`;

// ─── Carte produit ────────────────────────────────────────────────────────────
const SEUIL_STOCK_BAS = 3; // stock faible si ≤ 3

function ProduitCard({ produit, qtePanier, onTap, onDecrement, colors }) {
  const enPromo    = produit.prixPromo > 0;
  const prix       = enPromo ? produit.prixPromo : produit.prix;
  const hasVar     = produit.variants?.length > 0;
  const stockTotal = hasVar
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);
  const enRupture   = stockTotal <= 0;
  const stockBas    = !enRupture && stockTotal <= SEUIL_STOCK_BAS;
  // Bloque l'ajout si le panier a déjà tout le stock disponible
  const stockAtteint = !hasVar && qtePanier >= stockTotal && stockTotal > 0;

  const handleTap = () => {
    if (enRupture || stockAtteint) return;
    onTap(produit);
  };

  return (
    <View style={[
      styles.prodCard,
      {
        backgroundColor: colors.bgCard,
        borderColor: enRupture
          ? colors.border
          : qtePanier > 0
            ? colors.primary
            : stockBas
              ? '#F59E0B'
              : colors.border,
      },
      qtePanier > 0 && { borderWidth: 2 },
      stockBas && !qtePanier && { borderWidth: 1.5 },
      enRupture && { opacity: 0.4 },
    ]}>
      {/* Zone image — tap pour ajouter */}
      <TouchableOpacity
        onPress={handleTap}
        disabled={enRupture || stockAtteint}
        activeOpacity={0.8}
        style={[styles.prodImgWrap, { backgroundColor: colors.bgHover }]}
      >
        <CachedImage uri={produit.image1} style={StyleSheet.absoluteFill} contentFit="cover"
          placeholderIcon="cube-outline" placeholderBg={colors.bgHover} />
        {enPromo && !enRupture && (
          <View style={styles.promoBadge}><Text style={styles.promoBadgeText}>PROMO</Text></View>
        )}
        {hasVar && !enRupture && !qtePanier && (
          <View style={styles.varBadge}>
            <Ionicons name="chevron-down" size={9} color="#fff" />
            <Text style={styles.varBadgeText}>variantes</Text>
          </View>
        )}
        {stockBas && !enRupture && !qtePanier && (
          <View style={styles.stockBasBadge}>
            <Ionicons name="warning-outline" size={9} color="#fff" />
            <Text style={styles.stockBasBadgeText}>Stock bas ({stockTotal})</Text>
          </View>
        )}
        {stockAtteint && (
          <View style={[styles.ruptureMask, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <Text style={[styles.ruptureText, { backgroundColor: '#F59E0B' }]}>Max atteint</Text>
          </View>
        )}
        {enRupture && (
          <View style={styles.ruptureMask}>
            <Text style={styles.ruptureText}>Rupture</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Infos + stepper si dans le panier */}
      <View style={styles.prodInfo}>
        <TouchableOpacity onPress={handleTap} activeOpacity={0.7} disabled={enRupture || stockAtteint}>
          <Text style={[styles.prodNom, { color: enRupture ? colors.textMuted : colors.text }]} numberOfLines={2}>
            {produit.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Text style={[styles.prodPrix, { color: enRupture ? colors.textMuted : colors.primary }]}>
              {fmtCFA(prix)}
            </Text>
            {enPromo && <Text style={[styles.prodPrixBarre, { color: colors.textMuted }]}>{fmtCFA(produit.prix)}</Text>}
          </View>
          {hasVar && !qtePanier && (
            <Text style={[styles.prodVariantesHint, { color: colors.textMuted }]}>
              {produit.variants.length} couleur{produit.variants.length > 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>

        {/* Stepper −/+ visible quand qtePanier > 0 */}
        {qtePanier > 0 && (
          <View style={styles.prodStepper}>
            <TouchableOpacity
              onPress={() => onDecrement(produit)}
              style={[styles.prodStepBtn, { backgroundColor: colors.bgDanger }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name={qtePanier === 1 ? 'trash-outline' : 'remove'} size={13}
                color={qtePanier === 1 ? colors.dangerText : colors.danger} />
            </TouchableOpacity>
            <Text style={[styles.prodStepQte, { color: colors.text, borderColor: colors.border }]}>
              {qtePanier}
            </Text>
            <TouchableOpacity
              onPress={handleTap}
              disabled={stockAtteint}
              style={[styles.prodStepBtn, {
                backgroundColor: stockAtteint ? colors.bgHover : colors.primaryLight,
                opacity: stockAtteint ? 0.5 : 1,
              }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="add" size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Modal sélection variante ─────────────────────────────────────────────────
function VariantModal({ visible, produit, onSelect, onClose, colors }) {
  const [selectedVar, setSelectedVar]     = useState(null);
  const [selectedTaille, setSelectedTaille] = useState('');
  const insets = useSafeAreaInsets();

  const variants         = produit.variants || [];
  const couleursDispos   = variants.filter(v => v.stock > 0);
  const enPromo          = produit.prixPromo > 0;
  const prixBase         = enPromo ? produit.prixPromo : produit.prix;

  const getPrix = (v) => {
    if (!v) return prixBase;
    if (v.isOnPromo && v.promoPrice > 0) return v.promoPrice;
    if (v.hasCustomPrice && v.price > 0) return v.price;
    return prixBase;
  };

  const prix          = getPrix(selectedVar);
  const taillesDispos = selectedVar?.sizes || [];
  const canAdd        = selectedVar && (!taillesDispos.length || selectedTaille);

  const handleAdd = () => {
    if (!canAdd) return;
    const varLabel = [selectedVar.color, selectedTaille].filter(Boolean).join(' / ');
    onSelect({
      produitId:    String(produit._id),
      nom:          produit.name,
      image:        selectedVar.imageUrl || produit.image1,
      prixUnitaire: prix,
      quantite:     1,
      varianteLabel:varLabel,
      variantId:    String(selectedVar._id),
      couleurs:     [selectedVar.color || selectedVar.colorCode],
      tailles:      selectedTaille ? [selectedTaille] : [],
      sousTotal:    prix,
    });
    onClose();
  };

  return (
    <CustomBottomSheet visible={visible} onClose={onClose} bgColor={colors.bgCard} maxHeight="80%">
          {/* Header */}
          <View style={[styles.varHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              {produit.image1 && (
                <CachedImage uri={produit.image1} style={styles.varHeaderImg} contentFit="cover" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.varHeaderNom, { color: colors.text }]} numberOfLines={1}>{produit.name}</Text>
                <Text style={[styles.varHeaderPrix, { color: colors.primary }]}>{fmtCFA(prix)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* Couleurs */}
            <View>
              <Text style={[styles.varSectionLabel, { color: colors.textMuted }]}>COULEUR</Text>
              {couleursDispos.length === 0
                ? <Text style={{ color: colors.danger, fontSize: 13 }}>Aucune variante en stock</Text>
                : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {couleursDispos.map(v => (
                      <TouchableOpacity
                        key={String(v._id)}
                        onPress={() => { setSelectedVar(v); setSelectedTaille(''); }}
                        style={[
                          styles.varChip,
                          { borderColor: selectedVar?._id === v._id ? colors.primary : colors.border },
                          selectedVar?._id === v._id && { backgroundColor: colors.primaryLight },
                        ]}
                      >
                        {(v.colorCode || v.color) && (
                          <View style={[styles.colorDot, { backgroundColor: v.colorCode || '#999' }]} />
                        )}
                        <Text style={[styles.varChipText, { color: selectedVar?._id === v._id ? colors.primary : colors.textSub }]}>
                          {v.color}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>({v.stock})</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
              }
            </View>

            {/* Tailles */}
            {selectedVar && taillesDispos.length > 0 && (
              <View>
                <Text style={[styles.varSectionLabel, { color: colors.textMuted }]}>TAILLE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {taillesDispos.map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setSelectedTaille(t)}
                      style={[
                        styles.varChip,
                        { borderColor: selectedTaille === t ? colors.primary : colors.border },
                        selectedTaille === t && { backgroundColor: colors.primaryLight },
                      ]}
                    >
                      <Text style={[styles.varChipText, { color: selectedTaille === t ? colors.primary : colors.textSub }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Récap prix */}
            {selectedVar && (
              <View style={[styles.varPrixRecap, { backgroundColor: colors.bgSuccess }]}>
                <Text style={[styles.varPrixLabel, { color: colors.successText }]}>Prix unitaire</Text>
                <Text style={[styles.varPrixValue, { color: colors.primary }]}>{fmtCFA(prix)}</Text>
              </View>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={handleAdd}
              disabled={!canAdd}
              style={[styles.varAddBtn, { backgroundColor: canAdd ? colors.primary : colors.bgHover }]}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color={canAdd ? '#fff' : colors.textMuted} />
              <Text style={[styles.varAddBtnText, { color: canAdd ? '#fff' : colors.textMuted }]}>
                Ajouter au panier
              </Text>
            </TouchableOpacity>
          </View>
    </CustomBottomSheet>
  );
}

// ─── Modal encaissement ───────────────────────────────────────────────────────
function CheckoutModal({ visible, panier, total, remise, onConfirm, onClose, saving, colors }) {
  const insets = useSafeAreaInsets();
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [montantRecu, setMontantRecu]   = useState('');
  const [country, setCountry]           = useState(COUNTRY_CODES[0]);
  const [phoneVal, setPhoneVal]         = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [telephoneClient, setTelephoneClient]     = useState('');

  // Reset complet à chaque ouverture du modal
  useEffect(() => {
    if (visible) {
      setModePaiement('ESPECES');
      setMontantRecu('');
      setCountry(COUNTRY_CODES[0]);
      setPhoneVal('');
      setTelephoneClient('');
      setShowCountryPicker(false);
    }
  }, [visible]);

  const montantNum = Number(montantRecu) || 0;
  // Si champ vide → on considère montant reçu = total (comme sur le web)
  const montantEffectif = montantNum > 0 ? montantNum : total;
  const monnaie    = modePaiement === 'ESPECES' && montantNum >= total ? montantNum - total : 0;
  // Toujours confirmable — si espèces sans montant saisi, on prend total comme montant reçu
  const canConfirm = true;

  const handlePhoneChange = (val) => {
    // Formate selon le pays — identique au web
    const formatted = formatPhoneInput(val, country.format);
    setPhoneVal(formatted);
    const digits = formatted.replace(/\s/g, '');
    setTelephoneClient(digits.length > 0 ? `${country.code}${digits}` : '');
  };

  const isPhoneComplete = phoneVal.replace(/\s/g, '').length >= country.digits;

  return (
    <CustomBottomSheet visible={visible} onClose={onClose} bgColor={colors.bgCard} maxHeight="90%">
          <View style={[styles.checkoutHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.checkoutTitle, { color: colors.text }]}>Encaissement</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Récap panier */}
            <View style={[styles.checkoutRecap, { backgroundColor: colors.bgHover }]}>
              {panier.map((l, i) => (
                <View key={i} style={styles.checkoutLine}>
                  <Text style={[styles.checkoutLineNom, { color: colors.textSub }]} numberOfLines={1}>
                    {l.nom}{l.varianteLabel ? ` — ${l.varianteLabel}` : ''} ×{l.quantite}
                  </Text>
                  <Text style={[styles.checkoutLinePrix, { color: colors.text }]}>{fmtCFA(l.sousTotal)}</Text>
                </View>
              ))}
              {remise > 0 && (
                <View style={[styles.checkoutLine, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={{ fontSize: 12, color: colors.danger }}>Remise</Text>
                  <Text style={{ fontSize: 12, color: colors.danger }}>-{fmtCFA(remise)}</Text>
                </View>
              )}
              <View style={[styles.checkoutTotal, { borderTopColor: colors.border }]}>
                <Text style={[styles.checkoutTotalLabel, { color: colors.text }]}>Total à payer</Text>
                <Text style={[styles.checkoutTotalValue, { color: colors.primary }]}>{fmtCFA(total)}</Text>
              </View>
            </View>

            {/* Mode paiement */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MODE DE PAIEMENT</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                {[
                  { id: 'ESPECES',      label: 'Espèces',      icon: 'cash-outline'       },
                  { id: 'MOBILE_MONEY', label: 'Mobile Money', icon: 'phone-portrait-outline' },
                ].map(({ id, label, icon }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setModePaiement(id)}
                    style={[
                      styles.modeBtn,
                      { borderColor: modePaiement === id ? colors.primary : colors.border },
                      modePaiement === id && { backgroundColor: colors.primaryLight },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={icon} size={22} color={modePaiement === id ? colors.primary : colors.textMuted} />
                    <Text style={[styles.modeBtnText, { color: modePaiement === id ? colors.primary : colors.textSub }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Montant reçu (espèces) */}
            {modePaiement === 'ESPECES' && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MONTANT REÇU</Text>
                <TextInput
                  style={[styles.montantInput, { borderColor: colors.border, backgroundColor: colors.bgInput, color: colors.text }]}
                  value={montantRecu}
                  onChangeText={setMontantRecu}
                  keyboardType="numeric"
                  placeholder={String(total)}
                  placeholderTextColor={colors.textPlaceholder}
                />
                {/* Monnaie à rendre si montant saisi >= total */}
                {montantNum >= total && montantNum > 0 && (
                  <View style={[styles.monnaieBox, { backgroundColor: colors.bgSuccess }]}>
                    <Text style={[styles.monnaieLabel, { color: colors.successText }]}>💵 Monnaie à rendre</Text>
                    <Text style={[styles.monnaieValue, { color: colors.primary }]}>{fmtCFA(monnaie)}</Text>
                  </View>
                )}
                {/* Manque — seulement informatif, ne bloque pas */}
                {montantNum > 0 && montantNum < total && (
                  <Text style={{ fontSize: 11, color: colors.warningText, marginTop: 4 }}>
                    Manque {fmtCFA(total - montantNum)} — le total sera utilisé
                  </Text>
                )}
                {/* Si champ vide : on prend le total exact */}
                {montantNum === 0 && (
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                    Laissez vide pour montant exact ({fmtCFA(total)})
                  </Text>
                )}
              </View>
            )}

            {/* Téléphone client */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                TÉLÉPHONE CLIENT{' '}
                <Text style={{ color: colors.textMuted, textTransform: 'none', fontWeight: '400' }}>
                  (optionnel — reçu WhatsApp)
                </Text>
              </Text>
              <View style={[styles.phoneRow, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
                <TouchableOpacity
                  style={[styles.countryBtn, { borderRightColor: colors.border }]}
                  onPress={() => setShowCountryPicker(v => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 18 }}>{country.flag}</Text>
                  <Text style={[styles.countryCode, { color: colors.textSub }]}>{country.code}</Text>
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.phoneInput, { color: colors.text }]}
                  value={phoneVal}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  placeholder={country.format.replace(/X/g, '0')}
                  placeholderTextColor={colors.textPlaceholder}
                  maxLength={country.format.length}
                />
                {isPhoneComplete && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginRight: 12 }} />
                )}
              </View>

              {/* Picker pays — Modal bottom sheet custom */}
              <Modal
                visible={showCountryPicker}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setShowCountryPicker(false)}
              >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowCountryPicker(false)} activeOpacity={1} />
                  <View style={[styles.countryPickerSheet, { backgroundColor: colors.bgCard }]}>
                    <View style={styles.countryPickerHandle}>
                      <View style={[styles.countryPickerHandleBar, { backgroundColor: colors.border }]} />
                    </View>
                    <Text style={[styles.countryPickerTitle, { color: colors.text }]}>Indicatif pays</Text>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                      {COUNTRY_CODES.map(c => (
                        <TouchableOpacity
                          key={c.code}
                          style={[styles.countryRow, {
                            borderBottomColor: colors.border,
                            backgroundColor: country.code === c.code ? colors.primaryLight : 'transparent',
                          }]}
                          onPress={() => { setCountry(c); setPhoneVal(''); setTelephoneClient(''); setShowCountryPicker(false); }}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 24 }}>{c.flag}</Text>
                          <Text style={[styles.countryName, { color: colors.text }]}>{c.name}</Text>
                          <Text style={[styles.countryCodeText, { color: colors.primary, fontWeight: '700' }]}>{c.code}</Text>
                          {country.code === c.code && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={() => onConfirm({ modePaiement, montantRecu: montantEffectif, monnaie, telephoneClient })}
              disabled={!canConfirm || saving}
              style={[styles.confirmBtn, { backgroundColor: canConfirm ? colors.primary : colors.bgHover, opacity: saving ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              {saving
                ? <Ionicons name="sync-outline" size={20} color="#fff" />
                : <Ionicons name="checkmark-circle-outline" size={20} color={canConfirm ? '#fff' : colors.textMuted} />
              }
              <Text style={[styles.confirmBtnText, { color: canConfirm ? '#fff' : colors.textMuted }]}>
                {saving ? 'Enregistrement...' : `Confirmer la vente`}
              </Text>
            </TouchableOpacity>
          </View>
    </CustomBottomSheet>
  );
}

// ─── Générateur HTML du reçu (identique au ReceiptView web) ──────────────────
// async — génère le QR code SVG avec qrcode (offline, pas de réseau)
// Calcule la hauteur exacte du reçu en pixels selon son contenu
function calcReceiptHeight(vente) {
  const header      = 90;
  const colHeader   = 22;
  const ligneBase   = 30;
  const ligneExtra  = 12;
  const totaux      = 55;
  const paiement    = 20;
  const montantRecu = vente.modePaiement === 'ESPECES' ? 16 : 0;
  const monnaie     = (vente.modePaiement === 'ESPECES' && vente.monnaie > 0) ? 16 : 0;
  const remise      = vente.remise > 0 ? 16 : 0;
  const qrcode      = 95;
  const footer      = 30;
  const padding     = 44;

  const lignesHauteur = (vente.lignes || []).reduce((h, l) => {
    const chars = (l.nom || '').length;
    const extraLines = Math.max(0, Math.floor(chars / 30));
    return h + ligneBase + extraLines * ligneExtra;
  }, 0);

  return header + colHeader + lignesHauteur + totaux + remise +
         paiement + montantRecu + monnaie + qrcode + footer + padding;
}

async function buildReceiptHtml(vente, storeName) {
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n || 0);
  const verifyUrl = `${WEB_URL}/verifier-recu/${vente.reference}`;
  const date = new Date(vente.createdAt || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // QR code SVG généré localement — aucune requête réseau
  let qrSvg = '';
  try {
    const QRCode = require('qrcode');
    qrSvg = await QRCode.toString(verifyUrl, {
      type: 'svg',
      width: 80,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  } catch (_) {
    // Fallback si qrcode échoue — URL en texte
    qrSvg = `<div style="font-size:8px;color:#30a08b;word-break:break-all;">${verifyUrl}</div>`;
  }

  const lignesHtml = (vente.lignes || []).map(l => `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:bold;color:#111;">
        ${l.nom}${l.varianteLabel ? ` <span style="font-weight:normal;color:#6b7280;font-size:10px;">— ${l.varianteLabel}</span>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;">
        <span style="flex:2;color:#6b7280;"> </span>
        <span style="width:52px;text-align:right;color:#374151;">${fmt(l.prixUnitaire)}</span>
        <span style="width:28px;text-align:center;color:#374151;">×${l.quantite}</span>
        <span style="width:64px;text-align:right;font-weight:bold;color:#111;">${fmt(l.sousTotal)}</span>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family:'Courier New',monospace; background:#fff; color:#111; width:300px; margin:0 auto; padding:16px 18px 28px; }
    .sep { border-top:1px dashed #d1d5db; margin:8px 0; }
    .row { display:flex; justify-content:space-between; align-items:flex-start; font-size:11px; }
  </style></head><body>
    <div style="text-align:center;border-bottom:1px dashed #d1d5db;padding-bottom:10px;margin-bottom:8px;">
      <div style="font-size:17px;font-weight:bold;letter-spacing:1px;">🌿 IHAMBAOBAB</div>
      <div style="font-size:13px;font-weight:bold;margin-top:3px;">${storeName}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px;">Reçu de vente physique</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:1px;">${date}</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:1px;letter-spacing:0.5px;">${vente.reference || ''}</div>
    </div>
    <div class="row" style="color:#6b7280;margin-bottom:4px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">
      <span style="flex:2;">Article</span>
      <span style="width:52px;text-align:right;">P.U</span>
      <span style="width:28px;text-align:center;">Qté</span>
      <span style="width:64px;text-align:right;">Total</span>
    </div>
    <div style="margin-bottom:6px;">${lignesHtml}</div>
    <div class="sep"></div>
    <div style="font-size:10px;color:#6b7280;text-align:right;margin-bottom:2px;">FCFA</div>
    ${vente.remise > 0 ? `<div class="row" style="margin-bottom:3px;"><span style="color:#6b7280;">Remise</span><span style="color:#ef4444;">-${fmt(vente.remise)}</span></div>` : ''}
    <div class="row" style="font-size:15px;font-weight:bold;margin-bottom:6px;border-top:1px solid #111;padding-top:5px;">
      <span>TOTAL</span><span>${fmt(vente.total)} FCFA</span>
    </div>
    <div class="sep"></div>
    <div class="row" style="margin-bottom:3px;">
      <span style="color:#6b7280;">Mode paiement</span>
      <span style="font-weight:bold;">${vente.modePaiement === 'ESPECES' ? '💵 Espèces' : '📱 Mobile Money'}</span>
    </div>
    ${vente.modePaiement === 'ESPECES' && vente.montantRecu > 0 ? `<div class="row" style="margin-bottom:3px;"><span style="color:#6b7280;">Montant reçu</span><span>${fmt(vente.montantRecu)} FCFA</span></div>` : ''}
    ${vente.modePaiement === 'ESPECES' && vente.monnaie > 0 ? `<div class="row" style="margin-bottom:3px;font-weight:bold;color:#059669;"><span>Monnaie rendue</span><span>${fmt(vente.monnaie)} FCFA</span></div>` : ''}
    <div class="sep" style="padding-top:8px;text-align:center;">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Scannez pour vérifier l'authenticité</div>
      <div style="display:flex;justify-content:center;">${qrSvg}</div>
    </div>
    <div style="border-top:1px dashed #d1d5db;padding-top:8px;text-align:center;font-size:10px;color:#9ca3af;">
      Merci pour votre achat !<br/>ihambaobab.com
    </div>
  </body></html>`;
}

// ─── Modal reçu ───────────────────────────────────────────────────────────────
function ReceiptModal({ visible, vente, storeName, onClose, onNewSale, colors }) {
  const insets = useSafeAreaInsets();
  const [generating, setGenerating] = useState(false);

  // Bouton PDF — génère et partage le fichier (contient QR code de vérification)
  const downloadPDF = async () => {
    setGenerating(true);
    try {
      const Print   = require('expo-print');
      const Sharing = require('expo-sharing');
      const html = await buildReceiptHtml(vente, storeName);
      const height = calcReceiptHeight(vente);
      const { uri } = await Print.printToFileAsync({ html, width: 302, height });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Reçu ${vente.reference}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Toast.show({ type: 'info', text1: 'Partage non disponible sur cet appareil' });
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur PDF', text2: e.message });
    } finally {
      setGenerating(false);
    }
  };

  // Bouton WhatsApp — envoie le message texte formaté avec le lien de vérification
  // (WhatsApp ne permet pas de joindre fichier + texte simultanément)
  const shareWhatsApp = () => {
    const verifyUrl = `${WEB_URL}/verifier-recu/${vente.reference}`;
    const lignesText = vente.lignes
      .map(l => `  • ${l.nom}${l.varianteLabel ? ` (${l.varianteLabel})` : ''} ×${l.quantite} — ${fmtCFA(l.sousTotal)}`)
      .join('\n');
    const monnaieText = vente.modePaiement === 'ESPECES' && vente.monnaie > 0
      ? `\n💵 Monnaie rendue : ${fmtCFA(vente.monnaie)}` : '';
    const message =
      `🌿 *Reçu IHAMBAOBAB — ${storeName}*\n` +
      `📅 ${new Date(vente.createdAt || Date.now()).toLocaleDateString('fr-FR')}\n` +
      `📋 Réf : ${vente.reference}\n\n` +
      `*Articles :*\n${lignesText}\n\n` +
      `${vente.remise > 0 ? `🏷️ Remise : -${fmtCFA(vente.remise)}\n` : ''}` +
      `💰 *Total : ${fmtCFA(vente.total)}*\n` +
      `${vente.modePaiement === 'ESPECES' ? `💵 Reçu : ${fmtCFA(vente.montantRecu || vente.total)}` : '📱 Mobile Money'}` +
      `${monnaieText}\n\n` +
      `✅ Vérifier l'authenticité :\n${verifyUrl}`;
    const phone = vente.telephoneClient ? vente.telephoneClient.replace(/\D/g, '') : '';
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    Linking.openURL(waUrl).catch(() =>
      Toast.show({ type: 'error', text1: 'WhatsApp non disponible' })
    );
  };

  return (
    <CustomBottomSheet visible={visible} onClose={onClose} bgColor={colors.bgCard} maxHeight="92%">
          {/* Header vert */}
          <LinearGradient colors={['#30A08B', '#267a6b']} style={styles.receiptHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.receiptHeaderText}>Vente enregistrée !</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Corps reçu — ticket blanc centré, lisible light ET dark */}
          <ScrollView
            style={{ backgroundColor: colors.bg, flexShrink: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 8, alignItems: 'center' }}
            showsVerticalScrollIndicator={false}
          >
            {/* Ticket physique — toujours blanc comme un vrai reçu */}
            <View style={[styles.receiptTicket, { shadowColor: colors.text }]}>
              {/* En-tête */}
              <Text style={styles.receiptBrand}>🌿 IHAMBAOBAB</Text>
              <Text style={styles.receiptStoreName}>{storeName}</Text>
              <Text style={styles.receiptSubTitle}>Reçu de vente physique</Text>
              <Text style={styles.receiptDate}>
                {new Date(vente.createdAt || Date.now()).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
              <Text style={styles.receiptRef}>{vente.reference}</Text>

              <View style={styles.receiptDivider} />

              {/* Entête colonnes */}
              <View style={styles.receiptColHeader}>
                <Text style={[styles.receiptColText, { flex: 2 }]}>Article</Text>
                <Text style={[styles.receiptColText, { width: 52, textAlign: 'right' }]}>P.U</Text>
                <Text style={[styles.receiptColText, { width: 28, textAlign: 'center' }]}>Qté</Text>
                <Text style={[styles.receiptColText, { width: 70, textAlign: 'right' }]}>Total</Text>
              </View>

              {/* Lignes articles */}
              {vente.lignes.map((l, i) => (
                <View key={i} style={styles.receiptItemWrap}>
                  <Text style={styles.receiptItemNom}>
                    {l.nom}
                    {l.varianteLabel ? <Text style={styles.receiptItemVariante}> — {l.varianteLabel}</Text> : null}
                  </Text>
                  <View style={styles.receiptItemRow}>
                    <Text style={[styles.receiptItemCell, { flex: 2 }]} />
                    <Text style={[styles.receiptItemCell, { width: 52, textAlign: 'right' }]}>
                      {new Intl.NumberFormat('fr-FR').format(l.prixUnitaire)}
                    </Text>
                    <Text style={[styles.receiptItemCell, { width: 28, textAlign: 'center' }]}>×{l.quantite}</Text>
                    <Text style={[styles.receiptItemCellBold, { width: 70, textAlign: 'right' }]}>
                      {new Intl.NumberFormat('fr-FR').format(l.sousTotal)}
                    </Text>
                  </View>
                </View>
              ))}

              <View style={styles.receiptDivider} />
              <Text style={{ fontSize: 10, color: '#6B7280', textAlign: 'right', marginBottom: 3, width: '100%' }}>FCFA</Text>

              {vente.remise > 0 && (
                <View style={styles.receiptTotalRow}>
                  <Text style={{ color: '#EF4444', fontSize: 12 }}>Remise</Text>
                  <Text style={{ color: '#EF4444', fontSize: 12 }}>-{fmtCFA(vente.remise)}</Text>
                </View>
              )}
              <View style={[styles.receiptTotalRow, styles.receiptGrandTotal]}>
                <Text style={styles.receiptGrandTotalText}>TOTAL</Text>
                <Text style={styles.receiptGrandTotalText}>{fmtCFA(vente.total)} FCFA</Text>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptTotalRow}>
                <Text style={{ color: '#6B7280', fontSize: 12 }}>Mode paiement</Text>
                <Text style={{ fontWeight: '700', fontSize: 12, color: '#111' }}>
                  {vente.modePaiement === 'ESPECES' ? '💵 Espèces' : '📱 Mobile Money'}
                </Text>
              </View>
              {vente.modePaiement === 'ESPECES' && vente.montantRecu > 0 && (
                <View style={styles.receiptTotalRow}>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>Montant reçu</Text>
                  <Text style={{ fontSize: 12, color: '#111' }}>{fmtCFA(vente.montantRecu)} FCFA</Text>
                </View>
              )}
              {vente.modePaiement === 'ESPECES' && vente.monnaie > 0 && (
                <View style={[styles.receiptTotalRow, { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 4 }]}>
                  <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>💵 Monnaie rendue</Text>
                  <Text style={{ color: '#059669', fontWeight: '800', fontSize: 14 }}>{fmtCFA(vente.monnaie)} ₣</Text>
                </View>
              )}

              <View style={[styles.receiptDivider, { marginTop: 10 }]} />
              <Text style={styles.receiptFooter}>Merci pour votre achat !{'\n'}ihambaobab.com</Text>
            </View>
          </ScrollView>

          {/* Actions — identiques au web : WhatsApp + PDF/Imprimer + Nouvelle vente */}
          <View style={[styles.receiptActions, { borderTopColor: colors.border }]}>
            {/* Ligne 1 : WhatsApp + PDF */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.whatsappBtn, generating && { opacity: 0.6 }]}
                onPress={shareWhatsApp}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons name={generating ? 'sync-outline' : 'logo-whatsapp'} size={18} color="#fff" />
                <Text style={styles.whatsappBtnText}>
                  {generating ? 'Génération...' : 'WhatsApp + PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pdfBtn, { backgroundColor: colors.primary, opacity: generating ? 0.6 : 1 }]}
                onPress={downloadPDF}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={generating ? 'sync-outline' : 'print-outline'}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.pdfBtnText}>
                  {generating ? 'Génération...' : 'PDF / Imprimer'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Avertissement si pas de numéro */}
            {!vente.telephoneClient && (
              <View style={[styles.noPhoneHint, { backgroundColor: colors.bgWarning, marginBottom: 10 }]}>
                <Text style={[styles.noPhoneHintText, { color: colors.warningText }]}>
                  Aucun numéro client — WhatsApp ouvrira sans destinataire
                </Text>
              </View>
            )}

            {/* Nouvelle vente */}
            <TouchableOpacity
              style={[styles.newSaleBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
              onPress={onNewSale}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSub} />
              <Text style={[styles.newSaleBtnText, { color: colors.textSub }]}>Nouvelle vente</Text>
            </TouchableOpacity>
          </View>
    </CustomBottomSheet>
  );
}

// ─── POS Upgrade Wall ─────────────────────────────────────────────────────────
function PosUpgradeWall({ planName, colors }) {
  return (
    <View style={[styles.upgradeWall, { backgroundColor: colors.bg }]}>
      <LinearGradient colors={['#30A08B', '#267a6b']} style={styles.upgradeHeader}>
        <View style={styles.upgradeLockIcon}>
          <Ionicons name="lock-closed" size={32} color="#fff" />
        </View>
        <Text style={styles.upgradeTitle}>Caisse POS non disponible</Text>
        <Text style={styles.upgradeSub}>Votre plan actuel : <Text style={{ fontWeight: '800' }}>{planName || 'Starter'}</Text></Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.upgradeBody}>
        <View style={[styles.upgradeWarning, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Text style={{ fontSize: 13, color: '#92400E', lineHeight: 20 }}>
            La caisse physique (POS) est une fonctionnalité <Text style={{ fontWeight: '800' }}>Pro & Business</Text>.
            Elle vous permet de vendre en face-à-face avec reçus certifiés et 0% de commission.
          </Text>
        </View>
        {[
          { icon: '🏪', text: 'Caisse physique avec grille visuelle produits' },
          { icon: '🧾', text: 'Reçus certifiés avec QR code vérifiable' },
          { icon: '📱', text: 'Partage reçu par WhatsApp en 1 tap' },
          { icon: '✅', text: '0% commission sur vos ventes physiques' },
        ].map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 20 }}>{item.icon}</Text>
            <Text style={{ fontSize: 13, color: colors.text, flex: 1 }}>{item.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function VenteScreen() {
  const produits = useSyncStore((s) => s.produits) ?? [];
  const { triggerSync, isOffline } = useSync();
  const { colors } = useTheme();
  const { seller, subscription } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [search, setSearch]                   = useState('');
  const [panier, setPanier]                   = useState([]);
  const [remise, setRemise]                   = useState(0);
  const [mobileTab, setMobileTab]             = useState('catalogue'); // 'catalogue' | 'panier'
  const [produitSelectionne, setProduitSel]   = useState(null);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [showCheckout, setShowCheckout]       = useState(false);
  const [showReceipt, setShowReceipt]         = useState(false);
  const [derniereVente, setDerniereVente]     = useState(null);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState('');

  const storeName = seller?.storeName || seller?.name || 'Ma Boutique';
  const planName  = subscription?.planName || 'Starter';
  const hasAccess = ['Pro', 'Business'].includes(planName);

  // POS : affiche Published + Attente — le vendeur peut vendre ses propres produits
  // même si non encore validés par l'admin pour le marketplace
  const produitsFiltres = produits
    .filter(p => p.isPublished === 'Published' || p.isPublished === 'Attente' || p._pendingSync)
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  const sousTotal   = panier.reduce((s, l) => s + l.sousTotal, 0);
  const total       = Math.max(0, sousTotal - remise);
  const totalArticles = panier.reduce((s, l) => s + l.quantite, 0);

  const qtePanierProduit = (produitId) =>
    panier.filter(l => l.produitId === produitId).reduce((s, l) => s + l.quantite, 0);

  const ajouterLigne = useCallback((ligne) => {
    setPanier(prev => {
      const key = ligneKey(ligne);
      const idx = prev.findIndex(l => ligneKey(l) === key);
      if (idx >= 0) {
        const u = [...prev];
        u[idx] = { ...u[idx], quantite: u[idx].quantite + 1, sousTotal: (u[idx].quantite + 1) * u[idx].prixUnitaire };
        return u;
      }
      return [...prev, ligne];
    });
  }, []);

  const changerQuantite = useCallback((key, delta) => {
    setPanier(prev => prev
      .map(l => ligneKey(l) === key
        ? { ...l, quantite: l.quantite + delta, sousTotal: (l.quantite + delta) * l.prixUnitaire }
        : l)
      .filter(l => l.quantite > 0)
    );
  }, []);

  // Décrémente depuis la carte produit (bouton − sur la card)
  const decrementerDepuisCarte = useCallback((produit) => {
    const produitId = String(produit._id);
    setPanier(prev => {
      const ligne = [...prev].reverse().find(l => l.produitId === produitId);
      if (!ligne) return prev;
      const key = ligneKey(ligne);
      return prev
        .map(l => ligneKey(l) === key
          ? { ...l, quantite: l.quantite - 1, sousTotal: (l.quantite - 1) * l.prixUnitaire }
          : l)
        .filter(l => l.quantite > 0);
    });
  }, []);

  const supprimerLigne = (key) => setPanier(prev => prev.filter(l => ligneKey(l) !== key));
  const viderPanier    = () => { setPanier([]); setRemise(0); };

  const handleTapProduit = useCallback((produit) => {
    const hasVar = produit.variants?.length > 0;
    if (hasVar) {
      setProduitSel(produit);
      setShowVariantModal(true);
    } else {
      const prix = produit.prixPromo > 0 ? produit.prixPromo : produit.prix;
      ajouterLigne({
        produitId: String(produit._id),
        nom: produit.name, image: produit.image1,
        prixUnitaire: prix, quantite: 1,
        varianteLabel: '', couleurs: [], tailles: [],
        sousTotal: prix,
      });
    }
  }, [ajouterLigne]);

  const confirmerVente = async ({ modePaiement, montantRecu, monnaie, telephoneClient }) => {
    setSaving(true);
    setError('');

    // ── Vérification stock côté mobile avant envoi ────────────────────────────
    // Évite l'erreur "quantite minimum 1" du backend
    const lignesStockInsuff = panier.filter(l => {
      const produit = produits.find(p => String(p._id) === String(l.produitId));
      // Si produit absent du store local → on ne bloque pas (backend vérifie)
      if (!produit) return false;

      if (produit.variants?.length > 0) {
        // Produit avec variantes — cherche la variante via le label
        const variant = produit.variants.find(v =>
          (l.varianteLabel || '').includes(v.color || v.colorName || '')
        );
        // Si variante introuvable → on ne bloque pas
        if (!variant) return false;
        const stockVar = variant.stock ?? null;
        // Bloque seulement si stock connu et explicitement insuffisant
        return stockVar !== null && stockVar > 0 && stockVar < l.quantite;
      }

      // Produit sans variante
      const stock = produit.quantite;
      // Ne bloque que si stock renseigné (> 0) ET clairement insuffisant
      // stock = 0 ou null = donnée manquante → on ne bloque pas côté mobile
      if (!stock || stock <= 0) return false;
      return stock < l.quantite;
    });

    if (lignesStockInsuff.length > 0) {
      const noms = lignesStockInsuff.map(l => l.nom).join(', ');
      setSaving(false);
      Toast.show({
        type: 'error',
        text1: 'Stock insuffisant',
        text2: `${noms} — vérifiez le stock avant de vendre`,
        visibilityTime: 5000,
      });
      return;
    }
    try {
      const lignesPayload = panier.map(l => ({
        produitId: l.produitId, nom: l.nom, image: l.image,
        prixUnitaire: l.prixUnitaire, quantite: l.quantite,
        varianteLabel: l.varianteLabel,
        couleurs: l.couleurs || [], tailles: l.tailles || [],
        sousTotal: l.sousTotal,
      }));

      // sellerId obligatoire — le backend vérifie l'accès POS via sellerId
      const sellerId = seller?._id || seller?.id;

      const payload = {
        sellerId,
        lignes: lignesPayload,
        remise,
        modePaiement,
        montantRecu,
        monnaie,
        telephoneClient: telephoneClient || '',
      };

      // Online → API directe
      const NetInfo = require('@react-native-community/netinfo').default;
      const { isConnected } = await NetInfo.fetch();

      if (isConnected) {
        const apiClient = require('../config/api').default;
        const res = await apiClient.post('/api/pos/vente', payload);
        if (!res.data?.success) throw new Error(res.data?.message || 'Erreur');
        // Enrichit avec montantRecu et monnaie (le backend peut ne pas les retourner)
        const vente = {
          ...res.data.data,
          lignes: lignesPayload,  // lignes avec nom/image pour le reçu
          total,
          remise,
          montantRecu,
          monnaie: monnaie || 0,
          telephoneClient: telephoneClient || '',
        };
        setDerniereVente(vente);

        // Mise à jour optimiste du bilan (même logique que offline)
        // → le dashboard réagit immédiatement sans attendre le prochain heartbeat
        const articles = panier.reduce((s, l) => s + l.quantite, 0);
        const updated = await updateBilanCache({ posTotal: total, posVentes: 1, articles, modePaiement }).catch(() => null);
        if (updated) useSyncStore.getState().setStoreData('bilanToday', updated);
        // Invalide le cache bilan pour forcer un refetch serveur en arrière-plan
        syncService.invalidateAndFetch('bilan').catch(() => {});
      } else {
        // Génère une référence POS locale au même format que le backend
        // POS-{sellerId6}-{timestamp}-{rand4} → le QR code sera valide dès synchro
        const sellerPart = String(sellerId).slice(-6).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const offlineRef = `POS-${sellerPart}-${Date.now()}-${rand}`;

        // La passe dans le payload → le backend l'utilise si la vente n'existe pas encore
        await syncService.queueMutation('CREATE_VENTE', { ...payload, referenceOffline: offlineRef });

        // Mise à jour optimiste du bilan (SQLite + store mémoire)
        const articles = panier.reduce((s, l) => s + l.quantite, 0);
        const updated = await updateBilanCache({ posTotal: total, posVentes: 1, articles, modePaiement }).catch(() => null);
        if (updated) useSyncStore.getState().setStoreData('bilanToday', updated);

        setDerniereVente({ lignes: lignesPayload, total, remise, modePaiement, montantRecu, monnaie, telephoneClient, reference: offlineRef, createdAt: new Date() });
      }

      setShowCheckout(false);
      // Petit délai pour laisser l'animation de fermeture du checkout se terminer
      // avant d'ouvrir le reçu — évite le conflit Android entre deux Modals
      setTimeout(() => { setShowReceipt(true); }, Platform.OS === 'android' ? 350 : 100);
      viderPanier();

      // Met à jour le stock local immédiatement — évite de resélectionner un produit épuisé
      // avant que le sync serveur ne revienne avec les vraies valeurs
      const store = useSyncStore.getState();
      const currentProduits = store.produits ?? [];
      const updatedProduits = currentProduits.map(p => {
        const lignesP = lignesPayload.filter(l => String(l.produitId) === String(p._id));
        if (!lignesP.length) return p;
        const qteVendue = lignesP.reduce((s, l) => s + l.quantite, 0);
        return {
          ...p,
          quantite: Math.max(0, (p.quantite ?? 0) - qteVendue),
        };
      });
      store.setStoreData('produits', updatedProduits);
      // Invalide pour refetch serveur en arrière-plan
      store.invalidate('produits').catch(() => {});
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Erreur lors de la vente';

      // Détermine un message lisible selon le type d'erreur
      let text1 = 'Erreur';
      let text2 = msg;

      if (msg.toLowerCase().includes('stock') || msg.toLowerCase().includes('quantite') || msg.toLowerCase().includes('quantité')) {
        text1 = 'Stock insuffisant';
        text2 = 'Un ou plusieurs articles n\'ont plus assez de stock';
      } else if (msg.toLowerCase().includes('pos') || msg.toLowerCase().includes('plan') || msg.toLowerCase().includes('abonnement')) {
        text1 = 'Accès POS refusé';
        text2 = msg;
      } else if (msg.toLowerCase().includes('réseau') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout')) {
        text1 = 'Erreur réseau';
        text2 = 'Vérifiez votre connexion et réessayez';
      }

      // Notifie via Toast (visible même si checkout est ouvert)
      Toast.show({ type: 'error', text1, text2, visibilityTime: 5000 });
      // Aussi dans le state pour l'affichage dans le panier
      setError(text2);
    } finally {
      setSaving(false);
    }
  };

  if (!hasAccess) return <PosUpgradeWall planName={planName} colors={colors} />;

  // ── Catalogue ──────────────────────────────────────────────────────────────
  const CataloguePan = (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchBar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.bgHover }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchText, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un produit..."
            placeholderTextColor={colors.textPlaceholder}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {isOffline && (
          <View style={[styles.offlinePill, { backgroundColor: colors.bgWarning }]}>
            <Ionicons name="cloud-offline-outline" size={12} color={colors.warningText} />
            <Text style={[styles.offlinePillText, { color: colors.warningText }]}>Hors ligne</Text>
          </View>
        )}
      </View>

      {produitsFiltres.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {search ? 'Aucun résultat' : 'Aucun produit publié'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={produitsFiltres}
          keyExtractor={p => String(p._id)}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 10 }}
          contentContainerStyle={{ padding: 10, paddingBottom: 100, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProduitCard
              produit={item}
              qtePanier={qtePanierProduit(String(item._id))}
              onTap={handleTapProduit}
              onDecrement={decrementerDepuisCarte}
              colors={colors}
            />
          )}
        />
      )}
    </View>
  );

  // ── Panier ─────────────────────────────────────────────────────────────────
  const PanierPan = (
    <View style={{ flex: 1 }}>
      {/* Bandeau plan */}
      <View style={[styles.planBandeau, { backgroundColor: colors.bgSuccess, borderBottomColor: colors.border }]}>
        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
        <Text style={[styles.planBandeauText, { color: colors.successText }]}>
          0% commission · plan <Text style={{ fontWeight: '800' }}>{planName}</Text>
        </Text>
      </View>

      {/* Header */}
      <View style={[styles.panierHeader, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cart-outline" size={18} color={colors.primary} />
          <Text style={[styles.panierTitle, { color: colors.text }]}>Panier</Text>
          {panier.length > 0 && (
            <View style={[styles.panierBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.panierBadgeText}>{totalArticles}</Text>
            </View>
          )}
        </View>
        {panier.length > 0 && (
          <TouchableOpacity onPress={viderPanier} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>Vider</Text>
          </TouchableOpacity>
        )}
      </View>

      {panier.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Panier vide{'\n'}
            <Text style={{ fontSize: 12 }}>Ajoutez des produits</Text>
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Lignes panier */}
          {panier.map(ligne => {
            const key = ligneKey(ligne);
            return (
              <View key={key} style={[styles.panierLigne, { borderBottomColor: colors.border }]}>
                <View style={[styles.panierLigneImg, { backgroundColor: colors.bgHover }]}>
                  <CachedImage uri={ligne.image} style={StyleSheet.absoluteFill} contentFit="cover"
                    placeholderIcon="cube-outline" placeholderBg={colors.bgHover} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panierLigneNom, { color: colors.text }]} numberOfLines={1}>{ligne.nom}</Text>
                  {ligne.varianteLabel ? <Text style={[styles.panierLigneVar, { color: colors.primary }]}>{ligne.varianteLabel}</Text> : null}
                  <Text style={[styles.panierLignePrix, { color: colors.primary }]}>{fmtCFA(ligne.prixUnitaire)} / unité</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <TouchableOpacity onPress={() => supprimerLigne(key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <View style={styles.stepper}>
                    <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.bgHover }]} onPress={() => changerQuantite(key, -1)}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.stepQte, { color: colors.text, borderColor: colors.border }]}>{ligne.quantite}</Text>
                    <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.bgHover }]} onPress={() => changerQuantite(key, 1)}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.panierLigneSousTotal, { color: colors.text }]}>{fmtCFA(ligne.sousTotal)}</Text>
                </View>
              </View>
            );
          })}

          {/* Récap totaux + remise */}
          <View style={[styles.recapBox, { margin: 12, backgroundColor: colors.bgHover, borderColor: colors.border }]}>
            <View style={styles.recapRow}>
              <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Remise (₣)</Text>
              <TextInput
                style={[styles.remiseInput, { borderColor: colors.border, backgroundColor: colors.bgCard, color: colors.text }]}
                value={remise ? String(remise) : ''}
                onChangeText={v => setRemise(Math.min(Number(v) || 0, sousTotal))}
                keyboardType="numeric" placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
            <View style={styles.recapRow}>
              <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Sous-total</Text>
              <Text style={[styles.recapValue, { color: colors.textSub }]}>{fmtCFA(sousTotal)}</Text>
            </View>
            {remise > 0 && (
              <View style={styles.recapRow}>
                <Text style={[styles.recapLabel, { color: colors.danger }]}>Remise</Text>
                <Text style={[styles.recapValue, { color: colors.danger }]}>-{fmtCFA(remise)}</Text>
              </View>
            )}
            <View style={[styles.recapRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
              <Text style={[styles.recapTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.recapTotalValue, { color: colors.primary }]}>{fmtCFA(total)}</Text>
            </View>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.bgDanger, marginHorizontal: 12 }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.dangerText }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Contenu actif */}
      <View style={{ flex: 1 }}>
        {mobileTab === 'catalogue' ? CataloguePan : PanierPan}
      </View>

      {/* ── FABs flottants ─────────────────────────────────────────────────── */}
      {mobileTab === 'catalogue' && (
        <TouchableOpacity
          style={[styles.fabPanier, { bottom: insets.bottom + 12 }]}
          onPress={() => setMobileTab('panier')}
          activeOpacity={0.9}
        >
          <View style={{ position: 'relative' }}>
            <Ionicons name="cart-outline" size={22} color="#fff" />
            {totalArticles > 0 && (
              <View style={styles.fabBadge}>
                <Text style={styles.fabBadgeText}>{totalArticles > 9 ? '9+' : totalArticles}</Text>
              </View>
            )}
          </View>
          <Text style={styles.fabText}>
            {totalArticles > 0 ? `Panier · ${fmtCFA(total)}` : 'Panier vide'}
          </Text>
        </TouchableOpacity>
      )}

      {mobileTab === 'panier' && (
        <>
          <TouchableOpacity
            style={[styles.fabRetour, { bottom: insets.bottom + 12, borderColor: colors.border, backgroundColor: colors.bgCard }]}
            onPress={() => setMobileTab('catalogue')}
            activeOpacity={0.85}
          >
            <Ionicons name="grid-outline" size={18} color={colors.textSub} />
            <Text style={[styles.fabRetourText, { color: colors.textSub }]}>Catalogue</Text>
          </TouchableOpacity>

          {panier.length > 0 && (
            <TouchableOpacity
              style={[styles.fabEncaisser, { bottom: insets.bottom + 12, backgroundColor: colors.primary }]}
              onPress={() => { setError(''); setShowCheckout(true); }}
              activeOpacity={0.9}
            >
              <Ionicons name="receipt-outline" size={20} color="#fff" />
              <Text style={styles.fabEncaisserText}>Encaisser · {fmtCFA(total)}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Modals — visible passé explicitement pour que CustomBottomSheet gère l'animation */}
      {produitSelectionne && (
        <VariantModal
          visible={showVariantModal}
          produit={produitSelectionne}
          onSelect={(l) => { ajouterLigne(l); setMobileTab('panier'); }}
          onClose={() => { setShowVariantModal(false); setProduitSel(null); }}
          colors={colors}
        />
      )}
      <CheckoutModal
        visible={showCheckout}
        panier={panier} total={total} remise={remise}
        onConfirm={confirmerVente}
        onClose={() => setShowCheckout(false)}
        saving={saving} colors={colors}
      />
      {derniereVente && (
        <ReceiptModal
          visible={showReceipt}
          vente={derniereVente} storeName={storeName}
          onClose={() => { setShowReceipt(false); setMobileTab('catalogue'); }}
          onNewSale={() => { setShowReceipt(false); setMobileTab('catalogue'); }}
          colors={colors}
        />
      )}
    </View>
  );
}

const CARD_W = (W - 32) / 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Catalogue
  searchBar: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  searchInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  searchText: { flex: 1, fontSize: 14 },
  offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  offlinePillText: { fontSize: 10, fontWeight: '700' },

  // Cartes produit
  prodCard: { width: CARD_W, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2 },
  prodImgWrap: { width: '100%', aspectRatio: 1, position: 'relative', overflow: 'hidden', borderTopLeftRadius: 15, borderTopRightRadius: 15 },
  promoBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#EF4444', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  promoBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  qteBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  qteBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  varBadge: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  varBadgeText: { fontSize: 8, fontWeight: '700', color: '#fff' },
  ruptureMask: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  ruptureText: { color: '#fff', fontSize: 11, fontWeight: '800', backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  stockBasBadge: { position: 'absolute', bottom: 6, left: 4, right: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: 'rgba(217,119,6,0.88)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 3 },
  stockBasBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  prodInfo: { padding: 8, gap: 2, overflow: 'visible' },
  prodStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 0 },
  prodStepBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  prodStepQte: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4 },
  prodNom: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  prodPrix: { fontSize: 13, fontWeight: '800' },
  prodPrixBarre: { fontSize: 10, textDecorationLine: 'line-through' },
  prodVariantesHint: { fontSize: 9 },

  // Variant modal
  varSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24 },
  varHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  varHeaderImg: { width: 40, height: 40, borderRadius: 10 },
  varHeaderNom: { fontSize: 14, fontWeight: '800' },
  varHeaderPrix: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  varSectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  varChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  varChipText: { fontSize: 13, fontWeight: '600' },
  colorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  varPrixRecap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  varPrixLabel: { fontSize: 12, fontWeight: '600' },
  varPrixValue: { fontSize: 18, fontWeight: '800' },
  varAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 15 },
  varAddBtnText: { fontSize: 15, fontWeight: '800' },

  // Panier
  planBandeau: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6, borderBottomWidth: 1 },
  planBandeauText: { fontSize: 10, fontWeight: '600' },
  panierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  panierTitle: { fontSize: 14, fontWeight: '800' },
  panierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  panierBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  panierLigne: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderBottomWidth: 1, gap: 10 },
  panierLigneImg: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0 },
  panierLigneNom: { fontSize: 13, fontWeight: '600' },
  panierLigneVar: { fontSize: 10, marginTop: 1 },
  panierLignePrix: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  panierLigneSousTotal: { fontSize: 13, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepQte: { width: 34, height: 30, textAlign: 'center', fontWeight: '800', fontSize: 14, borderTopWidth: 1, borderBottomWidth: 1 },
  recapBox: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recapLabel: { fontSize: 12 },
  recapValue: { fontSize: 12, fontWeight: '600' },
  recapTotalLabel: { fontSize: 16, fontWeight: '800' },
  recapTotalValue: { fontSize: 18, fontWeight: '800' },
  remiseInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 13, width: 80, textAlign: 'right' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, padding: 10, marginBottom: 8 },
  errorText: { fontSize: 12, flex: 1 },

  // FABs
  fabPanier: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111827', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, elevation: 10 },
  fabBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: '#30A08B', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fabBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  fabText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  fabRetour: { position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 4 },
  fabRetourText: { fontSize: 13, fontWeight: '700' },
  fabEncaisser: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 100, shadowColor: '#30A08B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, elevation: 10 },
  fabEncaisserText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Checkout modal
  checkoutSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24 },
  checkoutHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  checkoutTitle: { fontSize: 18, fontWeight: '800' },
  checkoutRecap: { borderRadius: 16, padding: 14, gap: 6 },
  checkoutLine: { flexDirection: 'row', justifyContent: 'space-between' },
  checkoutLineNom: { fontSize: 12, flex: 1, marginRight: 8 },
  checkoutLinePrix: { fontSize: 12, fontWeight: '600', flexShrink: 0 },
  checkoutTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  checkoutTotalLabel: { fontSize: 16, fontWeight: '800' },
  checkoutTotalValue: { fontSize: 18, fontWeight: '800' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  modeBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5 },
  modeBtnText: { fontSize: 13, fontWeight: '700' },
  montantInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '800', marginTop: 8 },
  monnaieBox: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  monnaieLabel: { fontSize: 13, fontWeight: '600' },
  monnaieValue: { fontSize: 13, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  countryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 12, borderRightWidth: 1 },
  countryCode: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  phoneInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontSize: 14 },
  countryPickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24 },
  countryPickerHandle: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  countryPickerHandleBar: { width: 40, height: 4, borderRadius: 2 },
  countryPickerTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 20, marginBottom: 8 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  countryName: { flex: 1, fontSize: 13 },
  countryCodeText: { fontSize: 12 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 16 },
  confirmBtnText: { fontSize: 16, fontWeight: '800' },

  // Receipt modal
  receiptSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, elevation: 24 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  receiptHeaderText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  receiptTicket: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: W - 32,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    elevation: 4,
  },
  receiptBrand: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 16, fontWeight: '800', letterSpacing: 1, textAlign: 'center', color: '#111' },
  receiptStoreName: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 13, fontWeight: '700', textAlign: 'center', color: '#111', marginTop: 2 },
  receiptSubTitle: { fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 2 },
  receiptDate: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 1 },
  receiptRef: { fontSize: 9, color: '#9CA3AF', letterSpacing: 0.5, textAlign: 'center', marginTop: 1 },
  receiptDivider: { width: '100%', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderStyle: 'dashed', marginVertical: 8 },
  receiptColHeader: { flexDirection: 'row', width: '100%', marginBottom: 4 },
  receiptColText: { fontSize: 10, color: '#6B7280' },
  receiptItemWrap: { width: '100%', marginBottom: 6 },
  receiptItemNom: { fontSize: 11, fontWeight: '700', color: '#111' },
  receiptItemVariante: { fontWeight: '400', color: '#6B7280', fontSize: 10 },
  receiptItemRow: { flexDirection: 'row' },
  receiptItemCell: { fontSize: 10, color: '#374151' },
  receiptItemCellBold: { fontSize: 10, fontWeight: '700', color: '#111' },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  receiptGrandTotal: { borderTopWidth: 1, borderTopColor: '#111', paddingTop: 6, marginTop: 4 },
  receiptGrandTotalText: { fontSize: 14, fontWeight: '800', color: '#111' },
  receiptFooter: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 8, lineHeight: 16 },
  receiptActions: { borderTopWidth: 1, padding: 14, gap: 8 },
  whatsappBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22C55E', borderRadius: 16, paddingVertical: 13 },
  pdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, paddingVertical: 13 },
  pdfBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  whatsappBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  noPhoneHint: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8 },
  noPhoneHintText: { fontSize: 10, textAlign: 'center' },
  newSaleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 13, borderWidth: 1 },
  newSaleBtnText: { fontSize: 14, fontWeight: '700' },

  // Upgrade wall
  upgradeWall: { flex: 1 },
  upgradeHeader: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  upgradeLockIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  upgradeTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  upgradeSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  upgradeBody: { padding: 20, gap: 12 },
  upgradeWarning: { borderRadius: 16, padding: 14, borderWidth: 1 },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});