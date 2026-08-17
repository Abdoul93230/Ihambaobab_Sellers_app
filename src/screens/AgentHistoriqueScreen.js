/**
 * AgentHistoriqueScreen — historique des ventes POS de l'agent connecté
 *
 * - Sélecteur de périodes (pills) : Auj. / 7j / 30j / 90j
 * - Cache par période en mémoire (ref) ET en SQLite (setAgentStatsCache / getAgentStatsCache)
 * - Changer de période = affichage instantané depuis le cache (pas de spinner si déjà chargé)
 * - Fetch réseau en arrière-plan
 * - Stats en haut (CA, nb ventes, panier moyen, annulations)
 * - Liste paginée (scroll infini) des ventes COMPLETEE / ANNULEE
 * - Ventes offline (mutations SQLite en attente) affichées en tête
 * - Pull-to-refresh
 * - Modal détail avec lignes produits (CachedImage)
 * - Annulation de vente < 24h avec confirmation Alert
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, Alert, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, RefreshControl, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAgentStore } from '../stores/agentStore';
import apiClient from '../config/api';
import CachedImage from '../components/CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getPendingMutations,
  upsertAgentVentes, readAgentVentes, countAgentVentes,
  setAgentStatsCache, getAgentStatsCache,
} from '../db/database';

// ─── Périodes ─────────────────────────────────────────────────────────────────
const PERIODES = [
  { label: 'Auj.', value: 1  },
  { label: '7j',   value: 7  },
  { label: '30j',  value: 30 },
  { label: '90j',  value: 90 },
];

function getPeriodeDates(nbJours) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - (nbJours - 1));
  start.setHours(0, 0, 0, 0);
  return { dateStart: start.toISOString(), dateEnd: end.toISOString() };
}

// ─── Lecture des ventes offline depuis la queue SQLite ───────────────────────
async function loadOfflineVentes() {
  try {
    const mutations = await getPendingMutations();
    return mutations
      .filter(m => m.type === 'CREATE_VENTE')
      .map(m => {
        const p = m.payload;
        const lignes = (p.lignes || []).map(l => ({
          nom:           l.nom,
          image:         l.image,
          prixUnitaire:  l.prixUnitaire,
          quantite:      l.quantite,
          varianteLabel: l.varianteLabel || '',
          sousTotal:     l.sousTotal,
        }));
        const total = Math.max(0, lignes.reduce((s, l) => s + l.sousTotal, 0) - (p.remise || 0));
        return {
          _id:             m.id,
          _offlineMutId:   m.id,
          reference:       p.referenceOffline || m.id,
          createdAt:       new Date(Number(m.created_at) || Date.now()).toISOString(),
          statut:          'COMPLETEE',
          modePaiement:    p.modePaiement || 'ESPECES',
          total,
          remise:          p.remise || 0,
          montantRecu:     p.montantRecu || 0,
          monnaie:         p.monnaie || 0,
          telephoneClient: p.telephoneClient || '',
          lignes,
          _syncStatus:     m.status,
        };
      });
  } catch (_) {
    return [];
  }
}

// ─── CustomBottomSheet ────────────────────────────────────────────────────────
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
          <View style={[bsStyles.sheet, { backgroundColor: bgColor, maxHeight, paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity activeOpacity={1} style={bsStyles.handleArea} onPress={onClose}>
              <View style={bsStyles.handle} />
            </TouchableOpacity>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const bsStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, elevation: 24,
  },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
});

// ─── Constantes couleurs ──────────────────────────────────────────────────────
const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DANGER    = '#EF4444';
const SUCCESS   = '#10B981';
const WARN      = '#F59E0B';

const WEB_URL = 'https://ihambaobab.com';

function fmtCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' ₣';
}

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

// ─── Helpers formatage ────────────────────────────────────────────────────────
const fmtDate = (iso) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

const fmtMoney = (n) =>
  new Intl.NumberFormat('fr-FR').format(n ?? 0) + ' ₣';

const canCancel = (createdAt) =>
  Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;

// ─── Icône mode paiement ──────────────────────────────────────────────────────
function PaymentIcon({ mode, color }) {
  const name = mode === 'MOBILE_MONEY' ? 'phone-portrait-outline' : 'cash-outline';
  return <Ionicons name={name} size={13} color={color} />;
}

// ─── Badge statut ─────────────────────────────────────────────────────────────
function StatutBadge({ statut, syncStatus }) {
  if (syncStatus) {
    const isFailed = syncStatus === 'failed';
    const bg    = isFailed ? DANGER + '18' : WARN + '22';
    const color = isFailed ? DANGER : WARN;
    const label = isFailed ? 'Échec sync' : 'En attente';
    return (
      <View style={[styles.badge, { backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
        <Ionicons name={isFailed ? 'alert-circle-outline' : 'cloud-upload-outline'} size={10} color={color} />
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
    );
  }
  const isOk    = statut === 'COMPLETEE';
  const bgColor = isOk ? SUCCESS + '18' : DANGER + '18';
  const txColor = isOk ? SUCCESS : DANGER;
  const label   = isOk ? 'Complétée' : 'Annulée';
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: txColor }]}>{label}</Text>
    </View>
  );
}

// ─── Carte de vente ───────────────────────────────────────────────────────────
function VenteCard({ vente, onPress, colors }) {
  const isOffline   = !!vente._offlineMutId;
  const isFailed    = vente._syncStatus === 'failed';
  const borderColor = isOffline ? (isFailed ? DANGER : WARN) : colors.border;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor, borderWidth: isOffline ? 1.5 : 1 }]}
      onPress={() => onPress(vente)}
      activeOpacity={0.78}
    >
      {/* Ligne 1 : référence + date */}
      <View style={styles.cardRow}>
        <View style={[styles.refPill, { backgroundColor: isOffline ? WARN + '20' : colors.primaryLight }]}>
          <Ionicons
            name={isOffline ? 'cloud-upload-outline' : 'receipt-outline'}
            size={12}
            color={isOffline ? WARN : colors.primary}
          />
          <Text style={[styles.refText, { color: isOffline ? WARN : colors.primary }]}>
            {vente.reference}
          </Text>
        </View>
        <Text style={[styles.dateText, { color: colors.textMuted }]}>
          {fmtDate(vente.createdAt)}
        </Text>
      </View>

      {/* Ligne 2 : total + mode paiement + badge statut */}
      <View style={[styles.cardRow, { marginTop: 10 }]}>
        <Text style={[styles.totalText, { color: colors.text }]}>
          {fmtMoney(vente.total)}
        </Text>
        <View style={styles.cardRowRight}>
          <View style={[styles.modePill, { backgroundColor: colors.bgHover }]}>
            <PaymentIcon mode={vente.modePaiement} color={colors.textMuted} />
            <Text style={[styles.modeText, { color: colors.textMuted }]}>
              {vente.modePaiement === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'}
            </Text>
          </View>
          <StatutBadge statut={vente.statut} syncStatus={isOffline ? vente._syncStatus : null} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Ligne produit dans le modal ──────────────────────────────────────────────
function LigneProduit({ ligne, colors }) {
  return (
    <View style={[styles.ligneRow, { borderBottomColor: colors.border }]}>
      <CachedImage
        uri={ligne.image}
        style={styles.ligneImg}
        contentFit="cover"
        placeholderIconSize={16}
      />
      <View style={styles.ligneInfo}>
        <Text style={[styles.ligneNom, { color: colors.text }]} numberOfLines={2}>
          {ligne.nom}
        </Text>
        <Text style={[styles.ligneQtePrix, { color: colors.textMuted }]}>
          {`${ligne.quantite} x ${fmtMoney(ligne.prixUnitaire)}`}
        </Text>
      </View>
      <Text style={[styles.ligneSousTotal, { color: colors.text }]}>
        {fmtMoney(ligne.sousTotal)}
      </Text>
    </View>
  );
}

// ─── Modal de détail ──────────────────────────────────────────────────────────
function DetailModal({ vente, visible, onClose, onAnnuler, cancelling, colors, onViewReceipt }) {
  if (!vente) return null;

  const isOffline  = !!vente._offlineMutId;
  const isFailed   = vente._syncStatus === 'failed';
  const annulable  = !isOffline && vente.statut === 'COMPLETEE' && canCancel(vente.createdAt);
  const hasRemise  = Number(vente.remise) > 0;
  const hasMonnaie = vente.modePaiement === 'ESPECES' && Number(vente.monnaie) > 0;

  return (
    <CustomBottomSheet visible={visible} onClose={onClose} bgColor={colors.bgCard} maxHeight="88%">
      {/* En-tête */}
      <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.sheetHeaderLeft}>
          <View style={[styles.refPill, { backgroundColor: isOffline ? WARN + '20' : colors.primaryLight }]}>
            <Ionicons
              name={isOffline ? 'cloud-upload-outline' : 'receipt-outline'}
              size={12}
              color={isOffline ? WARN : colors.primary}
            />
            <Text style={[styles.refText, { color: isOffline ? WARN : colors.primary }]}>{vente.reference}</Text>
          </View>
          <Text style={[styles.sheetDate, { color: colors.textMuted }]}>
            {fmtDate(vente.createdAt)}
          </Text>
        </View>
        <View style={styles.sheetHeaderRight}>
          <StatutBadge statut={vente.statut} syncStatus={isOffline ? vente._syncStatus : null} />
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.bgHover }]}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Contenu scrollable */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
        {/* Lignes produits */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ARTICLES</Text>
          {vente.lignes?.map((l, i) => (
            <LigneProduit key={i} ligne={l} colors={colors} />
          ))}
        </View>

        {/* Récapitulatif financier */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RÉCAPITULATIF</Text>

          <View style={styles.recapRow}>
            <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Mode de paiement</Text>
            <View style={styles.recapValueRow}>
              <PaymentIcon mode={vente.modePaiement} color={colors.textMuted} />
              <Text style={[styles.recapValue, { color: colors.text }]}>
                {vente.modePaiement === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'}
              </Text>
            </View>
          </View>

          {hasRemise && (
            <View style={styles.recapRow}>
              <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Remise</Text>
              <Text style={[styles.recapValue, { color: SECONDARY }]}>
                {`-${fmtMoney(vente.remise)}`}
              </Text>
            </View>
          )}

          {hasMonnaie && (
            <View style={styles.recapRow}>
              <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Monnaie rendue</Text>
              <Text style={[styles.recapValue, { color: colors.text }]}>
                {fmtMoney(vente.monnaie)}
              </Text>
            </View>
          )}

          {!!vente.telephoneClient && (
            <View style={styles.recapRow}>
              <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Client</Text>
              <Text style={[styles.recapValue, { color: colors.text }]}>
                {vente.telephoneClient}
              </Text>
            </View>
          )}

          <View style={[styles.recapRow, styles.recapTotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.recapTotalLabel, { color: colors.text }]}>Total</Text>
            <Text style={[styles.recapTotalValue, { color: colors.primary }]}>
              {fmtMoney(vente.total)}
            </Text>
          </View>
        </View>

        {/* Bannière état sync (vente offline) */}
        {isOffline && (
          <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
            <View style={[styles.syncBanner, {
              backgroundColor: isFailed ? DANGER + '12' : WARN + '14',
              borderColor:     isFailed ? DANGER + '40' : WARN + '40',
            }]}>
              <Ionicons
                name={isFailed ? 'alert-circle-outline' : 'cloud-upload-outline'}
                size={18}
                color={isFailed ? DANGER : WARN}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isFailed ? DANGER : WARN }}>
                  {isFailed ? 'Synchronisation échouée' : 'En attente de synchronisation'}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  {isFailed
                    ? 'La vente n\'a pas pu être envoyée au serveur. Elle sera relancée à la reconnexion.'
                    : 'Cette vente sera confirmée automatiquement dès que la connexion est rétablie.'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Bouton reçu */}
        {!isOffline && vente.statut === 'COMPLETEE' && (
          <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.annulerBtn, { backgroundColor: colors.primary }]}
              onPress={() => onViewReceipt && onViewReceipt(vente)}
              activeOpacity={0.82}
            >
              <Ionicons name="receipt-outline" size={17} color="#fff" />
              <Text style={styles.annulerBtnText}>Voir le reçu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bouton annulation */}
        {annulable && (
          <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.annulerBtn, cancelling && { opacity: 0.6 }]}
              onPress={() => onAnnuler(vente)}
              disabled={cancelling}
              activeOpacity={0.82}
            >
              {cancelling
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="close-circle-outline" size={17} color="#fff" />
                    <Text style={styles.annulerBtnText}>Annuler cette vente</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </CustomBottomSheet>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, colors }) {
  return (
    <View style={[styles.statCard, { backgroundColor: color + '15', borderWidth: 1, borderColor: color + '30' }]}>
      <Text style={[styles.statCardValue, { color }]}>{value}</Text>
      <Text style={[styles.statCardLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ─── Modal reçu ───────────────────────────────────────────────────────────────
function AgentReceiptModal({ visible, vente, storeName, onClose, colors }) {
  const insets = useSafeAreaInsets();
  const [generating, setGenerating] = useState(false);

  if (!vente) return null;

  const downloadPDF = async () => {
    setGenerating(true);
    try {
      const Print   = require('expo-print');
      const Sharing = require('expo-sharing');
      const html    = await buildReceiptHtml(vente, storeName);
      const height  = calcReceiptHeight(vente);
      const { uri } = await Print.printToFileAsync({ html, width: 302, height });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Reçu ${vente.reference}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (e) {
      Alert.alert('Erreur PDF', e.message);
    } finally {
      setGenerating(false);
    }
  };

  const shareWhatsApp = () => {
    const verifyUrl = `${WEB_URL}/verifier-recu/${vente.reference}`;
    const lignesText = (vente.lignes || [])
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
    Linking.openURL(waUrl).catch(() => Alert.alert('Erreur', 'WhatsApp non disponible'));
  };

  return (
    <CustomBottomSheet visible={visible} onClose={onClose} bgColor={colors.bgCard} maxHeight="92%">
      {/* Header vert */}
      <LinearGradient colors={['#30A08B', '#267a6b']} style={rStyles.receiptHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="receipt-outline" size={20} color="#fff" />
          <Text style={rStyles.receiptHeaderText}>Reçu de vente</Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Ticket */}
      <ScrollView
        style={{ backgroundColor: colors.bg, flexShrink: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 8, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={rStyles.receiptTicket}>
          <Text style={rStyles.receiptBrand}>🌿 IHAMBAOBAB</Text>
          <Text style={rStyles.receiptStoreName}>{storeName}</Text>
          <Text style={rStyles.receiptSubTitle}>Reçu de vente physique</Text>
          <Text style={rStyles.receiptDate}>
            {new Date(vente.createdAt || Date.now()).toLocaleDateString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
          <Text style={rStyles.receiptRef}>{vente.reference}</Text>

          <View style={rStyles.receiptDivider} />

          <View style={rStyles.receiptColHeader}>
            <Text style={[rStyles.receiptColText, { flex: 2 }]}>Article</Text>
            <Text style={[rStyles.receiptColText, { width: 52, textAlign: 'right' }]}>P.U</Text>
            <Text style={[rStyles.receiptColText, { width: 28, textAlign: 'center' }]}>Qté</Text>
            <Text style={[rStyles.receiptColText, { width: 70, textAlign: 'right' }]}>Total</Text>
          </View>

          {(vente.lignes || []).map((l, i) => (
            <View key={i} style={rStyles.receiptItemWrap}>
              <Text style={rStyles.receiptItemNom}>
                {l.nom}
                {l.varianteLabel ? <Text style={rStyles.receiptItemVariante}> — {l.varianteLabel}</Text> : null}
              </Text>
              <View style={rStyles.receiptItemRow}>
                <Text style={[rStyles.receiptItemCell, { flex: 2 }]} />
                <Text style={[rStyles.receiptItemCell, { width: 52, textAlign: 'right' }]}>
                  {new Intl.NumberFormat('fr-FR').format(l.prixUnitaire)}
                </Text>
                <Text style={[rStyles.receiptItemCell, { width: 28, textAlign: 'center' }]}>×{l.quantite}</Text>
                <Text style={[rStyles.receiptItemCellBold, { width: 70, textAlign: 'right' }]}>
                  {new Intl.NumberFormat('fr-FR').format(l.sousTotal)}
                </Text>
              </View>
            </View>
          ))}

          <View style={rStyles.receiptDivider} />
          <Text style={{ fontSize: 10, color: '#6B7280', textAlign: 'right', marginBottom: 3, width: '100%' }}>FCFA</Text>

          {vente.remise > 0 && (
            <View style={rStyles.receiptTotalRow}>
              <Text style={{ color: '#EF4444', fontSize: 12 }}>Remise</Text>
              <Text style={{ color: '#EF4444', fontSize: 12 }}>-{fmtCFA(vente.remise)}</Text>
            </View>
          )}
          <View style={[rStyles.receiptTotalRow, rStyles.receiptGrandTotal]}>
            <Text style={rStyles.receiptGrandTotalText}>TOTAL</Text>
            <Text style={rStyles.receiptGrandTotalText}>{fmtCFA(vente.total)} FCFA</Text>
          </View>

          <View style={rStyles.receiptDivider} />

          <View style={rStyles.receiptTotalRow}>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Mode paiement</Text>
            <Text style={{ fontWeight: '700', fontSize: 12, color: '#111' }}>
              {vente.modePaiement === 'ESPECES' ? '💵 Espèces' : '📱 Mobile Money'}
            </Text>
          </View>
          {vente.modePaiement === 'ESPECES' && vente.montantRecu > 0 && (
            <View style={rStyles.receiptTotalRow}>
              <Text style={{ color: '#6B7280', fontSize: 12 }}>Montant reçu</Text>
              <Text style={{ fontSize: 12, color: '#111' }}>{fmtCFA(vente.montantRecu)} FCFA</Text>
            </View>
          )}
          {vente.modePaiement === 'ESPECES' && vente.monnaie > 0 && (
            <View style={[rStyles.receiptTotalRow, { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 4 }]}>
              <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>💵 Monnaie rendue</Text>
              <Text style={{ color: '#059669', fontWeight: '800', fontSize: 14 }}>{fmtCFA(vente.monnaie)} ₣</Text>
            </View>
          )}

          <View style={[rStyles.receiptDivider, { marginTop: 10 }]} />
          <Text style={rStyles.receiptFooter}>Merci pour votre achat !{'\n'}ihambaobab.com</Text>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={[rStyles.receiptActions, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <TouchableOpacity
            style={[rStyles.whatsappBtn, generating && { opacity: 0.6 }]}
            onPress={shareWhatsApp}
            disabled={generating}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={rStyles.whatsappBtnText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[rStyles.pdfBtn, generating && { opacity: 0.6 }]}
            onPress={downloadPDF}
            disabled={generating}
            activeOpacity={0.85}
          >
            <Ionicons name={generating ? 'sync-outline' : 'print-outline'} size={18} color="#fff" />
            <Text style={rStyles.pdfBtnText}>{generating ? 'Génération...' : 'PDF / Imprimer'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </CustomBottomSheet>
  );
}

const rStyles = StyleSheet.create({
  receiptHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  receiptHeaderText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  receiptTicket:     { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6 },
  receiptBrand:      { textAlign: 'center', fontSize: 16, fontWeight: '900', letterSpacing: 1.5, color: '#111', fontFamily: 'Courier New' },
  receiptStoreName:  { textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#111', marginTop: 2, fontFamily: 'Courier New' },
  receiptSubTitle:   { textAlign: 'center', fontSize: 10, color: '#6B7280', marginTop: 2 },
  receiptDate:       { textAlign: 'center', fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  receiptRef:        { textAlign: 'center', fontSize: 9, color: '#9CA3AF', letterSpacing: 0.5, marginTop: 1 },
  receiptDivider:    { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', marginVertical: 8, width: '100%' },
  receiptColHeader:  { flexDirection: 'row', marginBottom: 6 },
  receiptColText:    { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  receiptItemWrap:   { marginBottom: 8, width: '100%' },
  receiptItemNom:    { fontSize: 12, fontWeight: '700', color: '#111', marginBottom: 2 },
  receiptItemVariante: { fontSize: 10, fontWeight: '400', color: '#6B7280' },
  receiptItemRow:    { flexDirection: 'row', alignItems: 'center' },
  receiptItemCell:   { fontSize: 11, color: '#374151' },
  receiptItemCellBold: { fontSize: 11, fontWeight: '700', color: '#111' },
  receiptTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  receiptGrandTotal: { borderTopWidth: 1, borderColor: '#111', paddingTop: 6, marginTop: 4 },
  receiptGrandTotalText: { fontSize: 15, fontWeight: '900', color: '#111' },
  receiptFooter:     { textAlign: 'center', fontSize: 10, color: '#9CA3AF', lineHeight: 16, marginTop: 4 },
  receiptActions:    { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  whatsappBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', paddingVertical: 13, borderRadius: 14 },
  whatsappBtnText:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  pdfBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, paddingVertical: 13, borderRadius: 14 },
  pdfBtnText:        { color: '#fff', fontSize: 14, fontWeight: '800' },
});

// ─── Stats des ventes offline pour la période affichée ───────────────────────
function calcOfflineStats(offlineVentes, nbJours) {
  const { dateStart, dateEnd } = getPeriodeDates(nbJours);
  const start = new Date(dateStart);
  const end   = new Date(dateEnd);
  const inPeriod = offlineVentes.filter(v => {
    const d = new Date(v.createdAt);
    return d >= start && d <= end && v.statut === 'COMPLETEE';
  });
  const totalCA      = inPeriod.reduce((s, v) => s + (v.total || 0), 0);
  const totalEspeces = inPeriod.filter(v => v.modePaiement === 'ESPECES')
                               .reduce((s, v) => s + (v.total || 0), 0);
  const totalMobile  = inPeriod.filter(v => v.modePaiement === 'MOBILE_MONEY')
                               .reduce((s, v) => s + (v.total || 0), 0);
  return { count: inPeriod.length, totalCA, totalEspeces, totalMobile };
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgentHistoriqueScreen() {
  const { colors } = useTheme();
  const { agent }  = useAgentStore();
  const agentId    = agent?.id;

  // ── Périodes & stats ───────────────────────────────────────────────────────
  const [periode,       setPeriode]       = useState(7);
  const [stats,         setStats]         = useState(null);
  const statsCache = useRef({});   // { [nbJours]: statsObject }
  const venteCache = useRef({});   // { [`${nbJours}_${statut}_${page}`]: { ventes, pagination } }

  // ── Liste ──────────────────────────────────────────────────────────────────
  const [ventes,        setVentes]        = useState([]);
  const [offlineVentes, setOfflineVentes] = useState([]);
  const [statut,        setStatut]        = useState('COMPLETEE');
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [pagination,    setPagination]    = useState({ page: 1, pages: 1, total: 0, hasNext: false });

  // ── Modal détail ───────────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState(null);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [receiptOpen,   setReceiptOpen]   = useState(false);

  // ── Confirmation annulation ────────────────────────────────────────────────
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [venteToCancel, setVenteToCancel] = useState(null);

  // ── Stats fusionnées serveur + offline ────────────────────────────────────
  const displayStats = useMemo(() => {
    const off = calcOfflineStats(offlineVentes, periode);
    if (off.count === 0) return stats; // rien à fusionner
    const base = stats || { totalCA: 0, nombreVentes: 0, nombreAnnulations: 0, totalEspeces: 0, totalMobile: 0 };
    const totalCA      = (base.totalCA      || 0) + off.totalCA;
    const nombreVentes = (base.nombreVentes || 0) + off.count;
    return {
      ...base,
      totalCA,
      nombreVentes,
      totalEspeces: (base.totalEspeces || 0) + off.totalEspeces,
      totalMobile:  (base.totalMobile  || 0) + off.totalMobile,
      panierMoyen:  nombreVentes > 0 ? Math.round(totalCA / nombreVentes) : 0,
    };
  }, [stats, offlineVentes, periode]);

  // Snapshot pour l'annulation (mise à jour lors du fetch)
  const ventesSnapshotRef = useRef([]);

  // ─── Hydratation SQLite + pre-fetch toutes les périodes au montage ──────────
  useEffect(() => {
    if (!agentId) return;

    async function hydrateAndPrefetch() {
      // 1. Charger les caches SQLite dans les refs (instantané)
      for (const p of PERIODES) {
        const cached = await getAgentStatsCache(`agent_stats_${agentId}_${p.value}`);
        if (cached?.data) statsCache.current[p.value] = cached.data;
        const cv = await getAgentStatsCache(`agent_ventes_${agentId}_${p.value}_COMPLETEE_1`);
        if (cv?.data) venteCache.current[`${p.value}_COMPLETEE_1`] = cv.data;
        const ca = await getAgentStatsCache(`agent_ventes_${agentId}_${p.value}_ANNULEE_1`);
        if (ca?.data) venteCache.current[`${p.value}_ANNULEE_1`] = ca.data;
      }

      // 2. Afficher les stats de la période courante depuis le cache si dispo
      if (statsCache.current[periode]) setStats(statsCache.current[periode]);

      // 3. Pre-fetch réseau toutes les périodes en arrière-plan (silencieux)
      // Seulement COMPLETEE au montage — stats incluses, ANNULEE chargé à la demande
      for (const p of PERIODES) {
        fetchData(p.value, 'COMPLETEE', 1, true);
      }
    }

    hydrateAndPrefetch();
  }, [agentId]);

  // ─── Ventes offline ──────────────────────────────────────────────────────
  const fetchOfflineVentes = useCallback(async () => {
    if (statut !== 'COMPLETEE') { setOfflineVentes([]); return; }
    const offline = await loadOfflineVentes();
    setOfflineVentes(offline);
  }, [statut]);

  // ref stable pour lire periode/statut courants sans recréer fetchData
  const periodeRef = useRef(7);
  const statutRef  = useRef('COMPLETEE');

  // ─── Fetch réseau + mise en cache ─────────────────────────────────────────
  const fetchData = useCallback(async (nbJours, statutFilter, page = 1, silent = false) => {
    // Détermine si ce fetch correspond à ce qui est affiché à l'écran
    const isVisible = nbJours === periodeRef.current && statutFilter === statutRef.current;

    if (!silent && isVisible) setLoading(true);

    const { dateStart, dateEnd } = getPeriodeDates(nbJours);

    try {
      const res = await apiClient.get('/api/pos/agent/historique', {
        params: { page, limit: 20, statut: statutFilter, dateStart, dateEnd },
      });
      const { ventes: list, pagination: pg, stats: s } = res.data.data;

      // Cache stats (page 1 seulement)
      if (page === 1 && s) {
        statsCache.current[nbJours] = s;
        // Mettre à jour l'UI seulement si c'est la période affichée
        if (nbJours === periodeRef.current) setStats(s);
        await setAgentStatsCache(`agent_stats_${agentId}_${nbJours}`, s);
      }

      // Cache ventes
      const cacheKey = `${nbJours}_${statutFilter}_${page}`;
      venteCache.current[cacheKey] = { ventes: list, pagination: pg };
      await setAgentStatsCache(
        `agent_ventes_${agentId}_${nbJours}_${statutFilter}_${page}`,
        { ventes: list, pagination: pg },
      );
      await upsertAgentVentes(list);

      // Mettre à jour la liste seulement si période + statut correspondent à l'affichage
      if (isVisible) {
        if (page > 1) {
          setVentes(prev => [...prev, ...list]);
        } else {
          ventesSnapshotRef.current = list;
          setVentes(list);
        }
        setPagination(pg);
        setOfflineVentes(prev => {
          const refs = new Set(list.map(v => v.reference));
          return prev.filter(v => !refs.has(v.reference));
        });
      }
    } catch (e) {
      // Offline : lire depuis SQLite seulement pour la vue active
      if (!e.response && isVisible) {
        const cached = await readAgentVentes(statutFilter, page, 20);
        const total  = await countAgentVentes(statutFilter);
        if (cached.length > 0) {
          if (page > 1) setVentes(prev => [...prev, ...cached]);
          else setVentes(cached);
          setPagination({
            page,
            pages: Math.ceil(total / 20),
            total,
            hasNext: page < Math.ceil(total / 20),
          });
        }
      }
    } finally {
      if (isVisible) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [agentId]);

  // ─── Sync refs état courant ───────────────────────────────────────────────
  useEffect(() => { periodeRef.current = periode; }, [periode]);
  useEffect(() => { statutRef.current  = statut;  }, [statut]);

  // ─── Changement de période ────────────────────────────────────────────────
  const handlePeriodeChange = (nbJours) => {
    periodeRef.current = nbJours;
    setPeriode(nbJours);
    // Stats : depuis cache mémoire si disponible
    if (statsCache.current[nbJours]) setStats(statsCache.current[nbJours]);
    else setStats(null);
    // Ventes : depuis cache mémoire si disponible
    const key = `${nbJours}_${statut}_1`;
    if (venteCache.current[key]) {
      setVentes(venteCache.current[key].ventes);
      setPagination(venteCache.current[key].pagination);
    } else {
      setVentes([]);
    }
    // Fetch réseau en arrière-plan (silencieux si cache présent)
    fetchData(nbJours, statut, 1, !!statsCache.current[nbJours]);
  };

  // ─── Focus : affichage instantané depuis cache + fetch en fond ────────────
  useFocusEffect(
    useCallback(() => {
      fetchOfflineVentes();
      if (statsCache.current[periode]) setStats(statsCache.current[periode]);
      const key = `${periode}_${statut}_1`;
      if (venteCache.current[key]) {
        setVentes(venteCache.current[key].ventes);
        setPagination(venteCache.current[key].pagination);
        fetchData(periode, statut, 1, true);
      } else {
        fetchData(periode, statut, 1, false);
      }
    }, [periode, statut]),
  );

  // ─── Pull-to-refresh ──────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOfflineVentes();
    fetchData(periode, statut, 1, true);
  }, [periode, statut, fetchData, fetchOfflineVentes]);

  // ─── Scroll infini ────────────────────────────────────────────────────────
  const handleEndReached = useCallback(() => {
    if (!pagination.hasNext || loadingMore || loading) return;
    setLoadingMore(true);
    fetchData(periode, statut, pagination.page + 1, true);
  }, [pagination, loadingMore, loading, statut, periode, fetchData]);

  // ─── Annulation ───────────────────────────────────────────────────────────
  const handleAnnuler = useCallback((vente) => {
    setVenteToCancel(vente);
    setModalOpen(false);
    setTimeout(() => setConfirmOpen(true), Platform.OS === 'android' ? 350 : 100);
  }, []);

  const confirmAnnulation = useCallback(async () => {
    if (!venteToCancel) return;
    setCancelling(true);
    try {
      await apiClient.post(`/api/pos/agent/annuler/${venteToCancel.reference}`);
      ventesSnapshotRef.current = ventesSnapshotRef.current.filter(v => v._id !== venteToCancel._id);
      setVentes(prev => prev.filter(v => v._id !== venteToCancel._id));
      setConfirmOpen(false);
      setVenteToCancel(null);
      setModalOpen(false);
      setSelected(null);
    } catch (e) {
      setConfirmOpen(false);
      setVenteToCancel(null);
      const msg = !e.response
        ? 'Connexion requise pour annuler une vente.'
        : (e.response?.data?.message || 'Impossible d\'annuler cette vente');
      Alert.alert('Erreur', msg);
    } finally {
      setCancelling(false);
    }
  }, [venteToCancel]);

  // ─── Rendu carte ──────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => (
    <VenteCard
      vente={item}
      onPress={(v) => { setSelected(v); setModalOpen(true); }}
      colors={colors}
    />
  ), [colors]);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <ActivityIndicator
        size="small"
        color={colors.primary}
        style={{ marginVertical: 16 }}
      />
    );
  };

  // ─── Render principal ─────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>

      {/* ── Sélecteur de période ── */}
      <View style={styles.periodeWrap}>
        {PERIODES.map(p => (
          <TouchableOpacity
            key={p.value}
            style={[styles.periodeBtn, periode === p.value && styles.periodeBtnActive]}
            onPress={() => handlePeriodeChange(p.value)}
          >
            <Text style={[styles.periodeBtnText, periode === p.value && { color: '#fff' }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Stats ── */}
      {displayStats ? (
        <View style={[styles.statsBlock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {/* Ligne 1 : CA total en grand */}
          <View style={styles.statsMain}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statsMainLabel, { color: colors.textMuted }]}>CA TOTAL</Text>
              <Text style={[styles.statsMainValue, { color: PRIMARY }]}>{fmtMoney(displayStats.totalCA)}</Text>
            </View>
            <View style={styles.statsMainRight}>
              <View style={[styles.statsVenteBadge, { backgroundColor: '#2563EB' + '18' }]}>
                <Text style={[styles.statsVenteNum, { color: '#2563EB' }]}>{displayStats.nombreVentes}</Text>
                <Text style={[styles.statsVenteLabel, { color: '#2563EB' }]}>ventes</Text>
              </View>
              {displayStats.nombreAnnulations > 0 && (
                <View style={[styles.statsVenteBadge, { backgroundColor: DANGER + '18' }]}>
                  <Text style={[styles.statsVenteNum, { color: DANGER }]}>{displayStats.nombreAnnulations}</Text>
                  <Text style={[styles.statsVenteLabel, { color: DANGER }]}>annulées</Text>
                </View>
              )}
            </View>
          </View>
          {/* Séparateur */}
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          {/* Ligne 2 : panier moyen + répartition paiements */}
          <View style={styles.statsRow}>
            <StatCard label="Panier moy."   value={fmtMoney(displayStats.panierMoyen)}     color={SECONDARY} colors={colors} />
            <StatCard label="Espèces"       value={fmtMoney(displayStats.totalEspeces)}    color={WARN}      colors={colors} />
            <StatCard label="Mobile Money"  value={fmtMoney(displayStats.totalMobile)}     color={PRIMARY}   colors={colors} />
          </View>
        </View>
      ) : (
        <View style={[styles.statsBlock, styles.statsBlockSkeleton, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={PRIMARY} />
          <Text style={[styles.statsSkeletonText, { color: colors.textMuted }]}>Chargement des statistiques…</Text>
        </View>
      )}

      {/* ── Filtres toggle (COMPLETEE / ANNULEE) ── */}
      <View style={[styles.filterWrap, { backgroundColor: colors.bg }]}>
        <View style={[styles.methodToggle, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
          {['COMPLETEE', 'ANNULEE'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.methodBtn, statut === s && styles.methodBtnActive]}
              onPress={() => { if (statut !== s) { statutRef.current = s; setVentes([]); setStatut(s); } }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={s === 'COMPLETEE' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={14}
                color={statut === s ? '#fff' : colors.textMuted}
              />
              <Text style={[
                styles.methodBtnText,
                { color: statut === s ? '#fff' : colors.textMuted },
                statut === s && styles.methodBtnTextActive,
              ]}>
                {s === 'COMPLETEE' ? 'Complétées' : 'Annulées'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Liste ── */}
      {loading && !offlineVentes.length && !ventes.length ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1, marginTop: 40 }} />
      ) : (
        <FlatList
          data={[...offlineVentes, ...ventes]}
          keyExtractor={v => String(v._id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            (offlineVentes.length + ventes.length) === 0 && styles.listEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.bgHover }]}>
                <Ionicons name="receipt-outline" size={40} color={colors.textDisabled} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Aucune vente enregistrée
              </Text>
              <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                {statut === 'COMPLETEE'
                  ? 'Vos ventes complétées apparaîtront ici'
                  : 'Vos ventes annulées apparaîtront ici'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Modal détail ── */}
      <DetailModal
        vente={selected}
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAnnuler={handleAnnuler}
        cancelling={cancelling}
        colors={colors}
        onViewReceipt={(v) => { setModalOpen(false); setTimeout(() => setReceiptOpen(true), 300); }}
      />

      {/* ── Modal reçu ── */}
      <AgentReceiptModal
        visible={receiptOpen}
        vente={selected}
        storeName={agent?.storeName || 'Boutique'}
        onClose={() => setReceiptOpen(false)}
        colors={colors}
      />

      {/* ── Sheet confirmation annulation ── */}
      <CustomBottomSheet
        visible={confirmOpen}
        onClose={() => { if (!cancelling) { setConfirmOpen(false); setVenteToCancel(null); } }}
        bgColor={colors.bgCard}
        maxHeight="42%"
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 16 }}>
          {/* Icône + titre */}
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 16,
              backgroundColor: DANGER + '18', justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="close-circle-outline" size={28} color={DANGER} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
              Annuler cette vente ?
            </Text>
            {venteToCancel && (
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
                {`${venteToCancel.reference}  •  ${fmtMoney(venteToCancel.total)}`}
              </Text>
            )}
          </View>

          {/* Boutons */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 14,
                borderWidth: 1.5, borderColor: colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={() => { setConfirmOpen(false); setVenteToCancel(null); }}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSub }}>Non, garder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 14,
                backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 8,
                shadowColor: DANGER, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28, shadowRadius: 8, elevation: 5,
                opacity: cancelling ? 0.6 : 1,
              }}
              onPress={confirmAnnulation}
              disabled={cancelling}
              activeOpacity={0.82}
            >
              {cancelling
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Oui, annuler</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </CustomBottomSheet>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Périodes pills ────────────────────────────────────────────────────────
  periodeWrap: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 8,
  },
  periodeBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  periodeBtnActive: {
    backgroundColor: PRIMARY, borderColor: PRIMARY,
  },
  periodeBtnText: {
    fontSize: 13, fontWeight: '700', color: '#6B7280',
  },

  // ── Stats block ───────────────────────────────────────────────────────────
  statsBlock: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 16,
    borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  statsBlockSkeleton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18,
  },
  statsSkeletonText: { fontSize: 13, fontWeight: '500' },
  statsMain: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10,
  },
  statsMainLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
  statsMainValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  statsMainRight: { flexDirection: 'row', gap: 8 },
  statsVenteBadge: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 1,
  },
  statsVenteNum: { fontSize: 16, fontWeight: '900' },
  statsVenteLabel: { fontSize: 10, fontWeight: '700' },
  statsDivider: { height: 1, marginHorizontal: 16 },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  statCard: {
    flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2,
  },
  statCardValue: { fontSize: 13, fontWeight: '800' },
  statCardLabel: { fontSize: 10, fontWeight: '600' },

  // ── Filtres toggle — même motif que methodToggle de LoginScreen ───────────
  filterWrap:    { paddingHorizontal: 16, paddingBottom: 10 },
  methodToggle: {
    flexDirection: 'row', borderRadius: 12,
    borderWidth: 1.5, padding: 3, gap: 3,
  },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  methodBtnActive: {
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28, shadowRadius: 6, elevation: 4,
  },
  methodBtnText:       { fontSize: 13, fontWeight: '700' },
  methodBtnTextActive: { color: '#fff' },

  // ── Liste ─────────────────────────────────────────────────────────────────
  list:      { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 10 },
  listEmpty: { flexGrow: 1 },

  // ── Carte de vente ────────────────────────────────────────────────────────
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  refPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  refText:   { fontSize: 12, fontWeight: '800' },
  dateText:  { fontSize: 12 },
  totalText: { fontSize: 17, fontWeight: '800' },
  modePill:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
  },
  modeText: { fontSize: 11, fontWeight: '600' },

  badge:     { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // ── État vide ─────────────────────────────────────────────────────────────
  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 12, paddingBottom: 60, paddingTop: 40,
  },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:    { fontSize: 16, fontWeight: '700' },
  emptyHint:     { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  // ── Modal / Bottom sheet ──────────────────────────────────────────────────
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16, elevation: 28,
  },
  sheetHandleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  sheetHandle:     { width: 40, height: 4, borderRadius: 2 },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 6, borderBottomWidth: 1,
  },
  sheetHeaderLeft:  { gap: 4 },
  sheetHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetDate:        { fontSize: 12, marginTop: 2 },
  closeBtn:         { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // ── Sections dans le modal ────────────────────────────────────────────────
  section:      { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1 },
  sectionTitle: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 10,
  },

  // ── Ligne produit ─────────────────────────────────────────────────────────
  ligneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ligneImg:       { width: 44, height: 44, borderRadius: 10 },
  ligneInfo:      { flex: 1, gap: 3 },
  ligneNom:       { fontSize: 13, fontWeight: '600' },
  ligneQtePrix:   { fontSize: 12 },
  ligneSousTotal: { fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'right' },

  // ── Récapitulatif ─────────────────────────────────────────────────────────
  recapRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  recapValueRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recapLabel:      { fontSize: 13 },
  recapValue:      { fontSize: 13, fontWeight: '600' },
  recapTotalRow:   { marginTop: 6, paddingTop: 12, borderTopWidth: 1 },
  recapTotalLabel: { fontSize: 15, fontWeight: '700' },
  recapTotalValue: { fontSize: 17, fontWeight: '900' },

  // ── Footer modal (bouton annulation) ─────────────────────────────────────
  sheetFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  annulerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: DANGER, borderRadius: 14, paddingVertical: 14,
    shadowColor: DANGER, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
  },
  annulerBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Bannière sync offline ─────────────────────────────────────────────────
  syncBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
});
