import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Animated, ScrollView,
  TouchableWithoutFeedback, PanResponder, Dimensions, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { syncService } from '../services/syncService';
import { getDB } from '../db/database';
import apiClient from '../config/api';
import { mutationQueue } from '../services/mutationQueue';
import SUBSCRIPTION_CONFIG from '../config/subscriptionConfig';
import Toast from 'react-native-toast-message';

const W = Dimensions.get('window').width;

// ─── Statuts (identiques au web) ─────────────────────────────────────────────
const STATUS = {
  Published:   { label: 'Publié',    bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  UnPublished: { label: 'Non publié',bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
  Attente:     { label: 'En attente',bg: '#FFFBEB', color: '#92400E', dot: '#F59E0B' },
  Refuser:     { label: 'Refusé',    bg: '#FEF2F2', color: '#B91C1C', dot: '#EF4444' },
};
const STATUS_FILTERS = ['All', 'Published', 'Attente', 'Refuser'];
const STATUS_LABELS = { All: 'Tous', Published: 'Publié', Attente: 'En attente', Refuser: 'Refusé' };

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }

// ─── Badge statut ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.UnPublished;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Card produit (mode grille) ───────────────────────────────────────────────
function ProduitCard({ produit, onPress, colors }) {
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
      onPress={() => onPress(produit)}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={[styles.cardImgWrap, { backgroundColor: colors.bgHover }]}>
        {produit.image1
          ? <CachedImage uri={produit.image1} style={styles.cardImg} contentFit="cover" />
          : <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
        }
        <View style={styles.cardStatusPos}>
          <StatusBadge status={produit.isPublished} />
        </View>
      </View>

      {/* Infos */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>{produit.name}</Text>
        {produit.marque ? (
          <Text style={[styles.cardBrand, { color: colors.textMuted }]} numberOfLines={1}>{produit.marque}</Text>
        ) : null}
        <View style={styles.cardFooter}>
          <View>
            {hasPromo ? (
              <>
                <Text style={[styles.cardPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
                <Text style={[styles.cardPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
              </>
            ) : (
              <Text style={[styles.cardPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
            )}
          </View>
          <View style={[styles.stockBadge, { backgroundColor: stock < 5 ? '#FEF2F2' : colors.bgHover }]}>
            <Text style={[styles.stockText, { color: stock < 5 ? '#B91C1C' : colors.textMuted }]}>
              {stock} en stock
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Ligne produit (mode liste) ───────────────────────────────────────────────
function ProduitRow({ produit, onPress, colors }) {
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={() => onPress(produit)}
      activeOpacity={0.85}
    >
      <View style={[styles.rowImg, { backgroundColor: colors.bgHover }]}>
        {produit.image1
          ? <CachedImage uri={produit.image1} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
        }
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{produit.name}</Text>
        <Text style={[styles.rowBrand, { color: colors.textMuted }]} numberOfLines={1}>
          {produit.marque || 'Sans marque'}
        </Text>
        <StatusBadge status={produit.isPublished} />
      </View>
      <View style={styles.rowRight}>
        {hasPromo ? (
          <>
            <Text style={[styles.rowPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
            <Text style={[styles.rowPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
          </>
        ) : (
          <Text style={[styles.rowPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
        )}
        <Text style={[styles.rowStock, { color: stock < 5 ? '#EF4444' : colors.textMuted }]}>
          {stock} en stock
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

// ─── Modal détail produit ─────────────────────────────────────────────────────
const DETAIL_H = Dimensions.get('window').height * 0.85;

function ProduitDetailModal({ produit, visible, onClose, onEdit, onEtiquette, onDelete, colors, hasMarketplace }) {
  const slideAnim = useRef(new Animated.Value(DETAIL_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      slideAnim.setValue(DETAIL_H);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [mounted, visible]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: DETAIL_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setActiveImg(0); setActiveTab('details'); cb?.(); });
  };

  const handleClose = () => dismiss(onClose);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || g.vy > 1) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  if (!mounted || !produit) return null;

  const images = [produit.image1, produit.image2, produit.image3].filter(Boolean);
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.detailSheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle + Actions */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>
        <View style={[styles.detailActionsRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.detailActionBtn, { backgroundColor: colors.primaryLight }]}
            onPress={() => { dismiss(() => { onClose(); onEdit(produit); }); }}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={[styles.detailActionText, { color: colors.primary }]}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.detailActionBtn, { backgroundColor: '#FFF7ED' }]}
            onPress={() => { dismiss(() => { onClose(); onEtiquette?.(produit); }); }}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={14} color="#B45309" />
            <Text style={[styles.detailActionText, { color: '#B45309' }]}>Étiquette</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.detailActionBtn, { backgroundColor: '#FEF2F2' }]}
            onPress={() => {
              Alert.alert(
                'Supprimer le produit',
                `"${produit.name}" sera définitivement supprimé. Cette action est irréversible.`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => dismiss(() => { onClose(); onDelete?.(produit); }) },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={14} color="#DC2626" />
            <Text style={[styles.detailActionText, { color: '#DC2626' }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={[{ key: 'content' }]}
          renderItem={() => (
            <View>
              {/* Galerie images */}
              <View style={[styles.detailImgContainer, { backgroundColor: colors.bgHover }]}>
                {images.length > 0
                  ? <CachedImage uri={images[activeImg]} style={styles.detailMainImg} contentFit="contain" />
                  : <Ionicons name="cube-outline" size={64} color={colors.textMuted} />
                }
              </View>
              {images.length > 1 && (
                <View style={styles.detailThumbs}>
                  {images.map((img, i) => (
                    <TouchableOpacity key={i} onPress={() => setActiveImg(i)} activeOpacity={0.8}>
                      <CachedImage
                        uri={img}
                        style={[styles.detailThumb, { borderColor: i === activeImg ? colors.primary : colors.border }]}
                        contentFit="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Nom + Statut */}
              <View style={styles.detailHeader}>
                <View style={styles.detailTitleRow}>
                  <Text style={[styles.detailName, { color: colors.text }]} numberOfLines={2}>{produit.name}</Text>
                  <StatusBadge status={produit.isPublished} />
                </View>
                {produit.marque ? (
                  <Text style={[styles.detailBrand, { color: colors.textMuted }]}>{produit.marque}</Text>
                ) : null}
                <View style={styles.detailPrixRow}>
                  {hasPromo ? (
                    <>
                      <Text style={[styles.detailPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
                      <Text style={[styles.detailPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
                    </>
                  ) : (
                    <Text style={[styles.detailPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
                  )}
                </View>
              </View>

              {/* ── Bannière refus admin (marketplace uniquement) ─────────── */}
              {produit.isPublished === 'Refuser' && hasMarketplace && (
                <View style={[styles.refusalBanner, { borderColor: '#FECACA' }]}>
                  <View style={styles.refusalHeaderRow}>
                    <Ionicons name="close-circle" size={16} color="#DC2626" />
                    <Text style={styles.refusalTitle}>Refusé de la marketplace</Text>
                  </View>
                  {produit.comments && produit.comments !== 'Aucun commentaire' && (
                    <Text style={styles.refusalReason}>{produit.comments}</Text>
                  )}
                  <View style={styles.refusalHintRow}>
                    <Ionicons name="information-circle-outline" size={13} color="#D97706" />
                    <Text style={styles.refusalHint}>Ce refus n'affecte pas votre POS. Modifiez le produit pour le resoumettre sur la marketplace.</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.refusalBtn}
                    onPress={() => { dismiss(() => { onClose(); onEdit(produit); }); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={14} color="#fff" />
                    <Text style={styles.refusalBtnText}>Modifier & resoumettre</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tabs */}
              <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
                {['details', 'livraison'].map(tab => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textMuted, fontWeight: activeTab === tab ? '700' : '500' }]}>
                      {tab === 'details' ? 'Détails' : 'Livraison'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Contenu tab Détails */}
              {activeTab === 'details' && (
                <View style={styles.tabContent}>
                  {produit.variants?.length > 0
                    ? <InfoRow label="Stock total" value={`${stock} unités`} colors={colors} icon="cube-outline" />
                    : <InfoRow label="Quantité" value={`${produit.quantite ?? stock} unités`} colors={colors} icon="layers-outline" />
                  }
                  {produit.description ? (
                    <View style={styles.descBlock}>
                      <Text style={[styles.descLabel, { color: colors.textMuted }]}>Description</Text>
                      <Text style={[styles.descText, { color: colors.text }]}>
                        {produit.description?.replace(/<[^>]*>/g, '') || '—'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Variantes */}
                  {produit.variants?.length > 0 && (
                    <View style={styles.variantesBlock}>
                      <Text style={[styles.variantesTitle, { color: colors.text }]}>Variantes</Text>
                      <View style={styles.variantesGrid}>
                        {produit.variants.map((v, i) => (
                          <View key={i} style={[styles.varianteCard, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                            {v.imageUrl
                              ? <CachedImage uri={v.imageUrl} style={styles.varianteImg} contentFit="cover" />
                              : null
                            }
                            <View style={[styles.varianteDot, { backgroundColor: v.color || '#9CA3AF' }]} />
                            <Text style={[styles.varianteStock, { color: colors.text }]}>{v.stock} en stock</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Contenu tab Livraison */}
              {activeTab === 'livraison' && (
                <View style={styles.tabContent}>
                  {produit.shipping?.weight ? (
                    <InfoRow label="Poids" value={`${produit.shipping.weight} kg`} colors={colors} icon="scale-outline" />
                  ) : null}
                  {produit.shipping?.origine ? (
                    <InfoRow label="Origine" value={produit.shipping.origine} colors={colors} icon="location-outline" />
                  ) : null}
                  {!produit.shipping?.weight && !produit.shipping?.origine && (
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>Aucune info de livraison</Text>
                  )}
                </View>
              )}
            </View>
          )}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </Animated.View>
    </Modal>
  );
}

function InfoRow({ label, value, colors, icon }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={14} color={colors.primary} />
      </View>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

// ─── Modal Étiquette QR ────────────────────────────────────────────────────────
function EtiquetteModal({ produit, visible, onClose, colors }) {
  const [qrSvg, setQrSvg] = useState(null);
  const [printing, setPrinting] = useState(false);

  const hasPromo = produit?.prixPromo > 0 && produit?.prixPromo < produit?.prix;
  const prixAffiche = hasPromo ? produit.prixPromo : produit?.prix;
  const qrData = produit ? `${produit._id}|${produit.name}|${prixAffiche}` : '';

  useEffect(() => {
    if (!produit) return;
    QRCode.toString(qrData, { type: 'svg', width: 180, margin: 2 })
      .then(svg => setQrSvg(svg))
      .catch(() => setQrSvg(null));
  }, [produit, qrData]);

  const handlePrint = async () => {
    if (!produit) return;
    setPrinting(true);
    try {
      const prixHtml = hasPromo
        ? `<span style="color:#DC2626;font-size:22px;font-weight:800;">${fmt(produit.prixPromo)} ₣</span>
           <span style="text-decoration:line-through;color:#9CA3AF;font-size:14px;margin-left:8px;">${fmt(produit.prix)} ₣</span>`
        : `<span style="color:#1D4ED8;font-size:22px;font-weight:800;">${fmt(produit.prix)} ₣</span>`;

      const qrSvgData = await QRCode.toString(qrData, { type: 'svg', width: 200, margin: 2 });

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
  .label { width: 280px; background: white; border-radius: 16px; padding: 24px 20px; text-align: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12); font-family: Arial, sans-serif; }
  .qr-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
  .name { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 8px; line-height: 1.3; }
  .prix-row { margin-bottom: ${produit.barcode ? '8px' : '0'}; }
  .barcode { font-size: 12px; color: #6B7280; letter-spacing: 2px; }
  .brand { font-size: 12px; color: #6B7280; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="label">
    <div class="qr-wrap">${qrSvgData}</div>
    ${produit.marque ? `<div class="brand">${produit.marque}</div>` : ''}
    <div class="name">${produit.name}</div>
    <div class="prix-row">${prixHtml}</div>
    ${produit.barcode ? `<div class="barcode">EAN: ${produit.barcode}</div>` : ''}
  </div>
</body>
</html>`;

      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'imprimer l'étiquette.");
    } finally {
      setPrinting(false);
    }
  };

  const handleShare = async () => {
    if (!produit) return;
    setPrinting(true);
    try {
      const qrSvgData = await QRCode.toString(qrData, { type: 'svg', width: 200, margin: 2 });
      const prixHtml = hasPromo
        ? `<span style="color:#DC2626;font-size:22px;font-weight:800;">${fmt(produit.prixPromo)} ₣</span>
           <span style="text-decoration:line-through;color:#9CA3AF;font-size:14px;margin-left:8px;">${fmt(produit.prix)} ₣</span>`
        : `<span style="color:#1D4ED8;font-size:22px;font-weight:800;">${fmt(produit.prix)} ₣</span>`;

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
  .label { width: 280px; background: white; border-radius: 16px; padding: 24px 20px; text-align: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12); font-family: Arial, sans-serif; }
  .qr-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
  .name { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 8px; }
  .prix-row { margin-bottom: 0; }
  .brand { font-size: 12px; color: #6B7280; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="label">
    <div class="qr-wrap">${qrSvgData}</div>
    ${produit.marque ? `<div class="brand">${produit.marque}</div>` : ''}
    <div class="name">${produit.name}</div>
    <div class="prix-row">${prixHtml}</div>
  </div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
      } else {
        Alert.alert('Info', 'Le partage n\'est pas disponible sur cet appareil.');
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible de partager l'étiquette.");
    } finally {
      setPrinting(false);
    }
  };

  if (!produit) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.erBackdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.erCentered}>
        <View style={[styles.etSheet, { backgroundColor: colors.bgCard }]}>
          {/* Header */}
          <View style={[styles.erHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.erIconWrap, { backgroundColor: '#FFF7ED' }]}>
              <Ionicons name="qr-code-outline" size={18} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.erTitle, { color: colors.text }]}>Étiquette produit</Text>
              <Text style={[styles.erSubtitle, { color: colors.textMuted }]} numberOfLines={1}>{produit.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.erClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Aperçu étiquette */}
          <View style={[styles.etPreviewWrap, { backgroundColor: colors.bgHover }]}>
            <View style={[styles.etLabel, { backgroundColor: colors.bgCard, shadowColor: '#000' }]}>
              {qrSvg ? (
                <SvgXml xml={qrSvg} width={160} height={160} />
              ) : (
                <View style={styles.etQrPlaceholder}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
              {produit.marque ? (
                <Text style={[styles.etBrand, { color: colors.textMuted }]}>{produit.marque}</Text>
              ) : null}
              <Text style={[styles.etName, { color: colors.text }]} numberOfLines={2}>{produit.name}</Text>
              <View style={styles.etPrixRow}>
                {hasPromo ? (
                  <>
                    <Text style={styles.etPrixPromo}>{fmt(produit.prixPromo)} ₣</Text>
                    <Text style={[styles.etPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
                  </>
                ) : (
                  <Text style={[styles.etPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
                )}
              </View>
              {produit.barcode ? (
                <Text style={[styles.etBarcode, { color: colors.textMuted }]}>EAN: {produit.barcode}</Text>
              ) : null}
            </View>
          </View>

          {/* QR info */}
          <View style={[styles.etInfo, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.etInfoText, { color: colors.textMuted }]}>
              Le QR code contient l'identifiant, le nom et le prix du produit.
            </Text>
          </View>

          {/* Actions */}
          <View style={[styles.erFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.etBtnShare, { borderColor: colors.border }]}
              onPress={handleShare}
              disabled={printing}
              activeOpacity={0.8}
            >
              {printing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <>
                    <Ionicons name="share-outline" size={16} color={colors.primary} />
                    <Text style={[styles.etBtnShareText, { color: colors.primary }]}>Partager PDF</Text>
                  </>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.erBtnSave, { backgroundColor: '#B45309', flex: 1.2 }]}
              onPress={handlePrint}
              disabled={printing}
              activeOpacity={0.85}
            >
              {printing
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="print-outline" size={16} color="#fff" />
                    <Text style={styles.erBtnSaveText}>Imprimer</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function ProduitsScreen({ navigation }) {
  const { colors } = useTheme();
  const { seller, subscription } = useAuthStore();
  const produits = useSyncStore((s) => s.produits) ?? [];
  const produitsStats = useSyncStore((s) => s.produitsStats);
  const { triggerSync, isSyncing, isOffline } = useSync();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selectedProduit, setSelectedProduit] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const [etiquetteProduit, setEtiquetteProduit] = useState(null);
  const [etiquetteVisible, setEtiquetteVisible] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [editedProducts, setEditedProducts] = useState({});
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [serverResults, setServerResults] = useState(null); // null = utilise SQLite local
  const searchTimeout = useRef(null);

  const sellerId = seller?._id || seller?.id;

  // ── Recherche avec debounce ─────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (search.trim().length === 0) {
      setServerResults(null);
      return;
    }
    if (search.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      if (isOffline) {
        // Offline → recherche locale dans le store
        setServerResults(null);
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.get(`/searchProductByNameBySeller/${encodeURIComponent(search.trim())}/${sellerId}?limit=30`);
        const d = res.data;
        setServerResults(d?.products || d?.data || []);
      } catch (_) {
        setServerResults(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [search, isOffline]);

  // ── Chargement page suivante ────────────────────────────────────────────────
  const loadNextPage = useCallback(async () => {
    if (loading || !hasMore || isOffline) return;
    setLoading(true);
    try {
      const more = await syncService.fetchNextProduitsPage();
      setHasMore(more);
      setPage(p => p + 1);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [loading, hasMore, isOffline]);

  // Initialise hasMore depuis produitsStats
  useEffect(() => {
    setHasMore(produitsStats?.hasMore ?? false);
  }, [produitsStats]);

  // ── Données à afficher ──────────────────────────────────────────────────────
  const displayData = (() => {
    let base = serverResults !== null ? serverResults : produits;

    // Déduplication — un produit local (local_xxx) et son équivalent serveur
    // peuvent coexister brièvement pendant la sync. On garde uniquement le serveur.
    const seenNames = new Map(); // nom+prix → index
    const deduped = [];
    for (const p of base) {
      const isLocal = String(p._id).startsWith('local_');
      const key = `${p.name?.toLowerCase()}_${p.prix}`;
      if (isLocal) {
        if (!seenNames.has(key)) {
          seenNames.set(key, deduped.length);
          deduped.push(p);
        }
      } else {
        if (seenNames.has(key)) {
          deduped[seenNames.get(key)] = p;
        } else {
          seenNames.set(key, deduped.length);
          deduped.push(p);
        }
      }
    }
    base = deduped;

    // Filtre par statut
    if (statusFilter !== 'All') {
      base = base.filter(p => p.isPublished === statusFilter);
    }

    // Recherche locale si offline
    if (search.trim().length >= 2 && serverResults === null) {
      const q = search.toLowerCase();
      base = base.filter(p => p.name?.toLowerCase().includes(q) || p.marque?.toLowerCase().includes(q));
    }

    return base;
  })();

  const onPressProduit = (p) => {
    setSelectedProduit(p);
    setDetailVisible(true);
  };

  const openEtiquette = (p) => {
    setEtiquetteProduit(p);
    setEtiquetteVisible(true);
  };

  const toggleBulkEditMode = () => {
    setBulkEditMode(v => {
      if (v) { setEditedProducts({}); setExpandedProduct(null); }
      return !v;
    });
  };

  const handleBulkEditChange = useCallback((productId, field, value) => {
    setEditedProducts(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), [field]: value },
    }));
  }, []);

  const handleVariantEditChange = useCallback((productId, vIndex, field, value, originalVariants) => {
    setEditedProducts(prev => {
      const edits = prev[productId] || {};
      const updated = edits.variants ? [...edits.variants] : [...originalVariants];
      updated[vIndex] = { ...updated[vIndex], [field]: value };
      return { ...prev, [productId]: { ...edits, variants: updated } };
    });
  }, []);

  const handleBulkSave = async () => {
    const ids = Object.keys(editedProducts);
    if (ids.length === 0) return;
    setIsSavingBulk(true);
    try {
      const updates = ids.map(id => ({ id, changes: editedProducts[id] }));

      // Mise à jour locale immédiate (SQLite + store mémoire) — offline-first
      const { upsertMany } = require('../db/database');
      const currentProduits = useSyncStore.getState().produits ?? [];
      const updatedProduits = currentProduits.map(p => {
        const edit = editedProducts[String(p._id)];
        if (!edit) return p;
        return { ...p, ...edit, _pendingSync: true };
      });
      await upsertMany('produits', updatedProduits.filter(p => editedProducts[String(p._id)]), p => String(p._id)).catch(() => {});
      useSyncStore.getState().setStoreData('produits', updatedProduits);

      if (isOffline) {
        // Offline → mise en queue une mutation UPDATE_PRODUCT par produit modifié
        // Le payload doit être identique à celui de ProduitUpdateScreen (sellerOrAdmin, Clefournisseur…)
        // pour que prepareAdvancedUpdateData côté backend ne rejette pas la requête
        for (const { id, changes } of updates) {
          const original = currentProduits.find(p => String(p._id) === id);
          const clefournisseur = typeof original?.Clefournisseur === 'object'
            ? original?.Clefournisseur?._id || seller?._id
            : (original?.Clefournisseur || seller?._id);
          await syncService.queueMutation('UPDATE_PRODUCT', {
            productId: id,
            // Champs modifiés par l'édition rapide
            ...changes,
            // Champs requis par prepareAdvancedUpdateData
            sellerOrAdmin: 'seller',
            sellerOrAdmin_id: seller?._id,
            Clefournisseur: clefournisseur,
            // Champs non modifiés mais attendus par le backend (valeurs existantes)
            name: original?.name,
            prix: changes.prix !== undefined ? changes.prix : original?.prix,
            prixPromo: changes.prixPromo !== undefined ? changes.prixPromo : (original?.prixPromo || 0),
            quantite: changes.quantite !== undefined ? changes.quantite : (original?.quantite ?? 0),
            marque: original?.marque || 'inconnu',
            description: original?.description || '',
            ClefType: original?.ClefType,
            variants: original?.variants || [],
            deletedVariantIds: [],
          });
        }
        useSyncStore.getState().setPendingCount(
          (useSyncStore.getState().pendingCount || 0) + updates.length
        );
        Toast.show({ type: 'info', text1: 'Modifié hors ligne ✓', text2: 'Sera synchronisé automatiquement dès le retour du réseau.' });
      } else {
        // Online → envoi direct
        await apiClient.put('/Products/bulk-update', { updates });
        Toast.show({ type: 'success', text1: 'Sauvegarde terminée', text2: `${updates.length} produit(s) mis à jour.` });
        triggerSync();
      }

      setEditedProducts({});
      setBulkEditMode(false);
      setExpandedProduct(null);
    } catch (_) {
      Toast.show({ type: 'error', text1: 'Erreur', text2: 'Impossible de sauvegarder les modifications.' });
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleDeleteProduit = useCallback(async (produit) => {
    const sellerId = seller?._id || seller?.id;
    const removeLocal = async () => {
      const current = useSyncStore.getState().produits ?? [];
      useSyncStore.getState().setStoreData('produits', current.filter(p => String(p._id) !== String(produit._id)));
      try { const db = getDB(); await db.runAsync('DELETE FROM produits WHERE id = ?', [String(produit._id)]); } catch (_) {}
    };

    if (isOffline) {
      await removeLocal();
      await mutationQueue.push('delete_produit', { productId: produit._id, sellerOrAdmin_id: sellerId });
      Toast.show({ type: 'info', text1: 'Suppression différée', text2: 'Sera appliquée à la reconnexion.' });
      return;
    }

    try {
      await apiClient.delete(`/ProductSeller/${produit._id}`, {
        data: { sellerOrAdmin: 'seller', sellerOrAdmin_id: sellerId },
      });
      await removeLocal();
      Toast.show({ type: 'success', text1: 'Produit supprimé', text2: `"${produit.name}" a été supprimé.` });
    } catch {
      Toast.show({ type: 'error', text1: 'Erreur', text2: 'Impossible de supprimer ce produit.' });
    }
  }, [seller, isOffline]);

  const numCols = viewMode === 'grid' ? 2 : 1;
  const planName = subscription?.planName || 'Starter';
  const hasMarketplace = SUBSCRIPTION_CONFIG.hasMarketplaceAccess(planName);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Bandeau marketplace Starter */}
      {!hasMarketplace && (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#FDE68A' }}
          onPress={() => navigation.navigate('Abonnement')}
          activeOpacity={0.8}
        >
          <Ionicons name="storefront-outline" size={15} color="#92400E" />
          <Text style={{ flex: 1, fontSize: 12, color: '#78350F', fontWeight: '600' }}>
            Vos produits ne sont pas visibles sur la marketplace.{' '}
            <Text style={{ fontWeight: '800', textDecorationLine: 'underline' }}>Passer au plan Pro →</Text>
          </Text>
        </TouchableOpacity>
      )}
      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>

        {bulkEditMode ? (
          /* ── Barre contexte mode Édition Rapide ── */
          <View style={styles.bulkContextBar}>
            <View style={[styles.bulkContextIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="flash" size={15} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bulkContextTitle, { color: colors.text }]}>Édition Rapide</Text>
              <Text style={[styles.bulkContextSub, { color: colors.textMuted }]}>
                {displayData.length} produit{displayData.length > 1 ? 's' : ''} · modifiez prix et stock en ligne
              </Text>
            </View>
            <TouchableOpacity
              onPress={toggleBulkEditMode}
              style={[styles.bulkContextClose, { backgroundColor: colors.bgHover }]}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Ligne 1 : Recherche + bouton ⋯ */}
            <View style={styles.toolbarLine1}>
              <View style={[styles.searchWrap, { backgroundColor: colors.bgInput, borderColor: colors.border, flex: 1 }]}>
                <Ionicons name="search-outline" size={15} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Rechercher un produit..."
                  placeholderTextColor={colors.textPlaceholder}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearch(''); setServerResults(null); }}>
                    <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setMoreMenuVisible(v => !v)}
                style={[styles.moreBtn, { backgroundColor: moreMenuVisible ? colors.primary : colors.bgHover, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={moreMenuVisible ? '#fff' : colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Menu déroulant "Plus d'actions" */}
            {moreMenuVisible && (
              <View style={[styles.moreMenu, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.moreMenuItem}
                  onPress={() => { setMoreMenuVisible(false); toggleBulkEditMode(); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.moreMenuIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="flash" size={15} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moreMenuLabel, { color: colors.text }]}>Édition Rapide</Text>
                    <Text style={[styles.moreMenuSub, { color: colors.textMuted }]}>Modifier prix et stock en masse</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.border} />
                </TouchableOpacity>
                <View style={[styles.moreMenuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.moreMenuItem}
                  onPress={() => { setMoreMenuVisible(false); navigation.navigate('ImportMasse'); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.moreMenuIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moreMenuLabel, { color: colors.text }]}>Import en masse</Text>
                    <Text style={[styles.moreMenuSub, { color: colors.textMuted }]}>Créer plusieurs produits d'un coup</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.border} />
                </TouchableOpacity>
              </View>
            )}

            {/* Ligne 2 : Filtres statut + toggle vue */}
            <View style={styles.toolbarLine2}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.statusFilters}
                style={styles.statusFiltersScroll}
              >
                {STATUS_FILTERS.map(f => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setStatusFilter(f)}
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.bgHover, borderColor: colors.border },
                      statusFilter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: statusFilter === f ? '#fff' : colors.textSub }]}>
                      {STATUS_LABELS[f]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={[styles.viewToggle, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setViewMode('grid')}
                  style={[styles.viewToggleBtn, viewMode === 'grid' && { backgroundColor: colors.bgCard }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode('list')}
                  style={[styles.viewToggleBtn, viewMode === 'list' && { backgroundColor: colors.bgCard }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Ligne 3 : Stats + badge offline */}
            <View style={styles.statsRow}>
              <Text style={[styles.statsText, { color: colors.textMuted }]}>
                {displayData.length} produit{displayData.length > 1 ? 's' : ''}
                {produitsStats?.totalPublished !== undefined ? ` · ${produitsStats.totalPublished} publié${produitsStats.totalPublished > 1 ? 's' : ''}` : ''}
              </Text>
              {isOffline && (
                <View style={[styles.offlineBadge, { backgroundColor: colors.bgWarning }]}>
                  <Ionicons name="cloud-offline-outline" size={10} color={colors.warningText} />
                  <Text style={[styles.offlineBadgeText, { color: colors.warningText }]}>Hors ligne</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* ── Mode Édition Rapide (tableau bulk) ── */}
      {bulkEditMode ? (
        <View style={{ flex: 1 }}>
          <FlatList
            data={displayData}
            keyExtractor={p => String(p._id)}
            contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isSyncing} onRefresh={() => triggerSync()} tintColor={colors.primary} />
            }
            renderItem={({ item: product }) => {
              const edits = editedProducts[product._id] || {};
              const isEdited = Object.keys(edits).length > 0;
              const hasVariants = product.variants?.length > 0;
              const totalVariantStock = hasVariants
                ? product.variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : 0;
              const currentPrix     = edits.prix      !== undefined ? String(edits.prix)     : String(product.prix || '');
              const currentPrixPromo= edits.prixPromo !== undefined ? String(edits.prixPromo): String(product.prixPromo || '');
              const currentQuantite = edits.quantite  !== undefined ? String(edits.quantite) : String(product.quantite ?? '');
              const isExpanded = expandedProduct === product._id;

              return (
                <View style={[
                  styles.bulkRow,
                  { backgroundColor: isEdited ? '#F0FDF9' : colors.bgCard, borderColor: isEdited ? '#30A08B40' : colors.border },
                ]}>
                  {/* Produit info */}
                  <View style={styles.bulkRowTop}>
                    <View style={[styles.bulkThumb, { backgroundColor: colors.bgHover }]}>
                      {product.image1
                        ? <CachedImage uri={product.image1} style={StyleSheet.absoluteFill} contentFit="cover" />
                        : <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
                      }
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.bulkRowName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={[styles.bulkRowSub, { color: colors.textMuted }]} numberOfLines={1}>
                          {product.marque || 'Sans marque'}
                        </Text>
                        {hasVariants && (
                          <View style={[styles.variantBadge, { backgroundColor: colors.bgHover }]}>
                            <Text style={[styles.variantBadgeText, { color: colors.textMuted }]}>
                              {product.variants.length}v
                            </Text>
                          </View>
                        )}
                        {isEdited && (
                          <View style={styles.editedDot} />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Champs */}
                  <View style={styles.bulkFieldsRow}>
                    {/* Prix */}
                    <View style={styles.bulkFieldWrap}>
                      <Text style={[styles.bulkFieldLabel, { color: colors.textMuted }]}>Prix (F)</Text>
                      {hasVariants ? (
                        <TouchableOpacity
                          style={[styles.bulkVariantBtn, {
                            backgroundColor: isExpanded ? '#F0FDF9' : colors.bgHover,
                            borderColor: isExpanded ? '#30A08B50' : colors.border,
                          }]}
                          onPress={() => setExpandedProduct(isExpanded ? null : product._id)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.bulkVariantBtnText, { color: isExpanded ? '#30A08B' : colors.textMuted }]}>
                            Variantes
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={12}
                            color={isExpanded ? '#30A08B' : colors.textMuted}
                          />
                        </TouchableOpacity>
                      ) : (
                        <TextInput
                          style={[styles.bulkInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text }]}
                          value={currentPrix}
                          onChangeText={v => handleBulkEditChange(product._id, 'prix', Number(v) || 0)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textPlaceholder}
                        />
                      )}
                    </View>

                    {/* Prix Promo */}
                    <View style={styles.bulkFieldWrap}>
                      <Text style={[styles.bulkFieldLabel, { color: colors.textMuted }]}>Promo (F)</Text>
                      {hasVariants ? (
                        <View style={[styles.bulkInput, { backgroundColor: colors.bgHover, borderColor: colors.border, justifyContent: 'center' }]}>
                          <Text style={[styles.bulkFieldLabel, { color: colors.textMuted, textAlign: 'center' }]}>—</Text>
                        </View>
                      ) : (
                        <TextInput
                          style={[styles.bulkInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text }]}
                          value={currentPrixPromo}
                          onChangeText={v => handleBulkEditChange(product._id, 'prixPromo', Number(v) || 0)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textPlaceholder}
                        />
                      )}
                    </View>

                    {/* Stock */}
                    <View style={styles.bulkFieldWrap}>
                      <Text style={[styles.bulkFieldLabel, { color: colors.textMuted }]}>Stock</Text>
                      {hasVariants ? (
                        <View style={[styles.bulkInput, { backgroundColor: colors.bgHover, borderColor: colors.border, justifyContent: 'center' }]}>
                          <Text style={[styles.bulkFieldLabel, { color: colors.textMuted, textAlign: 'center' }]}>
                            {totalVariantStock}
                          </Text>
                        </View>
                      ) : (
                        <TextInput
                          style={[styles.bulkInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text }]}
                          value={currentQuantite}
                          onChangeText={v => handleBulkEditChange(product._id, 'quantite', Number(v) || 0)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textPlaceholder}
                        />
                      )}
                    </View>
                  </View>

                  {/* Zone variantes dépliée */}
                  {hasVariants && isExpanded && (
                    <View style={[styles.variantZone, { borderTopColor: colors.border, backgroundColor: colors.bgHover }]}>
                      <Text style={[styles.variantZoneTitle, { color: colors.textMuted }]}>
                        Édition des {product.variants.length} variante{product.variants.length > 1 ? 's' : ''}
                      </Text>
                      {product.variants.map((variant, vIndex) => {
                        const vEdits = edits.variants?.[vIndex] ?? {};
                        const vPrix  = vEdits.price !== undefined ? String(vEdits.price)  : String(variant.price  || '');
                        const vStock = vEdits.stock !== undefined ? String(vEdits.stock)  : String(variant.stock  || '');
                        return (
                          <View
                            key={variant._id || vIndex}
                            style={[styles.variantRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                          >
                            {/* Couleur / Image */}
                            <View style={[styles.variantSwatch, {
                              backgroundColor: variant.colorCode || '#E5E7EB',
                              borderColor: colors.border,
                              overflow: 'hidden',
                            }]}>
                              {variant.imageUrl
                                ? <CachedImage uri={variant.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                                : null
                              }
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.variantName, { color: colors.text }]} numberOfLines={1}>
                                {variant.color || `Variante ${vIndex + 1}`}
                              </Text>
                              {variant.sizes?.length > 0 && (
                                <Text style={[styles.variantSizes, { color: colors.textMuted }]}>
                                  {variant.sizes.join(', ')}
                                </Text>
                              )}
                            </View>
                            {/* Prix variante */}
                            <View style={styles.variantInputWrap}>
                              <Text style={[styles.bulkFieldLabel, { color: colors.textMuted }]}>Prix</Text>
                              <TextInput
                                style={[styles.bulkInputSm, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text }]}
                                value={vPrix}
                                onChangeText={v => handleVariantEditChange(product._id, vIndex, 'price', Number(v) || 0, product.variants)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textPlaceholder}
                              />
                            </View>
                            {/* Stock variante */}
                            <View style={styles.variantInputWrap}>
                              <Text style={[styles.bulkFieldLabel, { color: colors.textMuted }]}>Stock</Text>
                              <TextInput
                                style={[styles.bulkInputSm, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text }]}
                                value={vStock}
                                onChangeText={v => handleVariantEditChange(product._id, vIndex, 'stock', Number(v) || 0, product.variants)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textPlaceholder}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }}
          />

          {/* Barre de sauvegarde sticky */}
          {Object.keys(editedProducts).length > 0 && (
            <View style={[styles.bulkSaveBar, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
              <View style={[styles.bulkSaveCount, { backgroundColor: '#30A08B20' }]}>
                <Text style={styles.bulkSaveCountText}>{Object.keys(editedProducts).length}</Text>
              </View>
              <Text style={[styles.bulkSaveLabel, { color: colors.text }]}>
                produit{Object.keys(editedProducts).length > 1 ? 's' : ''} modifié{Object.keys(editedProducts).length > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                style={styles.bulkCancelBtn}
                onPress={() => setEditedProducts({})}
                disabled={isSavingBulk}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
                <Text style={[styles.bulkCancelText, { color: colors.textMuted }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkSaveBtn, { backgroundColor: '#30A08B', opacity: isSavingBulk ? 0.7 : 1 }]}
                onPress={handleBulkSave}
                disabled={isSavingBulk}
                activeOpacity={0.85}
              >
                {isSavingBulk
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="save-outline" size={15} color="#fff" />
                      <Text style={styles.bulkSaveBtnText}>Sauvegarder</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <>
          {/* ── Mode normal (grille/liste) ── */}
          <FlatList
            key={viewMode}
            data={displayData}
            keyExtractor={p => String(p._id)}
            numColumns={numCols}
            columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
            contentContainerStyle={[styles.listContent, displayData.length === 0 && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isSyncing}
                onRefresh={() => { triggerSync(); setPage(1); setHasMore(produitsStats?.hasMore ?? false); }}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item }) =>
              viewMode === 'grid'
                ? <ProduitCard produit={item} onPress={onPressProduit} colors={colors} />
                : <ProduitRow produit={item} onPress={onPressProduit} colors={colors} />
            }
            onEndReached={loadNextPage}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loading ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.footerText, { color: colors.textMuted }]}>Chargement...</Text>
                </View>
              ) : hasMore && !loading ? (
                <TouchableOpacity style={[styles.loadMoreBtn, { borderColor: colors.border }]} onPress={loadNextPage}>
                  <Text style={[styles.loadMoreText, { color: colors.primary }]}>Charger plus</Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              !isSyncing && (
                <View style={styles.empty}>
                  <Ionicons name="cube-outline" size={48} color={colors.border} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {search.length > 0 ? 'Aucun résultat' : 'Aucun produit'}
                  </Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {search.length > 0 ? `Aucun produit pour "${search}"` : 'Vos produits apparaîtront ici'}
                  </Text>
                </View>
              )
            }
          />

          {/* FAB — nouveau produit */}
          {(() => {
            const planName = subscription?.planName || 'Starter';
            const limit = SUBSCRIPTION_CONFIG.getPlan(planName)?.productLimit ?? -1;
            const total = produits.length;
            const atLimit = limit !== -1 && total >= limit;
            return (
              <TouchableOpacity
                style={[styles.fab, { backgroundColor: atLimit ? '#9CA3AF' : colors.primary }]}
                onPress={() => {
                  if (atLimit) { navigation.navigate('Abonnement'); return; }
                  navigation.navigate('ProduitUpdate', { produit: null });
                }}
                activeOpacity={0.85}
              >
                <Ionicons name={atLimit ? 'lock-closed' : 'add'} size={atLimit ? 20 : 26} color="#fff" />
              </TouchableOpacity>
            );
          })()}
        </>
      )}

      {/* Modal détail */}
      <ProduitDetailModal
        produit={selectedProduit}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onEdit={(p) => navigation.navigate('ProduitUpdate', { produit: p })}
        onEtiquette={(p) => { setDetailVisible(false); setTimeout(() => openEtiquette(p), 200); }}
        onDelete={handleDeleteProduit}
        colors={colors}
        hasMarketplace={hasMarketplace}
      />

      {/* Modal Étiquette */}
      <EtiquetteModal
        produit={etiquetteProduit}
        visible={etiquetteVisible}
        onClose={() => setEtiquetteVisible(false)}
        colors={colors}
      />
    </View>
  );
}

const CARD_W = (W - 32 - 10) / 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Toolbar
  toolbar: { borderBottomWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8 },

  // Mode bulk — barre de contexte
  bulkContextBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  bulkContextIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  bulkContextTitle: { fontSize: 14, fontWeight: '800' },
  bulkContextSub: { fontSize: 11, marginTop: 1 },
  bulkContextClose: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  // Ligne 1 : recherche + bouton ⋯
  toolbarLine1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  moreBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  // Menu déroulant
  moreMenu: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, elevation: 8 },
  moreMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  moreMenuIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  moreMenuLabel: { fontSize: 13, fontWeight: '700' },
  moreMenuSub: { fontSize: 11, marginTop: 1 },
  moreMenuDivider: { height: 1, marginHorizontal: 14 },

  // Ligne 2 : filtres + toggle vue
  toolbarLine2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusFiltersScroll: { flex: 1 },
  statusFilters: { flexDirection: 'row', gap: 6 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  filterChipText: { fontSize: 11, fontWeight: '600' },
  viewToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', flexShrink: 0 },
  viewToggleBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },

  // Ligne 3 : stats
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsText: { fontSize: 11 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  offlineBadgeText: { fontSize: 10, fontWeight: '600' },

  // Liste
  listContent: { padding: 12, paddingBottom: 32 },
  gridRow: { gap: 10, marginBottom: 10 },

  // Card grille
  card: { width: CARD_W, borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2 },
  cardImgWrap: { width: '100%', height: CARD_W * 0.85, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cardImg: { width: '100%', height: '100%' },
  cardStatusPos: { position: 'absolute', top: 8, left: 8 },
  cardBody: { padding: 10, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardBrand: { fontSize: 11 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
  cardPrix: { fontSize: 14, fontWeight: '800' },
  cardPrixOld: { fontSize: 11, textDecorationLine: 'line-through' },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  stockText: { fontSize: 10, fontWeight: '600' },
  // Row liste
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12, marginBottom: 2 },
  rowImg: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 14, fontWeight: '700' },
  rowBrand: { fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  rowPrix: { fontSize: 14, fontWeight: '800' },
  rowPrixOld: { fontSize: 11, textDecorationLine: 'line-through' },
  rowStock: { fontSize: 11 },

  // Status badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Footer list
  footerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  footerText: { fontSize: 12 },
  loadMoreBtn: { marginHorizontal: 16, marginVertical: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  loadMoreText: { fontSize: 14, fontWeight: '600' },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // FAB
  fab: { position: 'absolute', bottom: 20, right: 20, width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 8 },

  // Modal backdrop + sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  detailSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: DETAIL_H, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24,
    overflow: 'hidden',
  },
  detailTopRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  editBtnText: { fontSize: 13, fontWeight: '700' },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  // Détail produit
  detailImgContainer: { height: 240, justifyContent: 'center', alignItems: 'center', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  detailMainImg: { width: '100%', height: '100%' },
  detailThumbs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  detailThumb: { width: 52, height: 52, borderRadius: 10, borderWidth: 2 },
  detailHeader: { paddingHorizontal: 16, paddingTop: 14, gap: 4 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  detailName: { fontSize: 18, fontWeight: '800', flex: 1 },
  detailBrand: { fontSize: 13 },
  detailPrixRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  detailPrix: { fontSize: 22, fontWeight: '800' },
  detailPrixOld: { fontSize: 14, textDecorationLine: 'line-through' },
  tabRow: { flexDirection: 'row', marginTop: 16, marginHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, marginBottom: -1 },
  tabText: { fontSize: 14 },
  tabContent: { paddingHorizontal: 16, paddingTop: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, gap: 12 },
  infoIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600' },
  descBlock: { paddingVertical: 12, gap: 6 },
  descLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  descText: { fontSize: 13, lineHeight: 20 },
  variantesBlock: { paddingVertical: 12, gap: 10 },
  variantesTitle: { fontSize: 14, fontWeight: '700' },
  variantesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  varianteCard: { width: 72, alignItems: 'center', gap: 4, padding: 8, borderRadius: 12, borderWidth: 1 },
  varianteImg: { width: 44, height: 44, borderRadius: 8 },
  varianteDot: { width: 16, height: 16, borderRadius: 8 },
  varianteStock: { fontSize: 10, fontWeight: '600' },

  // Bulk edit table
  bulkRow: { borderRadius: 12, borderWidth: 1, marginHorizontal: 12, marginBottom: 8, overflow: 'hidden' },
  bulkRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  bulkThumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  bulkRowName: { fontSize: 13, fontWeight: '700' },
  bulkRowSub: { fontSize: 11 },
  variantBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  variantBadgeText: { fontSize: 9, fontWeight: '700' },
  editedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#30A08B' },
  bulkFieldsRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingBottom: 10 },
  bulkFieldWrap: { flex: 1, gap: 4 },
  bulkFieldLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  bulkInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, textAlign: 'center' },
  bulkVariantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  bulkVariantBtnText: { fontSize: 11, fontWeight: '600' },
  // Variant zone
  variantZone: { borderTopWidth: 1, padding: 10, gap: 8 },
  variantZoneTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4, marginBottom: 2 },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, borderWidth: 1 },
  variantSwatch: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  variantName: { fontSize: 12, fontWeight: '600' },
  variantSizes: { fontSize: 10 },
  variantInputWrap: { gap: 3, alignItems: 'center', width: 60 },
  bulkInputSm: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 6, fontSize: 12, textAlign: 'center', width: 60 },
  // Save bar
  bulkSaveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, elevation: 8 },
  bulkSaveCount: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  bulkSaveCountText: { fontSize: 12, fontWeight: '800', color: '#30A08B' },
  bulkSaveLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  bulkCancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  bulkCancelText: { fontSize: 13, fontWeight: '600' },
  bulkSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  bulkSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Détail actions row
  detailActionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flex: 1, justifyContent: 'center' },
  detailActionText: { fontSize: 12, fontWeight: '700' },
  // Bannière refus
  refusalBanner:    { marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, backgroundColor: '#FEF2F2', padding: 12, gap: 8 },
  refusalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refusalTitle:     { fontSize: 13, fontWeight: '800', color: '#DC2626', flex: 1 },
  refusalReason:    { fontSize: 12, color: '#7F1D1D', lineHeight: 18 },
  refusalHintRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#FFF7ED', borderRadius: 8, padding: 8 },
  refusalHint:      { fontSize: 11, color: '#92400E', flex: 1, lineHeight: 16 },
  refusalBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 10 },
  refusalBtnText:   { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Édition Rapide modal
  erBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  erCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  erSheet: { width: '100%', borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, elevation: 16 },
  erHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  erIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  erTitle: { fontSize: 16, fontWeight: '800' },
  erSubtitle: { fontSize: 12, marginTop: 1 },
  erClose: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  erBody: { padding: 16, gap: 14 },
  erField: { gap: 6 },
  erRow: { flexDirection: 'row', gap: 12 },
  erLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  erInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  erDiscountBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  erVariantNote: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  erVariantNoteText: { fontSize: 12, flex: 1, lineHeight: 18 },
  erFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  erBtnCancel: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  erBtnCancelText: { fontSize: 14, fontWeight: '600' },
  erBtnSave: { flex: 1.5, flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  erBtnSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Étiquette modal
  etSheet: { width: '100%', borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, elevation: 16 },
  etPreviewWrap: { margin: 16, borderRadius: 20, padding: 20, alignItems: 'center' },
  etLabel: { width: 220, padding: 20, borderRadius: 20, alignItems: 'center', gap: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, elevation: 8 },
  etQrPlaceholder: { width: 160, height: 160, justifyContent: 'center', alignItems: 'center' },
  etBrand: { fontSize: 11, textAlign: 'center' },
  etName: { fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  etPrixRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  etPrix: { fontSize: 18, fontWeight: '800' },
  etPrixPromo: { fontSize: 18, fontWeight: '800', color: '#DC2626' },
  etPrixOld: { fontSize: 13, textDecorationLine: 'line-through' },
  etBarcode: { fontSize: 11, letterSpacing: 1.5, marginTop: 2 },
  etInfo: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 4, padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  etInfoText: { fontSize: 11, flex: 1, lineHeight: 16 },
  etBtnShare: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  etBtnShareText: { fontSize: 13, fontWeight: '700' },
});
