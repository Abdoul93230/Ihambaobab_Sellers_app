import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useSync } from '../hooks/useSync';
import { useSyncStore } from '../stores/syncStore';
import CachedImage from '../components/CachedImage';
import apiClient from '../config/api';
import { getMeta, setMeta, upsertMany } from '../db/database';
import { syncService } from '../services/syncService';
import { mutationQueue } from '../services/mutationQueue';

const AMBER = '#F59E0B';
const DANGER = '#EF4444';
const GREEN = '#10B981';

function fmtMoney(n) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + ' MFCFA';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + ' kFCFA';
  return new Intl.NumberFormat('fr-FR').format(v) + ' FCFA';
}

// ─── Comparateur stricte d'alerte (Isole les variantes du même produit) ──────
function isSameAlertItem(a, b) {
  if (!a || !b) return false;
  const aProdId = String(a.productId || a._id || '');
  const bProdId = String(b.productId || b._id || '');
  if (aProdId !== bProdId) return false;

  if (a.varianteId || b.varianteId) {
    return String(a.varianteId || '') === String(b.varianteId || '');
  }
  if (a.variante || b.variante) {
    return String(a.variante || '').trim() === String(b.variante || '').trim();
  }
  return !a.varianteId && !b.varianteId && !a.variante && !b.variante;
}

// ─── Badge niveau ─────────────────────────────────────────────────────────────
function NiveauBadge({ niveau }) {
  const isRupture = niveau === 'rupture';
  return (
    <View style={[s.badge, { backgroundColor: (isRupture ? DANGER : AMBER) + '20' }]}>
      <Text style={[s.badgeText, { color: isRupture ? DANGER : AMBER }]}>
        {isRupture ? 'RUPTURE' : 'STOCK BAS'}
      </Text>
    </View>
  );
}

// ─── Squelette ────────────────────────────────────────────────────────────────
function SkeletonRow({ colors }) {
  return (
    <View style={[s.row, { borderBottomColor: colors.border }]}>
      <View style={[s.thumb, { backgroundColor: colors.bgHover }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[s.skelLine, { width: '65%', backgroundColor: colors.bgHover }]} />
        <View style={[s.skelLine, { width: '40%', backgroundColor: colors.bgHover }]} />
      </View>
      <View style={[s.skelLine, { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.bgHover }]} />
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function AlertesStockScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isOffline } = useSync();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Ref stable pour isOffline
  const isOfflineRef = useRef(isOffline);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);

  // Modale seuil global
  const [seuilModal, setSeuilModal] = useState(false);
  const [seuilInput, setSeuilInput] = useState('');
  const [savingSeuil, setSavingSeuil] = useState(false);

  // Modale édition rapide de stock
  const [editItem, setEditItem] = useState(null);
  const [editStockInput, setEditStockInput] = useState('');
  const [savingStock, setSavingStock] = useState(false);

  // ─── Fetch ───────────────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async (silent = false) => {
    if (isOfflineRef.current) {
      if (!silent) setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/modules/stock/alerts');
      const fresh = res.data?.data ?? null;
      if (fresh?.alertes) {
        fresh.alertes = fresh.alertes.map(a => ({
          ...a,
          stock: Number(a.stock || 0),
          totalCombinedStock: Number(a.totalCombinedStock ?? a.stock ?? 0),
        }));
      }
      setData(fresh);
      setMeta('alerts_cache', fresh).catch(() => { });
    } catch {
      if (!silent) setError('Impossible de charger les alertes. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    getMeta('alerts_cache').then(cached => {
      if (cached !== null) {
        if (cached?.alertes) {
          cached.alertes = cached.alertes.map(a => ({
            ...a,
            stock: Number(a.stock || 0),
            totalCombinedStock: Number(a.totalCombinedStock ?? a.stock ?? 0),
          }));
        }
        setData(cached);
        setLoading(false);
        if (!isOfflineRef.current) fetchAlerts(true);
      } else if (!isOfflineRef.current) {
        setLoading(true);
        fetchAlerts(false);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (!isOfflineRef.current) fetchAlerts(false);
      else setLoading(false);
    });
  }, [fetchAlerts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlerts(true);
  }, [fetchAlerts]);

  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    const wasOffline = wasOfflineRef.current;
    wasOfflineRef.current = isOffline;
    if (wasOffline && !isOffline) fetchAlerts(!!data);
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Synchronisation locale des produits SQLite & Zustand ───────────────────
  const updateLocalProductStock = async (productId, variantId, newStock) => {
    try {
      const store = useSyncStore.getState();
      const currentProds = store.produits || [];
      const pIdx = currentProds.findIndex(p => String(p._id) === String(productId));

      if (pIdx !== -1) {
        const prod = JSON.parse(JSON.stringify(currentProds[pIdx]));
        const numStock = Math.max(0, parseInt(String(newStock), 10) || 0);

        if (variantId && Array.isArray(prod.variants)) {
          prod.variants = prod.variants.map(v =>
            String(v._id) === String(variantId) ? { ...v, stock: numStock } : v
          );
          prod.quantite = prod.variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
        } else {
          prod.quantite = numStock;
        }

        const updatedProds = [...currentProds];
        updatedProds[pIdx] = prod;
        store.setStoreData('produits', updatedProds);

        await upsertMany('produits', [prod], p => String(p._id)).catch(() => { });
      }
    } catch (err) {
      console.warn('updateLocalProductStock error:', err);
    }
  };

  // ─── Récupération des variantes & calcul du stock total combiné ───────────────
  const getProductVariantsInfo = (item) => {
    if (!item) return { variants: [], hasVariants: false, totalCombinedStock: 0 };
    const productId = item.productId || item._id;

    let variants = item.variants && item.variants.length > 0 ? item.variants : [];
    if (!variants.length) {
      const store = useSyncStore.getState();
      const prod = (store.produits || []).find(p => String(p._id) === String(productId));
      if (prod?.variants?.length) {
        variants = prod.variants.map((v, idx) => {
          const cStr = Array.isArray(v.colors) ? v.colors.join('/') : (v.color || '');
          const sStr = Array.isArray(v.sizes) ? v.sizes.join('/') : (v.size || '');
          const nStr = v.name || v.label || v.title || '';
          return {
            _id: v._id,
            color: v.color,
            stock: Number(v.stock || 0),
            label: [cStr, sStr, nStr].filter(Boolean).join(' - ') || `Variante ${idx + 1}`,
          };
        });
      }
    }

    const hasVariants = variants.length > 0;
    const totalCombinedStock = hasVariants
      ? variants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
      : Number(item.stock || 0);

    return { variants, hasVariants, totalCombinedStock };
  };

  // ─── Mise à jour rapide de Stock (Online / Offline) ──────────────────────────
  const handleUpdateStock = async (item, targetStockVal) => {
    const newStock = Math.max(0, parseInt(String(targetStockVal), 10) || 0);
    const productId = item.productId || item._id;
    const variantId = item.varianteId || null;
    const seuil = data?.seuilGlobal ?? 5;

    const newNiveau = newStock === 0 ? 'rupture' : newStock <= seuil ? 'bas' : 'ok';

    // 1. Mettre à jour l'alerte ciblée et recalculer les variantes & stock combiné
    const currentAlertes = [...(data?.alertes || [])];
    const itemIndex = currentAlertes.findIndex(a => isSameAlertItem(a, item));

    let updatedAlertes = [...currentAlertes];
    if (itemIndex !== -1) {
      const targetAlert = { ...updatedAlertes[itemIndex] };

      if (variantId && Array.isArray(targetAlert.variants)) {
        targetAlert.variants = targetAlert.variants.map(v =>
          String(v._id) === String(variantId) ? { ...v, stock: newStock } : v
        );
        targetAlert.totalCombinedStock = targetAlert.variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
      } else {
        targetAlert.totalCombinedStock = newStock;
      }

      if (newNiveau === 'ok') {
        updatedAlertes.splice(itemIndex, 1);
      } else {
        targetAlert.stock = newStock;
        targetAlert.niveau = newNiveau;
        updatedAlertes[itemIndex] = targetAlert;
      }

      // Mettre à jour les autres alertes du même produit avec le nouveau stock combiné et les nouvelles variantes
      updatedAlertes = updatedAlertes.map(a => {
        if (String(a.productId || a._id) === String(productId) && variantId && Array.isArray(a.variants)) {
          const updatedVars = a.variants.map(v => String(v._id) === String(variantId) ? { ...v, stock: newStock } : v);
          return {
            ...a,
            variants: updatedVars,
            totalCombinedStock: updatedVars.reduce((sum, v) => sum + Number(v.stock || 0), 0),
          };
        }
        return a;
      });
    }

    const newRuptures = updatedAlertes.filter(a => a.niveau === 'rupture').length;
    const newStockBas = updatedAlertes.filter(a => a.niveau === 'bas').length;

    const newData = {
      ...data,
      alertes: updatedAlertes,
      ruptures: newRuptures,
      stockBas: newStockBas,
      totalAlertes: updatedAlertes.length,
    };

    setData(newData);
    setMeta('alerts_cache', newData).catch(() => { });

    // 2. Mettre à jour SQLite local et store global
    await updateLocalProductStock(productId, variantId, newStock);

    // 3. Exécuter l'action réseau ou la file d'attente hors-ligne
    try {
      if (isOffline) {
        await mutationQueue.push('ADJUST_STOCK', { produitId: productId, stock: newStock, variantId });
        Toast.show({
          type: 'info',
          text1: 'Stock mis à jour (Hors ligne)',
          text2: `${item.nom}${item.variante ? ` (${item.variante})` : ''} : ${newStock} unité${newStock > 1 ? 's' : ''}`,
        });
      } else {
        await apiClient.patch(`/api/stock/adjust/${productId}`, { stock: newStock, variantId });
        Toast.show({
          type: 'success',
          text1: 'Stock mis à jour',
          text2: `${item.nom}${item.variante ? ` (${item.variante})` : ''} : ${newStock} unité${newStock > 1 ? 's' : ''}`,
        });
        syncService.invalidateAndFetch('produits');
      }
    } catch (err) {
      console.warn('Erreur mise à jour stock:', err);
      await mutationQueue.push('ADJUST_STOCK', { produitId: productId, stock: newStock, variantId }).catch(() => { });
      Toast.show({
        type: 'info',
        text1: 'Stock enregistré localement',
        text2: 'La modification sera synchronisée ultérieurement.',
      });
    }
  };

  // ─── Modal d'édition rapide ──────────────────────────────────────────────────
  const openEditModal = (item) => {
    const curStock = Math.max(0, parseInt(String(item.stock || 0), 10) || 0);
    setEditItem({
      ...item,
      stock: curStock,
    });
    setEditStockInput(String(curStock));
  };

  const saveEditStock = async () => {
    if (!editItem) return;
    const val = parseInt(editStockInput, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert('Valeur invalide', 'Veuillez entrer un nombre positif ou zéro.');
      return;
    }
    setSavingStock(true);
    await handleUpdateStock(editItem, val);
    setSavingStock(false);
    setEditItem(null);
  };

  const selectVariantInModal = (v, productId) => {
    const colorStr = Array.isArray(v.colors) ? v.colors.join('/') : (v.color || '');
    const sizeStr = Array.isArray(v.sizes) ? v.sizes.join('/') : (v.size || '');
    const nameStr = v.name || v.label || v.title || '';
    const vLabel = [colorStr, sizeStr, nameStr].filter(Boolean).join(' - ') || 'Variante';
    const seuil = data?.seuilGlobal ?? 5;
    const vStock = Math.max(0, parseInt(String(v.stock || 0), 10) || 0);

    setEditItem({
      ...editItem,
      _id: productId,
      productId: productId,
      varianteId: v._id,
      image: v.imageUrl || v.picture || editItem.image,
      prix: v.price || v.prix || editItem.prix,
      stock: vStock,
      variante: vLabel,
      niveau: vStock === 0 ? 'rupture' : vStock <= seuil ? 'bas' : 'ok',
    });
    setEditStockInput(String(vStock));
  };

  // ─── Seuil global ────────────────────────────────────────────────────────────
  const openSeuilModal = () => {
    setSeuilInput(String(data?.seuilGlobal ?? 5));
    setSeuilModal(true);
  };

  const saveSeuil = async () => {
    const val = parseInt(seuilInput, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert('Valeur invalide', 'Entrez un nombre entier positif.');
      return;
    }
    if (isOffline) {
      Alert.alert('Hors ligne', 'Vous devez être connecté pour modifier le seuil.');
      return;
    }
    setSavingSeuil(true);
    try {
      await apiClient.patch('/api/modules/stock/seuil', { seuil: val });
      setSeuilModal(false);
      await fetchAlerts(true);
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le seuil. Réessayez.');
    } finally {
      setSavingSeuil(false);
    }
  };

  // ─── En-tête (stats + seuil global) ──────────────────────────────────────────
  const ListHeader = useCallback(() => {
    if (!data) return null;
    const seuil = data.seuilGlobal ?? 5;
    return (
      <View>
        <View style={[s.statsRow, { borderBottomColor: colors.border, backgroundColor: colors.bgCard }]}>
          <View style={[s.statChip, { backgroundColor: DANGER + '12' }]}>
            <Text style={[s.statVal, { color: DANGER }]}>{data.ruptures}</Text>
            <Text style={[s.statLabel, { color: DANGER }]}>Rupture{data.ruptures !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[s.statChip, { backgroundColor: AMBER + '12' }]}>
            <Text style={[s.statVal, { color: AMBER }]}>{data.stockBas}</Text>
            <Text style={[s.statLabel, { color: AMBER }]}>Stock bas</Text>
          </View>
          <View style={[s.statChip, { backgroundColor: colors.bgHover }]}>
            <Text style={[s.statVal, { color: colors.text }]}>{data.totalProduits}</Text>
            <Text style={[s.statLabel, { color: colors.textMuted }]}>Produit{data.totalProduits !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={openSeuilModal}
          style={[s.seuilBanner, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}
          activeOpacity={0.75}
        >
          <View style={[s.seuilIconWrap, { backgroundColor: AMBER + '18' }]}>
            <Ionicons name="flag-outline" size={16} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.seuilBannerLabel, { color: colors.textMuted }]}>Seuil d'alerte global</Text>
            <Text style={[s.seuilBannerVal, { color: colors.text }]}>
              En dessous de <Text style={{ color: AMBER, fontWeight: '800' }}>{seuil} unités</Text>
            </Text>
          </View>
          <View style={[s.seuilEditBtn, { backgroundColor: AMBER + '15', borderColor: AMBER + '40' }]}>
            <Ionicons name="pencil-outline" size={13} color={AMBER} />
            <Text style={[s.seuilEditText, { color: AMBER }]}>Modifier</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [data, colors]);

  // ─── Ligne produit ────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    const isRupture = item.niveau === 'rupture';
    const stockColor = isRupture ? DANGER : AMBER;
    const itemStockNum = Number(item.stock || 0);

    const { hasVariants, totalCombinedStock } = getProductVariantsInfo(item);

    return (
      <View style={[
        s.row,
        { borderBottomColor: colors.border },
        isRupture && { backgroundColor: DANGER + '07' },
      ]}>
        {item.image
          ? <CachedImage uri={item.image} style={s.thumb} contentFit="cover" />
          : <View style={[s.thumbEmpty, { backgroundColor: colors.bgHover }]}>
            <Ionicons name="cube-outline" size={20} color={colors.textDisabled} />
          </View>
        }

        <View style={s.info}>
          <Text style={[s.nom, { color: colors.text }]} numberOfLines={2}>{item.nom}</Text>
          <View style={s.metaRow}>
            {item.variante && (
              <View style={[s.variantChip, { backgroundColor: colors.bgHover }]}>
                <Ionicons name="options-outline" size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                <Text style={[s.variantText, { color: colors.textMuted }]}>{item.variante}</Text>
              </View>
            )}
            <NiveauBadge niveau={item.niveau} />
          </View>

          {/* Prix et Stock Combiné si variantes */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.prix, { color: colors.textMuted }]}>{fmtMoney(item.prix)}</Text>
            {hasVariants && (
              <Text style={[s.combinedText, { color: colors.textMuted }]}>
                • Stock total combiné : <Text style={{ fontWeight: '700', color: colors.text }}>{totalCombinedStock} un.</Text>
              </Text>
            )}
          </View>
        </View>

        <View style={s.quickStockRow}>
          <TouchableOpacity
            style={[s.stockStepBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
            onPress={() => handleUpdateStock(item, Math.max(0, itemStockNum - 1))}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={16} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.stockPill, { backgroundColor: stockColor + '15', borderColor: stockColor + '50' }]}
            onPress={() => openEditModal(item)}
            activeOpacity={0.8}
          >
            <Text style={[s.stockVal, { color: stockColor }]}>{itemStockNum}</Text>
            <Text style={[s.stockUnit, { color: stockColor }]}>
              {hasVariants ? `/ ${totalCombinedStock}` : `unité${itemStockNum !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.stockStepBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
            onPress={() => handleUpdateStock(item, itemStockNum + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.editStockIconBtn, { backgroundColor: colors.primary + '15' }]}
            onPress={() => openEditModal(item)}
            activeOpacity={0.75}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [colors, data?.seuilGlobal]);

  const alertes = data?.alertes ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={s.offlineText}>Hors ligne — modifications enregistrées localement</Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3].map(i => <SkeletonRow key={i} colors={colors} />)}
        </View>

      ) : isOffline && !data ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: '#6B728018' }]}>
            <Ionicons name="cloud-offline-outline" size={40} color="#6B7280" />
          </View>
          <Text style={[s.emptyTitle, { color: colors.text }]}>Hors ligne</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            Reconnectez-vous pour charger les alertes stock.
          </Text>
        </View>

      ) : error ? (
        <View style={[s.errorBox, { margin: 16, borderColor: DANGER + '40' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={DANGER} />
          <Text style={[s.errorText, { color: DANGER }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchAlerts()} style={s.retryBtn}>
            <Text style={[s.retryText, { color: colors.primary }]}>Réessayer</Text>
          </TouchableOpacity>
        </View>

      ) : (
        <FlatList
          data={alertes}
          keyExtractor={(item, idx) => (item.productId || item._id) + '_' + (item.varianteId || item.variante || idx)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={AMBER}
              colors={[AMBER]}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: GREEN + '18' }]}>
                <Ionicons name="checkmark-circle-outline" size={40} color={GREEN} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>Tous vos stocks sont OK</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                Aucun produit n'est en rupture ou en dessous de {data?.seuilGlobal ?? 5} unités.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ─── Modale Édition Rapide de Stock ─────────────────────────────────── */}
      <Modal
        visible={!!editItem}
        transparent
        animationType="fade"
        onRequestClose={() => !savingStock && setEditItem(null)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !savingStock && setEditItem(null)}
          />

          {editItem && (() => {
            const valNum = parseInt(editStockInput, 10) || 0;
            const seuil = data?.seuilGlobal ?? 5;
            const isResolved = valNum > seuil;
            const isRupture = valNum === 0;
            const statusColor = isResolved ? GREEN : isRupture ? DANGER : AMBER;
            const statusLabel = isResolved
              ? 'RÉTABLI (Hors alerte)'
              : isRupture
              ? 'RUPTURE DE STOCK'
              : 'STOCK BAS';

            const { variants: allVariants, hasVariants, totalCombinedStock } = getProductVariantsInfo(editItem);

            return (
              <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={s.modalHeader}>
                  <View style={[s.modalIconWrap, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="cube-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalTitle, { color: colors.text }]} numberOfLines={1}>
                      {editItem.nom}
                    </Text>
                    <Text style={[s.modalSub, { color: colors.textMuted }]}>
                      {editItem.variante ? `Variante : ${editItem.variante}` : 'Produit principal'}
                      {hasVariants ? ` • Total combiné : ${totalCombinedStock} un.` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => !savingStock && setEditItem(null)}
                    style={[s.modalClose, { backgroundColor: colors.bgHover }]}
                  >
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Sélecteur de variantes du même produit */}
                {hasVariants && (
                  <View style={s.variantSelectorWrap}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[s.variantSelectorTitle, { color: colors.textMuted }]}>
                        Variantes du produit ({allVariants.length}) :
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                        Total combiné : {totalCombinedStock} en stock
                      </Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                      {allVariants.map((v, idx) => {
                        const isSelected = String(v._id) === String(editItem.varianteId);
                        const vStock = Number(v.stock || 0);
                        const isVLow = vStock <= seuil;

                        return (
                          <TouchableOpacity
                            key={v._id || idx}
                            style={[
                              s.variantPillBtn,
                              {
                                backgroundColor: isSelected ? colors.primary + '20' : colors.bgHover,
                                borderColor: isSelected ? colors.primary : colors.border,
                              },
                            ]}
                            onPress={() => selectVariantInModal(v, editItem.productId || editItem._id)}
                            activeOpacity={0.7}
                          >
                            {v.color ? (
                              <View style={[s.variantColorDot, { backgroundColor: v.color }]} />
                            ) : null}
                            <Text style={[s.variantPillText, { color: isSelected ? colors.primary : colors.text }]}>
                              {v.label || `Variante ${idx + 1}`}
                            </Text>
                            <View style={[s.variantPillBadge, { backgroundColor: (isVLow ? (vStock === 0 ? DANGER : AMBER) : GREEN) + '25' }]}>
                              <Text style={[s.variantPillBadgeText, { color: isVLow ? (vStock === 0 ? DANGER : AMBER) : GREEN }]}>
                                {vStock}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Badge prévisualisation statut */}
                <View style={[s.statusPreviewBadge, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
                  <Ionicons
                    name={isResolved ? 'checkmark-circle' : 'alert-circle'}
                    size={15}
                    color={statusColor}
                  />
                  <Text style={[s.statusPreviewText, { color: statusColor }]}>{statusLabel}</Text>
                </View>

                {/* Saisie principale avec bouton d'effacement */}
                <View style={[s.inputWrap, { borderColor: statusColor, backgroundColor: colors.bg }]}>
                  <TouchableOpacity
                    style={s.modalStepBtn}
                    onPress={() => setEditStockInput(String(Math.max(0, valNum - 1)))}
                  >
                    <Ionicons name="remove" size={20} color={colors.text} />
                  </TouchableOpacity>

                  <TextInput
                    style={[s.input, { color: colors.text, textAlign: 'center' }]}
                    value={editStockInput}
                    onChangeText={v => setEditStockInput(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    autoFocus
                    placeholder="0"
                    placeholderTextColor={colors.textDisabled}
                  />

                  {editStockInput !== '' && (
                    <TouchableOpacity
                      onPress={() => setEditStockInput('')}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={s.modalStepBtn}
                    onPress={() => setEditStockInput(String(valNum + 1))}
                  >
                    <Ionicons name="add" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Variations rapides (-5, +5, +10, +20) */}
                <View style={s.deltaButtonsRow}>
                  {[-5, +5, +10, +20].map((delta) => (
                    <TouchableOpacity
                      key={delta}
                      style={[s.deltaBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]}
                      onPress={() => setEditStockInput(String(Math.max(0, valNum + delta)))}
                    >
                      <Text style={[s.deltaBtnText, { color: colors.text }]}>
                        {delta > 0 ? `+${delta}` : delta}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Presets rapides */}
                <View style={s.presetsRow}>
                  <Text style={[s.presetsLabel, { color: colors.textMuted }]}>Réappro :</Text>
                  {[10, 25, 50, 100].map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[s.presetChip, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}
                      onPress={() => setEditStockInput(String(preset))}
                    >
                      <Text style={[s.presetChipText, { color: colors.primary }]}>{preset}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={[s.btnCancel, { borderColor: colors.border }]}
                    onPress={() => setEditItem(null)}
                    disabled={savingStock}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.btnCancelText, { color: colors.textMuted }]}>Annuler</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.btnSave, { backgroundColor: colors.primary, opacity: savingStock ? 0.7 : 1 }]}
                    onPress={saveEditStock}
                    disabled={savingStock}
                    activeOpacity={0.8}
                  >
                    {savingStock ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={s.btnSaveText}>Enregistrer</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Modale seuil global ─────────────────────────────────────────────── */}
      <Modal
        visible={seuilModal}
        transparent
        animationType="fade"
        onRequestClose={() => !savingSeuil && setSeuilModal(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !savingSeuil && setSeuilModal(false)}
          />

          <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={s.modalHeader}>
              <View style={[s.modalIconWrap, { backgroundColor: AMBER + '18' }]}>
                <Ionicons name="flag-outline" size={18} color={AMBER} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalTitle, { color: colors.text }]}>Seuil d'alerte global</Text>
                <Text style={[s.modalSub, { color: colors.textMuted }]}>
                  Appliqué à tous vos produits
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !savingSeuil && setSeuilModal(false)}
                style={[s.modalClose, { backgroundColor: colors.bgHover }]}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[s.inputWrap, { borderColor: AMBER, backgroundColor: colors.bg }]}>
              <TextInput
                style={[s.input, { color: colors.text }]}
                value={seuilInput}
                onChangeText={v => setSeuilInput(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                selectTextOnFocus
                autoFocus
                placeholder="5"
                placeholderTextColor={colors.textDisabled}
              />
              <Text style={[s.inputUnit, { color: colors.textMuted }]}>unités</Text>
            </View>

            <Text style={[s.inputHint, { color: colors.textMuted }]}>
              Une alerte s'affiche quand un produit passe en dessous de ce seuil. Ce réglage s'applique à tous vos produits.
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.btnCancel, { borderColor: colors.border }]}
                onPress={() => setSeuilModal(false)}
                disabled={savingSeuil}
                activeOpacity={0.7}
              >
                <Text style={[s.btnCancelText, { color: colors.textMuted }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSave, { backgroundColor: AMBER, opacity: savingSeuil ? 0.7 : 1 }]}
                onPress={saveSeuil}
                disabled={savingSeuil}
                activeOpacity={0.8}
              >
                {savingSeuil ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={s.btnSaveText}>Enregistrer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6B7280', paddingHorizontal: 14, paddingVertical: 8,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', flex: 1 },

  skelLine: { height: 12, borderRadius: 6 },

  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  statChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, gap: 2 },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  seuilBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  seuilIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  seuilBannerLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  seuilBannerVal: { fontSize: 13, fontWeight: '600' },
  seuilEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  seuilEditText: { fontSize: 12, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  thumb: { width: 50, height: 50, borderRadius: 12 },
  thumbEmpty: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: 5 },
  nom: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  variantChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  variantText: { fontSize: 10, fontWeight: '600' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  prix: { fontSize: 11, fontWeight: '600' },
  combinedText: { fontSize: 11 },

  quickStockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockStepBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  stockPill: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, minWidth: 50 },
  stockVal: { fontSize: 15, fontWeight: '800' },
  stockUnit: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  editStockIconBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 2 },

  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 14, backgroundColor: '#FEF2F2' },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retryBtn: { paddingTop: 2 },
  retryText: { fontSize: 13, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 14 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  modalSub: { fontSize: 12, marginTop: 1 },
  modalClose: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  variantSelectorWrap: { gap: 4 },
  variantSelectorTitle: { fontSize: 11, fontWeight: '700' },
  variantPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  variantColorDot: { width: 10, height: 10, borderRadius: 5 },
  variantPillText: { fontSize: 12, fontWeight: '700' },
  variantPillBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  variantPillBadgeText: { fontSize: 10, fontWeight: '800' },

  statusPreviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  statusPreviewText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, gap: 8 },
  modalStepBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, fontSize: 26, fontWeight: '800' },
  inputUnit: { fontSize: 13, fontWeight: '600' },
  inputHint: { fontSize: 11, lineHeight: 16 },

  deltaButtonsRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  deltaBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  deltaBtnText: { fontSize: 13, fontWeight: '700' },

  presetsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presetsLabel: { fontSize: 11, fontWeight: '600' },
  presetChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  presetChipText: { fontSize: 12, fontWeight: '700' },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  btnCancelText: { fontSize: 14, fontWeight: '700' },
  btnSave: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  btnSaveText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
