import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
  Modal, TextInput, Alert, ActivityIndicator, Dimensions, Linking, Platform, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import apiClient from '../config/api';
import Toast from 'react-native-toast-message';

const { width: W } = Dimensions.get('window');

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('fr-FR') + ' ₣';
}
function fmtShort(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtNum(n)   { return new Intl.NumberFormat('fr-FR').format(n || 0); }
// Indicatifs téléphoniques
const COUNTRY_CODES = [
  { code: '+227', flag: '🇳🇪', name: 'Niger',       digits: 8,  placeholder: 'XX XX XX XX' },
  { code: '+226', flag: '🇧🇫', name: 'Burkina',     digits: 8,  placeholder: 'XX XX XX XX' },
  { code: '+225', flag: '🇨🇮', name: 'Côte d\'Ivoire', digits: 10, placeholder: 'XX XX XX XX XX' },
  { code: '+223', flag: '🇲🇱', name: 'Mali',        digits: 8,  placeholder: 'XX XX XX XX' },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal',     digits: 9,  placeholder: 'XX XXX XX XX' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun',    digits: 9,  placeholder: 'XXX XXX XXX' },
  { code: '+229', flag: '🇧🇯', name: 'Bénin',       digits: 8,  placeholder: 'XX XX XX XX' },
  { code: '+228', flag: '🇹🇬', name: 'Togo',        digits: 8,  placeholder: 'XX XX XX XX' },
  { code: '+224', flag: '🇬🇳', name: 'Guinée',      digits: 9,  placeholder: 'XXX XX XX XX' },
  { code: '+222', flag: '🇲🇷', name: 'Mauritanie',  digits: 8,  placeholder: 'XX XX XX XX' },
];

// Formate un numéro brut en groupes de 2 (standard Afrique de l'Ouest)
function fmtPhone(raw, maxDigits = 8) {
  const digits = raw.replace(/\D/g, '').slice(0, maxDigits);
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
function parsePhone(formatted) { return formatted.replace(/\D/g, ''); }

// Numéro de compte bancaire : groupes de 4
function fmtAccountNumber(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 20);
  return digits.replace(/(.{4})(?=.)/g, '$1 ');
}
function parseAccount(formatted) { return formatted.replace(/\s/g, ''); }

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateHour(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TX_CONFIG = {
  CREDIT_COMMANDE: { label: 'Vente marketplace', icon: 'bag-outline',           color: '#10B981' },
  CREDIT_POS:      { label: 'Vente caisse',       icon: 'storefront-outline',    color: '#30A08B' },
  RETRAIT:         { label: 'Retrait',             icon: 'arrow-up-outline',      color: '#EF4444' },
  COMMISSION:      { label: 'Commission',          icon: 'remove-circle-outline', color: '#F59E0B' },
  ANNULATION:      { label: 'Annulation',          icon: 'close-circle-outline',  color: '#6B7280' },
  ANNULATION_POS:  { label: 'Annulation caisse',   icon: 'close-circle-outline',  color: '#6B7280' },
  CORRECTION:      { label: 'Correction',          icon: 'construct-outline',     color: '#6366F1' },
};
const STATUT_CONFIG = {
  CONFIRME:   { label: 'Confirmé',   color: '#10B981', bg: '#ECFDF5' },
  EN_ATTENTE: { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
  ANNULE:     { label: 'Annulé',     color: '#EF4444', bg: '#FEF2F2' },
  EXPIRE:     { label: 'Expiré',     color: '#6B7280', bg: '#F3F4F6' },
  APPROUVE:   { label: 'Approuvé',   color: '#3B82F6', bg: '#EFF6FF' },
  TRAITE:     { label: 'Traité',     color: '#10B981', bg: '#ECFDF5' },
  REJETE:     { label: 'Rejeté',     color: '#EF4444', bg: '#FEF2F2' },
};

const VIEWS = [
  { key: 'pos',         label: 'Caisse POS',  icon: 'storefront-outline', color: '#30A08B' },
  { key: 'marketplace', label: 'Marketplace', icon: 'globe-outline',      color: '#267a6b' },
];

const PERIODES = [
  { label: '7j',  value: 7   },
  { label: '30j', value: 30  },
  { label: '90j', value: 90  },
  { label: '1an', value: 365 },
];

const POS_PERIODES = [
  { label: 'Auj.',  value: 1   },
  { label: '7j',    value: 7   },
  { label: '30j',   value: 30  },
  { label: '90j',   value: 90  },
];

// ─── Reçu PDF — identique à VenteScreen ──────────────────────────────────────
const WEB_URL = 'https://ihambaobab.com';

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
    const extraLines = Math.max(0, Math.floor((l.nom || '').length / 30));
    return h + ligneBase + extraLines * ligneExtra;
  }, 0);
  return header + colHeader + lignesHauteur + totaux + remise +
         paiement + montantRecu + monnaie + qrcode + footer + padding;
}

async function buildReceiptHtml(vente, storeName = 'Ma Boutique') {
  const verifyUrl = `${WEB_URL}/verifier-recu/${vente.reference}`;
  const date = new Date(vente.createdAt || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  let qrSvg = '';
  try {
    const QRCode = require('qrcode');
    qrSvg = await QRCode.toString(verifyUrl, {
      type: 'svg', width: 80, margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  } catch (_) {
    qrSvg = `<div style="font-size:8px;color:#30a08b;word-break:break-all;">${verifyUrl}</div>`;
  }

  const lignesHtml = (vente.lignes || []).map(l => `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:bold;color:#111;">
        ${l.nom}${l.varianteLabel ? ` <span style="font-weight:normal;color:#6b7280;font-size:10px;">— ${l.varianteLabel}</span>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;">
        <span style="flex:2;color:#6b7280;"> </span>
        <span style="width:52px;text-align:right;color:#374151;">${fmtNum(l.prixUnitaire)}</span>
        <span style="width:28px;text-align:center;color:#374151;">×${l.quantite}</span>
        <span style="width:64px;text-align:right;font-weight:bold;color:#111;">${fmtNum(l.sousTotal)}</span>
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
    ${vente.remise > 0 ? `<div class="row" style="margin-bottom:3px;"><span style="color:#6b7280;">Remise</span><span style="color:#ef4444;">-${fmtNum(vente.remise)}</span></div>` : ''}
    <div class="row" style="font-size:15px;font-weight:bold;margin-bottom:6px;border-top:1px solid #111;padding-top:5px;">
      <span>TOTAL</span><span>${fmtNum(vente.total)} FCFA</span>
    </div>
    <div class="sep"></div>
    <div class="row" style="margin-bottom:3px;">
      <span style="color:#6b7280;">Mode paiement</span>
      <span style="font-weight:bold;">${vente.modePaiement === 'ESPECES' ? '💵 Espèces' : '📱 Mobile Money'}</span>
    </div>
    ${vente.modePaiement === 'ESPECES' && vente.montantRecu > 0 ? `<div class="row" style="margin-bottom:3px;"><span style="color:#6b7280;">Montant reçu</span><span>${fmtNum(vente.montantRecu)} FCFA</span></div>` : ''}
    ${vente.modePaiement === 'ESPECES' && vente.monnaie > 0 ? `<div class="row" style="margin-bottom:3px;font-weight:bold;color:#059669;"><span>Monnaie rendue</span><span>${fmtNum(vente.monnaie)} FCFA</span></div>` : ''}
    <div class="sep" style="padding-top:8px;text-align:center;">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Scannez pour vérifier l'authenticité</div>
      <div style="display:flex;justify-content:center;">${qrSvg}</div>
    </div>
    <div style="border-top:1px dashed #d1d5db;padding-top:8px;text-align:center;font-size:10px;color:#9ca3af;">
      Merci pour votre achat !<br/>ihambaobab.com
    </div>
  </body></html>`;
}

// ─── VenteDetailModal ─────────────────────────────────────────────────────────
function VenteDetailModal({ vente, storeName, onClose, onAnnuler, annulLoading, colors }) {
  const insets = useSafeAreaInsets();
  const [confirmAnnul, setConfirmAnnul] = useState(false);
  const [motif,        setMotif]        = useState('');
  const [showRecu,     setShowRecu]     = useState(false);
  const [printing,     setPrinting]     = useState(false);

  if (!vente) return null;
  const isAnnulee   = vente.statut === 'ANNULEE';
  const peutAnnuler = !isAnnulee;

  const buildMessage = () => {
    const verifyUrl = `${WEB_URL}/verifier-recu/${vente.reference}`;
    const lignesText = vente.lignes
      .map(l => `  • ${l.nom}${l.varianteLabel ? ` (${l.varianteLabel})` : ''} ×${l.quantite} — ${fmtNum(l.sousTotal)} ₣`)
      .join('\n');
    const monnaieText = vente.modePaiement === 'ESPECES' && vente.monnaie > 0
      ? `\n💵 Monnaie rendue : ${fmtNum(vente.monnaie)} ₣` : '';
    return (
      `🌿 *Reçu IHAMBAOBAB — ${storeName}*\n` +
      `📅 ${fmtDate(vente.createdAt)}\n` +
      `📋 Réf : ${vente.reference}\n\n` +
      `*Articles :*\n${lignesText}\n\n` +
      (vente.remise > 0 ? `🏷️ Remise : -${fmtNum(vente.remise)} ₣\n` : '') +
      `💰 *Total : ${fmtNum(vente.total)} ₣*\n` +
      `${vente.modePaiement === 'ESPECES' ? `💵 Reçu : ${fmtNum(vente.montantRecu || vente.total)} ₣` : '📱 Mobile Money'}` +
      monnaieText + `\n\n✅ Vérifier l'authenticité :\n${verifyUrl}`
    );
  };

  // Bouton WhatsApp — envoie le message texte formaté avec le lien de vérification
  // (WhatsApp ne permet pas de joindre un fichier ET du texte en même temps)
  const handleWhatsApp = () => {
    const message = buildMessage();
    const phone = vente.telephoneClient ? vente.telephoneClient.replace(/\D/g, '') : '';
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    Linking.openURL(waUrl).catch(() =>
      Toast.show({ type: 'error', text1: 'WhatsApp non disponible' })
    );
  };

  // Bouton PDF — génère et partage le fichier PDF (contient le QR code de vérification)
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = await buildReceiptHtml(vente, storeName);
      const height = calcReceiptHeight(vente);
      const { uri } = await Print.printToFileAsync({ html, width: 302, height });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Reçu ${vente.reference}`, UTI: 'com.adobe.pdf' });
      } else {
        Toast.show({ type: 'info', text1: 'Partage non disponible sur cet appareil' });
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur PDF', text2: e.message });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[styles.detailSheet, { backgroundColor: colors.bgCard, paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <LinearGradient
            colors={isAnnulee ? ['#EF4444', '#dc2626'] : ['#30A08B', '#1e7a6b']}
            style={styles.detailHeader}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] }}>{vente.reference}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 14 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Infos générales */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{fmtDateHour(vente.createdAt)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons
                      name={vente.modePaiement === 'ESPECES' ? 'cash-outline' : 'phone-portrait-outline'}
                      size={13} color={colors.textMuted}
                    />
                    <Text style={{ fontSize: 12, color: colors.textSub }}>
                      {vente.modePaiement === 'ESPECES' ? 'Espèces' : 'Mobile Money'}
                    </Text>
                  </View>
                  {vente.telephoneClient ? (
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>· {vente.telephoneClient}</Text>
                  ) : null}
                </View>
              </View>
              <View style={[styles.badge, { backgroundColor: isAnnulee ? '#FEF2F2' : '#ECFDF5' }]}>
                <Ionicons
                  name={isAnnulee ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={11} color={isAnnulee ? '#EF4444' : '#10B981'}
                />
                <Text style={[styles.badgeText, { color: isAnnulee ? '#EF4444' : '#10B981' }]}>
                  {isAnnulee ? 'Annulée' : 'Complétée'}
                </Text>
              </View>
            </View>

            {/* Tableau articles */}
            <View style={[styles.lignesTable, { borderColor: colors.border }]}>
              <View style={[styles.lignesHeader, { backgroundColor: colors.bgHover }]}>
                <Text style={[styles.colArticle, styles.colLabel, { color: colors.textMuted }]}>Article</Text>
                <Text style={[styles.colPu,      styles.colLabel, { color: colors.textMuted }]}>P.U</Text>
                <Text style={[styles.colQte,     styles.colLabel, { color: colors.textMuted }]}>Qté</Text>
                <Text style={[styles.colTotal,   styles.colLabel, { color: colors.textMuted }]}>Total</Text>
              </View>
              {vente.lignes.map((l, i) => (
                <View key={i} style={[styles.ligneRow, { borderTopColor: colors.border }]}>
                  <View style={styles.colArticle}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{l.nom}</Text>
                    {l.varianteLabel ? (
                      <Text style={{ fontSize: 10, color: '#30A08B', marginTop: 1 }}>{l.varianteLabel}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.colPu, { fontSize: 11, color: colors.textSub, fontVariant: ['tabular-nums'] }]}>
                    {fmtNum(l.prixUnitaire)}
                  </Text>
                  <Text style={[styles.colQte, { fontSize: 11, color: colors.textSub }]}>×{l.quantite}</Text>
                  <Text style={[styles.colTotal, { fontSize: 12, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }]}>
                    {fmtNum(l.sousTotal)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Totaux */}
            <View style={[styles.totauxBox, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
              {vente.remise > 0 && (
                <View style={styles.totauxRow}>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>Remise</Text>
                  <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '700' }}>−{fmtNum(vente.remise)} ₣</Text>
                </View>
              )}
              <View style={[styles.totauxRow, { marginTop: vente.remise > 0 ? 4 : 0 }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.text }}>Total</Text>
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#10B981' }}>{fmtNum(vente.total)} ₣</Text>
              </View>
              {vente.modePaiement === 'ESPECES' && vente.montantRecu > 0 && (
                <View style={[styles.totauxRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Montant reçu</Text>
                  <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>{fmtNum(vente.montantRecu)} ₣</Text>
                </View>
              )}
              {vente.modePaiement === 'ESPECES' && vente.monnaie > 0 && (
                <View style={styles.totauxRow}>
                  <Text style={{ fontSize: 12, color: '#059669', fontWeight: '700' }}>Monnaie rendue</Text>
                  <Text style={{ fontSize: 12, color: '#059669', fontWeight: '800' }}>{fmtNum(vente.monnaie)} ₣</Text>
                </View>
              )}
              <View style={[styles.totauxRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>Commission (0%)</Text>
                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>0 ₣</Text>
              </View>
            </View>

            {/* Section reçu dépliable */}
            <View style={[styles.recuSection, { borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setShowRecu(v => !v)}
                style={[styles.recuToggle, { backgroundColor: colors.bgHover }]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name={showRecu ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                    {showRecu ? 'Masquer le reçu' : 'Voir / Partager le reçu'}
                  </Text>
                </View>
                <Ionicons name={showRecu ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {showRecu && (
                <View>
                  {/* Ticket blanc centré — même rendu que VenteScreen */}
                  <ScrollView
                    style={{ backgroundColor: colors.bgHover, borderTopWidth: 1, borderTopColor: colors.border }}
                    contentContainerStyle={{ padding: 12, alignItems: 'center' }}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <View style={[styles.receiptTicket, { shadowColor: colors.text }]}>
                      <Text style={styles.receiptBrand}>🌿 IHAMBAOBAB</Text>
                      <Text style={styles.receiptStoreName}>{storeName}</Text>
                      <Text style={styles.receiptSubTitle}>Reçu de vente physique</Text>
                      <Text style={styles.receiptDate}>{fmtDateHour(vente.createdAt)}</Text>
                      <Text style={styles.receiptRef}>{vente.reference}</Text>
                      <View style={styles.receiptDivider} />
                      <View style={styles.receiptColHeader}>
                        <Text style={[styles.receiptColText, { flex: 2 }]}>Article</Text>
                        <Text style={[styles.receiptColText, { width: 52, textAlign: 'right' }]}>P.U</Text>
                        <Text style={[styles.receiptColText, { width: 28, textAlign: 'center' }]}>Qté</Text>
                        <Text style={[styles.receiptColText, { width: 70, textAlign: 'right' }]}>Total</Text>
                      </View>
                      {vente.lignes.map((l, i) => (
                        <View key={i} style={styles.receiptItemWrap}>
                          <Text style={styles.receiptItemNom}>
                            {l.nom}
                            {l.varianteLabel ? <Text style={styles.receiptItemVariante}> — {l.varianteLabel}</Text> : null}
                          </Text>
                          <View style={styles.receiptItemRow}>
                            <Text style={[styles.receiptItemCell, { flex: 2 }]} />
                            <Text style={[styles.receiptItemCell, { width: 52, textAlign: 'right' }]}>{fmtNum(l.prixUnitaire)}</Text>
                            <Text style={[styles.receiptItemCell, { width: 28, textAlign: 'center' }]}>×{l.quantite}</Text>
                            <Text style={[styles.receiptItemCellBold, { width: 70, textAlign: 'right' }]}>{fmtNum(l.sousTotal)}</Text>
                          </View>
                        </View>
                      ))}
                      <View style={styles.receiptDivider} />
                      <Text style={{ fontSize: 10, color: '#6B7280', textAlign: 'right', marginBottom: 3, width: '100%' }}>FCFA</Text>
                      {vente.remise > 0 && (
                        <View style={styles.receiptTotalRow}>
                          <Text style={{ color: '#EF4444', fontSize: 12 }}>Remise</Text>
                          <Text style={{ color: '#EF4444', fontSize: 12 }}>-{fmtNum(vente.remise)}</Text>
                        </View>
                      )}
                      <View style={[styles.receiptTotalRow, styles.receiptGrandTotal]}>
                        <Text style={styles.receiptGrandTotalText}>TOTAL</Text>
                        <Text style={styles.receiptGrandTotalText}>{fmtNum(vente.total)} FCFA</Text>
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
                          <Text style={{ fontSize: 12, color: '#111' }}>{fmtNum(vente.montantRecu)} FCFA</Text>
                        </View>
                      )}
                      {vente.modePaiement === 'ESPECES' && vente.monnaie > 0 && (
                        <View style={[styles.receiptTotalRow, { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 4 }]}>
                          <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>💵 Monnaie rendue</Text>
                          <Text style={{ color: '#059669', fontWeight: '800', fontSize: 14 }}>{fmtNum(vente.monnaie)} ₣</Text>
                        </View>
                      )}
                      <View style={[styles.receiptDivider, { marginTop: 10 }]} />
                      <Text style={styles.receiptFooter}>Merci pour votre achat !{'\n'}ihambaobab.com</Text>
                    </View>
                  </ScrollView>
                  {/* Actions partage */}
                  <View style={[styles.recuActions, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      onPress={handleWhatsApp}
                      disabled={printing}
                      style={[styles.whatsappBtn, { opacity: printing ? 0.6 : 1 }]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={printing ? 'sync-outline' : 'logo-whatsapp'} size={16} color="#fff" />
                      <Text style={styles.recuBtnText}>{printing ? 'Génération…' : 'WhatsApp'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handlePrint}
                      disabled={printing}
                      style={[styles.printBtn, { backgroundColor: '#30A08B', opacity: printing ? 0.6 : 1 }]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={printing ? 'sync-outline' : 'print-outline'} size={16} color="#fff" />
                      <Text style={styles.recuBtnText}>{printing ? 'Génération…' : 'PDF / Imprimer'}</Text>
                    </TouchableOpacity>
                  </View>
                  {!vente.telephoneClient && (
                    <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
                      <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>
                        Aucun numéro client — WhatsApp ouvrira sans destinataire
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Annulation */}
            {peutAnnuler && !confirmAnnul && (
              <TouchableOpacity
                onPress={() => setConfirmAnnul(true)}
                style={[styles.annulTrigger, { borderColor: '#FECACA' }]}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-circle-outline" size={16} color="#EF4444" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>Annuler cette vente</Text>
              </TouchableOpacity>
            )}
            {peutAnnuler && confirmAnnul && (
              <View style={[styles.annulBox, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                  <Ionicons name="warning-outline" size={16} color="#EF4444" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#B91C1C' }}>Confirmer l'annulation</Text>
                    <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 16 }}>
                      Le stock sera restauré automatiquement. Aucune transaction financière (0% commission POS).
                    </Text>
                  </View>
                </View>
                <TextInput
                  value={motif}
                  onChangeText={setMotif}
                  placeholder="Motif de l'annulation (optionnel)"
                  placeholderTextColor="#F87171"
                  style={[styles.input, { borderColor: '#FECACA', backgroundColor: '#fff', color: '#111', marginBottom: 10 }]}
                  multiline numberOfLines={2}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setConfirmAnnul(false)}
                    style={[styles.annulBtn, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Retour</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onAnnuler(vente.reference, motif)}
                    disabled={annulLoading}
                    style={[styles.annulBtn, { backgroundColor: '#EF4444', opacity: annulLoading ? 0.7 : 1, flex: 1 }]}
                    activeOpacity={0.85}
                  >
                    {annulLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="refresh-circle-outline" size={14} color="#fff" />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                      {annulLoading ? 'En cours…' : 'Confirmer'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {isAnnulee && (
              <View style={[styles.annuledBanner, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                <Text style={{ fontSize: 12, color: '#DC2626', flex: 1 }}>
                  Cette vente a été annulée. Le stock a été restitué.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── SoldeCard ────────────────────────────────────────────────────────────────
function SoldeCard({ label, montant, icon, color, visible }) {
  return (
    <View style={styles.soldeCard}>
      <View style={[styles.soldeIcon, { backgroundColor: `${color}25` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.soldeLabel}>{label}</Text>
      <Text style={[styles.soldeMontant, { color }]}>
        {visible ? fmt(montant) : '••••••'}
      </Text>
    </View>
  );
}

// ─── PulseWrap — enveloppe une carte avec une pulsation d'opacité ─────────────
function PulseWrap({ active, children, style }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.35, duration: 500, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [active]);
  return <Animated.View style={[{ opacity: anim, gap: 14 }, style]}>{children}</Animated.View>;
}

// ─── PosKpiCard ───────────────────────────────────────────────────────────────
function PosKpiCard({ val, icon, color, bg, sub, colors }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.bgCard, borderColor: `${color}30` }]}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.kpiVal, { color }]} numberOfLines={1}>{val}</Text>
      <Text style={[styles.kpiSub, { color: colors.textMuted }]} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

// ─── MiniStat ─────────────────────────────────────────────────────────────────
function MiniStat({ label, val, icon, color, bg, visible, isMoney, colors }) {
  const display = !visible ? '••••' : isMoney ? `${fmtShort(val)} ₣` : String(val);
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniStatIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniStatVal, { color }]}>{display}</Text>
    </View>
  );
}

// ─── TxRow ────────────────────────────────────────────────────────────────────
function TxRow({ tx, colors, onPress }) {
  const cfg  = TX_CONFIG[tx.type]       || { label: tx.type,   icon: 'ellipsis-horizontal', color: '#6B7280' };
  const sCfg = STATUT_CONFIG[tx.statut] || { label: tx.statut, color: '#6B7280', bg: '#F3F4F6' };
  const isDebit = ['RETRAIT', 'COMMISSION', 'ANNULATION', 'ANNULATION_POS'].includes(tx.type);
  return (
    <TouchableOpacity onPress={() => onPress(tx)} activeOpacity={0.7} style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${cfg.color}18` }]}>
        <Ionicons name={cfg.icon} size={16} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{cfg.label}</Text>
        <Text style={[styles.rowSub, { color: colors.textMuted }]}>{fmtDateHour(tx.dateTransaction)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.rowAmount, { color: isDebit ? '#EF4444' : '#10B981' }]}>
          {isDebit ? '−' : '+'}{fmtShort(Math.abs(tx.montantNet ?? tx.montant))} ₣
        </Text>
        <View style={[styles.badge, { backgroundColor: sCfg.bg }]}>
          <Text style={[styles.badgeText, { color: sCfg.color }]}>{sCfg.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── TxDetailModal ────────────────────────────────────────────────────────────
function TxDetailModal({ tx, onClose, colors }) {
  if (!tx) return null;
  const cfg     = TX_CONFIG[tx.type]       || { label: tx.type,   icon: 'ellipsis-horizontal', color: '#6B7280' };
  const sCfg    = STATUT_CONFIG[tx.statut] || { label: tx.statut, color: '#6B7280', bg: '#F3F4F6' };
  const isDebit = ['RETRAIT', 'COMMISSION', 'ANNULATION', 'ANNULATION_POS'].includes(tx.type);
  const amtColor = isDebit ? '#EF4444' : '#10B981';

  const cmdRef = tx.commandeId?.reference || (typeof tx.commandeId === 'string' ? null : null);

  const rows = [
    tx.reference        && { label: 'Référence',         val: tx.reference,                   mono: true },
    tx.description      && { label: 'Description',        val: tx.description },
    tx.dateTransaction  && { label: 'Date',               val: fmtDateHour(tx.dateTransaction) },
    tx.montant != null  && { label: 'Montant brut',       val: fmt(Math.abs(tx.montant)),            color: amtColor },
    tx.commission != null && tx.commission > 0 && { label: tx.type === 'RETRAIT' ? 'Frais de transfert' : 'Commission', val: `−${fmt(Math.abs(tx.commission))}`, color: '#F59E0B' },
    tx.montantNet != null && tx.montantNet !== tx.montant && { label: 'Montant net', val: fmt(Math.abs(tx.montantNet)), color: amtColor },
    tx.tauxCommission != null && tx.tauxCommission > 0 && { label: tx.type === 'RETRAIT' ? 'Taux frais' : 'Taux commission', val: `${tx.tauxCommission}%` },
    cmdRef              && { label: 'Commande',           val: cmdRef,                          mono: true },
    tx.dateDisponibilite && { label: 'Disponible le',     val: fmtDate(tx.dateDisponibilite) },
  ].filter(Boolean);

  return (
    <Modal visible={!!tx} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.txModalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.txModalSheet, { backgroundColor: colors.bgCard }]}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>

        {/* En-tête */}
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
          <View style={[styles.txModalIcon, { backgroundColor: `${cfg.color}18` }]}>
            <Ionicons name={cfg.icon} size={26} color={cfg.color} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: isDebit ? '#EF4444' : '#10B981' }}>
            {isDebit ? '−' : '+'}{fmtShort(Math.abs(tx.montantNet ?? tx.montant))} ₣
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{cfg.label}</Text>
          <View style={[styles.badge, { backgroundColor: sCfg.bg, paddingHorizontal: 12, paddingVertical: 5 }]}>
            <Text style={[styles.badgeText, { color: sCfg.color, fontSize: 12 }]}>{sCfg.label}</Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20 }} />

        {/* Détails */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 0 }}>
          {rows.map((r, i) => (
            <View key={i} style={[styles.txModalRow, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={{ fontSize: 13, color: colors.textMuted, flex: 1 }}>{r.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: r.color || colors.text, fontFamily: r.mono ? Platform.OS === 'ios' ? 'Courier' : 'monospace' : undefined, flexShrink: 1, textAlign: 'right' }}>
                {r.val}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── OrderFinRow ──────────────────────────────────────────────────────────────
function OrderFinRow({ order, colors, onPress }) {
  const etat = (order.etatTraitement || '').toLowerCase();
  const isAnnule  = order.statusLivraison === 'annulé'  || etat.includes('annul');
  const isLivre   = order.statusLivraison === 'livré'   || order.statusLivraison === 'recu';
  const isEnCours = etat.includes('livraison');
  const isPrepare = etat.includes('préparer') || etat.includes('preparer');

  const statusInfo = isAnnule  ? { label: 'Annulée',     color: '#EF4444', bg: '#FEF2F2' }
                   : isLivre   ? { label: 'Livrée',       color: '#10B981', bg: '#ECFDF5' }
                   : isEnCours ? { label: 'En livraison', color: '#0EA5E9', bg: '#E0F2FE' }
                   : isPrepare ? { label: 'Préparée',      color: '#8B5CF6', bg: '#F5F3FF' }
                   :             { label: 'En attente',    color: '#F59E0B', bg: '#FFFBEB' };

  const paymentOk = isLivre || order.statusPayment === 'payé' || order.statusPayment === 'reçu';

  return (
    <TouchableOpacity onPress={() => onPress(order)} activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
          {order.reference || `#${String(order._id).slice(-8)}`}
        </Text>
        <Text style={[styles.rowSub, { color: colors.textMuted }]}>{fmtDate(order.date)}</Text>
        {order.sellerProducts?.length > 0 && (
          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {order.sellerProducts.length} article{order.sellerProducts.length > 1 ? 's' : ''} — {order.sellerProducts.map(p => p.nom).join(', ')}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.rowAmount, { color: colors.primary }]}>{fmt(order.montantNet ?? order.sellerTotal)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: paymentOk ? '#ECFDF5' : '#FFFBEB' }]}>
            <Text style={[styles.badgeText, { color: paymentOk ? '#10B981' : '#F59E0B' }]}>
              {paymentOk ? 'Payé' : 'Impayé'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── OrderDetailModal ─────────────────────────────────────────────────────────
function OrderDetailModal({ order, sellerId, isOffline, onClose, colors }) {
  const insets = useSafeAreaInsets();
  const [localOrder, setLocalOrder] = useState(null);
  const [validating, setValidating] = useState(null); // productId or 'all'

  useEffect(() => { if (order) setLocalOrder(order); }, [order]);

  if (!order || !localOrder) return null;

  const isAnnule    = (localOrder.statusLivraison === 'annulé') || (localOrder.etatTraitement || '').toLowerCase().includes('annul');
  const isLivre     = localOrder.statusLivraison === 'livré' || localOrder.statusLivraison === 'recu';
  const isEnCours   = (localOrder.etatTraitement || '').toLowerCase().includes('livraison');
  const isPrepare   = (localOrder.etatTraitement || '').toLowerCase().includes('préparer') || (localOrder.etatTraitement || '').toLowerCase().includes('preparer');

  const statusInfo = isAnnule  ? { label: 'Annulée',      color: '#EF4444', bg: '#FEF2F2', icon: 'close-circle-outline' }
                   : isLivre   ? { label: 'Livrée',        color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-circle-outline' }
                   : isEnCours ? { label: 'En livraison',  color: '#0EA5E9', bg: '#E0F2FE', icon: 'car-outline' }
                   : isPrepare ? { label: 'Préparée',       color: '#8B5CF6', bg: '#F5F3FF', icon: 'cube-outline' }
                   :             { label: 'En attente',     color: '#F59E0B', bg: '#FFFBEB', icon: 'time-outline' };

  const paymentOk = isLivre || localOrder.statusPayment === 'payé' || localOrder.statusPayment === 'reçu';
  const allValidated = localOrder.sellerProducts?.every(p => p.isValideSeller);
  const noneValidated = localOrder.sellerProducts?.every(p => !p.isValideSeller);

  const toggleProduct = async (produitId, idx) => {
    if (isOffline) { Toast.show({ type: 'error', text1: 'Hors ligne', text2: 'Validation impossible sans connexion' }); return; }
    setValidating(produitId);
    try {
      const res = await apiClient.put(`/seller-orders/${localOrder._id}/toggle-product/${sellerId}/${produitId}/${idx}`);
      if (res.data?.success) {
        setLocalOrder(prev => ({
          ...prev,
          sellerProducts: prev.sellerProducts.map((p, i) =>
            i === idx ? { ...p, isValideSeller: res.data.data?.isValideSeller ?? !p.isValideSeller } : p
          ),
        }));
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur de validation', text2: e.message });
    } finally {
      setValidating(null);
    }
  };

  const validateAll = async (isValid) => {
    if (isOffline) { Toast.show({ type: 'error', text1: 'Hors ligne', text2: 'Validation impossible sans connexion' }); return; }
    setValidating('all');
    try {
      const endpoint = isValid
        ? `/seller-orders/${localOrder._id}/validate/${sellerId}`
        : `/seller-orders/${localOrder._id}/validate/${sellerId}`;
      // For invalidate-all we toggle each — use the validate endpoint with isValid param per product
      if (!isValid) {
        // invalidate all: call validate-product with isValid=false for each
        await Promise.all(
          localOrder.sellerProducts.map((p, i) =>
            apiClient.put(`/seller-orders/${localOrder._id}/validate-product/${sellerId}/${p.produitId}`, { isValid: false })
          )
        );
        setLocalOrder(prev => ({
          ...prev,
          sellerProducts: prev.sellerProducts.map(p => ({ ...p, isValideSeller: false })),
        }));
      } else {
        await apiClient.put(endpoint);
        setLocalOrder(prev => ({
          ...prev,
          sellerProducts: prev.sellerProducts.map(p => ({ ...p, isValideSeller: true })),
        }));
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur', text2: e.message });
    } finally {
      setValidating(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.txModalOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.txModalSheet, { backgroundColor: colors.bgCard, paddingBottom: insets.bottom + 8 }]}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, gap: 12 }}>
            <View style={[styles.txModalIcon, { backgroundColor: statusInfo.bg }]}>
              <Ionicons name={statusInfo.icon} size={22} color={statusInfo.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
                {localOrder.reference || `#${String(localOrder._id).slice(-8)}`}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{fmtDateHour(localOrder.date)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 18 }}>
            {/* Statut badges */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <View style={[styles.badge, { backgroundColor: statusInfo.bg, paddingHorizontal: 10, paddingVertical: 5 }]}>
                <Ionicons name={statusInfo.icon} size={11} color={statusInfo.color} />
                <Text style={[styles.badgeText, { color: statusInfo.color, fontSize: 11 }]}> {statusInfo.label}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: paymentOk ? '#ECFDF5' : '#FFFBEB', paddingHorizontal: 10, paddingVertical: 5 }]}>
                <Ionicons name={paymentOk ? 'card-outline' : 'card-outline'} size={11} color={paymentOk ? '#10B981' : '#F59E0B'} />
                <Text style={[styles.badgeText, { color: paymentOk ? '#10B981' : '#F59E0B', fontSize: 11 }]}> {paymentOk ? 'Paiement reçu' : 'Paiement en attente'}</Text>
              </View>
            </View>

            {/* Montants */}
            <View style={[styles.totauxBox, { borderColor: colors.border, backgroundColor: colors.bgHover, marginBottom: 16 }]}>
              {localOrder.sellerTotal != null && (
                <View style={[styles.totauxRow, { marginBottom: 6 }]}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Montant brut</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{fmt(localOrder.sellerTotal)}</Text>
                </View>
              )}
              {localOrder.commission > 0 && (
                <View style={[styles.totauxRow, { marginBottom: 6 }]}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Commission ({Math.round((localOrder.tauxCommission || 0) * 100)}%)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>−{fmt(localOrder.commission)}</Text>
                </View>
              )}
              {localOrder.montantNet != null && (
                <View style={[styles.totauxRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Net vendeur</Text>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#10B981' }}>{fmt(localOrder.montantNet)}</Text>
                </View>
              )}
              {localOrder.montantNet == null && (
                <View style={styles.totauxRow}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Total estimé</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{fmt(localOrder.sellerTotal)}</Text>
                </View>
              )}
            </View>

            {/* Liste des produits */}
            {localOrder.sellerProducts?.length > 0 && (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Articles ({localOrder.sellerProducts.length})
                </Text>
                <View style={{ gap: 10, marginBottom: 16 }}>
                  {localOrder.sellerProducts.map((p, idx) => {
                    const prixEffectif = p.prixPromo > 0 ? p.prixPromo : p.prix;
                    const sousTotal = prixEffectif * (p.quantite || 1);
                    const isVal = p.isValideSeller;
                    return (
                      <View key={p.produitId || idx}
                        style={[styles.totauxBox, { borderColor: colors.border, backgroundColor: colors.bgCard, gap: 8 }]}>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                          {p.image ? (
                            <Image source={{ uri: p.image }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
                          ) : (
                            <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center' }}>
                              <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{p.nom}</Text>
                            {p.tailles?.length > 0 && (
                              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Taille : {p.tailles.join(', ')}</Text>
                            )}
                            {p.couleurs?.length > 0 && (
                              <Text style={{ fontSize: 11, color: colors.textMuted }}>Couleur : {p.couleurs.join(', ')}</Text>
                            )}
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                              {fmt(prixEffectif)} × {p.quantite || 1} = <Text style={{ fontWeight: '700', color: colors.text }}>{fmt(sousTotal)}</Text>
                            </Text>
                          </View>
                        </View>
                        {/* Badge + bouton validation */}
                        {!isLivre && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={[styles.badge, { backgroundColor: isVal ? '#ECFDF5' : '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4 }]}>
                              <Ionicons name={isVal ? 'checkmark-circle' : 'close-circle'} size={11} color={isVal ? '#10B981' : '#EF4444'} />
                              <Text style={[styles.badgeText, { color: isVal ? '#10B981' : '#EF4444', fontSize: 10 }]}>
                                {' '}{isVal ? 'Validé' : 'Non validé'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => toggleProduct(p.produitId, idx)}
                              disabled={validating !== null}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
                                backgroundColor: isVal ? '#FEF2F2' : '#ECFDF5', opacity: validating !== null ? 0.5 : 1 }}>
                              {validating === p.produitId
                                ? <ActivityIndicator size="small" color={isVal ? '#EF4444' : '#10B981'} />
                                : <Ionicons name={isVal ? 'close-circle-outline' : 'checkmark-circle-outline'} size={14} color={isVal ? '#EF4444' : '#10B981'} />
                              }
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isVal ? '#EF4444' : '#10B981' }}>
                                {isVal ? 'Invalider' : 'Valider'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Boutons bulk — masqués si livraison reçue */}
                {!isLivre && (
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                    <TouchableOpacity
                      onPress={() => validateAll(true)}
                      disabled={allValidated || validating !== null}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 11, borderRadius: 12, backgroundColor: allValidated ? '#F3F4F6' : '#ECFDF5',
                        opacity: (allValidated || validating !== null) ? 0.5 : 1 }}>
                      {validating === 'all' ? <ActivityIndicator size="small" color="#10B981" /> : <Ionicons name="checkmark-done-outline" size={15} color="#10B981" />}
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>Tout valider</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => validateAll(false)}
                      disabled={noneValidated || validating !== null}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 11, borderRadius: 12, backgroundColor: noneValidated ? '#F3F4F6' : '#FEF2F2',
                        opacity: (noneValidated || validating !== null) ? 0.5 : 1 }}>
                      {validating === 'all' ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="close-circle-outline" size={15} color="#EF4444" />}
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>Tout invalider</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isLivre && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12,
                    backgroundColor: '#ECFDF5', marginBottom: 20 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#065F46', flex: 1 }}>
                      Commande livrée et traitée avec succès.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── PosRow ───────────────────────────────────────────────────────────────────
function PosRow({ vente, colors, onPress }) {
  const isAnnulee = vente.statut === 'ANNULEE';
  return (
    <TouchableOpacity
      onPress={() => onPress(vente)}
      style={[styles.posRow, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: isAnnulee ? '#FEF2F2' : '#ECFDF5' }]}>
        <Ionicons name={isAnnulee ? 'close-circle-outline' : 'receipt-outline'} size={16} color={isAnnulee ? '#EF4444' : '#10B981'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{vente.reference}</Text>
        <Text style={[styles.rowSub, { color: colors.textMuted }]}>
          {fmtDateHour(vente.createdAt)} · {vente.modePaiement === 'ESPECES' ? 'Espèces' : 'Mobile Money'}
        </Text>
        {vente.lignes?.length > 0 && (
          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {vente.lignes.length} article{vente.lignes.length > 1 ? 's' : ''} — {vente.lignes.map(l => l.nom).join(', ')}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.rowAmount, {
          color: isAnnulee ? '#9CA3AF' : colors.primary,
          textDecorationLine: isAnnulee ? 'line-through' : 'none',
        }]}>
          {fmt(vente.total)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[styles.badge, { backgroundColor: isAnnulee ? '#FEF2F2' : '#ECFDF5' }]}>
            <Text style={[styles.badgeText, { color: isAnnulee ? '#EF4444' : '#10B981' }]}>
              {isAnnulee ? 'Annulée' : 'Complétée'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── WithdrawModal ────────────────────────────────────────────────────────────
function WithdrawModal({ visible, soldeDisponible, onClose, onConfirm, sending, colors }) {
  const insets = useSafeAreaInsets();
  const [montant,       setMontant]       = useState('');
  const [methode,       setMethode]       = useState('MOBILE_MONEY');
  const [operateur,     setOperateur]     = useState('My Nita');
  const [countryCode,   setCountryCode]   = useState(COUNTRY_CODES[0]); // Niger +227
  const [showCCPicker,  setShowCCPicker]  = useState(false);
  const [telephone,     setTelephone]     = useState('');
  const [nomBenef,      setNomBenef]      = useState('');
  const [banque,        setBanque]        = useState('');
  const [numCompte,     setNumCompte]     = useState('');
  const [nomTitulaire,  setNomTitulaire]  = useState('');

  useEffect(() => {
    if (visible) {
      setMontant(''); setMethode('MOBILE_MONEY'); setOperateur('My Nita');
      setCountryCode(COUNTRY_CODES[0]); setShowCCPicker(false);
      setTelephone(''); setNomBenef(''); setBanque(''); setNumCompte(''); setNomTitulaire('');
    }
  }, [visible]);

  const montantNum = Number(montant) || 0;
  const phoneDigits   = telephone.replace(/\D/g, '');
  const accountDigits = numCompte.replace(/\s/g, '');
  const canConfirm = montantNum >= 5000 && montantNum <= soldeDisponible
    && (methode === 'ESPECES'
      || (methode === 'MOBILE_MONEY'      && phoneDigits.length === countryCode.digits && nomBenef.trim())
      || (methode === 'VIREMENT_BANCAIRE' && banque.trim() && accountDigits.length >= 10 && nomTitulaire.trim()));

  const handleConfirm = () => {
    const details = methode === 'MOBILE_MONEY'
      ? { operateur, indicatif: countryCode.code, numeroTelephone: `${countryCode.code}${phoneDigits}`, nomBeneficiaire: nomBenef }
      : methode === 'VIREMENT_BANCAIRE'
        ? { banque, numeroCompte: accountDigits, nomTitulaire }
        : {};
    onConfirm({ montantDemande: montantNum, methodeRetrait: methode, detailsRetrait: details });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[styles.modalSheet, { backgroundColor: colors.bgCard, paddingBottom: insets.bottom + 16 }]}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Demande de retrait</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.infoBox, { backgroundColor: '#ECFDF5' }]}>
              <Text style={{ fontSize: 12, color: '#059669' }}>Solde disponible pour retrait</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>{fmt(soldeDisponible)}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>MONTANT (min. 5 000 ₣)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bgHover, color: colors.text }]}
                value={montant} onChangeText={setMontant} keyboardType="numeric"
                placeholder="Ex: 25000" placeholderTextColor={colors.textMuted}
              />
              {montantNum > soldeDisponible && (
                <Text style={{ fontSize: 11, color: '#EF4444' }}>Dépasse votre solde disponible</Text>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>MÉTHODE DE RETRAIT</Text>
              {[
                { key: 'MOBILE_MONEY',      label: 'Mobile Money',     icon: 'phone-portrait-outline', sub: 'My Nita / Amanata' },
                { key: 'VIREMENT_BANCAIRE', label: 'Virement bancaire', icon: 'business-outline',       sub: 'Virement sur compte bancaire' },
                { key: 'ESPECES',           label: 'Espèces',           icon: 'cash-outline',           sub: 'Points de collecte' },
              ].map(m => (
                <TouchableOpacity key={m.key} onPress={() => setMethode(m.key)}
                  style={[styles.methodeBtn, { borderColor: methode === m.key ? colors.primary : colors.border }, methode === m.key && { backgroundColor: colors.primaryLight }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name={m.icon} size={18} color={methode === m.key ? colors.primary : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: methode === m.key ? colors.primary : colors.text }}>{m.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{m.sub}</Text>
                  </View>
                  {methode === m.key && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
            {methode === 'MOBILE_MONEY' && (
              <View style={{ gap: 12 }}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DÉTAILS MOBILE MONEY</Text>
                {/* Opérateur */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['My Nita', 'Amanata'].map(op => (
                    <TouchableOpacity key={op} onPress={() => setOperateur(op)}
                      style={[styles.chip, { borderColor: operateur === op ? colors.primary : colors.border }, operateur === op && { backgroundColor: colors.primaryLight }]}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: operateur === op ? colors.primary : colors.textSub }}>{op}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* Numéro de téléphone */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>NUMÉRO DE TÉLÉPHONE</Text>
                  <View style={[styles.inputRow, { borderColor: phoneDigits.length === countryCode.digits ? colors.primary : colors.border, backgroundColor: colors.bgHover, gap: 0 }]}>
                    {/* Sélecteur indicatif */}
                    <TouchableOpacity
                      onPress={() => setShowCCPicker(v => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 10, borderRightWidth: 1, borderRightColor: colors.border, marginRight: 10 }}
                    >
                      <Text style={{ fontSize: 16 }}>{countryCode.flag}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{countryCode.code}</Text>
                      <Ionicons name={showCCPicker ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.inputInner, { color: colors.text, letterSpacing: 1.5, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }]}
                      value={fmtPhone(telephone, countryCode.digits)}
                      onChangeText={t => setTelephone(parsePhone(t))}
                      keyboardType="phone-pad"
                      placeholder={countryCode.placeholder}
                      placeholderTextColor={colors.textMuted}
                      maxLength={countryCode.digits + Math.floor(countryCode.digits / 2)}
                    />
                    {phoneDigits.length > 0 && (
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: phoneDigits.length === countryCode.digits ? '#10B981' : colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name={phoneDigits.length === countryCode.digits ? 'checkmark' : 'ellipsis-horizontal'} size={11} color="#fff" />
                      </View>
                    )}
                  </View>
                  {/* Dropdown indicatifs */}
                  {showCCPicker && (
                    <View style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bgCard, overflow: 'hidden', marginTop: 2 }}>
                      {COUNTRY_CODES.map(cc => (
                        <TouchableOpacity
                          key={cc.code}
                          onPress={() => { setCountryCode(cc); setTelephone(''); setShowCCPicker(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
                            backgroundColor: countryCode.code === cc.code ? colors.primaryLight : 'transparent',
                            borderBottomWidth: 1, borderBottomColor: colors.border }}
                        >
                          <Text style={{ fontSize: 18 }}>{cc.flag}</Text>
                          <Text style={{ fontSize: 13, fontWeight: countryCode.code === cc.code ? '700' : '500', color: countryCode.code === cc.code ? colors.primary : colors.text, flex: 1 }}>{cc.name}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: countryCode.code === cc.code ? colors.primary : colors.textMuted }}>{cc.code}</Text>
                          {countryCode.code === cc.code && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {/* Nom bénéficiaire */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>NOM DU BÉNÉFICIAIRE</Text>
                  <View style={[styles.inputRow, { borderColor: nomBenef ? colors.primary : colors.border, backgroundColor: colors.bgHover }]}>
                    <Ionicons name="person-outline" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.inputInner, { color: colors.text }]}
                      value={nomBenef} onChangeText={setNomBenef}
                      placeholder="Prénom et nom" placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
            )}
            {methode === 'VIREMENT_BANCAIRE' && (
              <View style={{ gap: 12 }}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DÉTAILS BANCAIRES</Text>
                {/* Nom de la banque */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>NOM DE LA BANQUE</Text>
                  <View style={[styles.inputRow, { borderColor: banque ? colors.primary : colors.border, backgroundColor: colors.bgHover }]}>
                    <Ionicons name="business-outline" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.inputInner, { color: colors.text }]}
                      value={banque} onChangeText={setBanque}
                      placeholder="Ex: Afriland First Bank" placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                {/* Numéro de compte */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>NUMÉRO DE COMPTE</Text>
                  <View style={[styles.inputRow, { borderColor: parseAccount(numCompte).length >= 10 ? colors.primary : colors.border, backgroundColor: colors.bgHover }]}>
                    <Ionicons name="card-outline" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.inputInner, { color: colors.text, letterSpacing: 2, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }]}
                      value={fmtAccountNumber(numCompte)}
                      onChangeText={t => setNumCompte(parseAccount(fmtAccountNumber(t)))}
                      keyboardType="numeric"
                      placeholder="XXXX XXXX XXXX XXXX"
                      placeholderTextColor={colors.textMuted}
                      maxLength={24}
                    />
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Saisissez les chiffres, les espaces s'ajoutent automatiquement</Text>
                </View>
                {/* Nom du titulaire */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>NOM DU TITULAIRE</Text>
                  <View style={[styles.inputRow, { borderColor: nomTitulaire ? colors.primary : colors.border, backgroundColor: colors.bgHover }]}>
                    <Ionicons name="person-outline" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.inputInner, { color: colors.text }]}
                      value={nomTitulaire} onChangeText={setNomTitulaire}
                      placeholder="Nom tel qu'il figure sur le compte"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
            )}
            {montantNum >= 5000 && (
              <View style={[styles.infoBox, { backgroundColor: colors.bgHover }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Vous recevrez</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#10B981' }}>{fmt(montantNum)}</Text>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={handleConfirm} disabled={!canConfirm || sending}
              style={[styles.confirmBtn, { backgroundColor: canConfirm ? colors.primary : colors.bgHover, opacity: sending ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="arrow-up-outline" size={18} color={canConfirm ? '#fff' : colors.textMuted} />
              }
              <Text style={[styles.confirmBtnText, { color: canConfirm ? '#fff' : colors.textMuted }]}>
                {sending ? 'Envoi...' : 'Confirmer le retrait'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── ÉCRAN PRINCIPAL ──────────────────────────────────────────────────────────
export default function PortefeuilleScreen() {
  const { seller }    = useAuthStore();
  const { isOffline } = useSync();
  const { colors }    = useTheme();
  const sellerId      = seller?._id || seller?.id;
  const storeName     = seller?.nomBoutique || seller?.nom || 'Ma Boutique';

  // ── Vue active ─────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('pos');
  const pageScrollRef = useRef(null);
  const activeViewRef = useRef('pos');

  const switchView = useCallback((key) => {
    const idx = VIEWS.findIndex(v => v.key === key);
    pageScrollRef.current?.scrollTo({ x: idx * W, animated: true });
    setActiveView(key);
    activeViewRef.current = key;
  }, []);

  // ── État ───────────────────────────────────────────────────────────────────
  const [periode,        setPeriode]        = useState(30);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [portfolio,      setPortfolio]      = useState(null);
  const [transactions,   setTransactions]   = useState([]);
  const [orders,         setOrders]         = useState([]);
  const [posVentes,      setPosVentes]      = useState([]);

  const [loading,       setLoading]       = useState(true);
  const [statsLoading,  setStatsLoading]  = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [txLoading,     setTxLoading]     = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [posLoading,    setPosLoading]    = useState(false);
  const [annulLoading,  setAnnulLoading]  = useState(false);

  const [txPage,        setTxPage]        = useState(1);
  const [txTotalPages,  setTxTotalPages]  = useState(1);
  const [ordPage,       setOrdPage]       = useState(1);
  const [ordTotalPages, setOrdTotalPages] = useState(1);
  const [posPage,        setPosPage]        = useState(1);
  const [posTotalPages,  setPosTotalPages]  = useState(1);
  const [posStatsLive, setPosStatsLive] = useState(null);

  const [mkTab,           setMkTab]           = useState('commandes');
  const [selectedTx,      setSelectedTx]      = useState(null);
  const [selectedOrder,   setSelectedOrder]   = useState(null);
  const [retraits,        setRetraits]        = useState([]);
  const [retraitsLoading, setRetraitsLoading] = useState(false);
  const [retraitsPage,    setRetraitsPage]    = useState(1);
  const [retraitsTotalPages, setRetraitsTotalPages] = useState(1);
  const [txType,          setTxType]          = useState('');
  const [txStatut,        setTxStatut]        = useState('');
  const [posStatut,       setPosStatut]       = useState('');
  const [posMode,         setPosMode]         = useState('');
  const [posPeriode,      setPosPeriode]      = useState(30);

  const [selectedVente,   setSelectedVente]   = useState(null);
  const [showWithdraw,    setShowWithdraw]    = useState(false);
  const [sendingRetrait,  setSendingRetrait]  = useState(false);

  const pollingRef         = useRef(null);
  const dashboardLoadedRef = useRef(false);
  const mkTabScrollRef     = useRef(null);
  const posOpacity         = useRef(new Animated.Value(1)).current;
  // Cache périodes en mémoire — même pattern que DashboardScreen
  const periodeCache       = useRef({});
  // Ref isOffline — accessible dans les callbacks sans les re-créer
  const isOfflineRef       = useRef(isOffline);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);

  // Floutement lors du rechargement POS (filtre période/statut)
  useEffect(() => {
    if (posLoading && posVentes.length > 0) {
      Animated.timing(posOpacity, { toValue: 0.35, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(posOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [posLoading]);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (silent = false, forPeriode = null) => {
    const p = forPeriode ?? periode;
    if (!sellerId) return;
    if (isOfflineRef.current) { setLoading(false); setRefreshing(false); return; }

    // Prefetch background d'une autre période — aucun effet sur l'UI
    if (forPeriode !== null) {
      try {
        const res = await apiClient.get(`/api/financial/seller/${sellerId}/dashboard?periode=${p}`);
        periodeCache.current[p] = res.data?.data || res.data;
      } catch (_) {}
      return;
    }

    // Cache hit pour la période active — affichage instantané + recharge silencieuse
    if (!silent && periodeCache.current[p]) {
      setPortfolio(periodeCache.current[p]);
      setLoading(false);
      setStatsLoading(false);
      silent = true;
    }

    if (silent) { setStatsLoading(true); } else { setLoading(true); }
    try {
      const res = await apiClient.get(`/api/financial/seller/${sellerId}/dashboard?periode=${p}`);
      const data = res.data?.data || res.data;
      periodeCache.current[p] = data;
      setPortfolio(data);
    } catch (e) {
      if (!silent) Toast.show({ type: 'error', text1: 'Erreur', text2: 'Impossible de charger le portefeuille' });
    } finally {
      setLoading(false);
      setStatsLoading(false);
      setRefreshing(false);
    }
  }, [sellerId, periode]);

  const fetchTransactions = useCallback(async (page = 1) => {
    if (!sellerId || isOfflineRef.current) return;
    setTxLoading(true);
    try {
      const end   = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (periode - 1));
      start.setHours(0, 0, 0, 0);
      const params = new URLSearchParams({ page, limit: 5, dateStart: start.toISOString(), dateEnd: end.toISOString() });
      if (txType)   params.append('type',   txType);
      if (txStatut) params.append('statut', txStatut);
      const res  = await apiClient.get(`/api/financial/seller/${sellerId}/transactions?${params}`);
      const d    = res.data?.data || res.data;
      setTransactions(d?.transactions || []);
      setTxPage(page);
      setTxTotalPages(d?.pagination?.pages ?? 1);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Erreur transactions' });
    } finally { setTxLoading(false); }
  }, [sellerId, txType, txStatut, periode]);

  const fetchOrders = useCallback(async (page = 1) => {
    if (!sellerId || isOfflineRef.current) return;
    setOrdersLoading(true);
    try {
      const end   = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (periode - 1));
      start.setHours(0, 0, 0, 0);
      const res  = await apiClient.get(`/api/financial/seller/${sellerId}/orders-financial?page=${page}&limit=5&dateStart=${start.toISOString()}&dateEnd=${end.toISOString()}`);
      const d    = res.data?.data || res.data;
      setOrders(d?.orders || []);
      setOrdPage(page);
      setOrdTotalPages(d?.pagination?.totalPages ?? 1);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Erreur commandes' });
    } finally { setOrdersLoading(false); }
  }, [sellerId, periode]);

  const fetchPos = useCallback(async (page = 1) => {
    if (!sellerId || isOfflineRef.current) return;
    setPosLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 5 });
      if (posStatut) params.append('statut',      posStatut);
      if (posMode)   params.append('modePaiement', posMode);
      const end   = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (posPeriode - 1));
      start.setHours(0, 0, 0, 0);
      params.append('dateStart', start.toISOString());
      params.append('dateEnd',   end.toISOString());
      const res  = await apiClient.get(`/api/pos/historique/${sellerId}?${params}`);
      const d    = res.data?.data || res.data;
      const pag  = d?.pagination || {};
      setPosVentes(d?.ventes || []);
      setPosPage(page);
      setPosTotalPages(Math.ceil((pag.total ?? 0) / 5) || 1);
      if (page === 1 && d?.stats) setPosStatsLive(d.stats);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Erreur historique POS' });
    } finally { setPosLoading(false); }
  }, [sellerId, posStatut, posMode, posPeriode]);

  const handleRetrait = async ({ montantDemande, methodeRetrait, detailsRetrait }) => {
    setSendingRetrait(true);
    try {
      await apiClient.post(`/api/financial/seller/${sellerId}/retrait`, { montantDemande, methodeRetrait, detailsRetrait });
      Toast.show({ type: 'success', text1: 'Demande envoyée', text2: 'Votre retrait est en cours de traitement' });
      setShowWithdraw(false);
      fetchDashboard(true);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur retrait', text2: e.response?.data?.message || e.message });
    } finally { setSendingRetrait(false); }
  };

  const handleAnnulerPos = async (reference, motif) => {
    if (isOffline) {
      Toast.show({ type: 'error', text1: 'Hors ligne', text2: 'Impossible d\'annuler sans connexion' });
      return;
    }
    setAnnulLoading(true);
    try {
      await apiClient.post(`/api/pos/annuler/${reference}`, { motif });
      Toast.show({ type: 'success', text1: 'Vente annulée', text2: 'Le stock a été restitué.' });
      setSelectedVente(null);
      fetchPos(1);
      fetchDashboard(true);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur', text2: e.response?.data?.message || e.message });
    } finally { setAnnulLoading(false); }
  };

  const fetchRetraits = useCallback(async (page = 1) => {
    if (!sellerId || isOfflineRef.current) return;
    setRetraitsLoading(true);
    try {
      const end   = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (periode - 1));
      start.setHours(0, 0, 0, 0);
      const res  = await apiClient.get(`/api/financial/seller/${sellerId}/retraits?page=${page}&limit=5&dateStart=${start.toISOString()}&dateEnd=${end.toISOString()}`);
      const d    = res.data;
      setRetraits(d?.data || []);
      setRetraitsPage(page);
      setRetraitsTotalPages(d?.pagination?.pages ?? 1);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Erreur retraits' });
    } finally { setRetraitsLoading(false); }
  }, [sellerId, periode]);

  const switchMkTab = (tab) => {
    setMkTab(tab);
    mkTabScrollRef.current?.scrollTo({ x: tab === 'commandes' ? 0 : W - 30, animated: true });
  };

  // ─── Effets ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const silent = dashboardLoadedRef.current;
    dashboardLoadedRef.current = true;
    fetchDashboard(silent);
  }, [fetchDashboard]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchOrders(); },       [fetchOrders]);
  useEffect(() => { fetchRetraits(); },     [fetchRetraits]);
  useEffect(() => { fetchPos(1); },         [fetchPos]);

  // Préchargement silencieux de toutes les autres périodes dès que la première charge est terminée
  useEffect(() => {
    if (!sellerId || isOffline) return;
    const otherPeriodes = PERIODES.map(p => p.value).filter(p => p !== periode);
    const prefetch = async () => {
      await Promise.all(otherPeriodes.map(async (p) => {
        if (periodeCache.current[p]) return; // déjà en cache
        try {
          await fetchDashboard(true, p);
        } catch (_) {}
      }));
    };
    // Déclencher après un court délai pour ne pas concurrencer la charge initiale
    const t = setTimeout(prefetch, 1500);
    return () => clearTimeout(t);
  // Exécuter une seule fois au montage (sellerId + isOffline)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, isOffline]);

  // Reconnexion : déverouiller les spinners bloqués + recharger toutes les sections
  useEffect(() => {
    if (isOffline) {
      // Couper tous les spinners si la connexion tombe en pleine charge
      setLoading(false);
      setStatsLoading(false);
      setRefreshing(false);
      clearInterval(pollingRef.current);
      return;
    }
    // Connexion rétablie — charger si pas encore de données
    if (!periodeCache.current[periode]) {
      fetchDashboard(false);
      fetchTransactions(1);
      fetchOrders(1);
      fetchRetraits(1);
      fetchPos(1);
    }
    pollingRef.current = setInterval(() => fetchDashboard(true), 30_000);
    return () => clearInterval(pollingRef.current);
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = () => {
    if (isOffline) {
      Toast.show({ type: 'info', text1: 'Hors ligne', text2: 'Reconnectez-vous pour actualiser' });
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    fetchDashboard();
    fetchTransactions(1);
    fetchOrders(1);
    fetchRetraits(1);
    fetchPos(1);
  };

  // ─── Données extraites ─────────────────────────────────────────────────────
  const portefeuille = portfolio?.portefeuille || {};
  const stats        = portfolio?.statistiques || {};
  const txRecentes   = portfolio?.transactionsRecentes || [];
  const retraitsRec  = portfolio?.retraitsRecents      || [];
  const posStats     = portfolio?.posStats             || null;

  const soldeDisponible = portefeuille.soldeDisponible           ?? 0;
  const soldeBloqueTemp = portefeuille.soldeBloqueTemporairement ?? 0;
  const soldeEnAttente  = portefeuille.soldeEnAttente            ?? 0;
  const soldeTotal      = portefeuille.soldeTotal                ?? 0;
  const soldeReserve    = portefeuille.soldeReserveRetrait       ?? 0;
  const canWithdraw     = soldeDisponible >= 5000 && !isOffline;

  const liveStats       = posStatsLive || {};
  const posCACompletees = liveStats.totalCA            ?? 0;
  const posCAEspeces    = liveStats.totalEspeces        ?? 0;
  const posCAMobile     = liveStats.totalMobile         ?? 0;
  const posNbAnnulees   = liveStats.nombreAnnulations   ?? 0;
  const posPanierMoyen  = liveStats.panierMoyen         ?? 0;
  const topArticles     = liveStats.topArticles         ?? [];
  const hasActivePosFilter = posStatut || posMode;

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading && !portfolio) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 13 }}>Chargement du portefeuille…</Text>
      </View>
    );
  }
  if (isOffline && !portfolio) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Hors ligne</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
          Le portefeuille nécessite une connexion internet pour la première consultation.
        </Text>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>

      {/* Sélecteur de vue fixe */}
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

      {/* Pages swipeables */}
      <ScrollView
        ref={pageScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        directionalLockEnabled
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          const key = VIEWS[idx]?.key || 'pos';
          setActiveView(key);
          activeViewRef.current = key;
        }}
        style={{ flex: 1 }}
      >

        {/* ════════ PAGE POS ════════════════════════════════════════════════ */}
        <View style={styles.page}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#30A08B" />}
            contentContainerStyle={styles.pageContent}
            scrollEventThrottle={200}
          >
            {/* Filtre temporel POS */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingTop: 4 }}>
              {POS_PERIODES.map(p => {
                const isActive = posPeriode === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => setPosPeriode(p.value)}
                    style={[styles.chip, { borderColor: isActive ? colors.primary : colors.border }, isActive && { backgroundColor: colors.primaryLight }]}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '800' : '500', color: isActive ? colors.primary : colors.textSub }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <PulseWrap active={posLoading && posVentes.length > 0}>
            {/* Hero CA POS */}
            {posStatsLive ? (
              <LinearGradient colors={['#30A08B', '#1e7a6b']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
                <View style={styles.heroCardTop}>
                  <View>
                    <Text style={styles.heroCaption}>CA Caisse POS</Text>
                    <Text style={styles.heroTotal}>
                      {balanceVisible ? fmt(posCACompletees) : '•••••• ₣'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBalanceVisible(v => !v)} style={styles.heroBtn}>
                    <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                {isOffline && (
                  <View style={styles.offlinePill}>
                    <Ionicons name="cloud-offline-outline" size={11} color="#fff" />
                    <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>Hors ligne — données en cache</Text>
                  </View>
                )}
                <View style={styles.heroDivider} />
                <View style={styles.heroStatRow}>
                  {[
                    { val: String(liveStats.nombreVentes ?? 0), label: 'Ventes' },
                    { val: balanceVisible ? `${fmtShort(posPanierMoyen)} ₣` : '••••', label: 'Panier moy.' },
                    { val: String(posNbAnnulees), label: 'Annulées' },
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
            ) : null}

            {/* KPI cards — répartition paiements */}
            <View style={styles.kpiRow}>
              <PosKpiCard val={balanceVisible ? `${fmtShort(posCAEspeces)} ₣` : '••••'} icon="cash-outline"           color="#F59E0B" bg="#FFFBEB" sub="Espèces"     colors={colors} />
              <PosKpiCard val={balanceVisible ? `${fmtShort(posCAMobile)} ₣`  : '••••'} icon="phone-portrait-outline" color="#30A08B" bg="#E6F7F4" sub="Mobile Money" colors={colors} />
            </View>

            {/* Top articles vendus */}
            {topArticles.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, paddingBottom: 6 }]}>
                <View style={styles.cardHead}>
                  <Ionicons name="podium-outline" size={14} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Top articles</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>par CA · période sélectionnée</Text>
                </View>
                {topArticles.map((art, i) => {
                  const maxCA      = topArticles[0].ca || 1;
                  const pct        = art.ca / maxCA;
                  const rankColors = ['#F59E0B', '#9CA3AF', '#B17236'];
                  const rankColor  = i < 3 ? rankColors[i] : colors.textMuted;
                  return (
                    <View key={art.nom} style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {art.image ? (
                        <View style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.bgHover }}>
                          <Image source={{ uri: art.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                        </View>
                      ) : (
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bgHover, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: rankColor, width: 20 }}>#{i + 1}</Text>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>{art.nom}</Text>
                        </View>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bgHover }}>
                          <View style={{ width: `${Math.round(pct * 100)}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.55 + pct * 0.45 }} />
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{fmtNum(art.ca)} ₣</Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>{art.qte} vendu{art.qte > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            </PulseWrap>

            {/* Filtres POS */}
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="ellipse-outline" size={12} color={colors.textMuted} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[{ label: 'Toutes', value: '' }, { label: 'Complétées', value: 'COMPLETEE' }, { label: 'Annulées', value: 'ANNULEE' }].map(f => {
                    const active = posStatut === f.value;
                    const dotColor = f.value === 'COMPLETEE' ? '#10B981' : f.value === 'ANNULEE' ? '#EF4444' : colors.textMuted;
                    return (
                      <TouchableOpacity key={f.value} onPress={() => setPosStatut(f.value)}
                        style={[styles.txFilterChip, active && { backgroundColor: dotColor + '18', borderColor: dotColor }]}
                        activeOpacity={0.75}>
                        {f.value !== '' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />}
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? dotColor : colors.textSub }}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="funnel-outline" size={12} color={colors.textMuted} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { label: 'Tous',         value: '',              icon: 'apps-outline' },
                    { label: 'Espèces',      value: 'ESPECES',       icon: 'cash-outline' },
                    { label: 'Mobile Money', value: 'MOBILE_MONEY',  icon: 'phone-portrait-outline' },
                  ].map(f => {
                    const active = posMode === f.value;
                    return (
                      <TouchableOpacity key={f.value} onPress={() => setPosMode(f.value)}
                        style={[styles.txFilterChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        activeOpacity={0.75}>
                        <Ionicons name={f.icon} size={11} color={active ? '#fff' : colors.textMuted} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textSub }}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {hasActivePosFilter && (
                <TouchableOpacity onPress={() => { setPosStatut(''); setPosMode(''); }}>
                  <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>× Réinitialiser</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Liste ventes */}
            <PulseWrap active={posLoading && posVentes.length > 0}>
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, padding: 0 }]}>
              <View style={[styles.cardHead, { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }]}>
                <Ionicons name="receipt-outline" size={14} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Historique des ventes</Text>
                {posTotalPages > 1 && (
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>p.{posPage}/{posTotalPages}</Text>
                )}
              </View>
              {posLoading && posVentes.length === 0 ? (
                <View style={styles.emptyBlock}><ActivityIndicator color={colors.primary} /></View>
              ) : posVentes.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Aucune vente sur cette période.</Text>
                </View>
              ) : (
                <>
                  {posVentes.map((v, i) => (
                    <PosRow key={v._id || i} vente={v} colors={colors} onPress={setSelectedVente} />
                  ))}
                  {posTotalPages > 1 && (
                    <View style={styles.paginationRow}>
                      <TouchableOpacity onPress={() => fetchPos(posPage - 1)} disabled={posPage <= 1} style={[styles.pageBtn, posPage <= 1 && { opacity: 0.35 }]}>
                        <Ionicons name="chevron-back" size={16} color={colors.primary} />
                        <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Préc.</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{posPage} / {posTotalPages}</Text>
                      <TouchableOpacity onPress={() => fetchPos(posPage + 1)} disabled={posPage >= posTotalPages} style={[styles.pageBtn, posPage >= posTotalPages && { opacity: 0.35 }]}>
                        <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Suiv.</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
            </PulseWrap>

          </ScrollView>
        </View>

        {/* ════════ PAGE MARKETPLACE ════════════════════════════════════════ */}
        <View style={styles.page}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#267a6b" />}
            contentContainerStyle={{ paddingBottom: 40 }}
            scrollEventThrottle={200}
          >
            {/* ── 1. Hero solde — même style que POS ────────────────────── */}
            <LinearGradient colors={['#30A08B', '#1e7a6b']} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.heroCard, { margin: 14, marginBottom: 0 }]}>
              <View style={styles.heroCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroCaption}>Solde Marketplace</Text>
                  <Text style={styles.heroTotal}>{balanceVisible ? fmt(soldeTotal) : '•••••• ₣'}</Text>
                </View>
                <TouchableOpacity onPress={() => setBalanceVisible(v => !v)} style={styles.heroBtn}>
                  <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {isOffline && (
                <View style={styles.offlinePill}>
                  <Ionicons name="cloud-offline-outline" size={11} color="#fff" />
                  <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>Hors ligne — données en cache</Text>
                </View>
              )}
              <View style={styles.heroDivider} />
              <View style={styles.heroStatRow}>
                {[
                  { val: balanceVisible ? `${fmtShort(soldeDisponible)} ₣` : '••••', label: 'Disponible' },
                  { val: balanceVisible ? `${fmtShort(soldeBloqueTemp)} ₣`  : '••••', label: 'Bloqué 48h' },
                  { val: balanceVisible ? `${fmtShort(soldeEnAttente)} ₣`   : '••••', label: 'En attente' },
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
              {soldeReserve > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Ionicons name="arrow-up-outline" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                    {balanceVisible ? `${fmt(soldeReserve)} réservés pour retrait` : 'Montant réservé pour retrait'}
                  </Text>
                </View>
              )}
            </LinearGradient>

            {/* ── Filtre période — s'applique aux stats, commandes, transactions ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingTop: 14, paddingBottom: 2 }}>
              {PERIODES.map(p => {
                const isActive = periode === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => setPeriode(p.value)}
                    style={[styles.chip, { borderColor: isActive ? colors.primary : colors.border }, isActive && { backgroundColor: colors.primaryLight }]}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '800' : '500', color: isActive ? colors.primary : colors.textSub }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ padding: 14, gap: 14 }}>

              {/* ── 2. Bouton retrait ──────────────────────────────────────── */}
              <TouchableOpacity
                onPress={() => {
                  if (isOffline) { Toast.show({ type: 'error', text1: 'Hors ligne', text2: 'Un retrait nécessite une connexion' }); return; }
                  if (soldeDisponible < 5000) { Toast.show({ type: 'error', text1: 'Solde insuffisant', text2: 'Minimum 5 000 ₣ pour un retrait' }); return; }
                  setShowWithdraw(true);
                }}
                style={[styles.retraitBtn, { backgroundColor: canWithdraw ? colors.primary : colors.bgHover }]}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-up-outline" size={18} color={canWithdraw ? '#fff' : colors.textMuted} />
                <Text style={[styles.retraitBtnText, { color: canWithdraw ? '#fff' : colors.textMuted }]}>Demander un retrait</Text>
                {!canWithdraw && <Text style={{ fontSize: 10, color: colors.textMuted }}>(min 5 000 ₣)</Text>}
              </TouchableOpacity>

              {/* ── 3. Retraits en attente (alerte si présents) ────────────── */}
              {retraitsRec.filter(r => r.statut === 'EN_ATTENTE').length > 0 && (
                <View style={[styles.card, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time-outline" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>
                      {retraitsRec.filter(r => r.statut === 'EN_ATTENTE').length} retrait{retraitsRec.filter(r => r.statut === 'EN_ATTENTE').length > 1 ? 's' : ''} en attente
                    </Text>
                    <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                      {fmt(retraitsRec.filter(r => r.statut === 'EN_ATTENTE').reduce((s, r) => s + (r.montantDemande || 0), 0))} en cours de traitement
                    </Text>
                  </View>
                </View>
              )}

              {/* ── 4. Statistiques période ────────────────────────────────── */}
              <PulseWrap active={statsLoading} style={{ gap: 0 }}>
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.cardHead}>
                  <Ionicons name="stats-chart-outline" size={14} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Statistiques</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>{periode}j</Text>
                </View>
                <View style={styles.miniStatGrid}>
                  <View style={[styles.miniStat, { backgroundColor: '#E6F7F4' }]}>
                    <View style={[styles.miniStatIcon, { backgroundColor: '#C6EDE8' }]}>
                      <Ionicons name="bag-handle-outline" size={13} color="#30A08B" />
                    </View>
                    <Text style={[styles.miniStatLabel, { color: '#30A08B' }]}>Commandes</Text>
                    <Text style={[styles.miniStatVal, { color: '#30A08B' }]}>{balanceVisible ? String(stats.nombreVentes ?? 0) : '••••'}</Text>
                  </View>
                  <View style={[styles.miniStat, { backgroundColor: '#ECFDF5' }]}>
                    <View style={[styles.miniStatIcon, { backgroundColor: '#D1FAE5' }]}>
                      <Ionicons name="trending-up-outline" size={13} color="#10B981" />
                    </View>
                    <Text style={[styles.miniStatLabel, { color: '#10B981' }]}>CA Brut</Text>
                    <Text style={[styles.miniStatVal, { color: '#10B981' }]}>{balanceVisible ? `${fmtShort(stats.ventesTotal ?? stats.caTotale ?? 0)} ₣` : '••••'}</Text>
                  </View>
                  <View style={[styles.miniStat, { backgroundColor: '#FEF2F2' }]}>
                    <View style={[styles.miniStatIcon, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="remove-circle-outline" size={13} color="#EF4444" />
                    </View>
                    <Text style={[styles.miniStatLabel, { color: '#EF4444' }]}>Commissions</Text>
                    <Text style={[styles.miniStatVal, { color: '#EF4444' }]}>{balanceVisible ? `${fmtShort(stats.commissionsTotal ?? stats.totalCommissions ?? 0)} ₣` : '••••'}</Text>
                  </View>
                  <View style={[styles.miniStat, { backgroundColor: '#F5F3FF' }]}>
                    <View style={[styles.miniStatIcon, { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons name="cash-outline" size={13} color="#8B5CF6" />
                    </View>
                    <Text style={[styles.miniStatLabel, { color: '#8B5CF6' }]}>Net vendeur</Text>
                    <Text style={[styles.miniStatVal, { color: '#8B5CF6' }]}>{balanceVisible ? `${fmtShort((stats.ventesTotal ?? stats.caTotale ?? 0) - (stats.commissionsTotal ?? stats.totalCommissions ?? 0))} ₣` : '••••'}</Text>
                  </View>
                </View>
              </View>
              </PulseWrap>

              {/* ── 5 & 6. Commandes / Transactions — carte unifiée swipeable ── */}
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, padding: 0 }]}>
                {/* Header */}
                <View style={[styles.cardHead, { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 0 }]}>
                  <Ionicons name={mkTab === 'commandes' ? 'bag-outline' : 'swap-vertical-outline'} size={14} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {mkTab === 'commandes' ? 'Commandes' : 'Transactions'}
                  </Text>
                  {mkTab === 'commandes' && ordTotalPages > 1 && (
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>p.{ordPage}/{ordTotalPages}</Text>
                  )}
                  {mkTab === 'transactions' && txTotalPages > 1 && (
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>p.{txPage}/{txTotalPages}</Text>
                  )}
                </View>

                {/* Tab switch */}
                <View style={[styles.switchRowFull, { borderBottomColor: colors.border, marginTop: 8 }]}>
                  <TouchableOpacity
                    style={[styles.switchBtnFull, mkTab === 'commandes' && { borderBottomColor: colors.primary }]}
                    onPress={() => switchMkTab('commandes')} activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 13, fontWeight: mkTab === 'commandes' ? '700' : '500', color: mkTab === 'commandes' ? colors.primary : colors.textMuted }}>
                      Commandes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.switchBtnFull, mkTab === 'transactions' && { borderBottomColor: colors.primary }]}
                    onPress={() => switchMkTab('transactions')} activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 13, fontWeight: mkTab === 'transactions' ? '700' : '500', color: mkTab === 'transactions' ? colors.primary : colors.textMuted }}>
                      Transactions
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Pages swipeables */}
                <ScrollView
                  ref={mkTabScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={e => {
                    const tab = e.nativeEvent.contentOffset.x < (W - 30) / 2 ? 'commandes' : 'transactions';
                    setMkTab(tab);
                  }}
                  style={{ width: W - 30 }}
                >
                  {/* Page commandes */}
                  <View style={{ width: W - 30 }}>
                  <PulseWrap active={ordersLoading && orders.length > 0} style={{ gap: 0 }}>
                    {ordersLoading && orders.length === 0 ? (
                      <View style={styles.emptyBlock}><ActivityIndicator color={colors.primary} /></View>
                    ) : orders.length === 0 ? (
                      <View style={styles.emptyBlock}>
                        <Ionicons name="bag-outline" size={32} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Aucune commande sur cette période.</Text>
                      </View>
                    ) : (
                      <>
                        {orders.map((o, i) => <OrderFinRow key={o._id || i} order={o} colors={colors} onPress={setSelectedOrder} />)}
                        {ordTotalPages > 1 && (
                          <View style={styles.paginationRow}>
                            <TouchableOpacity onPress={() => fetchOrders(ordPage - 1)} disabled={ordPage <= 1} style={[styles.pageBtn, ordPage <= 1 && { opacity: 0.35 }]}>
                              <Ionicons name="chevron-back" size={16} color={colors.primary} />
                              <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Préc.</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 12, color: colors.textMuted }}>{ordPage} / {ordTotalPages}</Text>
                            <TouchableOpacity onPress={() => fetchOrders(ordPage + 1)} disabled={ordPage >= ordTotalPages} style={[styles.pageBtn, ordPage >= ordTotalPages && { opacity: 0.35 }]}>
                              <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Suiv.</Text>
                              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </PulseWrap>
                  </View>

                  {/* Page transactions */}
                  <View style={{ width: W - 30 }}>
                  <PulseWrap active={txLoading && transactions.length > 0} style={{ gap: 0 }}>
                    {/* Barre de filtres unifiée */}
                    <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
                      {/* Ligne type */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="funnel-outline" size={12} color={colors.textMuted} />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {[
                            { label: 'Tout',      value: '',                icon: 'apps-outline' },
                            { label: 'Ventes',    value: 'CREDIT_COMMANDE', icon: 'storefront-outline' },
                            { label: 'Retraits',  value: 'RETRAIT',         icon: 'arrow-up-circle-outline' },
                          ].map(f => {
                            const active = txType === f.value;
                            return (
                              <TouchableOpacity
                                key={f.value}
                                onPress={() => setTxType(f.value)}
                                style={[styles.txFilterChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                                activeOpacity={0.75}
                              >
                                <Ionicons name={f.icon} size={11} color={active ? '#fff' : colors.textMuted} />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textSub }}>{f.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                      {/* Séparateur */}
                      <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: -14 }} />
                      {/* Ligne statut */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="ellipse-outline" size={12} color={colors.textMuted} />
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {[
                            { label: 'Tous',       value: '',           dot: colors.textMuted },
                            { label: 'Confirmé',   value: 'CONFIRME',   dot: '#10B981' },
                            { label: 'En attente', value: 'EN_ATTENTE', dot: '#F59E0B' },
                            { label: 'Annulé',     value: 'ANNULE',     dot: '#EF4444' },
                          ].map(f => {
                            const active = txStatut === f.value;
                            return (
                              <TouchableOpacity
                                key={f.value}
                                onPress={() => setTxStatut(f.value)}
                                style={[styles.txFilterChip, active && { backgroundColor: f.dot + '18', borderColor: f.dot }]}
                                activeOpacity={0.75}
                              >
                                {f.value !== '' && (
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: f.dot }} />
                                )}
                                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? f.dot : colors.textSub }}>{f.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                    {txLoading && transactions.length === 0 ? (
                      <View style={styles.emptyBlock}><ActivityIndicator color={colors.primary} /></View>
                    ) : transactions.length === 0 ? (
                      <View style={styles.emptyBlock}>
                        <Ionicons name="list-outline" size={32} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Aucune transaction sur cette période.</Text>
                      </View>
                    ) : (
                      <>
                        {transactions.map((tx, i) => <TxRow key={tx._id || i} tx={tx} colors={colors} onPress={setSelectedTx} />)}
                        {txTotalPages > 1 && (
                          <View style={styles.paginationRow}>
                            <TouchableOpacity onPress={() => fetchTransactions(txPage - 1)} disabled={txPage <= 1} style={[styles.pageBtn, txPage <= 1 && { opacity: 0.35 }]}>
                              <Ionicons name="chevron-back" size={16} color={colors.primary} />
                              <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Préc.</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 12, color: colors.textMuted }}>{txPage} / {txTotalPages}</Text>
                            <TouchableOpacity onPress={() => fetchTransactions(txPage + 1)} disabled={txPage >= txTotalPages} style={[styles.pageBtn, txPage >= txTotalPages && { opacity: 0.35 }]}>
                              <Text style={[styles.pageBtnTxt, { color: colors.primary }]}>Suiv.</Text>
                              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </PulseWrap>
                  </View>
                </ScrollView>
              </View>

              {/* ── 7. Retraits ────────────────────────────────────────────── */}
              <PulseWrap active={retraitsLoading && retraits.length > 0} style={{ gap: 0 }}>
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, padding: 0 }]}>
                <View style={[styles.cardHead, { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }]}>
                  <Ionicons name="arrow-up-circle-outline" size={14} color="#8B5CF6" />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Retraits</Text>
                  {retraitsTotalPages > 1 && (
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>p.{retraitsPage}/{retraitsTotalPages}</Text>
                  )}
                </View>
                {retraitsLoading && retraits.length === 0 ? (
                  <View style={styles.emptyBlock}><ActivityIndicator color="#8B5CF6" /></View>
                ) : retraits.length === 0 ? (
                  <View style={styles.emptyBlock}>
                    <Ionicons name="arrow-up-circle-outline" size={32} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Aucun retrait sur cette période.</Text>
                  </View>
                ) : (
                  <>
                    {retraits.map((r, i) => {
                      const sCfg = STATUT_CONFIG[r.statut] || { label: r.statut, color: '#6B7280', bg: '#F3F4F6' };
                      const methodeLabel = { MOBILE_MONEY: 'Mobile Money', VIREMENT_BANCAIRE: 'Virement', ESPECES: 'Espèces' }[r.methodeRetrait] || r.methodeRetrait;
                      return (
                        <View key={r._id || i} style={[styles.row, { borderBottomColor: colors.border }]}>
                          <View style={[styles.rowIcon, { backgroundColor: '#F5F3FF' }]}>
                            <Ionicons name="arrow-up-outline" size={16} color="#8B5CF6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rowLabel, { color: colors.text }]}>{methodeLabel}</Text>
                            <Text style={[styles.rowSub, { color: colors.textMuted }]}>{fmtDate(r.datedemande || r.createdAt)}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={[styles.rowAmount, { color: '#8B5CF6' }]}>−{fmtShort(r.montantDemande)} ₣</Text>
                            <View style={[styles.badge, { backgroundColor: sCfg.bg }]}>
                              <Text style={[styles.badgeText, { color: sCfg.color }]}>{sCfg.label}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    {retraitsTotalPages > 1 && (
                      <View style={styles.paginationRow}>
                        <TouchableOpacity onPress={() => fetchRetraits(retraitsPage - 1)} disabled={retraitsPage <= 1} style={[styles.pageBtn, retraitsPage <= 1 && { opacity: 0.35 }]}>
                          <Ionicons name="chevron-back" size={16} color="#8B5CF6" />
                          <Text style={[styles.pageBtnTxt, { color: '#8B5CF6' }]}>Préc.</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{retraitsPage} / {retraitsTotalPages}</Text>
                        <TouchableOpacity onPress={() => fetchRetraits(retraitsPage + 1)} disabled={retraitsPage >= retraitsTotalPages} style={[styles.pageBtn, retraitsPage >= retraitsTotalPages && { opacity: 0.35 }]}>
                          <Text style={[styles.pageBtnTxt, { color: '#8B5CF6' }]}>Suiv.</Text>
                          <Ionicons name="chevron-forward" size={16} color="#8B5CF6" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
              </PulseWrap>

            </View>
          </ScrollView>
        </View>

      </ScrollView>

      {/* Modals */}
      <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} colors={colors} />
      <OrderDetailModal order={selectedOrder} sellerId={sellerId} isOffline={isOffline} onClose={() => setSelectedOrder(null)} colors={colors} />
      {selectedVente && (
        <VenteDetailModal
          vente={selectedVente}
          storeName={storeName}
          onClose={() => setSelectedVente(null)}
          onAnnuler={handleAnnulerPos}
          annulLoading={annulLoading}
          colors={colors}
        />
      )}
      <WithdrawModal
        visible={showWithdraw}
        soldeDisponible={soldeDisponible}
        onClose={() => setShowWithdraw(false)}
        onConfirm={handleRetrait}
        sending={sendingRetrait}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // View selector
  viewSelectorWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1 },
  viewSelector:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  viewTab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, position: 'relative' },
  viewTabText:      { fontSize: 13 },
  viewTabDot:       { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2 },

  // Pages
  page:        { width: W, flex: 1 },
  pageContent: { padding: 14, paddingBottom: 40, gap: 14 },

  // Hero POS
  heroCard:      { borderRadius: 18, padding: 18, gap: 14 },
  heroCardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroCaption:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 4 },
  heroTotal:     { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroBtn:       { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  heroDivider:   { height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroStatRow:   { flexDirection: 'row', alignItems: 'center' },
  heroStat:      { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 8 },
  heroStatSep:   { width: 6 },
  heroStatVal:   { fontSize: 13, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },

  // KPI cards POS
  kpiRow:  { flexDirection: 'row', gap: 6 },
  kpiCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 9, gap: 3 },
  kpiIcon: { width: 26, height: 26, borderRadius: 7, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  kpiVal:  { fontSize: 12, fontWeight: '900' },
  kpiSub:  { fontSize: 8, fontWeight: '500' },

  // Info banner
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },

  // Search / filter
  searchBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput:  { flex: 1, fontSize: 13, padding: 0 },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },

  // Hero Marketplace
  offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },

  // SoldeCard
  soldeCard:    { width: 130, borderRadius: 12, padding: 12, gap: 4, backgroundColor: '#fff' },
  soldeIcon:    { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  soldeLabel:   { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  soldeMontant: { fontSize: 12, fontWeight: '800' },

  // Cards
  card:      { borderRadius: 14, borderWidth: 1, padding: 14, overflow: 'hidden' },
  cardHead:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardSub:       { fontSize: 11, fontWeight: '500', marginLeft: 'auto' },
  paginationRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  pageBtn:        { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 8 },
  pageBtnTxt:     { fontSize: 13, fontWeight: '600' },
  switchRowFull:  { flexDirection: 'row', borderBottomWidth: 1 },
  switchBtnFull:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  txModalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  txModalSheet:   { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
  txModalIcon:    { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  txModalRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', flex: 1 },

  // MiniStat grid 2×2
  miniStatGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  miniStat:      { width: '47%', flexGrow: 1, borderRadius: 12, padding: 10, gap: 4, backgroundColor: 'transparent' },
  miniStatIcon:  { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  miniStatLabel: { fontSize: 11, fontWeight: '500' },
  miniStatVal:   { fontSize: 14, fontWeight: '800' },

  // Rows
  row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, gap: 10 },
  posRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, gap: 10 },
  rowIcon:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowLabel:  { fontSize: 13, fontWeight: '600' },
  rowSub:    { fontSize: 11, marginTop: 1 },
  rowAmount: { fontSize: 13, fontWeight: '800' },

  // Badge
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '700' },

  // Bouton retrait
  retraitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  retraitBtnText: { fontSize: 15, fontWeight: '800' },

  // Chip
  chip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  txFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: 'transparent' },

  // Load more / empty
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1 },
  emptyBlock:  { padding: 32, alignItems: 'center', justifyContent: 'center' },

  // VenteDetailModal
  detailSheet:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, elevation: 24 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  closeBtn:     { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },

  // Tableau articles
  lignesTable:  { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  lignesHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  ligneRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1 },
  colLabel:     { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  colArticle:   { flex: 2 },
  colPu:        { width: 60, textAlign: 'right' },
  colQte:       { width: 32, textAlign: 'center' },
  colTotal:     { width: 64, textAlign: 'right' },

  // Totaux
  totauxBox:  { borderRadius: 12, padding: 14, borderWidth: 1 },
  totauxRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Reçu thermique — ticket blanc (aligné VenteScreen)
  recuSection:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  recuToggle:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  receiptTicket: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    width: 270,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    elevation: 4,
  },
  receiptBrand:     { textAlign: 'center', fontSize: 15, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: '#111', marginBottom: 2 },
  receiptStoreName: { textAlign: 'center', fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: '#111' },
  receiptSubTitle:  { textAlign: 'center', fontSize: 9, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginTop: 2 },
  receiptDate:      { textAlign: 'center', fontSize: 9, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginTop: 1 },
  receiptRef:       { textAlign: 'center', fontSize: 8, color: '#9CA3AF', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 0.5, marginTop: 1 },
  receiptDivider:   { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', marginVertical: 8 },
  receiptColHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  receiptColText:   { fontSize: 9, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700' },
  receiptItemWrap:  { marginBottom: 6 },
  receiptItemRow:   { flexDirection: 'row', alignItems: 'center' },
  receiptItemNom:   { fontSize: 11, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: '#111', flexShrink: 1 },
  receiptItemVariante: { fontSize: 9, fontWeight: '400', color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  receiptItemCell:  { fontSize: 10, color: '#374151', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  receiptItemCellBold: { fontSize: 10, fontWeight: '700', color: '#111', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  receiptTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  receiptGrandTotal: { borderTopWidth: 1, borderTopColor: '#111', paddingTop: 5, marginTop: 2, marginBottom: 4 },
  receiptGrandTotalText: { fontSize: 14, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: '#111' },
  receiptFooter:    { textAlign: 'center', fontSize: 9, color: '#9CA3AF', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', lineHeight: 14 },
  recuActions:      { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1 },
  whatsappBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22C55E', borderRadius: 12, paddingVertical: 12 },
  printBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  recuBtnText:      { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Annulation
  annulTrigger:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: 14, paddingVertical: 14 },
  annulBox:      { borderWidth: 2, borderRadius: 14, padding: 14 },
  annulBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  annuledBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },

  // Withdraw modal
  modalSheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, elevation: 24 },
  handle:         { width: 40, height: 4, borderRadius: 2 },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle:     { fontSize: 17, fontWeight: '800' },
  fieldLabel:     { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  inputInner:     { flex: 1, fontSize: 14, padding: 0 },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 4 },
  confirmBtnText: { fontSize: 15, fontWeight: '800' },
  infoBox:        { borderRadius: 10, padding: 12, gap: 4 },
  methodeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, padding: 12 },
});
